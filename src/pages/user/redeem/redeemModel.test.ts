import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  FIRST_PAGE,
  PAGE_SIZES,
  basePosition,
  entryColor,
  entryKind,
  entryTitleKey,
  entryTrace,
  entryValue,
  formatMoney,
  formatMoneyChange,
  isAdminEntry,
  isSamePosition,
  outcomeLines,
  readHistoryPage,
  readRedeemOutcome,
} from './redeemModel'

const WORDS: Record<string, string> = {
  'redeem.requests': 'requests',
  'redeem.days': ' days',
  'redeem.adminAdjustment': 'Admin Adjustment',
  'redeem.added': 'Added',
  'redeem.concurrentRequests': 'concurrent requests',
  'redeem.subscriptionAssigned': 'Subscription Assigned',
  'redeem.subscriptionDays': '{days} days',
  'redeem.newBalance': 'New Balance',
  'redeem.newConcurrency': 'New Concurrency',
}
const t = (key: string, params?: Record<string, unknown>) =>
  (WORDS[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name]))

describe('formatMoney', () => {
  it('writes two decimals after the dollar sign', () => {
    expect(formatMoney(128.5)).toBe('$128.50')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(9999)).toBe('$9999.00')
  })

  it('puts the minus before the dollar sign', () => {
    expect(formatMoney(-5)).toBe('-$5.00')
    expect(formatMoney(-0.25)).toBe('-$0.25')
  })

  it('gives no sign to an amount that rounds to nothing', () => {
    expect(formatMoney(-0.001)).toBe('$0.00')
  })

  it('reads what is not a number as nothing', () => {
    expect(formatMoney(Number.NaN)).toBe('$0.00')
    expect(formatMoney(undefined as unknown as number)).toBe('$0.00')
  })
})

describe('formatMoneyChange', () => {
  it('marks what came in with a plus and what went out with a minus', () => {
    expect(formatMoneyChange(10)).toBe('+$10.00')
    expect(formatMoneyChange(25.5)).toBe('+$25.50')
    expect(formatMoneyChange(-5)).toBe('-$5.00')
  })

  it('counts no change as a gain, as the Vue page does', () => {
    expect(formatMoneyChange(0)).toBe('+$0.00')
  })
})

describe('entryKind', () => {
  it('groups what users redeem with what administrators change', () => {
    expect(entryKind('balance')).toBe('balance')
    expect(entryKind('admin_balance')).toBe('balance')
    expect(entryKind('concurrency')).toBe('concurrency')
    expect(entryKind('admin_concurrency')).toBe('concurrency')
    expect(entryKind('subscription')).toBe('subscription')
    expect(entryKind('invitation')).toBe('invitation')
  })

  it('has a kind of its own for types it does not know', () => {
    expect(entryKind('gift')).toBe('other')
    expect(entryKind('')).toBe('other')
  })
})

describe('isAdminEntry', () => {
  it('is true for the two changes administrators make', () => {
    expect(isAdminEntry('admin_balance')).toBe(true)
    expect(isAdminEntry('admin_concurrency')).toBe(true)
    expect(isAdminEntry('balance')).toBe(false)
    expect(isAdminEntry('subscription')).toBe(false)
  })
})

describe('entryColor', () => {
  it('tells money that came in from money that was taken', () => {
    expect(entryColor({ type: 'balance', value: 10 })).toBe('green')
    expect(entryColor({ type: 'admin_balance', value: 25.5 })).toBe('green')
    expect(entryColor({ type: 'admin_balance', value: -5 })).toBe('red')
  })

  it('tells concurrency that was added from concurrency that was taken', () => {
    expect(entryColor({ type: 'concurrency', value: 3 })).toBe('blue')
    expect(entryColor({ type: 'admin_concurrency', value: -1 })).toBe('orange')
  })

  it('counts no change as a gain', () => {
    expect(entryColor({ type: 'balance', value: 0 })).toBe('green')
    expect(entryColor({ type: 'concurrency', value: 0 })).toBe('blue')
  })

  it('has one colour for subscriptions, whatever the value', () => {
    expect(entryColor({ type: 'subscription', value: 0 })).toBe('purple')
    expect(entryColor({ type: 'subscription', value: -7 })).toBe('purple')
  })

  it('leaves what changes nothing without a colour', () => {
    expect(entryColor({ type: 'invitation', value: 0 })).toBe('secondary')
    expect(entryColor({ type: 'gift', value: 5 })).toBe('secondary')
  })
})

