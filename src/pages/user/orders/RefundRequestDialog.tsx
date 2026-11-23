import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { paymentAPI } from '@/api/payment'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { creditText, refundReasonOf } from './myOrderModel'

const DIALOG_WIDTH = 480

/**
 * Asks for the money of a completed order back, with a reason; whether it is granted is decided by an
 * administrator. Mount it for each opening. Port of the refund dialog of UserOrdersView.vue.
 */
export function RefundRequestDialog({
  order,
  onClose,
  onChanged,
}: {
  order: PaymentOrder
  onClose: () => void
  /** The order may no longer be what the list shows: the request was taken, or refused for what it has become. */
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [isSending, setSending] = useState(false)
  const sentReason = refundReasonOf(reason)

  const close = () => {
    if (!isSending) onClose()
  }
  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) close()
  }

  const send = async () => {
    if (isSending || !sentReason) return
    setSending(true)
    try {
      await paymentAPI.requestRefund(order.id, { reason: sentReason })
    } catch (error) {
      toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
      onChanged()
      setSending(false)
      return
    }
    toast.success(t('common.success'))
    onChanged()
    onClose()
  }

  return (
    // While the request is being sent the dialog stays: Escape, the close button and Cancel are off.
    <Dialog
      isOpen
      onOpenChange={reportOpen}
      width={DIALOG_WIDTH}
      maxHeight="90dvh"
      purpose={isSending ? 'required' : 'form'}
    >
      <Layout
        header={
          <DialogHeader title={t('payment.orders.requestRefund')} onOpenChange={isSending ? undefined : reportOpen} />
        }
        content={
          <LayoutContent>
            <VStack gap={5} hAlign="stretch">
              <MetadataList columns={2}>
                <MetadataListItem label={t('payment.orders.orderId')}>
                  <Text hasTabularNumbers>{`#${order.id}`}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.amount')}>
                  <Text hasTabularNumbers>{creditText(order.amount)}</Text>
                </MetadataListItem>
              </MetadataList>

              <TextArea
                label={t('payment.refundReason')}
                placeholder={t('payment.refundReasonPlaceholder')}
                rows={3}
                width="100%"
                isRequired
                value={reason}
                onChange={setReason}
                isDisabled={isSending}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isSending} onClick={close} />
              {/* The request needs a reason; until one is written it cannot be sent. */}
              <Button
                label={isSending ? t('common.processing') : t('payment.orders.requestRefund')}
                variant="primary"
                isLoading={isSending}
                isDisabled={!sentReason}
                onClick={() => void send()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
