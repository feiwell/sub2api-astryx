import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { paymentAPI } from '@/api/payment'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { cancelOutcome } from './myOrderModel'

/**
 * Asks before an unpaid order is cancelled, and cancels it. Mount it for each order to cancel. Port of
 * the cancel confirmation of UserOrdersView.vue.
 */
export function CancelOrderDialog({
  order,
  onClose,
  onChanged,
}: {
  order: PaymentOrder
  onClose: () => void
  /** The order may no longer be what the list shows: it was cancelled, or turned out to be something else. */
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [isCancelling, setCancelling] = useState(false)

  const cancel = async () => {
    if (isCancelling) return
    setCancelling(true)
    try {
      const answer = await paymentAPI.cancelOrder(order.id)
      // An order found to be paid after all is fulfilled, not cancelled; the list shows what became of it.
      if (cancelOutcome(answer.data) === 'alreadyPaid') toast.warning(t('payment.errors.CONFLICT'))
      else toast.success(t('common.success'))
    } catch (error) {
      // The dialog stays, over a list that now shows why: mostly the order is no longer unpaid.
      toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
      onChanged()
      setCancelling(false)
      return
    }
    onChanged()
    onClose()
  }

  return (
    <AlertDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isCancelling) onClose()
      }}
      title={t('payment.orders.cancel')}
      // The question itself does not say which order; its number goes before it.
      description={`#${order.id} — ${t('payment.confirmCancel')}`}
      actionLabel={t('payment.orders.cancel')}
      actionVariant="destructive"
      cancelLabel={t('common.cancel')}
      isActionLoading={isCancelling}
      onAction={() => void cancel()}
    />
  )
}