describe('entryTitleKey', () => {
  it('names what a code did', () => {
    expect(entryTitleKey({ type: 'balance', value: 10 })).toBe('redeem.balanceAddedRedeem')
    expect(entryTitleKey({ type: 'concurrency', value: 3 })).toBe('redeem.concurrencyAddedRedeem')
    expect(entryTitleKey({ type: 'subscription', value: 0 })).toBe('redeem.subscriptionAssigned')
  })

  it('names what an administrator did by its direction', () => {
    expect(entryTitleKey({ type: 'admin_balance', value: 25.5 })).toBe('redeem.balanceAddedAdmin')
    expect(entryTitleKey({ type: 'admin_balance', value: 0 })).toBe('redeem.balanceAddedAdmin')
    expect(entryTitleKey({ type: 'admin_balance', value: -5 })).toBe('redeem.balanceDeductedAdmin')
    expect(entryTitleKey({ type: 'admin_concurrency', value: 2 })).toBe('redeem.concurrencyAddedAdmin')
    expect(entryTitleKey({ type: 'admin_concurrency', value: -1 })).toBe('redeem.concurrencyReducedAdmin')
  })

  it('names the invitation code an account was registered with', () => {
    expect(entryTitleKey({ type: 'invitation', value: 0 })).toBe('admin.redeem.types.invitation')
  })

  it('calls a type it does not know unknown', () => {
    expect(entryTitleKey({ type: 'gift', value: 1 })).toBe('common.unknown')
  })
})

describe('entryValue', () => {
  it('writes money as a change', () => {
    expect(entryValue({ type: 'balance', value: 10 }, t)).toBe('+$10.00')
    expect(entryValue({ type: 'admin_balance', value: -5 }, t)).toBe('-$5.00')
  })

  it('writes concurrency as a number of requests', () => {
    expect(entryValue({ type: 'concurrency', value: 3 }, t)).toBe('+3 requests')
    expect(entryValue({ type: 'admin_concurrency', value: -1 }, t)).toBe('-1 requests')
    expect(entryValue({ type: 'concurrency', value: 0 }, t)).toBe('+0 requests')
  })

  it('writes a subscription as its days and its group', () => {
    const item = { type: 'subscription', value: 0, validity_days: 30, group: { id: 7, name: 'Pro' } }
    expect(entryValue(item, t)).toBe('30 days - Pro')
  })

  it('leaves the group out when the server did not name it', () => {
    expect(entryValue({ type: 'subscription', value: 0, validity_days: 15 }, t)).toBe('15 days')
  })

  it('takes the days from the value where none are given, rounded', () => {
    expect(entryValue({ type: 'subscription', value: 7, validity_days: 0 }, t)).toBe('7 days')
    expect(entryValue({ type: 'subscription', value: 6.6 }, t)).toBe('7 days')
  })

  it('keeps the minus of a subscription that was cut short', () => {
    expect(entryValue({ type: 'subscription', value: 0, validity_days: -7 }, t)).toBe('-7 days')
  })

  it('writes nothing for what changes neither money, concurrency nor a subscription', () => {
    expect(entryValue({ type: 'invitation', value: 0 }, t)).toBe('')
    expect(entryValue({ type: 'gift', value: 5 }, t)).toBe('')
  })

  it('reads a missing value as nothing', () => {
    expect(entryValue({ type: 'balance', value: undefined as unknown as number }, t)).toBe('+$0.00')
  })
})

describe('entryTrace', () => {
  it('shows the first eight characters of the code that was used', () => {
    expect(entryTrace({ type: 'balance', code: 'REDEEM-CODE-123' }, t)).toBe('REDEEM-C...')
  })

  it('shows a code of eight characters or fewer whole', () => {
    expect(entryTrace({ type: 'balance', code: 'ABCD1234' }, t)).toBe('ABCD1234')
    expect(entryTrace({ type: 'concurrency', code: 'ABC' }, t)).toBe('ABC')
  })

  it('says that an administrator made the change instead of showing a code', () => {
    expect(entryTrace({ type: 'admin_balance', code: 'INTERNAL-0001' }, t)).toBe('Admin Adjustment')
    expect(entryTrace({ type: 'admin_concurrency', code: 'INTERNAL-0002' }, t)).toBe('Admin Adjustment')
  })

  it('shows nothing where there is no code', () => {
    expect(entryTrace({ type: 'balance', code: undefined as unknown as string }, t)).toBe('')
  })
})

