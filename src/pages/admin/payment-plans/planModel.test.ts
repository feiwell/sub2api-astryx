import { describe, expect, it } from 'vitest'
import type { AdminGroup } from '@/types'
import type { SubscriptionPlan } from '@/types/payment'
import {
  cnyCharge,
  currencyEntry,
  emptyPlanForm,
  featureLines,
  limitText,
  planFormOf,
  planGroup,
  planOf,
  planOriginalPriceText,
  planPriceText,
  planProblems,
  planRequest,
  selectableGroups,
  validityUnitOf,
  type PlanForm,
  type RawPlan,
} from './planModel'

const plan = (patch: Partial<SubscriptionPlan> = {}): SubscriptionPlan =>
  ({
    id: 1,
    group_id: 2,
    name: 'Pro',
    description: 'For daily work',
    price: 19.9,
    original_price: 29.9,
    currency: 'USD',
    validity_days: 1,
    validity_unit: 'months',
    features: ['Priority', 'Support'],
    for_sale: true,
    sort_order: 3,
    ...patch,
  }) as SubscriptionPlan

const group = (patch: Partial<AdminGroup>): AdminGroup =>
  ({
    id: 2,
    name: 'claude-pro',
    platform: 'anthropic',
    rate_multiplier: 1.5,
    subscription_type: 'subscription',
    daily_limit_usd: null,
    weekly_limit_usd: null,
    monthly_limit_usd: null,
    ...patch,
  }) as AdminGroup

const filled = (patch: Partial<PlanForm> = {}): PlanForm => ({
  ...emptyPlanForm(),
  name: 'Pro',
  groupId: 2,
  description: 'For daily work',
  price: 19.9,
  ...patch,
})

describe('features', () => {
  it('reads one feature from each line of a text', () => {
    expect(featureLines('Priority\n  Support  \n\n \nMore')).toEqual(['Priority', 'Support', 'More'])
  })

  it('takes a list as it is, without its empty entries', () => {
    expect(featureLines([' Priority ', '', 'Support'])).toEqual(['Priority', 'Support'])
  })

  it('reads nothing from nothing', () => {
    expect(featureLines('')).toEqual([])
    expect(featureLines(null)).toEqual([])
    expect(featureLines(undefined)).toEqual([])
  })

  it('gives a plan from the server its list of features', () => {
    const raw = { ...plan(), features: 'Priority\nSupport\n' } as RawPlan
    expect(planOf(raw).features).toEqual(['Priority', 'Support'])
    expect(planOf({ ...raw, features: null }).features).toEqual([])
    expect(planOf(raw).name).toBe('Pro')
  })
})

describe('validity unit', () => {
  it('keeps the three units', () => {
    expect(validityUnitOf('days')).toBe('days')
    expect(validityUnitOf('weeks')).toBe('weeks')
    expect(validityUnitOf('months')).toBe('months')
  })

  it('reads the other spellings', () => {
    expect(validityUnitOf('day')).toBe('days')
    expect(validityUnitOf('week')).toBe('weeks')
    expect(validityUnitOf(' Month ')).toBe('months')
    expect(validityUnitOf('MONTHS')).toBe('months')
  })

  it('takes anything else for days', () => {
    expect(validityUnitOf('')).toBe('days')
    expect(validityUnitOf(null)).toBe('days')
    expect(validityUnitOf(undefined)).toBe('days')
    expect(validityUnitOf('year')).toBe('days')
  })
})

describe('price texts', () => {
  it('shows the price with two decimals behind the symbol of its currency', () => {
    expect(planPriceText(plan())).toBe('$19.90')
    expect(planPriceText(plan({ price: 5.5, currency: 'CNY' }))).toBe('¥5.50')
    expect(planPriceText(plan({ price: 9.9, currency: 'NZD' }))).toBe('NZ$9.90')
    expect(planPriceText(plan({ price: 1234.5 }))).toBe('$1234.50')
  })

  it('shows a dollar sign for a plan without a currency', () => {
    expect(planPriceText(plan({ price: 49, currency: '' }))).toBe('$49.00')
    expect(planPriceText(plan({ price: 49, currency: undefined }))).toBe('$49.00')
  })

  it('shows the original price only where there is one', () => {
    expect(planOriginalPriceText(plan())).toBe('$29.90')
    expect(planOriginalPriceText(plan({ original_price: 0 }))).toBeNull()
    expect(planOriginalPriceText(plan({ original_price: undefined }))).toBeNull()
  })
})

