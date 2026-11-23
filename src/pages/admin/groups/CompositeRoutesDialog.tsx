import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Table, proportional, pixel, type TableColumn } from '@astryxdesign/core/Table'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Section } from '@astryxdesign/core/Section'
import { Spinner } from '@astryxdesign/core/Spinner'
import { ArrowPathIcon, CheckIcon, PencilSquareIcon, PlayIcon, TrashIcon } from '@heroicons/react/24/outline'
import type {
  AdminGroup,
  CompositeModelRoute,
  CompositeModelRouteInput,
  CompositeRouteDecision,
  CompositeRouteEndpoint,
  CompositeRouteMatchType,
  GroupPlatform,
} from '@/types'
import { CONCRETE_PLATFORM_OPTIONS } from '@/constants/platforms'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { groupPlatformLabel } from './groupPlatform'

type ConcretePlatform = Exclude<GroupPlatform, 'composite'>

interface RouteForm {
  public_model: string
  match_type: CompositeRouteMatchType
  target_platform: ConcretePlatform
  upstream_model: string
  endpoint: CompositeRouteEndpoint
  priority: number
  enabled: boolean
  notes: string
}

const EMPTY_FORM: RouteForm = {
  public_model: '',
  match_type: 'exact',
  target_platform: 'openai',
  upstream_model: '',
  endpoint: 'any',
  priority: 100,
  enabled: true,
  notes: '',
}

// Endpoint value -> admin.groups.compositeRoutes.endpoints.<key>
const ENDPOINTS: ReadonlyArray<[CompositeRouteEndpoint, string]> = [
  ['any', 'any'],
  ['messages', 'messages'],
  ['count_tokens', 'countTokens'],
  ['responses', 'responses'],
  ['chat_completions', 'chatCompletions'],
  ['embeddings', 'embeddings'],
  ['images', 'images'],
  ['gemini', 'gemini'],
]

const MATCH_TYPES: ReadonlyArray<CompositeRouteMatchType> = ['exact', 'prefix']

interface RouteRow extends CompositeModelRoute, Record<string, unknown> {}

interface CompositeRoutesDialogProps {
  group: AdminGroup
  onClose: () => void
}

/**
 * Model routes of a composite group: saved routes on one side, the add/edit
 * form and a routing preview on the other.
 */
