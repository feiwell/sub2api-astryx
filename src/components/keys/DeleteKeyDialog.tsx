import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { keysAPI } from '@/api'
import type { ApiKey } from '@/types'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

interface DeleteKeyDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  apiKey: ApiKey | null
}

export function DeleteKeyDialog({ isOpen, onClose, onSuccess, apiKey }: DeleteKeyDialogProps) {
  const { t } = useI18n()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!apiKey) return
    setDeleting(true)
    try {
      await keysAPI.delete(apiKey.id)
      toast.success(t('keys.keyDeletedSuccess'))
      onClose()
      onSuccess()
    } catch (error) {
      // The server's own message (e.g. a permission error) says more than the generic text.
      toast.error((error as { message?: string } | null)?.message || t('keys.failedToDelete'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={t('keys.deleteKey')}
      description={t('keys.deleteConfirmMessage', { name: apiKey?.name ?? '' })}
      actionLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      isActionLoading={deleting}
      onAction={() => void handleDelete()}
    />
  )
}
