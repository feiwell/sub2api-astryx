import type { PaymentOrder } from '@/types/payment'

// How an order's amounts and times are worded is the same on the management list; one tested copy serves both.
export {
  creditText,
  formatOrderTime,
  hasBonus,
  hasCreditLine,
  orderTimeLines,
  paidText,
} from '../../admin/orders/orderModel'

// ---------------------------------------------------------------- the list

/** What the list can be narrowed to, in the order it is offered. */
export const STATUS_CHOICES = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const

/** What the list is asked for: no status is sent while every order is wanted. */
export const myOrdersQuery = (status: string, page: number, pageSize: number) => ({
  page,
  page_size: pageSize,
  status: status || undefined,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** One page of orders as the server sends it; an answer without a list reads as no orders. */
export function readOrderPage(data: unknown): { items: PaymentOrder[]; total: number } {
  if (!isRecord(data)) return { items: [], total: 0 }
  const total = Number(data.total)
  return {
    items: Array.isArray(data.items) ? (data.items as PaymentOrder[]) : [],
    total: Number.isFinite(total) && total > 0 ? total : 0,
  }
}

/** The last page there is; the first one when there are no orders. */
export const lastPageOf = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize))

// ---------------------------------------------------------------- what can be done to a row

/** The payment providers that let a user ask for a refund, as the server lists them. */
export function readEligibleProviders(data: unknown): Set<string> {
  const ids = isRecord(data) ? data.provider_instance_ids : null
  return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id !== '') : [])
}

export type MyOrderAction = 'cancel' | 'requestRefund'

/**
 * What the user can do to an order: cancel it while it is unpaid, or ask for the money back once it is
 * completed, when it was paid through a provider that takes such requests. The server refuses a refund
 * request for a subscription, so none is offered there.
 */
export function myOrderAction(
  order: Pick<PaymentOrder, 'status' | 'order_type' | 'provider_instance_id'>,
  eligibleProviders: ReadonlySet<string>,
): MyOrderAction | null {
  if (order.status === 'PENDING') return 'cancel'
  if (
    order.status === 'COMPLETED' &&
    order.order_type !== 'subscription' &&
    !!order.provider_instance_id &&
    eligibleProviders.has(order.provider_instance_id)
  ) {
    return 'requestRefund'
  }
  return null
}

/**
 * How cancelling went. Before it cancels, the server asks the payment provider once more; when the order
 * turns out to be paid it is fulfilled instead, and the answer, though not an error, says so.
 */
export type CancelOutcome = 'cancelled' | 'alreadyPaid'

export const cancelOutcome = (data: unknown): CancelOutcome =>
  isRecord(data) && data.message === 'already_paid' ? 'alreadyPaid' : 'cancelled'

/** The reason as it is sent; a reason of spaces alone is no reason. */
export const refundReasonOf = (text: string): string => text.trim()
