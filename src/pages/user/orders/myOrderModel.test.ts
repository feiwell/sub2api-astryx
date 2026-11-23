import { describe, expect, it } from 'vitest'
import type { PaymentOrder } from '@/types/payment'
import {
  STATUS_CHOICES,
  cancelOutcome,
  creditText,
  lastPageOf,
  myOrderAction,
  myOrdersQuery,
  paidText,
  readEligibleProviders,
  readOrderPage,
  refundReasonOf,
} from './myOrderModel'

type ActionFields = Pick<PaymentOrder, 'status' | 'order_type' | 'provider_instance_id'>

const order = (patch: Partial<ActionFields> = {}): ActionFields => ({
  status: 'COMPLETED',
  order_type: 'balance',
  provider_instance_id: '1',
  ...patch,
})

const ELIGIBLE = new Set(['1', '7'])

describe('the list', () => {
  it('offers the statuses of the Vue page, in its order', () => {
    expect([...STATUS_CHOICES]).toEqual(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'])
  })

  it('asks for a status only when one is picked', () => {
    expect(myOrdersQuery('PENDING', 1, 20)).toEqual({ page: 1, page_size: 20, status: 'PENDING' })
    expect(myOrdersQuery('', 4, 20)).toEqual({ page: 4, page_size: 20, status: undefined })
  })

  it('reads a page of orders', () => {
    const items = [{ id: 1 }, { id: 2 }]
    expect(readOrderPage({ items, total: 57, page: 1, page_size: 20, pages: 3 })).toEqual({ items, total: 57 })
  })

  it('reads an answer without a list as no orders', () => {
    expect(readOrderPage({ items: null, total: 0 })).toEqual({ items: [], total: 0 })
    expect(readOrderPage({})).toEqual({ items: [], total: 0 })
    expect(readOrderPage(null)).toEqual({ items: [], total: 0 })
    expect(readOrderPage(undefined)).toEqual({ items: [], total: 0 })
    expect(readOrderPage('oops')).toEqual({ items: [], total: 0 })
    expect(readOrderPage([{ id: 1 }])).toEqual({ items: [], total: 0 })
  })

  it('takes no total that is not a count', () => {
    expect(readOrderPage({ items: [], total: '5' }).total).toBe(5)
    expect(readOrderPage({ items: [], total: -3 }).total).toBe(0)
    expect(readOrderPage({ items: [], total: 'many' }).total).toBe(0)
    expect(readOrderPage({ items: [] }).total).toBe(0)
  })

  it('knows the last page', () => {
    expect(lastPageOf(0, 20)).toBe(1)
    expect(lastPageOf(1, 20)).toBe(1)
    expect(lastPageOf(40, 20)).toBe(2)
    expect(lastPageOf(41, 20)).toBe(3)
    expect(lastPageOf(57, 10)).toBe(6)
  })
})

describe('the providers that take refund requests', () => {
  it('reads the list the server sends', () => {
    expect([...readEligibleProviders({ provider_instance_ids: ['1', '7'] })]).toEqual(['1', '7'])
  })

  it('reads anything else as none', () => {
    expect(readEligibleProviders({ provider_instance_ids: null }).size).toBe(0)
    expect(readEligibleProviders({}).size).toBe(0)
    expect(readEligibleProviders(null).size).toBe(0)
    expect(readEligibleProviders(undefined).size).toBe(0)
    expect(readEligibleProviders(['1']).size).toBe(0)
    expect(readEligibleProviders({ provider_instance_ids: '1' }).size).toBe(0)
  })

  it('leaves out what is no provider id', () => {
    expect([...readEligibleProviders({ provider_instance_ids: ['1', '', 2, null, '7'] })]).toEqual(['1', '7'])
  })
})

describe('what can be done to an order', () => {
  it('lets an unpaid order be cancelled, whatever it would be paid through', () => {
    expect(myOrderAction(order({ status: 'PENDING' }), ELIGIBLE)).toBe('cancel')
    expect(myOrderAction(order({ status: 'PENDING', provider_instance_id: undefined }), new Set())).toBe('cancel')
    expect(myOrderAction(order({ status: 'PENDING', order_type: 'subscription' }), new Set())).toBe('cancel')
  })

  it('lets a completed top-up be asked back when its provider takes refund requests', () => {
    expect(myOrderAction(order(), ELIGIBLE)).toBe('requestRefund')
    expect(myOrderAction(order({ provider_instance_id: '7' }), ELIGIBLE)).toBe('requestRefund')
  })

  it('offers no refund request when the provider takes none, or is not known', () => {
    expect(myOrderAction(order({ provider_instance_id: '2' }), ELIGIBLE)).toBeNull()
    expect(myOrderAction(order({ provider_instance_id: undefined }), ELIGIBLE)).toBeNull()
    expect(myOrderAction(order({ provider_instance_id: '' }), ELIGIBLE)).toBeNull()
    expect(myOrderAction(order(), new Set())).toBeNull()
  })

  it('offers no refund request for a subscription: the server refuses those', () => {
    expect(myOrderAction(order({ order_type: 'subscription' }), ELIGIBLE)).toBeNull()
  })

  it('still offers it when the order does not say what it is for', () => {
    const untyped = { status: 'COMPLETED', provider_instance_id: '1' } as ActionFields
    expect(myOrderAction(untyped, ELIGIBLE)).toBe('requestRefund')
  })

  it.each([
    'PAID',
    'RECHARGING',
    'EXPIRED',
    'CANCELLED',
    'FAILED',
    'REFUND_REQUESTED',
    'REFUNDING',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
    'REFUND_FAILED',
  ] as const)('offers nothing for an order that is %s', (status) => {
    expect(myOrderAction(order({ status }), ELIGIBLE)).toBeNull()
  })
})

describe('cancelling', () => {
  it('went through unless the server says the order was paid after all', () => {
    expect(cancelOutcome({ message: 'cancelled' })).toBe('cancelled')
    expect(cancelOutcome({ message: 'already_paid' })).toBe('alreadyPaid')
  })

  it('reads an answer that says nothing as cancelled', () => {
    expect(cancelOutcome({})).toBe('cancelled')
    expect(cancelOutcome(null)).toBe('cancelled')
    expect(cancelOutcome(undefined)).toBe('cancelled')
  })
})

describe('asking for a refund', () => {
  it('sends the reason without the space around it', () => {
    expect(refundReasonOf('  bought twice \n')).toBe('bought twice')
    expect(refundReasonOf('two\nlines')).toBe('two\nlines')
  })

  it('takes spaces alone for no reason', () => {
    expect(refundReasonOf('')).toBe('')
    expect(refundReasonOf('   \n\t ')).toBe('')
  })
})

describe('amounts', () => {
  it('are worded as on the management list', () => {
    expect(paidText({ pay_amount: 72, currency: 'CNY' })).toBe('¥72.00')
    expect(creditText(10)).toBe('$10.00')
  })
})
