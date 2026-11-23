import { describe, expect, it } from 'vitest'
import {
  NO_VALUE,
  creditText,
  emptyOrderFilters,
  formatOrderTime,
  hasBonus,
  hasCreditLine,
  isPendingWarning,
  maxRefundable,
  opensRefundDialog,
  orderAction,
  orderQuery,
  orderTimeLines,
  orderUserLabel,
  paidText,
  readOrderDetail,
  refundFormOf,
  refundOutcome,
  refundProblems,
  refundRequest,
  refundedAmount,
  type AdminOrder,
  type RefundForm,
} from './orderModel'

const order = (patch: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 7,
  user_id: 101,
  amount: 100,
  pay_amount: 720,
  currency: 'CNY',
  fee_rate: 0,
  payment_type: 'alipay',
  out_trade_no: 'sub2_1',
  status: 'COMPLETED',
  order_type: 'balance',
  created_at: '2026-11-22T08:00:00Z',
  expires_at: '2026-11-22T08:30:00Z',
  refund_amount: 0,
  ...patch,
})

describe('orderQuery', () => {
  it('sends the page alone while no filter is set', () => {
    expect(orderQuery(emptyOrderFilters(), 2, 20)).toEqual({
      page: 2,
      page_size: 20,
      keyword: undefined,
      status: undefined,
      payment_type: undefined,
      order_type: undefined,
    })
  })

  it('sends the filters under the names the server reads', () => {
    const filters = { keyword: '  alice ', status: 'PAID', paymentType: 'stripe', orderType: 'subscription' }
    expect(orderQuery(filters, 1, 50)).toEqual({
      page: 1,
      page_size: 50,
      keyword: 'alice',
      status: 'PAID',
      payment_type: 'stripe',
      order_type: 'subscription',
    })
  })

  it('treats a keyword of spaces as no keyword', () => {
    expect(orderQuery({ ...emptyOrderFilters(), keyword: '   ' }, 1, 20).keyword).toBeUndefined()
  })
})

describe('amounts', () => {
  it('writes what was paid in the currency of the order', () => {
    expect(paidText(order())).toBe('¥720.00')
    expect(paidText(order({ currency: 'USD', pay_amount: 12.5 }))).toBe('$12.50')
    expect(paidText(order({ currency: 'NZD', pay_amount: 3 }))).toBe('NZ$3.00')
  })

  it('falls back to the default currency when the order names none', () => {
    expect(paidText(order({ currency: undefined, pay_amount: 9 }))).toBe('¥9.00')
  })

  it('writes credited amounts in dollars', () => {
    expect(creditText(100)).toBe('$100.00')
    expect(creditText(0.005)).toBe('$0.01')
  })

  it('writes a missing amount as zero rather than failing', () => {
    expect(creditText(undefined)).toBe('$0.00')
    expect(creditText(Number.NaN)).toBe('$0.00')
    expect(paidText({ pay_amount: undefined as unknown as number, currency: 'USD' })).toBe('$0.00')
  })

  it('shows the credited line when it says more than the paid amount', () => {
    expect(hasCreditLine(order({ amount: 10, pay_amount: 10 }))).toBe(false)
    expect(hasCreditLine(order({ amount: 10, pay_amount: 72 }))).toBe(true)
    expect(hasCreditLine(order({ amount: 10, pay_amount: 10, bonus_amount: 1 }))).toBe(true)
    expect(hasCreditLine(order({ amount: 10, pay_amount: 10, bonus_amount: 0 }))).toBe(false)
  })

  it('knows a bonus only when there is one', () => {
    expect(hasBonus(order({ bonus_amount: 2 }))).toBe(true)
    expect(hasBonus(order({ bonus_amount: 0 }))).toBe(false)
    expect(hasBonus(order())).toBe(false)
  })
})

describe('orderUserLabel', () => {
  it('prefers the mailbox, then the name, then the number', () => {
    expect(orderUserLabel(order({ user_email: 'a@example.test', user_name: 'alice' }))).toBe('a@example.test')
    expect(orderUserLabel(order({ user_email: '', user_name: 'carol' }))).toBe('carol')
    expect(orderUserLabel(order())).toBe('#101')
  })
})

describe('formatOrderTime', () => {
  it('writes a dash for a time that is not set', () => {
    expect(formatOrderTime(undefined, 'en')).toBe(NO_VALUE)
    expect(formatOrderTime('', 'en')).toBe(NO_VALUE)
  })

  it('shows a value that is no date as it was sent', () => {
    expect(formatOrderTime('soon', 'en')).toBe('soon')
  })

  it('writes a date to the second', () => {
    const text = formatOrderTime('2026-11-22T08:05:09Z', 'en')
    expect(text).toMatch(/\d{1,2}:05:09/)
    expect(text).toContain('26')
  })
})

