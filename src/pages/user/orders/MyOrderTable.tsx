import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableStickyColumns, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { BanknotesIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { PaymentOrder } from '@/types/payment'
import { OrderStatus } from '~/components/payment/OrderStatus'
import { useI18n } from '~/i18n'
import { creditText, formatOrderTime, hasBonus, hasCreditLine, orderTimeLines, paidText } from './myOrderModel'
import type { MyOrders } from './useMyOrders'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<PaymentOrder, keyof PaymentOrder>

// What a column needs depends on the language of its labels: the English ones run longer. The method
// column holds the longest name there is, a direct WeChat payment, whole, and the actions column the
// longer of its two buttons.
const COLUMN_WIDTHS = {
  chinese: { id: 68, method: 132, created: 78, actions: 128 },
  other: { id: 76, method: 152, created: 82, actions: 176 },
}

// In a narrower window the table scrolls sideways, and the action stays in reach. Not on a phone: held in
// place there, it would cover most of what is left of the row.
const PINNED_COLUMNS = { endKeys: ['actions'] }
const NO_PINNED_COLUMNS = {}
const ROOM_TO_PIN = '(min-width: 768px)'

/**
 * The user's orders of one page. An unpaid order can be cancelled; a completed one can be asked back
 * where its payment provider takes such requests. Port of components/payment/OrderTable.vue with the
 * actions of UserOrdersView.vue.
 */
export function MyOrderTable({
  list,
  onCancel,
  onRequestRefund,
}: {
  list: MyOrders
  /** Cancelling is asked for; it is confirmed before it is done. */
  onCancel: (order: PaymentOrder) => void
  /** The refund request dialog is asked for. */
  onRequestRefund: (order: PaymentOrder) => void
}) {
  const { t, te, locale } = useI18n()
  const widths = locale.startsWith('zh') ? COLUMN_WIDTHS.chinese : COLUMN_WIDTHS.other
  const hasRoomToPin = useMediaQuery(ROOM_TO_PIN, true)
  const pinned = useTableStickyColumns<Row>(hasRoomToPin ? PINNED_COLUMNS : NO_PINNED_COLUMNS)
  const rows: Row[] = list.items

  const methodLabel = (type: string) => (te(`payment.methods.${type}`) ? t(`payment.methods.${type}`) : type)

  const creditLine = (row: Row) => {
    const credited = `${t('payment.orders.creditedAmount')}: ${creditText(row.amount)}`
    return hasBonus(row)
      ? `${credited} (${t('payment.orders.bonusIncluded', { amount: creditText(row.bonus_amount) })})`
      : credited
  }

  const columns: TableColumn<Row>[] = [
    {
      key: 'id',
      header: t('payment.orders.orderId'),
      width: pixel(widths.id),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {`#${row.id}`}
        </Text>
      ),
    },
    {
      key: 'out_trade_no',
      header: t('payment.orders.orderNo'),
      // An order number is 21 characters long, and is shown whole.
      width: proportional(1, { minWidth: 178 }),
      renderCell: (row) => (
        <Text type="code" maxLines={1} hasTruncateTooltip>
          {row.out_trade_no}
        </Text>
      ),
    },
    {
      key: 'pay_amount',
      header: t('payment.orders.payAmount'),
      width: proportional(1, { minWidth: 140 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Text type="supporting" weight="medium" hasTabularNumbers textWrap="nowrap">
              {paidText(row)}
            </Text>
            {row.fee_rate > 0 && (
              <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
                {`(${t('payment.orders.fee')} ${row.fee_rate}%)`}
              </Text>
            )}
          </HStack>
          {hasCreditLine(row) && (
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {creditLine(row)}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'payment_type',
      header: t('payment.orders.paymentMethod'),
      width: pixel(widths.method),
      renderCell: (row) => (
        <Text type="supporting" maxLines={1} hasTruncateTooltip>
          {methodLabel(row.payment_type)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('payment.orders.status'),
      // The longest Chinese status, a refund asked for, stays on one line. The English ones break between words.
      width: pixel(114),
      renderCell: (row) => <OrderStatus status={row.status} />,
    },
    {
      key: 'created_at',
      header: t('payment.orders.createdAt'),
      width: pixel(widths.created),
      renderCell: (row) => {
        const lines = orderTimeLines(row.created_at, locale)
        if (!lines) return <Text type="supporting">{formatOrderTime(row.created_at, locale)}</Text>
        return (
          <VStack gap={0.5}>
            <Text type="supporting" hasTabularNumbers textWrap="nowrap">
              {lines[0]}
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
              {lines[1]}
            </Text>
          </VStack>
        )
      },
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: pixel(widths.actions),
      align: 'end',
      renderCell: (row) => {
        const action = list.actionOf(row)
        if (action === 'cancel') {
          return (
            <Button
              label={t('payment.orders.cancel')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={XMarkIcon} />}
              onClick={() => onCancel(row)}
            />
          )
        }
        if (action === 'requestRefund') {
          return (
            <Button
              label={t('payment.orders.requestRefund')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={BanknotesIcon} />}
              onClick={() => onRequestRefund(row)}
            />
          )
        }
        return null
      },
    },
  ]

  return (
    <Table<Row>
      data={rows}
      columns={columns}
      idKey={(row) => row.id}
      density="compact"
      dividers="rows"
      hasHover
      plugins={{ pinned }}
    />
  )
}
