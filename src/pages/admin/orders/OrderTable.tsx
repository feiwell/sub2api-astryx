import type { ComponentType, SVGProps } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableStickyColumns, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { ArrowPathIcon, BanknotesIcon, CheckIcon, EyeIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { OrderStatus } from '~/components/payment/OrderStatus'
import { useI18n } from '~/i18n'
import {
  creditText,
  formatOrderTime,
  hasBonus,
  hasCreditLine,
  opensRefundDialog,
  orderAction,
  orderTimeLines,
  orderUserLabel,
  paidText,
  type AdminOrder,
  type OrderAction,
} from './orderModel'
import type { AdminOrders } from './useAdminOrders'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<AdminOrder, keyof AdminOrder>

type ActionIcon = ComponentType<SVGProps<SVGSVGElement>>

const ACTION_ICONS: Record<OrderAction, ActionIcon> = {
  cancel: XMarkIcon,
  retry: ArrowPathIcon,
  approveRefund: CheckIcon,
  retryRefund: ArrowPathIcon,
  queryRefund: ArrowPathIcon,
  refund: BanknotesIcon,
}

// What a column needs depends on the language of its labels: the English ones run longer. With either set
// the eight columns fit a 1440 wide window.
const COLUMN_WIDTHS = {
  chinese: { id: 68, method: 108, created: 78, actions: 232 },
  other: { id: 76, method: 128, created: 82, actions: 272 },
}

// In a narrower window the table scrolls sideways, and the actions stay in reach. Not on a phone: held in
// place there, they would cover most of what is left of the row.
const PINNED_COLUMNS = { endKeys: ['actions'] }
const NO_PINNED_COLUMNS = {}
const ROOM_TO_PIN = '(min-width: 768px)'

/**
 * The orders of one page. Every row can be looked at; besides that a row offers the one thing its
 * status allows. Port of components/payment/OrderTable.vue with the actions of AdminOrdersView.vue.
 */
export function OrderTable({
  list,
  onView,
  onRefund,
}: {
  list: AdminOrders
  onView: (order: AdminOrder) => void
  /** The refund dialog is asked for: to approve a request, to try a failed refund again, or to start one. */
  onRefund: (order: AdminOrder) => void
}) {
  const { t, te, locale } = useI18n()
  const widths = locale.startsWith('zh') ? COLUMN_WIDTHS.chinese : COLUMN_WIDTHS.other
  const hasRoomToPin = useMediaQuery(ROOM_TO_PIN, true)
  const pinned = useTableStickyColumns<Row>(hasRoomToPin ? PINNED_COLUMNS : NO_PINNED_COLUMNS)
  const rows: Row[] = list.items

  const methodLabel = (type: string) => (te(`payment.methods.${type}`) ? t(`payment.methods.${type}`) : type)

  const actionLabel = (action: OrderAction): string => {
    switch (action) {
      case 'cancel':
        return t('payment.orders.cancel')
      case 'retry':
        return t('payment.admin.retry')
      case 'approveRefund':
        return t('payment.admin.approveRefund')
      case 'retryRefund':
        return t('payment.admin.retryRefund')
      case 'queryRefund':
        return t('payment.admin.queryRefundStatus')
      case 'refund':
        return t('payment.admin.refund')
    }
  }

  const act = (order: Row, action: OrderAction) => {
    if (opensRefundDialog(action)) onRefund(order)
    else if (action === 'cancel') void list.cancel(order)
    else if (action === 'retry') void list.retry(order)
    else void list.queryRefund(order)
  }

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
      width: pixel(178),
      renderCell: (row) => (
        <Text type="code" maxLines={1} hasTruncateTooltip>
          {row.out_trade_no}
        </Text>
      ),
    },
    {
      key: 'user',
      header: t('payment.admin.colUser'),
      width: proportional(1, { minWidth: 116 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" weight="medium" maxLines={1} hasTruncateTooltip>
            {orderUserLabel(row)}
          </Text>
          {row.user_notes && (
            <Text type="supporting" color="secondary" maxLines={1} hasTruncateTooltip>
              {`(${row.user_notes})`}
            </Text>
          )}
        </VStack>
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
      // Room for the longest pair: the amount asked for beside the button that grants it.
      width: pixel(widths.actions),
      align: 'end',
      renderCell: (row) => {
        const action = orderAction(row.status)
        return (
          <HStack gap={1} vAlign="center" hAlign="end">
            <IconButton
              label={t('common.view')}
              tooltip={t('common.view')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={EyeIcon} />}
              onClick={() => onView(row)}
            />
            {/* What the user asked back stands beside the button that grants it. */}
            {action === 'approveRefund' && row.refund_amount > 0 && (
              <Token size="sm" color="orange" label={creditText(row.refund_amount)} />
            )}
            {action && (
              <Button
                label={actionLabel(action)}
                variant="ghost"
                size="sm"
                icon={<Icon icon={ACTION_ICONS[action]} />}
                isLoading={list.busy[row.id] === action}
                onClick={() => act(row, action)}
              />
            )}
          </HStack>
        )
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