describe('orderTimeLines', () => {
  it('puts the day on one line and the time of day on the next', () => {
    const lines = orderTimeLines('2026-11-22T08:05:09Z', 'en')
    expect(lines).toHaveLength(2)
    expect(lines?.[0]).toContain('26')
    expect(lines?.[0]).not.toContain(':')
    expect(lines?.[1]).toMatch(/\d{1,2}:05:09/)
  })

  it('has no lines for a time that is not set or is no date', () => {
    expect(orderTimeLines(undefined, 'en')).toBeNull()
    expect(orderTimeLines('', 'en')).toBeNull()
    expect(orderTimeLines('soon', 'en')).toBeNull()
  })
})

describe('orderAction', () => {
  it('gives each status the one thing that can be done to it', () => {
    expect(orderAction('PENDING')).toBe('cancel')
    expect(orderAction('FAILED')).toBe('retry')
    expect(orderAction('REFUND_REQUESTED')).toBe('approveRefund')
    expect(orderAction('REFUND_FAILED')).toBe('retryRefund')
    expect(orderAction('REFUND_PENDING')).toBe('queryRefund')
    expect(orderAction('COMPLETED')).toBe('refund')
    expect(orderAction('PARTIALLY_REFUNDED')).toBe('refund')
  })

  it('leaves the other statuses with nothing to do', () => {
    for (const status of ['PAID', 'RECHARGING', 'EXPIRED', 'CANCELLED', 'REFUNDING', 'REFUNDED', 'SOMETHING_NEW', '']) {
      expect(orderAction(status)).toBeNull()
    }
  })

  it('sends the refund actions to the dialog and does the others at once', () => {
    expect(opensRefundDialog('approveRefund')).toBe(true)
    expect(opensRefundDialog('retryRefund')).toBe(true)
    expect(opensRefundDialog('refund')).toBe(true)
    expect(opensRefundDialog('cancel')).toBe(false)
    expect(opensRefundDialog('retry')).toBe(false)
    expect(opensRefundDialog('queryRefund')).toBe(false)
  })
})

describe('refund amounts', () => {
  it('counts an amount as refunded only once a refund went through', () => {
    expect(refundedAmount(order({ status: 'PARTIALLY_REFUNDED', refund_amount: 30 }))).toBe(30)
    expect(refundedAmount(order({ status: 'REFUNDED', refund_amount: 100 }))).toBe(100)
    expect(refundedAmount(order({ status: 'REFUND_REQUESTED', refund_amount: 30 }))).toBe(0)
    expect(refundedAmount(order({ status: 'REFUND_PENDING', refund_amount: 30 }))).toBe(0)
    expect(refundedAmount(order({ status: 'REFUND_FAILED', refund_amount: 30 }))).toBe(0)
  })

  it('lets the rest of the order go back', () => {
    expect(maxRefundable(order())).toBe(100)
    expect(maxRefundable(order({ status: 'PARTIALLY_REFUNDED', refund_amount: 33.33 }))).toBe(66.67)
    expect(maxRefundable(order({ status: 'REFUND_REQUESTED', refund_amount: 40 }))).toBe(100)
    expect(maxRefundable(order({ status: 'REFUNDED', refund_amount: 120 }))).toBe(0)
  })

  it('keeps a whole amount finer than a cent as it is, so that all of it is a full refund', () => {
    expect(maxRefundable(order({ amount: 10.984 }))).toBe(10.984)
    expect(maxRefundable(order({ amount: 10.989, status: 'REFUND_FAILED', refund_amount: 10.989 }))).toBe(10.989)
    expect(refundFormOf(order({ amount: 10.984 })).amount).toBe(10.984)
    const all: RefundForm = { amount: 10.984, reason: 'x', deductBalance: true, force: false }
    expect(refundProblems(all, order({ amount: 10.984 }))).toEqual({})
  })

  it('clears the float noise of a subtraction', () => {
    expect(maxRefundable(order({ amount: 0.3, status: 'PARTIALLY_REFUNDED', refund_amount: 0.1 }))).toBe(0.2)
  })
})

describe('refundFormOf', () => {
  it('starts from everything that can go back', () => {
    expect(refundFormOf(order())).toEqual({ amount: 100, reason: '', deductBalance: true, force: false })
    expect(refundFormOf(order({ status: 'PARTIALLY_REFUNDED', refund_amount: 25 })).amount).toBe(75)
  })

  it('starts from what the user asked for, and why', () => {
    const form = refundFormOf(
      order({ status: 'REFUND_REQUESTED', refund_amount: 40, refund_request_reason: 'bought by mistake' }),
    )
    expect(form.amount).toBe(40)
    expect(form.reason).toBe('bought by mistake')
  })

  it('falls back to the whole order when a request names no amount', () => {
    expect(refundFormOf(order({ status: 'REFUND_REQUESTED', refund_amount: 0 })).amount).toBe(100)
  })

  it('does not take the amount of a failed refund as a request', () => {
    expect(refundFormOf(order({ status: 'REFUND_FAILED', refund_amount: 40 })).amount).toBe(100)
  })
})

