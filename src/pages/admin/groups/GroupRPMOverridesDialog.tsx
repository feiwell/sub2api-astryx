import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Table, proportional, pixel, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Divider } from '@astryxdesign/core/Divider'
import { Spinner } from '@astryxdesign/core/Spinner'
import { TrashIcon } from '@heroicons/react/24/outline'
import type { AdminGroup, AdminUser } from '@/types'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import type { GroupRPMOverrideEntry } from '~/lib/api/admin/groups'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { GroupSummary, GroupUserSearch } from './GroupUserOverrideParts'

interface EntryRow extends GroupRPMOverrideEntry, Record<string, unknown> {}

interface GroupRPMOverridesDialogProps {
  group: AdminGroup
  onClose: () => void
  onSaved: () => void
}

/**
 * Per-user RPM overrides of a group (port of GroupRPMOverridesModal.vue).
 * Edits stay local until Save, which submits the whole list; "clear all"
 * deletes the stored overrides immediately, like the Vue modal.
 */
export function GroupRPMOverridesDialog({ group, onClose, onSaved }: GroupRPMOverridesDialogProps) {
  const { t } = useI18n()
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [serverEntries, setServerEntries] = useState<GroupRPMOverrideEntry[]>([])
  const [localEntries, setLocalEntries] = useState<GroupRPMOverrideEntry[]>([])
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [newRpm, setNewRpm] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI.groups
      .getGroupRPMOverrides(group.id)
      .then((entries) => {
        if (cancelled) return
        setServerEntries(entries)
        setLocalEntries(entries.map((e) => ({ ...e })))
      })
      .catch(() => {
        if (!cancelled) toast.error(t('admin.groups.failedToLoad'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [group.id, t])

  const isDirty = useMemo(() => {
    if (localEntries.length !== serverEntries.length) return true
    const serverMap = new Map(serverEntries.map((e) => [e.user_id, e.rpm_override]))
    return localEntries.some((e) => serverMap.get(e.user_id) !== e.rpm_override)
  }, [localEntries, serverEntries])

  const totalPages = Math.max(1, Math.ceil(localEntries.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows: EntryRow[] = localEntries
    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
    .map((e) => ({ ...e }))

  const canAdd = selectedUser != null && newRpm != null && Number.isInteger(newRpm) && newRpm >= 0

  // Add a user locally, or overwrite the user's existing entry
  const handleAddLocal = () => {
    if (!selectedUser || newRpm == null || !Number.isInteger(newRpm) || newRpm < 0) return
    const user = selectedUser
    const entry: GroupRPMOverrideEntry = {
      user_id: user.id,
      user_name: user.username || '',
      user_email: user.email,
      user_notes: user.notes || '',
      user_status: user.status || 'active',
      rpm_override: newRpm,
    }
    setLocalEntries((prev) => {
      const idx = prev.findIndex((e) => e.user_id === user.id)
      if (idx < 0) return [...prev, entry]
      const next = [...prev]
      next[idx] = entry
      return next
    })
    setSelectedUser(null)
    setNewRpm(null)
  }

  // Only non-negative integers are accepted; an empty field keeps the old value
  const updateLocalRpm = (userId: number, value: number | null) => {
    if (value == null || !Number.isInteger(value) || value < 0) return
    setLocalEntries((prev) => prev.map((e) => (e.user_id === userId ? { ...e, rpm_override: value } : e)))
  }

  const removeLocal = (userId: number) => {
    setLocalEntries((prev) => prev.filter((e) => e.user_id !== userId))
  }

  const handleClearAll = async () => {
    if (clearing) return
    setClearing(true)
    try {
      await adminAPI.groups.clearGroupRPMOverrides(group.id)
      setLocalEntries([])
      setServerEntries([])
      toast.success(t('admin.groups.rpmSaved'))
      onSaved()
    } catch {
      toast.error(t('admin.groups.failedToSave'))
    } finally {
      setClearing(false)
    }
  }

  const handleRevert = () => {
    setLocalEntries(serverEntries.map((e) => ({ ...e })))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = localEntries.map((e) => ({ user_id: e.user_id, rpm_override: e.rpm_override }))
      await adminAPI.groups.batchSetGroupRPMOverrides(group.id, entries)
      toast.success(t('admin.groups.rpmSaved'))
      onSaved()
      onClose()
    } catch {
      toast.error(t('admin.groups.failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  // Closing with unsaved edits discards them, like the Vue modal
  const handleClose = () => {
    if (isDirty) handleRevert()
    onClose()
  }

  const columns: TableColumn<EntryRow>[] = [
    {
      key: 'user_email',
      header: t('admin.groups.columns.userEmail'),
      width: proportional(2, { minWidth: 160 }),
      renderCell: (entry: EntryRow) => <Text type="supporting">{entry.user_email}</Text>,
    },
    {
      key: 'user_id',
      header: t('admin.groups.columns.id'),
      width: pixel(64),
      renderCell: (entry: EntryRow) => <Text type="supporting">{entry.user_id}</Text>,
    },
    {
      key: 'user_name',
      header: t('admin.groups.columns.userName'),
      width: proportional(1),
      renderCell: (entry: EntryRow) => <Text>{entry.user_name || '-'}</Text>,
    },
    {
      key: 'user_notes',
      header: t('admin.groups.columns.userNotes'),
      width: proportional(1),
      renderCell: (entry: EntryRow) => (
        <Text type="supporting" maxLines={1}>
          {entry.user_notes || '-'}
        </Text>
      ),
    },
    {
      key: 'user_status',
      header: t('admin.groups.columns.userStatus'),
      width: pixel(96),
      renderCell: (entry: EntryRow) => (
        <Badge variant={entry.user_status === 'active' ? 'success' : 'neutral'} label={entry.user_status} />
      ),
    },
    {
      key: 'rpm_override',
      header: t('admin.groups.columns.rpmOverride'),
      width: pixel(136),
      renderCell: (entry: EntryRow) => (
        <NumberInput
          label={t('admin.groups.columns.rpmOverride')}
          labelTooltip={t('admin.groups.columns.rpmOverrideHint')}
          isLabelHidden
          size="sm"
          value={entry.rpm_override}
          onChange={(value) => updateLocalRpm(entry.user_id, value)}
          hasClear
          min={0}
          step={1}
          isIntegerOnly
          isWheelEnabled={false}
        />
      ),
    },
    {
      key: 'remove',
      header: '',
      width: pixel(56),
      renderCell: (entry: EntryRow) => (
        <IconButton
          label={t('common.delete')}
          variant="ghost"
          size="sm"
          icon={<Icon icon={TrashIcon} />}
          onClick={() => removeLocal(entry.user_id)}
        />
      ),
    },
  ]

  return (
    <Dialog isOpen onOpenChange={(open) => !open && handleClose()} width={896} maxHeight="85dvh" purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.groups.rpmOverridesTitle')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <GroupSummary
                group={group}
                metric={`${t('admin.groups.groupRpmDefault')}: ${group.rpm_limit || 0}`}
              />

              {/* Add user */}
              <VStack gap={2} hAlign="stretch">
                <Heading level={3}>{t('admin.groups.addUserRpm')}</Heading>
                <HStack gap={2} vAlign="end">
                  <StackItem size="fill">
                    <GroupUserSearch value={selectedUser} onChange={setSelectedUser} />
                  </StackItem>
                  <NumberInput
                    label={t('admin.groups.columns.rpmOverride')}
                    isLabelHidden
                    width={112}
                    placeholder="100"
                    value={newRpm}
                    onChange={setNewRpm}
                    hasClear
                    min={0}
                    step={1}
                    isIntegerOnly
                    onEnter={handleAddLocal}
                  />
                  <Button
                    label={t('common.add')}
                    variant="primary"
                    isDisabled={!canAdd}
                    onClick={handleAddLocal}
                  />
                </HStack>

                {localEntries.length > 0 && (
                  <>
                    <Divider />
                    <HStack gap={3} vAlign="center" hAlign="end">
                      <Button
                        label={t('admin.groups.clearAll')}
                        variant="destructive"
                        size="sm"
                        isLoading={clearing}
                        onClick={handleClearAll}
                      />
                    </HStack>
                  </>
                )}
              </VStack>

              {loading ? (
                <HStack hAlign="center" paddingBlock={6}>
                  <Spinner />
                </HStack>
              ) : (
                <VStack gap={2} hAlign="stretch">
                  <Heading level={3}>
                    {t('admin.groups.rpmOverrides')} ({localEntries.length})
                  </Heading>
                  {localEntries.length === 0 ? (
                    <HStack hAlign="center" paddingBlock={6}>
                      <Text type="supporting">{t('admin.groups.noRpmOverrides')}</Text>
                    </HStack>
                  ) : (
                    <>
                      <Table
                        columns={columns}
                        data={pageRows}
                        idKey="user_id"
                        density="compact"
                        dividers="rows"
                        hasHover
                      />
                      <Pagination
                        page={currentPage}
                        onChange={setPage}
                        totalItems={localEntries.length}
                        pageSize={pageSize}
                        pageSizeOptions={pageSizeOptions}
                        onPageSizeChange={(size) => {
                          setPageSize(size)
                          setPage(1)
                        }}
                        size="sm"
                      />
                    </>
                  )}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} vAlign="center" hAlign="between">
              <HStack gap={2} vAlign="center">
                {isDirty && (
                  <>
                    <Badge variant="warning" label={t('admin.groups.unsavedChanges')} />
                    <Button label={t('admin.groups.revertChanges')} variant="ghost" size="sm" onClick={handleRevert} />
                  </>
                )}
              </HStack>
              <HStack gap={3} vAlign="center">
                <Button label={t('common.close')} variant="secondary" onClick={handleClose} />
                {isDirty && (
                  <Button label={t('common.save')} variant="primary" isLoading={saving} onClick={handleSave} />
                )}
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
