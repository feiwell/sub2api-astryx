import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import type { SubscriptionPlan } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'

/**
 * Asks before a plan is deleted, and deletes it. Mount it for each plan to delete. Port of the delete
 * confirmation of views/admin/orders/AdminPaymentPlansView.vue.
 */
export function DeletePlanDialog({
  plan,
  onClose,
  onDeleted,
}: {
  plan: SubscriptionPlan
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const [isDeleting, setDeleting] = useState(false)

  const remove = async () => {
    if (isDeleting) return
    setDeleting(true)
    try {
      await adminAPI.payment.deletePlan(plan.id)
    } catch (error) {
      // The dialog stays: a plan with orders still open can be deleted once they are done.
      toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
      setDeleting(false)
      return
    }
    toast.success(t('common.deleted'))
    onDeleted()
    onClose()
  }

  return (
    <AlertDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isDeleting) onClose()
      }}
      title={t('payment.admin.deletePlan')}
      // The question itself does not say which plan; its name goes before it.
      description={`${plan.name} — ${t('payment.admin.deletePlanConfirm')}`}
      actionLabel={t('common.delete')}
      actionVariant="destructive"
      cancelLabel={t('common.cancel')}
      isActionLoading={isDeleting}
      onAction={() => void remove()}
    />
  )
}
