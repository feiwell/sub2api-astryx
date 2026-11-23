import { currencySymbol } from '@/components/payment/currency'
import type { PaymentOrder } from '@/types/payment'
import type { RefundResult } from '~/lib/api/admin/payment'

/** An order as the management list sends it: the order, plus who placed it. */
export interface AdminOrder extends PaymentOrder {
  user_email?: string
  user_name?: string
  user_notes?: string
}

/** One step of an order's history, as the detail request sends it. */
export interface OrderAuditLog {
  id: number
  action: string
  detail?: string | null
  operator?: string | null
  created_at: string
}

export const NO_VALUE = '-'

// ---------------------------------------------------------------- filters

export interface OrderFilters {
  keyword: string
  status: string
  paymentType: string
  orderType: string
}

export const emptyOrderFilters = (): OrderFilters => ({ keyword: '', status: '', paymentType: '', orderType: '' })

/** What the list can be narrowed to, in the order it is offered. */
export const STATUS_CHOICES = [
  'PENDING',
  'PAID',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
  'REFUNDED',
  'REFUND_REQUESTED',
  'REFUND_PENDING',
  'REFUND_FAILED',
] as const
export const PAYMENT_TYPE_CHOICES = ['alipay', 'wxpay', 'stripe', 'airwallex'] as const
export const ORDER_TYPE_CHOICES = ['balance', 'subscription'] as const

/** What the list is asked for: a filter left empty is not sent. */
export function orderQuery(filters: OrderFilters, page: number, pageSize: number) {
  return {
    page,
    page_size: pageSize,
    keyword: filters.keyword.trim() || undefined,
    status: filters.status || undefined,
    payment_type: filters.paymentType || undefined,
    order_type: filters.orderType || undefined,
  }
}

// ---------------------------------------------------------------- what a row shows

const amountOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const fixed = (value: number | null | undefined): string => amountOf(value).toFixed(2)

/** An amount credited to a balance. These are US dollars whatever the order was paid in. */
export const creditText = (amount: number | null | undefined): string => `${currencySymbol('USD')}${fixed(amount)}`

/** What the payer was charged, in the currency of the order. */
export const paidText = (order: Pick<PaymentOrder, 'pay_amount' | 'currency'>): string =>
  `${currencySymbol(order.currency)}${fixed(order.pay_amount)}`

/** Whether what was credited is not simply what was paid: another currency, a fee, or a bonus on top. */
export const hasCreditLine = (order: Pick<PaymentOrder, 'amount' | 'pay_amount' | 'bonus_amount'>): boolean =>
  order.amount !== order.pay_amount || amountOf(order.bonus_amount) > 0

export const hasBonus = (order: Pick<PaymentOrder, 'bonus_amount'>): boolean => amountOf(order.bonus_amount) > 0

/** Who placed the order: the mailbox, else the name, else the user's number. */
export const orderUserLabel = (order: Pick<AdminOrder, 'user_email' | 'user_name' | 'user_id'>): string =>
  order.user_email || order.user_name || `#${order.user_id}`

/** A server time in the reader's language, to the second; a value that is no date is shown as sent. */
export function formatOrderTime(value: string | null | undefined, locale: string): string {
  if (!value) return NO_VALUE
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

/** The same time as two short lines, the day over the time of day, for a column too narrow for one; null when it is no date. */
export function orderTimeLines(value: string | null | undefined, locale: string): [string, string] | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return [
    new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date),
    new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(date),
  ]
}

// ---------------------------------------------------------------- what can be done to a row

export type OrderAction = 'cancel' | 'retry' | 'approveRefund' | 'retryRefund' | 'queryRefund' | 'refund'

/** What can be done to an order besides looking at it: at most one thing, decided by its status. */
export function orderAction(status: string): OrderAction | null {
  switch (status) {
    case 'PENDING':
      return 'cancel'
    case 'FAILED':
      return 'retry'
    case 'REFUND_REQUESTED':
      return 'approveRefund'
    case 'REFUND_FAILED':
      return 'retryRefund'
    case 'REFUND_PENDING':
      return 'queryRefund'
    case 'COMPLETED':
    case 'PARTIALLY_REFUNDED':
      return 'refund'
    default:
      return null
  }
}

