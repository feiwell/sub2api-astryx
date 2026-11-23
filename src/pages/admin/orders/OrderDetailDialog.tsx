import { Fragment, useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { OrderStatus } from '~/components/payment/OrderStatus'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import {
  NO_VALUE,
  creditText,
  formatOrderTime,
  orderUserLabel,
  paidText,
  readOrderDetail,
  type AdminOrder,
  type OrderAuditLog,
} from './orderModel'

/**
 * One order in full, with its history. The row as listed is shown at once; what the server holds now,
 * and the history, take its place when they arrive. Port of the detail dialog of AdminOrdersView.vue.
 */
export function OrderDetailDialog({ order: listed, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { t, te, locale } = useI18n()
  const [order, setOrder] = useState<AdminOrder>(listed)
  const [logs, setLogs] = useState<OrderAuditLog[]>([])

  useEffect(() => {
    let isStale = false
    adminAPI.payment.getOrder(listed.id).then(
      (answer) => {
        if (isStale) return
        const detail = readOrderDetail(answer.data)
        // What only the list says of the order, such as who placed it, is kept.
        if (detail.order) setOrder({ ...listed, ...detail.order })
        setLogs(detail.logs)
      },
      // The dialog goes on showing what the list knew of the order.
      (error: unknown) => console.warn('[admin-orders] failed to load an order', error),
    )
    return () => {
      isStale = true
    }
  }, [listed])

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const time = (value: string | null | undefined) => <Text hasTabularNumbers>{formatOrderTime(value, locale)}</Text>
  const methodKey = `payment.methods.${order.payment_type}`
  const orderType =
    order.order_type === 'balance'
      ? t('payment.admin.balanceOrder')
      : order.order_type === 'subscription'
        ? t('payment.admin.subscriptionOrder')
        : order.order_type || NO_VALUE

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={760} maxHeight="90dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('payment.admin.orderDetail')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={5}>
              <MetadataList columns="multi">
                <MetadataListItem label={t('payment.orders.orderId')}>
                  <Text hasTabularNumbers>{`#${order.id}`}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.orderNo')}>
                  <Text type="code" wordBreak="break-all">
                    {order.out_trade_no || NO_VALUE}
                  </Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.status')}>
                  <OrderStatus status={order.status} />
                </MetadataListItem>
                <MetadataListItem label={t('payment.admin.colUser')}>
                  <Text wordBreak="break-all">
                    {order.user_notes ? `${orderUserLabel(order)} (${order.user_notes})` : orderUserLabel(order)}
                  </Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.admin.orderType')}>
                  <Text>{orderType}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.paymentMethod')}>
                  <Text>{te(methodKey) ? t(methodKey) : order.payment_type || NO_VALUE}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.amount')}>
                  <Text hasTabularNumbers>{creditText(order.amount)}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.payAmount')}>
                  <Text hasTabularNumbers>{paidText(order)}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.admin.feeRate')}>
                  <Text hasTabularNumbers>{`${order.fee_rate ?? 0}%`}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.createdAt')}>{time(order.created_at)}</MetadataListItem>
                <MetadataListItem label={t('payment.admin.expiresAt')}>{time(order.expires_at)}</MetadataListItem>
                {order.paid_at && (
                  <MetadataListItem label={t('payment.admin.paidAt')}>{time(order.paid_at)}</MetadataListItem>
                )}
                {order.completed_at && (
                  <MetadataListItem label={t('payment.admin.completedAt')}>{time(order.completed_at)}</MetadataListItem>
                )}
                {order.refund_amount > 0 && (
                  <MetadataListItem label={t('payment.admin.refundAmount')}>
                    <Text hasTabularNumbers>{creditText(order.refund_amount)}</Text>
                  </MetadataListItem>
                )}
              </MetadataList>

              {/* A reason can run to a paragraph: it gets the whole width rather than half of it. */}
              {order.refund_reason && (
                <MetadataList columns="single" label={{ position: 'top' }}>
                  <MetadataListItem label={t('payment.admin.refundReason')}>
                    <Text wordBreak="break-word">{order.refund_reason}</Text>
                  </MetadataListItem>
                </MetadataList>
              )}

              {order.refund_requested_at && (
                <VStack gap={2}>
                  <Text type="label">{t('payment.admin.refundRequestInfo')}</Text>
                  <MetadataList columns="multi">
                    <MetadataListItem label={t('payment.admin.refundRequestedAt')}>
                      {time(order.refund_requested_at)}
                    </MetadataListItem>
                    <MetadataListItem label={t('payment.admin.refundRequestedBy')}>
                      <Text hasTabularNumbers>
                        {order.refund_requested_by ? `#${order.refund_requested_by}` : NO_VALUE}
                      </Text>
                    </MetadataListItem>
                  </MetadataList>
                  <MetadataList columns="single" label={{ position: 'top' }}>
                    <MetadataListItem label={t('payment.admin.refundRequestReason')}>
                      <Text wordBreak="break-word">{order.refund_request_reason || NO_VALUE}</Text>
                    </MetadataListItem>
                  </MetadataList>
                </VStack>
              )}

              {logs.length > 0 && (
                <VStack gap={2}>
                  <Text type="label">{t('payment.admin.auditLogs')}</Text>
                  <VStack gap={3}>
                    {logs.map((log, index) => (
                      <Fragment key={log.id}>
                        {index > 0 && <Divider />}
                        <VStack gap={1}>
                          <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                            <Text type="code" weight="medium" wordBreak="break-all">
                              {log.action}
                            </Text>
                            <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
                              {formatOrderTime(log.created_at, locale)}
                            </Text>
                          </HStack>
                          {log.detail && (
                            <Text type="supporting" color="secondary" wordBreak="break-all">
                              {log.detail}
                            </Text>
                          )}
                          {log.operator && (
                            <Text type="supporting" color="secondary" wordBreak="break-all">
                              {`${t('payment.admin.operator')}: ${log.operator}`}
                            </Text>
                          )}
                        </VStack>
                      </Fragment>
                    ))}
                  </VStack>
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
