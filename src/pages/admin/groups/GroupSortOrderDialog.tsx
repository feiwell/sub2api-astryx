import { useEffect, useMemo, useState } from 'react'
import { createReorderable } from '@astryxdesign/core'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import type { AdminGroup } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { groupPlatformLabel } from './groupPlatform'

interface GroupSortOrderDialogProps {
  onClose: () => void
  onSaved: () => void
}

/**
 * Reorders every group (unpaginated). Rows are dragged by their handle, or
 * moved with the arrow keys after activating it; saving writes sort_order as
 * index * 10.
 */
export function GroupSortOrderDialog({ onClose, onSaved }: GroupSortOrderDialogProps) {
  const { t } = useI18n()
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    adminAPI.groups
      .getAll()
      .then((all) => {
        if (!cancelled) setGroups([...all].sort((a, b) => a.sort_order - b.sort_order))
      })
      .catch(() => {
        if (cancelled) return
        toast.error(t('admin.groups.failedToLoad'))
        onClose()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Load once per open (the dialog mounts on open); onClose is only used if that load fails
  }, [t])

  const reorderable = useMemo(
    () =>
      createReorderable({
        onReorder: ({ key, to }) => {
          setGroups((prev) => {
            const from = prev.findIndex((g) => g.id === key)
            if (from < 0) return prev
            const next = [...prev]
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            return next
          })
        },
      }),
    [],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = groups.map((g, index) => ({ id: g.id, sort_order: index * 10 }))
      await adminAPI.groups.updateSortOrder(updates)
      toast.success(t('admin.groups.sortOrderUpdated'))
      onSaved()
      onClose()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.groups.failedToUpdateSortOrder')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={512} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.groups.sortOrder')} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Text type="supporting">{t('admin.groups.sortOrderHint')}</Text>
              {loading ? (
                <HStack hAlign="center" paddingBlock={6}>
                  <Spinner />
                </HStack>
              ) : (
                <List hasDividers reorderable={reorderable} edge="outset">
                  {groups.map((group) => (
                    <ListItem
                      key={group.id}
                      itemKey={group.id}
                      label={group.name}
                      description={<Badge label={groupPlatformLabel(t, group.platform)} />}
                      endContent={<Text type="supporting">#{group.id}</Text>}
                    />
                  ))}
                </List>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={saving ? t('common.saving') : t('common.save')}
                variant="primary"
                isLoading={saving}
                isDisabled={loading}
                onClick={handleSave}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