/** Whether the action is answered in the refund dialog rather than done at once. */
export const opensRefundDialog = (action: OrderAction): boolean =>
  action === 'approveRefund' || action === 'retryRefund' || action === 'refund'

// ---------------------------------------------------------------- refunds

/**
 * What has really gone back to the payer. While a refund is only asked for or under way,
 * refund_amount holds the amount asked for, not an amount refunded.
 */
export function refundedAmount(order: Pick<PaymentOrder, 'status' | 'refund_amount'>): number {
  return order.status === 'PARTIALLY_REFUNDED' || order.status === 'REFUNDED' ? amountOf(order.refund_amount) : 0
}

export function maxRefundable(order: Pick<PaymentOrder, 'status' | 'amount' | 'refund_amount'>): number {
  const amount = amountOf(order.amount)
  const refunded = refundedAmount(order)
  // The whole amount is kept exactly as the server holds it: the server takes anything less, by however
  // little, for a partial refund.
  if (refunded <= 0) return Math.max(0, amount)
  // A difference of two amounts carries float noise: 0.3 - 0.1 is 0.19999999999999998.
  return Math.max(0, Math.round((amount - refunded) * 1e8) / 1e8)
}

export interface RefundForm {
  /** null while the amount field is empty. */
  amount: number | null
  reason: string
  deductBalance: boolean
  force: boolean
}

/** A form with an amount in it. */
export type FilledRefundForm = RefundForm & { amount: number }

/** The form as the dialog opens: what the user asked for when there is a request, else all that can go back. */
export function refundFormOf(order: AdminOrder): FilledRefundForm {
  const asked = order.status === 'REFUND_REQUESTED' && amountOf(order.refund_amount) > 0
  return {
    amount: asked ? order.refund_amount : maxRefundable(order),
    reason: order.refund_request_reason || '',
    deductBalance: true,
    force: false,
  }
}

export interface RefundProblems {
  amount?: 'tooLittle' | 'tooMuch'
  reason?: 'missing'
}

/** What stands in the way of sending the refund; empty when nothing does. */
export function refundProblems(form: RefundForm, order: AdminOrder): RefundProblems {
  const problems: RefundProblems = {}
  if (form.amount === null || !(form.amount > 0)) problems.amount = 'tooLittle'
  else if (form.amount > maxRefundable(order)) problems.amount = 'tooMuch'
  if (!form.reason.trim()) problems.reason = 'missing'
  return problems
}

/** What is sent. It takes no form without an amount: the server reads an amount of 0 as the whole order. */
export const refundRequest = (form: FilledRefundForm) => ({
  amount: form.amount,
  reason: form.reason.trim(),
  deduct_balance: form.deductBalance,
  force: form.force,
})

/**
 * How a refund, or a look at a refund under way, went:
 * - done: the money is on its way back;
 * - pending: the payment provider has taken the refund and not yet confirmed it;
 * - needsForce: the server will only do it when told to ignore the balance check;
 * - failed: nothing changed, and the answer says why.
 */
export type RefundOutcome = 'done' | 'pending' | 'needsForce' | 'failed'

/** The server words "not confirmed yet" as a warning; it has no field for it. */
export const isPendingWarning = (warning: string | null | undefined): boolean =>
  /pending|处理中|待/.test(String(warning || '').toLowerCase())

export function refundOutcome(result: RefundResult | null | undefined): RefundOutcome {
  if (result?.success) return 'done'
  if (isPendingWarning(result?.warning)) return 'pending'
  if (result?.require_force) return 'needsForce'
  return 'failed'
}

// ---------------------------------------------------------------- one order in full

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export interface OrderDetail {
  /** The order as the server holds it now; null when the answer carried none. */
  order: AdminOrder | null
  logs: OrderAuditLog[]
}

/**
 * Reads the answer of the detail request. The server wraps the order and its history in one object;
 * an answer that is the order itself is read too.
 */
export function readOrderDetail(data: unknown): OrderDetail {
  if (!isRecord(data)) return { order: null, logs: [] }
  const logs = data.auditLogs ?? data.audit_logs
  const order = isRecord(data.order) ? data.order : typeof data.id === 'number' && 'status' in data ? data : null
  return {
    order: order as AdminOrder | null,
    logs: Array.isArray(logs) ? (logs as OrderAuditLog[]) : [],
  }
}
