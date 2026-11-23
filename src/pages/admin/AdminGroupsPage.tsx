import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Table, proportional, pixel, useTableStickyColumns, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { Grid } from '@astryxdesign/core/Grid'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
  PencilSquareIcon,
  TrashIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import { adminAPI } from '~/lib/api/admin'
import type { AdminGroup, CreateGroupRequest, GroupPlatform, UpdateGroupRequest } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useAuthStore, selectIsSimpleMode } from '~/stores/auth'
import { CompositeRoutesDialog } from './groups/CompositeRoutesDialog'
import { GroupRateMultipliersDialog } from './groups/GroupRateMultipliersDialog'
import { GroupRPMOverridesDialog } from './groups/GroupRPMOverridesDialog'
import { GroupSortOrderDialog } from './groups/GroupSortOrderDialog'
import {
  GroupModelAllowlistSection,
  GroupModelPricingSection,
  GroupRoutingSection,
} from './groups/GroupEditorSections'
import {
  buildFallbackGroupOptions,
  buildGroupEditorPayload,
  buildInvalidRequestFallbackOptions,
  convertApiFormatToRoutingRules,
  createGroupEditorState,
  groupEditorStateForPlatform,
  groupEditorStateFromGroup,
  useGroupEditorState,
  validateGroupEditorState,
} from './groups/groupEditorState'

// Labels come from admin.groups.platforms.<value>
const PLATFORMS = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok', 'kimi', 'zhipu', 'deepseek', 'minimax', 'composite'] as const

const PINNED_ACTIONS = { endKeys: ['actions'] }
const NO_PINNED_COLUMNS = {}

interface GroupRow extends AdminGroup, Record<string, unknown> {
  __id: string
}