export function CompositeRoutesDialog({ group, onClose }: CompositeRoutesDialogProps) {
  const { t } = useI18n()

  const [routes, setRoutes] = useState<CompositeModelRoute[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<RouteForm>(EMPTY_FORM)
  const [deletingRoute, setDeletingRoute] = useState<CompositeModelRoute | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [previewModel, setPreviewModel] = useState('')
  const [previewEndpoint, setPreviewEndpoint] = useState<CompositeRouteEndpoint>('any')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [decision, setDecision] = useState<CompositeRouteDecision | null>(null)

  const patch = (next: Partial<RouteForm>) => setForm((prev) => ({ ...prev, ...next }))

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const loadRoutes = useCallback(async () => {
    setLoading(true)
    try {
      const list = await adminAPI.groups.listCompositeRoutes(group.id)
      setRoutes([...list].sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.id - b.id)))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.compositeRoutes.failedToLoad')))
    } finally {
      setLoading(false)
    }
  }, [group.id, t])

  useEffect(() => {
    void loadRoutes()
  }, [loadRoutes])

  const endpointOptions = ENDPOINTS.map(([value, key]) => ({
    value,
    label: t(`admin.groups.compositeRoutes.endpoints.${key}`),
  }))
  const matchOptions = MATCH_TYPES.map((value) => ({
    value,
    label: t(`admin.groups.compositeRoutes.match.${value}`),
  }))
  const platformOptions = CONCRETE_PLATFORM_OPTIONS.map((option) => ({ value: option.value, label: option.label }))

  const endpointLabel = (endpoint: CompositeRouteEndpoint) =>
    endpointOptions.find((option) => option.value === endpoint)?.label || endpoint
  const matchLabel = (matchType: CompositeRouteMatchType) =>
    matchOptions.find((option) => option.value === matchType)?.label || matchType
  const sourceLabel = (source: string) => {
    if (source === 'route') return t('admin.groups.compositeRoutes.sources.route')
    if (source === 'detector') return t('admin.groups.compositeRoutes.sources.detector')
    return source || '—'
  }

  const editRoute = (route: CompositeModelRoute) => {
    setEditingId(route.id)
    setForm({
      public_model: route.public_model,
      match_type: route.match_type,
      target_platform: route.target_platform,
      upstream_model: route.upstream_model,
      endpoint: route.endpoint,
      priority: route.priority || 100,
      enabled: route.enabled,
      notes: route.notes || '',
    })
  }

  const handleSave = async () => {
    if (!form.public_model.trim()) {
      toast.error(t('admin.groups.compositeRoutes.publicModelRequired'))
      return
    }
    setSaving(true)
    try {
      const payload: CompositeModelRouteInput = {
        public_model: form.public_model.trim(),
        match_type: form.match_type,
        target_platform: form.target_platform,
        upstream_model: form.upstream_model.trim(),
        endpoint: form.endpoint,
        priority: Number(form.priority) || 100,
        enabled: form.enabled,
        notes: form.notes.trim(),
      }
      if (editingId) {
        await adminAPI.groups.updateCompositeRoute(group.id, editingId, payload)
        toast.success(t('admin.groups.compositeRoutes.routeUpdated'))
      } else {
        await adminAPI.groups.createCompositeRoute(group.id, payload)
        toast.success(t('admin.groups.compositeRoutes.routeCreated'))
      }
      resetForm()
      await loadRoutes()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.compositeRoutes.failedToSave')))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingRoute) return
    setDeleting(true)
    try {
      await adminAPI.groups.deleteCompositeRoute(group.id, deletingRoute.id)
      if (editingId === deletingRoute.id) resetForm()
      toast.success(t('admin.groups.compositeRoutes.routeDeleted'))
      setDeletingRoute(null)
      await loadRoutes()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.compositeRoutes.failedToDelete')))
      setDeletingRoute(null)
    } finally {
      setDeleting(false)
    }
  }

  const handlePreview = async () => {
    const model = previewModel.trim()
    if (!model) return
    setPreviewLoading(true)
    try {
      setDecision(await adminAPI.groups.previewCompositeRoute(group.id, { model, endpoint: previewEndpoint }))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.compositeRoutes.failedToPreview')))
    } finally {
      setPreviewLoading(false)
    }
  }

  const rows: RouteRow[] = routes.map((route) => ({ ...route }))

  const columns: TableColumn<RouteRow>[] = [
    {
      key: 'public_model',
      header: t('admin.groups.compositeRoutes.publicModel'),
      width: proportional(3),
      renderCell: (route: RouteRow) => (
        <VStack gap={1}>
          <Text weight="medium" color={route.enabled ? 'primary' : 'secondary'} wordBreak="break-all">
            {route.public_model}
          </Text>
          <HStack gap={1} wrap="wrap">
            <Badge label={matchLabel(route.match_type)} />
            {!route.enabled && <Badge variant="error" label={t('admin.accounts.status.inactive')} />}
          </HStack>
        </VStack>
      ),
    },
    {
      key: 'target_platform',
      header: t('admin.groups.compositeRoutes.target'),
      width: proportional(2),
      renderCell: (route: RouteRow) => (
        <VStack gap={1}>
          <Text>{groupPlatformLabel(t, route.target_platform)}</Text>
          <Text type="supporting" wordBreak="break-all">
            {route.upstream_model || route.public_model}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'endpoint',
      header: t('admin.groups.compositeRoutes.scope'),
      width: proportional(2),
      renderCell: (route: RouteRow) => (
        <VStack gap={1}>
          <Text>{endpointLabel(route.endpoint)}</Text>
          <Text type="supporting">
            {t('admin.groups.compositeRoutes.priority')}: {route.priority}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'actions',
      header: t('admin.groups.columns.actions'),
      width: pixel(88),
      align: 'end',
      renderCell: (route: RouteRow) => (
        <HStack gap={1} hAlign="end">
          <IconButton
            label={t('common.edit')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={PencilSquareIcon} />}
            onClick={() => editRoute(route)}
          />
          <IconButton
            label={t('common.delete')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={TrashIcon} />}
            onClick={() => setDeletingRoute(route)}
          />
        </HStack>
      ),
    },
  ]

  return (
    <>
      <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={896} maxHeight="85dvh" purpose="form">
        <Layout
          header={
            <DialogHeader
              title={t('admin.groups.compositeRoutes.titleWithGroup', { name: group.name })}
              onOpenChange={(open) => !open && onClose()}
            />
          }
          content={
            <LayoutContent>
              <Grid columns={{ minWidth: 360, repeat: 'fit' }} gap={5} align="start">
                {/* Saved routes */}
                <VStack gap={3} hAlign="stretch">
                  <HStack gap={3} vAlign="center" hAlign="between">
                    <Heading level={3}>{t('admin.groups.compositeRoutes.routes')}</Heading>
                    <IconButton
                      label={t('common.refresh')}
                      size="sm"
                      icon={<Icon icon={ArrowPathIcon} />}
                      isLoading={loading}
                      onClick={() => void loadRoutes()}
                    />
                  </HStack>
                  {loading ? (
                    <HStack hAlign="center" paddingBlock={8}>
                      <Spinner />
                    </HStack>
                  ) : rows.length === 0 ? (
                    <HStack hAlign="center" paddingBlock={8}>
                      <Text type="supporting">{t('admin.groups.compositeRoutes.empty')}</Text>
                    </HStack>
                  ) : (
                    <Table columns={columns} data={rows} idKey="id" density="compact" dividers="rows" verticalAlign="top" />
                  )}
                </VStack>

                <VStack gap={5} hAlign="stretch">
                  {/* Add / edit route */}
                  <VStack gap={3} hAlign="stretch">
                    <HStack gap={3} vAlign="center" hAlign="between">
                      <Heading level={3}>
                        {editingId
                          ? t('admin.groups.compositeRoutes.editRoute')
                          : t('admin.groups.compositeRoutes.addRoute')}
                      </Heading>
                      {editingId && (
                        <Button label={t('common.cancel')} variant="ghost" size="sm" onClick={resetForm} />
                      )}
                    </HStack>
                    <TextInput
                      label={t('admin.groups.compositeRoutes.publicModel')}
                      placeholder="openrouter/gpt-5"
                      value={form.public_model}
                      onChange={(public_model) => patch({ public_model })}
                      onEnter={handleSave}
                      isRequired
                    />
                    <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
                      <Selector
                        label={t('admin.groups.compositeRoutes.matchType')}
                        value={form.match_type}
                        onChange={(value) => patch({ match_type: value as CompositeRouteMatchType })}
                        options={matchOptions}
                      />
                      <Selector
                        label={t('admin.groups.compositeRoutes.endpoint')}
                        value={form.endpoint}
                        onChange={(value) => patch({ endpoint: value as CompositeRouteEndpoint })}
                        options={endpointOptions}
                      />
                    </Grid>
                    <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
                      <Selector
                        label={t('admin.groups.compositeRoutes.targetPlatform')}
                        value={form.target_platform}
                        onChange={(value) => patch({ target_platform: value as ConcretePlatform })}
                        options={platformOptions}
                      />
                      <NumberInput
                        label={t('admin.groups.compositeRoutes.priority')}
                        value={form.priority}
                        onChange={(priority) => patch({ priority })}
                        min={1}
                        step={1}
                        isIntegerOnly
                      />
                    </Grid>
                    <TextInput
                      label={t('admin.groups.compositeRoutes.upstreamModel')}
                      description={t('admin.groups.compositeRoutes.upstreamModelHint')}
                      placeholder="gpt-5"
                      value={form.upstream_model}
                      onChange={(upstream_model) => patch({ upstream_model })}
                      onEnter={handleSave}
                    />
                    <TextArea
                      label={t('admin.groups.compositeRoutes.notes')}
                      value={form.notes}
                      onChange={(notes) => patch({ notes })}
                      rows={2}
                    />
                    <HStack gap={3} vAlign="center" hAlign="between">
                      <CheckboxInput
                        label={t('admin.groups.compositeRoutes.enabled')}
                        value={form.enabled}
                        onChange={(enabled) => patch({ enabled })}
                      />
                      <Button
                        label={editingId ? t('common.update') : t('common.create')}
                        variant="primary"
                        icon={<Icon icon={CheckIcon} />}
                        isLoading={saving}
                        onClick={handleSave}
                      />
                    </HStack>
                  </VStack>

                  <Divider />

                  {/* Routing preview */}
                  <VStack gap={3} hAlign="stretch">
                    <Heading level={3}>{t('admin.groups.compositeRoutes.preview')}</Heading>
                    <TextInput
                      label={t('admin.groups.compositeRoutes.publicModel')}
                      isLabelHidden
                      placeholder="openrouter/gpt-5"
                      value={previewModel}
                      onChange={setPreviewModel}
                      onEnter={handlePreview}
                    />
                    <HStack gap={2} vAlign="center">
                      <StackItem size="fill">
                        <Selector
                          label={t('admin.groups.compositeRoutes.endpoint')}
                          isLabelHidden
                          value={previewEndpoint}
                          onChange={(value) => setPreviewEndpoint(value as CompositeRouteEndpoint)}
                          options={endpointOptions}
                        />
                      </StackItem>
                      <IconButton
                        label={t('admin.groups.compositeRoutes.preview')}
                        icon={<Icon icon={PlayIcon} />}
                        isLoading={previewLoading}
                        isDisabled={!previewModel.trim()}
                        onClick={handlePreview}
                      />
                    </HStack>
                    {decision && (
                      <Section variant="muted" padding={3}>
                        <VStack gap={2}>
                          <HStack gap={2} vAlign="center" wrap="wrap">
                            <Badge
                              variant={decision.matched ? 'success' : 'error'}
                              label={
                                decision.matched
                                  ? t('admin.groups.compositeRoutes.matched')
                                  : t('admin.groups.compositeRoutes.notMatched')
                              }
                            />
                            <Badge label={sourceLabel(decision.source)} />
                          </HStack>
                          {decision.matched ? (
                            <VStack gap={1}>
                              <Text>
                                {t('admin.groups.compositeRoutes.targetPlatform')}:{' '}
                                {groupPlatformLabel(t, decision.target_platform)}
                              </Text>
                              <Text wordBreak="break-all">
                                {t('admin.groups.compositeRoutes.upstreamModel')}: {decision.upstream_model}
                              </Text>
                            </VStack>
                          ) : (
                            <Text type="supporting">{decision.reason}</Text>
                          )}
                        </VStack>
                      </Section>
                    )}
                  </VStack>
                </VStack>
              </Grid>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.close')} variant="secondary" onClick={onClose} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={deletingRoute !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRoute(null)
        }}
        title={t('admin.groups.compositeRoutes.deleteConfirm')}
        description={
          deletingRoute
            ? `${deletingRoute.public_model} → ${groupPlatformLabel(t, deletingRoute.target_platform)} · ${
                deletingRoute.upstream_model || deletingRoute.public_model
              }`
            : ''
        }
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={handleDelete}
      />
    </>
  )
}