describe('the group of a plan', () => {
  const groups = [group({}), group({ id: 3, name: 'gpt-plus', platform: 'openai', rate_multiplier: 1 })]

  it('is the group with the id of the plan', () => {
    expect(planGroup(plan({ group_id: 3 }), groups, true)).toEqual({
      kind: 'group',
      name: 'gpt-plus',
      platform: 'openai',
      rate: 1,
    })
  })

  it('is missing when the groups are known and it is not among them', () => {
    expect(planGroup(plan({ group_id: 9 }), groups, true)).toEqual({ kind: 'number', id: 9, isMissing: true })
  })

  it('is taken from the plan itself while the groups are not known', () => {
    const carried = plan({ group_id: 9, group_name: 'old', group_platform: 'gemini', rate_multiplier: 0.8 })
    expect(planGroup(carried, [], false)).toEqual({ kind: 'group', name: 'old', platform: 'gemini', rate: 0.8 })
    expect(planGroup(plan({ group_id: 9, group_name: 'old' }), [], false)).toEqual({
      kind: 'group',
      name: 'old',
      platform: '',
      rate: null,
    })
  })

  it('is only a number while the groups are not known and the plan carries no name', () => {
    expect(planGroup(plan({ group_id: 9 }), [], false)).toEqual({ kind: 'number', id: 9, isMissing: false })
  })

  it('is none for a plan without a group', () => {
    expect(planGroup(plan({ group_id: 0 }), groups, true)).toEqual({ kind: 'none' })
    expect(planGroup(plan({ group_id: 0 }), [], false)).toEqual({ kind: 'none' })
  })
})

describe('groups to pick from', () => {
  const groups = [
    group({ id: 1, name: 'default', subscription_type: 'standard' }),
    group({ id: 2 }),
    group({ id: 3, name: 'gpt-plus' }),
  ]

  it('are the subscription groups', () => {
    expect(selectableGroups(groups, null).map((each) => each.id)).toEqual([2, 3])
  })

  it('include the group the plan is in, whatever its kind', () => {
    expect(selectableGroups(groups, 1).map((each) => each.id)).toEqual([1, 2, 3])
    expect(selectableGroups(groups, 3).map((each) => each.id)).toEqual([2, 3])
    expect(selectableGroups(groups, 9).map((each) => each.id)).toEqual([2, 3])
  })
})

describe('limit text', () => {
  it('shows a limit in dollars, and nothing for no limit', () => {
    expect(limitText(20)).toBe('$20')
    expect(limitText(5.5)).toBe('$5.5')
    expect(limitText(0)).toBe('$0')
    expect(limitText(null)).toBeNull()
    expect(limitText(undefined)).toBeNull()
  })
})

describe('the form', () => {
  it('starts empty for a new plan: thirty days, on sale, no price yet', () => {
    expect(emptyPlanForm()).toEqual({
      name: '',
      groupId: null,
      description: '',
      price: null,
      originalPrice: null,
      currency: '',
      validityDays: 30,
      validityUnit: 'days',
      sortOrder: 0,
      features: '',
      forSale: true,
    })
  })

  it('starts from the plan that is edited', () => {
    expect(planFormOf(plan())).toEqual({
      name: 'Pro',
      groupId: 2,
      description: 'For daily work',
      price: 19.9,
      originalPrice: 29.9,
      currency: 'USD',
      validityDays: 1,
      validityUnit: 'months',
      sortOrder: 3,
      features: 'Priority\nSupport',
      forSale: true,
    })
  })

  it('fills in what an old plan leaves out', () => {
    const old = plan({
      group_id: 0,
      description: undefined,
      original_price: 0,
      currency: undefined,
      validity_unit: 'day',
      sort_order: undefined,
      features: undefined,
      for_sale: false,
    })
    expect(planFormOf(old)).toMatchObject({
      groupId: null,
      description: '',
      originalPrice: null,
      currency: '',
      validityUnit: 'days',
      sortOrder: 0,
      features: '',
      forSale: false,
    })
  })

  it('cuts a currency label to three capitals as it is typed', () => {
    expect(currencyEntry('usd')).toBe('USD')
    expect(currencyEntry('nzdx')).toBe('NZD')
    expect(currencyEntry('')).toBe('')
    expect(currencyEntry('u1')).toBe('U1')
  })
})