describe('readRedeemOutcome', () => {
  it('reads the code the server answers with', () => {
    const answer = {
      id: 9002,
      code: 'SUB-PRO-0123456789',
      type: 'subscription',
      value: 0,
      status: 'used',
      group_id: 7,
      validity_days: 30,
      group: { id: 7, name: 'Pro' },
    }
    expect(readRedeemOutcome(answer)).toEqual({
      type: 'subscription',
      value: 0,
      message: '',
      newBalance: null,
      newConcurrency: null,
      groupName: 'Pro',
      validityDays: 30,
    })
  })

  it('reads the answer the client is typed for', () => {
    const answer = { message: 'Code redeemed successfully', type: 'balance', value: 10, new_balance: 138.5 }
    expect(readRedeemOutcome(answer)).toEqual({
      type: 'balance',
      value: 10,
      message: 'Code redeemed successfully',
      newBalance: 138.5,
      newConcurrency: null,
      groupName: '',
      validityDays: 0,
    })
  })

  it('prefers the group name given beside the code to the one of the group', () => {
    const answer = { type: 'subscription', value: 0, group_name: 'Named', group: { id: 7, name: 'Pro' } }
    expect(readRedeemOutcome(answer).groupName).toBe('Named')
  })

  it('keeps a new balance or concurrency of zero', () => {
    const outcome = readRedeemOutcome({ type: 'balance', value: -5, new_balance: 0, new_concurrency: 0 })
    expect(outcome.newBalance).toBe(0)
    expect(outcome.newConcurrency).toBe(0)
  })

  it('reads an answer that names no type', () => {
    const outcome = readRedeemOutcome({ success: true, amount: 10, message: 'Redeemed code: ABC' })
    expect(outcome.type).toBe('')
    expect(outcome.value).toBe(0)
    expect(outcome.message).toBe('Redeemed code: ABC')
  })

  it('reads no answer at all as an outcome that says nothing', () => {
    const nothing = {
      type: '',
      value: 0,
      message: '',
      newBalance: null,
      newConcurrency: null,
      groupName: '',
      validityDays: 0,
    }
    expect(readRedeemOutcome(null)).toEqual(nothing)
    expect(readRedeemOutcome(undefined)).toEqual(nothing)
    expect(readRedeemOutcome('ok')).toEqual(nothing)
  })
})

describe('outcomeLines', () => {
  const outcome = (answer: unknown) => outcomeLines(readRedeemOutcome(answer), t)

  it('tells how much money a code added', () => {
    expect(outcome({ type: 'balance', value: 10 })).toEqual(['Added: $10.00'])
  })

  it('tells the message and the new balance where the server gives them', () => {
    const answer = { message: 'Code redeemed successfully', type: 'balance', value: 10, new_balance: 138.5 }
    expect(outcome(answer)).toEqual(['Code redeemed successfully', 'Added: $10.00', 'New Balance: $138.50'])
  })

  it('tells how much concurrency a code added, and the new concurrency where the server gives it', () => {
    expect(outcome({ type: 'concurrency', value: 3 })).toEqual(['Added: 3 concurrent requests'])
    expect(outcome({ type: 'concurrency', value: 3, new_concurrency: 8 })).toEqual([
      'Added: 3 concurrent requests',
      'New Concurrency: 8 requests',
    ])
  })

  it('tells the group and the days of a subscription', () => {
    const answer = { type: 'subscription', value: 0, validity_days: 30, group: { id: 7, name: 'Pro' } }
    expect(outcome(answer)).toEqual(['Subscription Assigned - Pro (30 days)'])
  })

  it('leaves out the group or the days the server did not give', () => {
    expect(outcome({ type: 'subscription', value: 0, validity_days: 15 })).toEqual(['Subscription Assigned (15 days)'])
    expect(outcome({ type: 'subscription', value: 0, group_name: 'Pro' })).toEqual(['Subscription Assigned - Pro'])
    expect(outcome({ type: 'subscription', value: 0 })).toEqual(['Subscription Assigned'])
  })

  it('writes money that was taken with its minus', () => {
    expect(outcome({ type: 'balance', value: -5 })).toEqual(['Added: -$5.00'])
  })

  it('has only the message for an answer that names no type', () => {
    expect(outcome({ success: true, amount: 10, message: 'Redeemed code: ABC' })).toEqual(['Redeemed code: ABC'])
  })

  it('has no lines for an answer that says nothing', () => {
    expect(outcome({})).toEqual([])
    expect(outcome({ type: 'invitation', value: 0 })).toEqual([])
  })
})

