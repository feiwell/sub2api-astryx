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
import type { GroupRateMultiplierEntry } from '~/lib/api/admin/groups'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { GroupSummary, GroupUserSearch } from './GroupUserOverrideParts'

interface EntryRow extends GroupRateMultiplierEntry, Record<string, unknown> {}

interface GroupRateMultipliersDialogProps {
  group: AdminGroup
  onClose: () => void
  onSaved: () => void
}

/**
 * Per-user rate multipliers of a group. Edits stay local until Save, which
 * submits the whole list (rate_multiplier only; RPM overrides are kept).
 */
export function GroupRateMultipliersDialog({ group, onClose, onSaved }: GroupRateMultipliersDialogProps) {
  const { t } = useI18n()
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [serverEntries, setServerEntries] = useState<GroupRateMultiplierEntry[]>([])
  const [localEntries, setLocalEntries] = useState<GroupRateMultiplierEntry[]>([])
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [newRate, setNewRate] = useState<number | null>(null)
  const [batchFactor, setBatchFactor] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI.groups
      .getGroupRateMultipliers(group.id)
      .then((raw) => {
        if (cancelled) return
        // Only users with a rate multiplier; RPM-only rows belong to the RPM overrides dialog
        const entries = raw.filter((e) => e.rate_multiplier != null)
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
    const serverMap = new Map(serverEntries.map((e) => [e.user_id, e.rate_multiplier ?? null]))
    return localEntries.some((e) => serverMap.get(e.user_id) !== (e.rate_multiplier ?? null))
  }, [localEntries, serverEntries])

  const totalPages = Math.max(1, Math.ceil(localEntries.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows: EntryRow[] = localEntries
    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
    .map((e) => ({ ...e }))

  // Final-rate preview column while a batch factor other than 1 is entered
  const showFinalRate = batchFactor != null && batchFactor > 0 && batchFactor !== 1
  const computeFinalRate = (rate: number | null | undefined) => {
    const base = rate ?? group.rate_multiplier ?? 1
    if (!batchFactor) return base
    return parseFloat((base * batchFactor).toFixed(6))
  }

  // Add a user locally, or overwrite the user's existing entry
  const handleAddLocal = () => {
    if (!selectedUser || newRate == null || newRate <= 0) return
    const user = selectedUser
    const entry: GroupRateMultiplierEntry = {
      user_id: user.id,
      user_name: user.username || '',
      user_email: user.email,
      user_notes: user.notes || '',
      user_status: user.status || 'active',
      rate_multiplier: newRate,
      rpm_override: null,
    }
    setLocalEntries((prev) => {
      const idx = prev.findIndex((e) => e.user_id === user.id)
      if (idx < 0) return [...prev, entry]
      const next = [...prev]
      next[idx] = entry
      return next
    })
    setSelectedUser(null)
    setNewRate(null)
  }

  // A cleared field falls back to the group rate (null)
  const updateLocalRate = (userId: number, value: number | null) => {
    if (value != null && (!Number.isFinite(value) || value <= 0)) return
    setLocalEntries((prev) => prev.map((e) => (e.user_id === userId ? { ...e, rate_multiplier: value } : e)))
  }

  const removeLocal = (userId: number) => {
    setLocalEntries((prev) => prev.filter((e) => e.user_id !== userId))
  }

  const applyBatchFactor = () => {
    if (!batchFactor || batchFactor <= 0) return
    setLocalEntries((prev) =>
      prev.map((e) =>
        e.rate_multiplier != null
          ? { ...e, rate_multiplier: parseFloat((e.rate_multiplier * batchFactor).toFixed(6)) }
          : e,
      ),
    )
    setBatchFactor(null)
  }

  const handleRevert = () => {
    setLocalEntries(serverEntries.map((e) => ({ ...e })))
    setBatchFactor(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = localEntries
        .filter((e) => e.rate_multiplier != null)
        .map((e) => ({ user_id: e.user_id, rate_multiplier: e.rate_multiplier as number }))
      await adminAPI.groups.batchSetGroupRateMultipliers(group.id, entries)
      toast.success(t('admin.groups.rateSaved'))
      onSaved()
      onClose()
    } catch {
      toast.error(t('admin.groups.failedToSave'))
    } finally {
      setSaving(false)
    }
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
      key: 'rate_multiplier',
      header: t('admin.groups.columns.rateMultiplier'),
      width: pixel(136),
      renderCell: (entry: EntryRow) => (
        <NumberInput
          label={t('admin.groups.columns.rateMultiplier')}
          isLabelHidden
          size="sm"
          value={entry.rate_multiplier ?? null}
          placeholder={String(group.rate_multiplier ?? 1)}
          onChange={(value) => updateLocalRate(entry.user_id, value)}
          hasClear
          min={0.001}
          step={0.001}
          isWheelEnabled={false}
        />
      ),
    },
    ...(showFinalRate
      ? [
          {
            key: 'final_rate',
            header: t('admin.groups.finalRate'),
            width: pixel(96),
            renderCell: (entry: EntryRow) => (
              <Text weight="medium" color="accent">
                {computeFinalRate(entry.rate_multiplier)}
              </Text>
            ),
          },
        ]
      : []),
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
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={896} maxHeight="85dvh" purpose="form">
      <Layout
        header={
          <DialogHeader title={t('admin.groups.rateMultipliersTitle')} onOpenChange={(open) => !open && onClose()} />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <GroupSummary
                group={group}
                metric={`${t('admin.groups.columns.rateMultiplier')}: ${group.rate_multiplier}x`}
              />

              {/* Add user */}
              <VStack gap={2} hAlign="stretch">
                <Heading level={3}>{t('admin.groups.addUserRate')}</Heading>
                <HStack gap={2} vAlign="end">
                  <StackItem size="fill">
                    <GroupUserSearch value={selectedUser} onChange={setSelectedUser} />
                  </StackItem>
                  <NumberInput
                    label={t('admin.groups.columns.rateMultiplier')}
                    isLabelHidden
                    width={112}
                    placeholder="1.0"
                    value={newRate}
                    onChange={setNewRate}
                    hasClear
                    min={0}
                    step={0.001}
                    onEnter={handleAddLocal}
                  />
                  <Button
                    label={t('common.add')}
                    variant="primary"
                    isDisabled={!selectedUser || newRate == null || newRate <= 0}
                    onClick={handleAddLocal}
                  />
                </HStack>

                {/* Batch adjust + clear all */}
                {localEntries.length > 0 && (
                  <>
                    <Divider />
                    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                      <HStack gap={2} vAlign="center">
                        <Text type="supporting" weight="medium">
                          {t('admin.groups.batchAdjust')}
                        </Text>
                        <Text type="supporting">×</Text>
                        <NumberInput
                          label={t('admin.groups.multiplierFactor')}
                          isLabelHidden
                          size="sm"
                          width={96}
                          placeholder="0.5"
                          value={batchFactor}
                          onChange={setBatchFactor}
                          hasClear
                          min={0}
                          step={0.1}
                          onEnter={applyBatchFactor}
                        />
                        <Button
                          label={t('admin.groups.applyMultiplier')}
                          variant="primary"
                          size="sm"
                          isDisabled={!batchFactor || batchFactor <= 0}
                          onClick={applyBatchFactor}
                        />
                      </HStack>
                      <Button
                        label={t('admin.groups.clearAll')}
                        variant="destructive"
                        size="sm"
                        onClick={() => setLocalEntries([])}
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
                    {t('admin.groups.rateMultipliers')} ({localEntries.length})
                  </Heading>
                  {localEntries.length === 0 ? (
                    <HStack hAlign="center" paddingBlock={6}>
                      <Text type="supporting">{t('admin.groups.noRateMultipliers')}</Text>
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
                <Button label={t('common.close')} variant="secondary" onClick={onClose} />
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