describe('problems', () => {
  it('finds none in a filled form', () => {
    expect(planProblems(filled())).toEqual({})
    expect(planProblems(filled({ currency: 'nzd', originalPrice: 29.9, sortOrder: null }))).toEqual({})
  })

  it('finds everything a new form lacks', () => {
    expect(planProblems(emptyPlanForm())).toEqual({
      name: 'missing',
      group: 'missing',
      description: 'missing',
      price: 'missing',
    })
  })

  it('takes blanks for nothing', () => {
    expect(planProblems(filled({ name: '   ' }))).toEqual({ name: 'missing' })
    expect(planProblems(filled({ description: ' \n ' }))).toEqual({ description: 'missing' })
  })

  it('wants a group', () => {
    expect(planProblems(filled({ groupId: null }))).toEqual({ group: 'missing' })
    expect(planProblems(filled({ groupId: 0 }))).toEqual({ group: 'missing' })
  })

  it('wants a price above zero', () => {
    expect(planProblems(filled({ price: null }))).toEqual({ price: 'missing' })
    expect(planProblems(filled({ price: 0 }))).toEqual({ price: 'notPositive' })
    expect(planProblems(filled({ price: -1 }))).toEqual({ price: 'notPositive' })
    expect(planProblems(filled({ price: 0.01 }))).toEqual({})
  })

  it('wants the plan to last at least one unit', () => {
    expect(planProblems(filled({ validityDays: null }))).toEqual({ validity: 'missing' })
    expect(planProblems(filled({ validityDays: 0 }))).toEqual({ validity: 'notPositive' })
    expect(planProblems(filled({ validityDays: 1 }))).toEqual({})
  })

  it('wants a currency label of three letters, or none', () => {
    expect(planProblems(filled({ currency: '' }))).toEqual({})
    expect(planProblems(filled({ currency: '  ' }))).toEqual({})
    expect(planProblems(filled({ currency: 'US' }))).toEqual({ currency: 'malformed' })
    expect(planProblems(filled({ currency: 'U1D' }))).toEqual({ currency: 'malformed' })
    expect(planProblems(filled({ currency: 'USD' }))).toEqual({})
  })
})

describe('the request', () => {
  it('is not made from a form with a problem', () => {
    expect(planRequest(emptyPlanForm())).toBeNull()
    expect(planRequest(filled({ price: 0 }))).toBeNull()
    expect(planRequest(filled({ currency: 'US' }))).toBeNull()
  })

  it('carries the form under the names the server reads', () => {
    const form = filled({
      name: '  Pro  ',
      description: ' For daily work\n',
      originalPrice: 29.9,
      currency: 'nzd',
      validityDays: 3,
      validityUnit: 'weeks',
      sortOrder: 7,
      features: ' Priority \n\nSupport\n',
      forSale: false,
    })
    expect(planRequest(form)).toEqual({
      name: 'Pro',
      group_id: 2,
      description: 'For daily work',
      price: 19.9,
      original_price: 29.9,
      currency: 'NZD',
      validity_days: 3,
      validity_unit: 'weeks',
      sort_order: 7,
      for_sale: false,
      features: 'Priority\nSupport',
    })
  })

  it('sends zero for an original price or a sort order left empty', () => {
    expect(planRequest(filled({ originalPrice: null, sortOrder: null }))).toMatchObject({
      original_price: 0,
      sort_order: 0,
      currency: '',
      features: '',
    })
  })
})

describe('the charge in yuan', () => {
  const config = { subscription_usd_to_cny_rate: 7.2, recharge_fee_rate: 2.5 }

  it('is the price at the rate, with the fee rounded up to the cent', () => {
    // 19.9 * 7.2 = 143.28; 2.5% of it is 3.582, charged as 3.59.
    expect(cnyCharge(19.9, config)).toEqual({ amount: 143.28, feeRate: 2.5, total: 146.87 })
    expect(cnyCharge(10, config)).toEqual({ amount: 72, feeRate: 2.5, total: 73.8 })
  })

  it('is the plain amount when no fee is charged', () => {
    expect(cnyCharge(10, { subscription_usd_to_cny_rate: 7.2, recharge_fee_rate: 0 })).toEqual({
      amount: 72,
      feeRate: 0,
      total: 72,
    })
    expect(cnyCharge(10, { subscription_usd_to_cny_rate: 7.2 })).toEqual({ amount: 72, feeRate: 0, total: 72 })
  })

  it('rounds the amount to the cent', () => {
    expect(cnyCharge(0.01, { subscription_usd_to_cny_rate: 7.25 })).toEqual({ amount: 0.07, feeRate: 0, total: 0.07 })
    expect(cnyCharge(1.23, { subscription_usd_to_cny_rate: 7.2 })?.amount).toBe(8.86)
  })

  it('is not known without a price or without a rate', () => {
    expect(cnyCharge(null, config)).toBeNull()
    expect(cnyCharge(0, config)).toBeNull()
    expect(cnyCharge(-5, config)).toBeNull()
    expect(cnyCharge(10, null)).toBeNull()
    expect(cnyCharge(10, { subscription_usd_to_cny_rate: 0, recharge_fee_rate: 2.5 })).toBeNull()
    expect(cnyCharge(10, {})).toBeNull()
  })
})
