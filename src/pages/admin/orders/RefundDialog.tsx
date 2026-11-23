import { useEffect, useId, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { entryErrorStatus } from '../promptAudit/configText'
import {
  creditText,
  formatOrderTime,
  maxRefundable,
  orderUserLabel,
  paidText,
  refundFormOf,
  refundOutcome,
  refundProblems,
  refundRequest,
  refundedAmount,
  type AdminOrder,
  type RefundForm,
} from './orderModel'

const DIALOG_WIDTH = 560
const AMOUNT_STEP = 0.01

/**
 * Refunds an order, in whole or in part. Mount it for each opening: it starts from what the user asked
 * for when there is a request, else from all that can still go back. Port of AdminRefundDialog.vue and
 * the refund handling of AdminOrdersView.vue.
 */
export function RefundDialog({
  order,
  onClose,
  onChanged,
}: {
  order: AdminOrder
  onClose: () => void
  /** The order may no longer be what the list shows: a refund went through, or failed on the way. */
  onChanged: () => void
}) {
  const { t, locale } = useI18n()
  const fieldsId = useId()
  const [form, setForm] = useState<RefundForm>(() => refundFormOf(order))
  const [isSaving, setSaving] = useState(false)
  // A reason left out is pointed out once confirming was tried, not while the form is filled in.
  const [wasConfirmTried, setConfirmTried] = useState(false)
  // Set while the amount field holds text it cannot take. The field keeps its last number then, which is
  // not what the user sees, so it must not be sent.
  const [amountEntryError, setAmountEntryError] = useState<NumberInputEntryError | null>(null)
  // What the server said when it would only refund on being told to ignore the balance check; null
  // while it has not asked for that.
  const [forceWarning, setForceWarning] = useState<string | null>(null)
  // Raised to send the focus to the first field that stands in the way of confirming.
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    if (focusRequest === 0) return
    const field = document.getElementById(fieldsId)?.querySelector<HTMLElement>('[aria-invalid="true"]')
    field?.scrollIntoView({ block: 'nearest' })
    field?.focus()
  }, [focusRequest, fieldsId])

  const limit = maxRefundable(order)
  const refunded = refundedAmount(order)
  const problems = refundProblems(form, order)
  const needsForce = forceWarning !== null
  const cannotConfirm = Object.keys(problems).length > 0 || amountEntryError !== null
  const hasRequest = !!order.refund_requested_at || !!order.refund_request_reason

  // A wrong amount is said at once, unlike a reason not yet written: it is something that was typed.
  const amountStatus = amountEntryError
    ? entryErrorStatus(amountEntryError)
    : problems.amount === 'tooMuch'
      ? { type: 'error' as const, message: t('payment.errors.REFUND_AMOUNT_EXCEEDED') }
      : problems.amount === 'tooLittle'
        ? { type: 'error' as const, message: t('payment.errors.INVALID_AMOUNT') }
        : undefined

  const edit = (patch: Partial<RefundForm>) => setForm((current) => ({ ...current, ...patch }))

  const changeDeduction = (deductBalance: boolean) => {
    edit({ deductBalance, force: false })
    // The balance check the server asked to be let off belongs to the deduction as it was set.
    setForceWarning(null)
  }

  const close = () => {
    if (!isSaving) onClose()
  }
  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) close()
  }

  const confirm = async () => {
    if (isSaving) return
    const { amount } = form
    if (cannotConfirm || amount === null) {
      setConfirmTried(true)
      setFocusRequest((request) => request + 1)
      return
    }
    if (needsForce && !form.force) return
    setSaving(true)
    try {
      const answer = await adminAPI.payment.refundOrder(order.id, refundRequest({ ...form, amount }))
      const outcome = refundOutcome(answer.data)
      if (outcome === 'needsForce') {
        // The dialog stays, now with the switch that lets the refund go ahead anyway.
        setForceWarning(answer.data.warning || '')
        setSaving(false)
        return
      }
      if (outcome === 'failed') {
        toast.error(answer.data?.warning || t('common.error'))
        onChanged()
        setSaving(false)
        return
      }
      toast.success(outcome === 'done' ? t('payment.admin.refundSuccess') : t('payment.admin.refundPending'))
    } catch (error) {
      toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
      // A refund that failed at the payment provider leaves the order marked as such.
      onChanged()
      setSaving(false)
      return
    }
    onChanged()
    onClose()
  }

  return (
    // While the refund is being sent the dialog stays: Escape, the close button and Cancel are off.
    <Dialog
      isOpen
      onOpenChange={reportOpen}
      width={DIALOG_WIDTH}
      maxHeight="90dvh"
      purpose={isSaving ? 'required' : 'form'}
    >
      <Layout
        header={
          <DialogHeader title={t('payment.admin.refundOrder')} onOpenChange={isSaving ? undefined : reportOpen} />
        }
        content={
          <LayoutContent>
            <VStack id={fieldsId} gap={5} hAlign="stretch">
              {hasRequest && (
                <Banner
                  status="info"
                  title={t('payment.admin.refundRequestInfo')}
                  description={
                    <VStack gap={1}>
                      {order.refund_requested_at && (
                        <Text type="supporting" hasTabularNumbers>
                          {`${t('payment.admin.refundRequestedAt')}: ${formatOrderTime(order.refund_requested_at, locale)}`}
                        </Text>
                      )}
                      {order.refund_request_reason && (
                        <Text type="supporting" wordBreak="break-word">
                          {`${t('payment.admin.refundRequestReason')}: ${order.refund_request_reason}`}
                        </Text>
                      )}
                    </VStack>
                  }
                />
              )}

              <MetadataList columns={2}>
                <MetadataListItem label={t('payment.orders.orderId')}>
                  <Text hasTabularNumbers>{`#${order.id}`}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.admin.colUser')}>
                  <Text wordBreak="break-all">{orderUserLabel(order)}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.creditedAmount')}>
                  <Text hasTabularNumbers>{creditText(order.amount)}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.payAmount')}>
                  <Text hasTabularNumbers>{paidText(order)}</Text>
                </MetadataListItem>
                {refunded > 0 && (
                  <MetadataListItem label={t('payment.admin.alreadyRefunded')}>
                    <Text hasTabularNumbers>{creditText(refunded)}</Text>
                  </MetadataListItem>
                )}
              </MetadataList>

              <Switch
                label={t('payment.admin.deductBalance')}
                description={form.deductBalance ? t('payment.admin.deductBalanceHint') : t('payment.admin.noDeduction')}
                value={form.deductBalance}
                onChange={changeDeduction}
                labelPosition="start"
                labelSpacing="spread"
                width="100%"
                isDisabled={isSaving}
              />

              <NumberInput
                label={t('payment.admin.refundAmount')}
                description={`${t('payment.admin.maxRefundable')}: ${creditText(limit)}`}
                width="100%"
                value={form.amount}
                // The field shows what was typed and nothing else, and a wrong entry is refused. With an
                // upper bound it would quietly turn a larger entry into the bound as it is left; unless it
                // may be emptied it would put the last number back. Confirm, clicked straight from the
                // field, would then send an amount nobody typed.
                hasClear
                min={0}
                step={AMOUNT_STEP}
                units="USD"
                isRequired
                // The dialog scrolls with the wheel: a field that passes under the pointer must not change with it.
                isWheelEnabled={false}
                isDisabled={isSaving}
                onChange={(amount) => edit({ amount })}
                onEntryErrorChange={setAmountEntryError}
                status={amountStatus}
              />

              <TextArea
                label={t('payment.admin.refundReason')}
                placeholder={t('payment.admin.refundReasonPlaceholder')}
                rows={3}
                width="100%"
                isRequired
                value={form.reason}
                onChange={(reason) => edit({ reason })}
                isDisabled={isSaving}
                status={
                  wasConfirmTried && problems.reason
                    ? { type: 'error', message: t('payment.admin.refundReasonPlaceholder') }
                    : undefined
                }
              />

              {needsForce && (
                <VStack gap={3} hAlign="stretch">
                  <Banner status="warning" title={forceWarning || t('payment.admin.insufficientBalance')} />
                  <Switch
                    label={t('payment.admin.forceRefund')}
                    value={form.force}
                    onChange={(force) => edit({ force })}
                    labelPosition="start"
                    labelSpacing="spread"
                    width="100%"
                    isDisabled={isSaving}
                  />
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isSaving} onClick={close} />
              <Button
                label={isSaving ? t('common.processing') : t('payment.admin.confirmRefund')}
                variant="primary"
                isLoading={isSaving}
                isDisabled={needsForce && !form.force}
                onClick={() => void confirm()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