export function AdminGroupsPage() {
  const { t } = useI18n()
  const isSimpleMode = useAuthStore(selectIsSimpleMode)
  const hasRoomToPin = useMediaQuery('(min-width: 768px)', true)
  const pinned = useTableStickyColumns<GroupRow>(hasRoomToPin ? PINNED_ACTIONS : NO_PINNED_COLUMNS)

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [page] = useState(1)
  const [pageSize] = useState(20)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showSortDialog, setShowSortDialog] = useState(false)
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<AdminGroup | null>(null)
  const [compositeRoutesGroup, setCompositeRoutesGroup] = useState<AdminGroup | null>(null)
  const [rateMultipliersGroup, setRateMultipliersGroup] = useState<AdminGroup | null>(null)
  const [rpmOverridesGroup, setRpmOverridesGroup] = useState<AdminGroup | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Model pricing / allowlist / routing sections of both forms (gap 47)
  const createEditor = useGroupEditorState('create')
  const editEditor = useGroupEditorState('edit')

  const [createForm, setCreateForm] = useState<CreateGroupRequest>({
    name: '',
    description: '',
    platform: 'anthropic',
    rate_multiplier: 1.0,
    is_exclusive: false,
    subscription_type: 'standard',
    long_context_pricing_enabled: true,
  })

  const [editForm, setEditForm] = useState<UpdateGroupRequest>({})

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const filters: any = {}
      if (searchQuery) filters.search = searchQuery
      if (platformFilter) filters.platform = platformFilter

      const response = await adminAPI.groups.list(page, pageSize, filters)
      setGroups(response.items)
    } catch (error: any) {
      toast.error(error.message || t('admin.groups.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, platformFilter, t])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  const openCreateModal = () => {
    setCreateForm({
      name: '',
      description: '',
      platform: 'anthropic',
      rate_multiplier: 1.0,
      is_exclusive: false,
      subscription_type: 'standard',
      long_context_pricing_enabled: true,
    })
    createEditor.setState(createGroupEditorState())
    setShowCreateModal(true)
    // Simple mode submits name/description/platform only, so no candidates needed
    if (!isSimpleMode) void createEditor.loadAllowlistCandidates(0, 'anthropic')
  }

  const handleCreate = async () => {
    const platform = createForm.platform || 'anthropic'
    if (!isSimpleMode) {
      const error = validateGroupEditorState(createEditor.state, t)
      if (error) {
        toast.error(error)
        return
      }
    }

    setSubmitting(true)
    try {
      const payload: CreateGroupRequest = isSimpleMode
        ? { name: createForm.name, description: createForm.description, platform: createForm.platform }
        : { ...createForm, ...buildGroupEditorPayload(createEditor.state, platform, 'create') }
      await adminAPI.groups.create(payload)
      toast.success(t('admin.groups.groupCreated'))
      setShowCreateModal(false)
      setCreateForm({
        name: '',
        description: '',
        platform: 'anthropic',
        rate_multiplier: 1.0,
        is_exclusive: false,
        subscription_type: 'standard',
        long_context_pricing_enabled: true,
      })
      createEditor.reset()
      loadGroups()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.failedToCreate')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editingGroup) return
    const platform = editingGroup.platform
    if (!isSimpleMode) {
      const error = validateGroupEditorState(editEditor.state, t)
      if (error) {
        toast.error(error)
        return
      }
    }

    setSubmitting(true)
    try {
      const payload: UpdateGroupRequest = isSimpleMode
        ? editForm
        : { ...editForm, ...buildGroupEditorPayload(editEditor.state, platform, 'edit') }
      await adminAPI.groups.update(editingGroup.id, payload)
      toast.success(t('admin.groups.groupUpdated'))
      setShowEditModal(false)
      setEditingGroup(null)
      setEditForm({})
      editEditor.reset()
      loadGroups()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.failedToUpdate')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingGroup) return

    setSubmitting(true)
    try {
      await adminAPI.groups.delete(deletingGroup.id)
      toast.success(t('admin.groups.groupDeleted'))
      setShowDeleteDialog(false)
      setDeletingGroup(null)
      loadGroups()
    } catch (error: any) {
      toast.error(error.message || t('admin.groups.failedToDelete'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDuplicate = async (group: AdminGroup) => {
    try {
      const duplicated = await adminAPI.groups.duplicate(group.id)
      toast.success(t('admin.groups.duplicateSuccess', { name: duplicated.name }))
      loadGroups()
    } catch (error: any) {
      toast.error(error.message || t('admin.groups.duplicateFailed'))
    }
  }

  const openEditModal = async (group: AdminGroup) => {
    setEditingGroup(group)
    setEditForm({
      name: group.name,
      description: group.description,
      rate_multiplier: group.rate_multiplier,
      is_exclusive: group.is_exclusive,
      status: group.status,
      subscription_type: group.subscription_type,
    })
    editEditor.setState(groupEditorStateFromGroup(group, []))
    setShowEditModal(true)
    if (isSimpleMode) return
    // Routing rules resolve account names asynchronously, like the Vue view
    const routingRules = await convertApiFormatToRoutingRules(group.model_routing)
    editEditor.setState((prev) => ({ ...prev, model_routing_rules: routingRules }))
    void editEditor.loadAllowlistCandidates(group.id, group.platform)
  }

  const openDeleteDialog = (group: AdminGroup) => {
    setDeletingGroup(group)
    setShowDeleteDialog(true)
  }

  // Switching the create platform resets the allowlist and reloads its candidates
  const changeCreatePlatform = (platform: GroupPlatform) => {
    setCreateForm((f) => ({ ...f, platform }))
    createEditor.setState((prev) => groupEditorStateForPlatform(prev, platform))
    if (!isSimpleMode) void createEditor.loadAllowlistCandidates(0, platform)
  }

  const noFallbackLabel = t('admin.groups.claudeCode.noFallback')
  const noInvalidRequestFallbackLabel = t('admin.groups.invalidRequestFallback.noFallback')
  const createFallbackOptions = useMemo(
    () => buildFallbackGroupOptions(groups, noFallbackLabel),
    [groups, noFallbackLabel],
  )
  const createInvalidRequestFallbackOptions = useMemo(
    () => buildInvalidRequestFallbackOptions(groups, noInvalidRequestFallbackLabel),
    [groups, noInvalidRequestFallbackLabel],
  )
  const editFallbackOptions = useMemo(
    () => buildFallbackGroupOptions(groups, noFallbackLabel, editingGroup?.id),
    [groups, noFallbackLabel, editingGroup?.id],
  )
  const editInvalidRequestFallbackOptions = useMemo(
    () => buildInvalidRequestFallbackOptions(groups, noInvalidRequestFallbackLabel, editingGroup?.id),
    [groups, noInvalidRequestFallbackLabel, editingGroup?.id],
  )

  const rows: GroupRow[] = groups.map(g => ({ ...g, __id: String(g.id) }))

  const platformLabel = (platform: string) => {
    const key = `admin.groups.platforms.${platform}`
    const label = t(key)
    return label === key ? platform : label
  }
  const platformOptions = PLATFORMS.map((value) => ({ value, label: platformLabel(value) }))
  const statusOptions = [
    { value: 'active', label: t('common.active') },
    { value: 'inactive', label: t('common.inactive') },
  ]

  const columns: TableColumn<GroupRow>[] = [
    {
      key: 'id',
      header: t('admin.groups.columns.id'),
      width: pixel(80),
      renderCell: (group: GroupRow) => <Text type="supporting">#{group.id}</Text>,
    },
    {
      key: 'name',
      header: t('admin.groups.columns.name'),
      width: proportional(3),
      renderCell: (group: GroupRow) => <Text type="body" weight="medium">{group.name}</Text>,
    },
    {
      key: 'platform',
      header: t('admin.groups.columns.platform'),
      width: pixel(140),
      renderCell: (group: GroupRow) => <Badge label={platformLabel(group.platform)} />,
    },
    {
      key: 'rate_multiplier',
      header: t('admin.groups.columns.rateMultiplier'),
      width: pixel(100),
      renderCell: (group: GroupRow) => <Text type="body">{group.rate_multiplier.toFixed(2)}x</Text>,
    },
    {
      key: 'status',
      header: t('admin.groups.columns.status'),
      width: pixel(100),
      renderCell: (group: GroupRow) => (
        <Badge
          variant={group.status === 'active' ? 'success' : 'neutral'}
          label={group.status === 'active' ? t('common.active') : t('common.inactive')}
        />
      ),
    },
    {
      key: 'account_count',
      header: t('admin.groups.columns.accounts'),
      width: pixel(100),
      renderCell: (group: GroupRow) => <Text type="body">{group.account_count || 0}</Text>,
    },
    {
      key: 'actions',
      header: t('admin.groups.columns.actions'),
      width: pixel(128),
      align: 'end',
      renderCell: (group: GroupRow) => {
        const items: DropdownMenuOption[] = []
        if (!isSimpleMode) {
          items.push({
            label: t('admin.groups.duplicate'),
            icon: <Icon icon={DocumentDuplicateIcon} />,
            onClick: () => void handleDuplicate(group),
          })
          if (group.platform === 'composite') {
            items.push({ label: t('admin.groups.compositeRoutes.action'), onClick: () => setCompositeRoutesGroup(group) })
          }
          items.push(
            { label: t('admin.groups.rateMultipliers'), onClick: () => setRateMultipliersGroup(group) },
            { label: t('admin.groups.rpmOverrides'), onClick: () => setRpmOverridesGroup(group) },
            { type: 'divider' },
          )
        }
        items.push({
          label: t('common.delete'),
          icon: <Icon icon={TrashIcon} />,
          variant: 'destructive',
          onClick: () => openDeleteDialog(group),
        })

        return (
          <HStack gap={1} hAlign="end" vAlign="center">
            <Button
              label={t('common.edit')}
              size="sm"
              variant="ghost"
              icon={<Icon icon={PencilSquareIcon} />}
              onClick={() => void openEditModal(group)}
            />
            <MoreMenu
              label={`${t('common.more')} · ${group.name}`}
              size="sm"
              alignment="end"
              items={items}
            />
          </HStack>
        )
      },
    },
  ]

  return (
    <Page title={t('admin.groups.title')} description={t('admin.groups.description')}>
          <VStack gap={6} hAlign="stretch">
            {/* Filters */}
            <Card padding={4}>
              <VStack gap={3}>
                <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={3}>
                  <TextInput
                    label={t('common.search')}
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={t('admin.groups.searchGroups')}
                  />
                  <Selector
                    label={t('admin.groups.columns.platform')}
                    value={platformFilter}
                    onChange={setPlatformFilter}
                    options={[{ value: '', label: t('admin.groups.platforms.all') }, ...platformOptions]}
                  />
                </Grid>
                <HStack gap={2}>
                  <Button
                    label={t('admin.groups.createGroup')}
                    variant="primary"
                    icon={<Icon icon={PlusIcon} />}
                    onClick={openCreateModal}
                  />
                  {/* Gap 44: sort order entry point */}
                  {!isSimpleMode && (
                    <Button
                      label={t('admin.groups.sortOrder')}
                      variant="secondary"
                      icon={<Icon icon={ArrowsUpDownIcon} />}
                      onClick={() => setShowSortDialog(true)}
                    />
                  )}
                  <Button
                    label={t('common.refresh')}
                    variant="secondary"
                    icon={<Icon icon={ArrowPathIcon} />}
                    onClick={loadGroups}
                    isLoading={loading}
                  />
                </HStack>
              </VStack>
            </Card>

            {/* Table */}
            <Card padding={0}>
              {loading && rows.length === 0 ? (
                <VStack hAlign="center" minHeight={400} paddingBlockStart={10}>
                  <Spinner />
                </VStack>
              ) : rows.length === 0 ? (
                <VStack hAlign="center" minHeight={400} paddingBlockStart={10}>
                  <EmptyState
                    icon={<Icon icon={MagnifyingGlassIcon} />}
                    title={t('admin.groups.noGroupsYet')}
                    description={t('admin.groups.createFirstGroup')}
                  />
                </VStack>
              ) : (
                <Table
                  columns={columns}
                  data={rows}
                  idKey="__id"
                  plugins={{ pinned }}
                  density="compact"
                  dividers="rows"
                  hasHover
                />
              )}
            </Card>
          </VStack>

          {/* Create Modal */}
          {showCreateModal && (
            <Dialog
              isOpen={showCreateModal}
              onOpenChange={(open) => setShowCreateModal(open)}
              width={720}
              maxHeight="85dvh"
              purpose="form"
            >
              <Layout
                header={
                  <DialogHeader
                    title={t('admin.groups.createGroup')}
                    onOpenChange={(open) => setShowCreateModal(open)}
                  />
                }
                content={
                  <LayoutContent>
                    <VStack gap={4} hAlign="stretch">
                      <TextInput
                        label={t('admin.groups.form.nameLabel')}
                        value={createForm.name}
                        onChange={(val) => setCreateForm(f => ({ ...f, name: val }))}
                        placeholder={t('admin.groups.enterGroupName')}
                        isRequired
                      />
                      <TextInput
                        label={t('admin.groups.form.description')}
                        placeholder={t('admin.groups.form.descriptionPlaceholder')}
                        value={createForm.description || ''}
                        onChange={(val) => setCreateForm(f => ({ ...f, description: val }))}
                      />
                      <Selector
                        label={t('admin.groups.columns.platform')}
                        description={t('admin.groups.platformHint')}
                        value={createForm.platform}
                        onChange={(val) => changeCreatePlatform(val as GroupPlatform)}
                        options={platformOptions}
                      />
                      <NumberInput
                        label={t('admin.groups.form.rateMultiplier')}
                        description={t('admin.groups.rateMultiplierHint')}
                        value={createForm.rate_multiplier ?? 1.0}
                        onChange={(val) => setCreateForm(f => ({ ...f, rate_multiplier: val }))}
                        min={0}
                        step={0.1}
                      />
                      <CheckboxInput
                        label={t('admin.groups.exclusive')}
                        value={createForm.is_exclusive || false}
                        onChange={(checked: boolean) => setCreateForm(f => ({ ...f, is_exclusive: checked }))}
                      />
                      {!isSimpleMode && (
                        <>
                          {/* Gap 47: model pricing */}
                          <GroupModelPricingSection
                            state={createEditor.state}
                            platform={createForm.platform || 'anthropic'}
                            patch={(patch) => createEditor.setState((prev) => ({ ...prev, ...patch }))}
                          />
                          {/* Gap 47: model allowlist */}
                          <GroupModelAllowlistSection
                            state={createEditor.state}
                            isLoading={createEditor.allowlistLoading}
                            patch={(patch) => createEditor.setState((prev) => ({ ...prev, ...patch }))}
                          />
                          {/* Gap 47: routing */}
                          <GroupRoutingSection
                            state={createEditor.state}
                            platform={createForm.platform || 'anthropic'}
                            subscriptionType={createForm.subscription_type}
                            fallbackGroupOptions={createFallbackOptions}
                            invalidRequestFallbackOptions={createInvalidRequestFallbackOptions}
                            patch={(patch) => createEditor.setState((prev) => ({ ...prev, ...patch }))}
                          />
                        </>
                      )}
                    </VStack>
                  </LayoutContent>
                }
                footer={
                  <LayoutFooter>
                    <HStack gap={2} hAlign="end">
                      <Button
                        label={t('common.cancel')}
                        variant="secondary"
                        onClick={() => setShowCreateModal(false)}
                      />
                      <Button
                        label={t('common.create')}
                        variant="primary"
                        onClick={handleCreate}
                        isLoading={submitting}
                      />
                    </HStack>
                  </LayoutFooter>
                }
              />
            </Dialog>
          )}

          {/* Edit Modal */}
          {showEditModal && editingGroup && (
            <Dialog
              isOpen={showEditModal}
              onOpenChange={(open) => setShowEditModal(open)}
              width={720}
              maxHeight="85dvh"
              purpose="form"
            >
              <Layout
                header={
                  <DialogHeader
                    title={t('admin.groups.editGroup')}
                    onOpenChange={(open) => setShowEditModal(open)}
                  />
                }
                content={
                  <LayoutContent>
                    <VStack gap={4} hAlign="stretch">
                      <TextInput
                        label={t('admin.groups.form.nameLabel')}
                        value={editForm.name || ''}
                        onChange={(val) => setEditForm(f => ({ ...f, name: val }))}
                      />
                      <TextInput
                        label={t('admin.groups.form.description')}
                        placeholder={t('admin.groups.form.descriptionPlaceholder')}
                        value={editForm.description || ''}
                        onChange={(val) => setEditForm(f => ({ ...f, description: val }))}
                      />
                      {/* The platform is fixed after creation, like the Vue form */}
                      <Selector
                        label={t('admin.groups.form.platform')}
                        description={t('admin.groups.platformNotEditable')}
                        value={editingGroup.platform}
                        options={platformOptions}
                        isDisabled
                      />
                      <NumberInput
                        label={t('admin.groups.form.rateMultiplier')}
                        description={t('admin.groups.rateMultiplierHint')}
                        value={editForm.rate_multiplier ?? 1.0}
                        onChange={(val) => setEditForm(f => ({ ...f, rate_multiplier: val }))}
                        min={0}
                        step={0.1}
                      />
                      <Selector
                        label={t('admin.groups.form.status')}
                        value={editForm.status || 'active'}
                        onChange={(val) => setEditForm(f => ({ ...f, status: val as 'active' | 'inactive' }))}
                        options={statusOptions}
                      />
                      {!isSimpleMode && (
                        <>
                          {/* Gap 47: model pricing */}
                          <GroupModelPricingSection
                            state={editEditor.state}
                            platform={editingGroup.platform}
                            patch={(patch) => editEditor.setState((prev) => ({ ...prev, ...patch }))}
                          />
                          {/* Gap 47: model allowlist */}
                          <GroupModelAllowlistSection
                            state={editEditor.state}
                            isLoading={editEditor.allowlistLoading}
                            patch={(patch) => editEditor.setState((prev) => ({ ...prev, ...patch }))}
                          />
                          {/* Gap 47: routing */}
                          <GroupRoutingSection
                            state={editEditor.state}
                            platform={editingGroup.platform}
                            subscriptionType={editForm.subscription_type || editingGroup.subscription_type}
                            fallbackGroupOptions={editFallbackOptions}
                            invalidRequestFallbackOptions={editInvalidRequestFallbackOptions}
                            patch={(patch) => editEditor.setState((prev) => ({ ...prev, ...patch }))}
                          />
                        </>
                      )}
                    </VStack>
                  </LayoutContent>
                }
                footer={
                  <LayoutFooter>
                    <HStack gap={2} hAlign="end">
                      <Button
                        label={t('common.cancel')}
                        variant="secondary"
                        onClick={() => setShowEditModal(false)}
                      />
                      <Button
                        label={t('common.save')}
                        variant="primary"
                        onClick={handleEdit}
                        isLoading={submitting}
                      />
                    </HStack>
                  </LayoutFooter>
                }
              />
            </Dialog>
          )}

          {/* Delete Dialog */}
          {showDeleteDialog && deletingGroup && (
            <Dialog
              isOpen={showDeleteDialog}
              onOpenChange={(open) => setShowDeleteDialog(open)}
            >
              <DialogHeader title={t('admin.groups.deleteGroup')} />
              <VStack gap={4}>
                <Text type="body">
                  {t('admin.groups.deleteConfirm', { name: deletingGroup.name })}
                </Text>
                <HStack gap={2} hAlign="end">
                  <Button
                    label={t('common.cancel')}
                    variant="secondary"
                    onClick={() => setShowDeleteDialog(false)}
                  />
                  <Button
                    label={t('common.delete')}
                    variant="destructive"
                    onClick={handleDelete}
                    isLoading={submitting}
                  />
                </HStack>
              </VStack>
            </Dialog>
          )}

          {/* Gap 44: group sort order */}
          {showSortDialog && (
            <GroupSortOrderDialog onClose={() => setShowSortDialog(false)} onSaved={loadGroups} />
          )}

          {/* Gap 45: composite model routes */}
          {compositeRoutesGroup && (
            <CompositeRoutesDialog
              group={compositeRoutesGroup}
              onClose={() => setCompositeRoutesGroup(null)}
            />
          )}

          {/* Gap 46: per-user rate multipliers */}
          {rateMultipliersGroup && (
            <GroupRateMultipliersDialog
              group={rateMultipliersGroup}
              onClose={() => setRateMultipliersGroup(null)}
              onSaved={loadGroups}
            />
          )}

          {/* Gap 46: per-user RPM overrides */}
          {rpmOverridesGroup && (
            <GroupRPMOverridesDialog
              group={rpmOverridesGroup}
              onClose={() => setRpmOverridesGroup(null)}
              onSaved={loadGroups}
            />
          )}
    </Page>
  )
}
