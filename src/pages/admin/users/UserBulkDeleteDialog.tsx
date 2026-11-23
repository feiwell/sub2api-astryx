import { useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'

interface UserBulkDeleteDialogProps {
  isOpen: boolean
  selectedIds: number[]
  onClose: () => void
  onSaved: () => void
}

export function UserBulkDeleteDialog({ isOpen, selectedIds, onClose, onSaved }: UserBulkDeleteDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)

  const handleConfirmDelete = async () => {
    setLoading(true)
    try {
      // Vue reports per-user outcomes rather than aborting on the first failure.
      const results = await Promise.allSettled(selectedIds.map((id) => adminAPI.users.delete(id)))
      const failed = results.filter((r) => r.status === 'rejected').length
      const deleted = results.length - failed
      if (deleted > 0) toast.success(t('admin.users.bulkDelete.success', { count: deleted }))
      if (failed > 0) toast.error(t('admin.users.bulkDelete.failed', { count: failed }))
      onSaved()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={480}>
      <Layout
        header={
          <DialogHeader
            title={t('admin.users.bulkDelete.title')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {/* Vue's bulkDelete.confirm already carries the irreversibility warning. */}
              <Text type="body">
                {t('admin.users.bulkDelete.confirm', { count: selectedIds.length })}
              </Text>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={t('common.delete')}
                variant="destructive"
                isLoading={loading}
                onClick={handleConfirmDelete}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