describe('positions', () => {
  it('offers the page sizes of the Vue page and starts with the smallest', () => {
    expect(PAGE_SIZES).toEqual([20, 50, 100])
    expect(DEFAULT_PAGE_SIZE).toBe(20)
    expect(FIRST_PAGE).toEqual({ page: 1, pageSize: 20 })
  })

  it('compares the page and the size', () => {
    expect(isSamePosition({ page: 1, pageSize: 50 }, { page: 1, pageSize: 50 })).toBe(true)
    expect(isSamePosition({ page: 1, pageSize: 50 }, { page: 2, pageSize: 50 })).toBe(false)
    expect(isSamePosition({ page: 1, pageSize: 50 }, { page: 1, pageSize: 20 })).toBe(false)
  })

  it('goes on from the request on its way', () => {
    expect(basePosition({ page: 1, pageSize: 50 }, { page: 2, pageSize: 20 })).toEqual({ page: 1, pageSize: 50 })
  })

  it('goes on from the page on screen when nothing is on its way', () => {
    expect(basePosition(null, { page: 2, pageSize: 20 })).toEqual({ page: 2, pageSize: 20 })
  })

  it('goes on from the first page when nothing has been loaded', () => {
    expect(basePosition(null, null)).toEqual(FIRST_PAGE)
  })
})

describe('readHistoryPage', () => {
  const asked = { page: 2, pageSize: 50 }
  const row = { id: 1, code: 'REDEEM-CODE-123', type: 'balance', value: 10, status: 'used', used_at: '2026-11-22' }

  it('reads the rows, the total and the position the server reports', () => {
    const answer = { items: [row], total: 57, page: 3, page_size: 20, pages: 3 }
    expect(readHistoryPage(answer, asked)).toEqual({ items: [row], total: 57, page: 3, pageSize: 20 })
  })

  it('takes the position that was asked for where the server reports none', () => {
    expect(readHistoryPage({ items: [row], total: 57 }, asked)).toEqual({
      items: [row],
      total: 57,
      page: 2,
      pageSize: 50,
    })
  })

  it('does not take a position that is not a whole number above nothing', () => {
    const answer = { items: [], total: 0, page: '3', page_size: '20' }
    expect(readHistoryPage(answer, asked)).toEqual({ items: [], total: 0, page: 2, pageSize: 50 })
    expect(readHistoryPage({ items: [], total: 0, page: 0, page_size: 0 }, asked)).toMatchObject(asked)
    expect(readHistoryPage({ items: [], total: 0, page: 1.5, page_size: -20 }, asked)).toMatchObject(asked)
  })

  it('counts the rows where the server gives no total', () => {
    expect(readHistoryPage({ items: [row, row] }, asked).total).toBe(2)
    expect(readHistoryPage({ items: [row], total: -1 }, asked).total).toBe(1)
  })

  it('reads rows that are not a list as no rows', () => {
    expect(readHistoryPage({ items: null, total: 0 }, asked).items).toEqual([])
    expect(readHistoryPage({ items: 'none' }, asked).items).toEqual([])
  })

  it('drops what is not a row', () => {
    expect(readHistoryPage({ items: [row, null, 'x', 3], total: 4 }, asked).items).toEqual([row])
  })

  it('reads no answer at all as an empty page where it was asked for', () => {
    expect(readHistoryPage(null, asked)).toEqual({ items: [], total: 0, page: 2, pageSize: 50 })
    expect(readHistoryPage(undefined, FIRST_PAGE)).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
  })
})
