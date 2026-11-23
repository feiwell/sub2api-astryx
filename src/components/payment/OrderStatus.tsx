import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/Stack'
import type { OrderStatus as OrderStatusValue } from '@/types/payment'
import { useI18n } from '~/i18n'

type Variant = 'success' | 'warning' | 'error' | 'accent' | 'neutral'

const STATUS: Record<string, { key: string; variant: Variant }> = {
  PENDING: { key: 'payment.status.pending', variant: 'warning' },
  PAID: { key: 'payment.status.paid', variant: 'accent' },
  RECHARGING: { key: 'payment.status.recharging', variant: 'accent' },
  COMPLETED: { key: 'payment.status.completed', variant: 'success' },
  EXPIRED: { key: 'payment.status.expired', variant: 'neutral' },
  CANCELLED: { key: 'payment.status.cancelled', variant: 'neutral' },
  FAILED: { key: 'payment.status.failed', variant: 'error' },
  REFUND_REQUESTED: { key: 'payment.status.refund_requested', variant: 'warning' },
  REFUNDING: { key: 'payment.status.refunding', variant: 'warning' },
  REFUND_PENDING: { key: 'payment.status.refund_pending', variant: 'warning' },
  REFUNDED: { key: 'payment.status.refunded', variant: 'accent' },
  PARTIALLY_REFUNDED: { key: 'payment.status.partially_refunded', variant: 'accent' },
  REFUND_FAILED: { key: 'payment.status.refund_failed', variant: 'error' },
}

/** Port of components/payment/OrderStatusBadge.vue. */
export function OrderStatus({ status }: { status: OrderStatusValue | string }) {
  const { t } = useI18n()
  const normalized = String(status || '').trim().toUpperCase()
  const entry = STATUS[normalized]
  const label = entry ? t(entry.key) : normalized
  return (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={entry?.variant ?? 'neutral'} label={label} />
      <Text>{label}</Text>
    </HStack>
  )
}