describe('refundProblems', () => {
  const form = (patch: Partial<RefundForm> = {}): RefundForm => ({
    amount: 50,
    reason: 'duplicate',
    deductBalance: true,
    force: false,
    ...patch,
  })

  it('finds nothing wrong with an amount in range and a reason', () => {
    expect(refundProblems(form(), order())).toEqual({})
    expect(refundProblems(form({ amount: 100 }), order())).toEqual({})
  })

  it('refuses an amount that is not above zero', () => {
    expect(refundProblems(form({ amount: 0 }), order()).amount).toBe('tooLittle')
    expect(refundProblems(form({ amount: -5 }), order()).amount).toBe('tooLittle')
    expect(refundProblems(form({ amount: Number.NaN }), order()).amount).toBe('tooLittle')
  })

  it('refuses an amount left empty', () => {
    expect(refundProblems(form({ amount: null }), order()).amount).toBe('tooLittle')
  })

  it('refuses more than can go back', () => {
    expect(refundProblems(form({ amount: 100.01 }), order()).amount).toBe('tooMuch')
    expect(refundProblems(form({ amount: 80 }), order({ status: 'PARTIALLY_REFUNDED', refund_amount: 30 })).amount).toBe(
      'tooMuch',
    )
  })

  it('asks for a reason that is more than spaces', () => {
    expect(refundProblems(form({ reason: '' }), order()).reason).toBe('missing')
    expect(refundProblems(form({ reason: '   ' }), order()).reason).toBe('missing')
  })
})

describe('refundRequest', () => {
  it('sends the form under the names the server reads', () => {
    expect(refundRequest({ amount: 12.5, reason: ' duplicate ', deductBalance: false, force: true })).toEqual({
      amount: 12.5,
      reason: 'duplicate',
      deduct_balance: false,
      force: true,
    })
  })
})

describe('refundOutcome', () => {
  it('takes success as done', () => {
    expect(refundOutcome({ success: true })).toBe('done')
    expect(refundOutcome({ success: true, warning: 'gateway refund is pending confirmation' })).toBe('done')
  })

  it('reads a refund the provider has not confirmed as pending', () => {
    expect(refundOutcome({ success: false, warning: 'gateway refund is pending confirmation' })).toBe('pending')
    expect(refundOutcome({ success: false, warning: 'Gateway refund is still PENDING confirmation' })).toBe('pending')
    expect(refundOutcome({ success: false, warning: '退款处理中' })).toBe('pending')
  })

  it('reads a refusal to deduct as a call for force', () => {
    expect(
      refundOutcome({
        success: false,
        require_force: true,
        warning: 'user balance is insufficient for deduction, use force',
      }),
    ).toBe('needsForce')
  })

  it('takes anything else as failed', () => {
    expect(refundOutcome({ success: false, warning: 'gateway failed: timeout, rolled back' })).toBe('failed')
    expect(refundOutcome({ success: false })).toBe('failed')
    expect(refundOutcome(null)).toBe('failed')
    expect(refundOutcome(undefined)).toBe('failed')
  })

  it('knows the wording of "not confirmed yet"', () => {
    expect(isPendingWarning('pending')).toBe(true)
    expect(isPendingWarning('待确认')).toBe(true)
    expect(isPendingWarning('gateway refund failed: closed')).toBe(false)
    expect(isPendingWarning(undefined)).toBe(false)
  })
})

describe('readOrderDetail', () => {
  const full = order({ id: 9, user_email: 'a@example.test' })
  const logs = [{ id: 1, action: 'ORDER_CREATED', detail: '{}', operator: 'system', created_at: '2026-11-22T08:00:00Z' }]

  it('reads the order and its history from the wrapped answer', () => {
    expect(readOrderDetail({ order: full, auditLogs: logs })).toEqual({ order: full, logs })
  })

  it('reads the history under its other name', () => {
    expect(readOrderDetail({ order: full, audit_logs: logs })).toEqual({ order: full, logs })
  })

  it('reads an answer that is the order itself', () => {
    expect(readOrderDetail(full)).toEqual({ order: full, logs: [] })
  })

  it('reads a history that is missing or null as empty', () => {
    expect(readOrderDetail({ order: full, auditLogs: null }).logs).toEqual([])
    expect(readOrderDetail({ order: full }).logs).toEqual([])
  })

  it('finds no order in an answer that carries none', () => {
    expect(readOrderDetail(null)).toEqual({ order: null, logs: [] })
    expect(readOrderDetail('ok')).toEqual({ order: null, logs: [] })
    expect(readOrderDetail([full])).toEqual({ order: null, logs: [] })
    expect(readOrderDetail({ message: 'ok' })).toEqual({ order: null, logs: [] })
  })
})
