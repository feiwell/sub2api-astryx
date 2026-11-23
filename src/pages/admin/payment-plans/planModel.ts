import { currencySymbol } from '@/components/payment/currency'
import type { AdminGroup } from '@/types'
import type { SubscriptionPlan } from '@/types/payment'

export type ValidityUnit = 'days' | 'weeks' | 'months'

export const VALIDITY_UNITS: ValidityUnit[] = ['days', 'weeks', 'months']

/** A plan as the server sends it: its features are one text, a feature to a line. */
export type RawPlan = Omit<SubscriptionPlan, 'features'> & { features?: string | string[] | null }

/** The features of a plan, from a text with one to a line or from a list: trimmed, the empty ones left out. */
export function featureLines(features: string | string[] | null | undefined): string[] {
  const lines = typeof features === 'string' ? features.split('\n') : features || []
  return lines.map((line) => line.trim()).filter(Boolean)
}

export function planOf(raw: RawPlan): SubscriptionPlan {
  return { ...raw, features: featureLines(raw.features) }
}

/** The unit a plan lasts in. Plans saved long ago can carry it in another spelling, such as "day". */
export function validityUnitOf(unit: string | null | undefined): ValidityUnit {
  const name = (unit || '').trim().toLowerCase().replace(/s$/, '')
  if (name === 'month') return 'months'
  if (name === 'week') return 'weeks'
  return 'days'
}

// The currency of a plan is a label beside its price. A plan without one shows a dollar sign.
const symbolOf = (plan: Pick<SubscriptionPlan, 'currency'>) => currencySymbol(plan.currency || 'USD')

export function planPriceText(plan: Pick<SubscriptionPlan, 'price' | 'currency'>): string {
  return `${symbolOf(plan)}${(plan.price ?? 0).toFixed(2)}`
}

/** The price a plan is marked down from; null for a plan that has none. */
export function planOriginalPriceText(plan: Pick<SubscriptionPlan, 'original_price' | 'currency'>): string | null {
  return plan.original_price ? `${symbolOf(plan)}${plan.original_price.toFixed(2)}` : null
}

export type PlanGroup =
  | { kind: 'group'; name: string; platform: string; rate: number | null }
  /** Only the number of the group is known. It is missing when the groups are known and it is not among them. */
  | { kind: 'number'; id: number; isMissing: boolean }
  | { kind: 'none' }

/**
 * The group a plan subscribes its buyers to. While the groups themselves could not be loaded, what the
 * plan carries about its group stands in, and no group is called missing.
 */
export function planGroup(
  plan: Pick<SubscriptionPlan, 'group_id' | 'group_name' | 'group_platform' | 'rate_multiplier'>,
  groups: AdminGroup[],
  areGroupsKnown: boolean,
): PlanGroup {
  const group = groups.find((candidate) => candidate.id === plan.group_id)
  if (group) return { kind: 'group', name: group.name, platform: group.platform, rate: group.rate_multiplier }
  if (!(plan.group_id > 0)) return { kind: 'none' }
  if (areGroupsKnown) return { kind: 'number', id: plan.group_id, isMissing: true }
  if (plan.group_name) {
    return {
      kind: 'group',
      name: plan.group_name,
      platform: plan.group_platform || '',
      rate: plan.rate_multiplier ?? null,
    }
  }
  return { kind: 'number', id: plan.group_id, isMissing: false }
}

/**
 * The groups a plan can be given: the subscription groups, and the group the plan is in now when that
 * is another kind of group, so that opening a plan never shows it without its group.
 */
export function selectableGroups(groups: AdminGroup[], currentGroupId: number | null): AdminGroup[] {
  return groups.filter((group) => group.subscription_type === 'subscription' || group.id === currentGroupId)
}

/** A spending limit of a group in US dollars; null where the group has none. */
export function limitText(limit: number | null | undefined): string | null {
  return limit != null ? `$${limit}` : null
}

export interface PlanForm {
  name: string
  groupId: number | null
  description: string
  /** The number fields hold null while they are empty. */
  price: number | null
  originalPrice: number | null
  currency: string
  validityDays: number | null
  validityUnit: ValidityUnit
  sortOrder: number | null
  /** One feature to a line. */
  features: string
  forSale: boolean
}

export function emptyPlanForm(): PlanForm {
  return {
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
  }
}

export function planFormOf(plan: SubscriptionPlan): PlanForm {
  return {
    name: plan.name,
    groupId: plan.group_id > 0 ? plan.group_id : null,
    description: plan.description || '',
    price: plan.price,
    // No original price is stored as zero, and shown as an empty field.
    originalPrice: plan.original_price || null,
    currency: plan.currency || '',
    validityDays: plan.validity_days,
    validityUnit: validityUnitOf(plan.validity_unit),
    sortOrder: plan.sort_order || 0,
    features: featureLines(plan.features).join('\n'),
    forSale: plan.for_sale,
  }
}

/** What a currency label is cut down to as it is typed: three characters, in capitals. */
export function currencyEntry(text: string): string {
  return text.toUpperCase().slice(0, 3)
}

export interface PlanProblems {
  name?: 'missing'
  group?: 'missing'
  description?: 'missing'
  price?: 'missing' | 'notPositive'
  validity?: 'missing' | 'notPositive'
  currency?: 'malformed'
}

const CURRENCY_CODE = /^[A-Za-z]{3}$/

/** What stands in the way of saving the form; nothing in it when the form can be saved. */
export function planProblems(form: PlanForm): PlanProblems {
  const problems: PlanProblems = {}
  if (!form.name.trim()) problems.name = 'missing'
  if (form.groupId === null || !(form.groupId > 0)) problems.group = 'missing'
  if (!form.description.trim()) problems.description = 'missing'
  if (form.price === null) problems.price = 'missing'
  else if (!(form.price > 0)) problems.price = 'notPositive'
  if (form.validityDays === null) problems.validity = 'missing'
  else if (!(form.validityDays >= 1)) problems.validity = 'notPositive'
  const currency = form.currency.trim()
  if (currency && !CURRENCY_CODE.test(currency)) problems.currency = 'malformed'
  return problems
}

/** What is sent to create or update a plan; null while the form has a problem. */
export function planRequest(form: PlanForm): Record<string, unknown> | null {
  if (Object.keys(planProblems(form)).length > 0) return null
  return {
    name: form.name.trim(),
    group_id: form.groupId,
    description: form.description.trim(),
    price: form.price,
    original_price: form.originalPrice || 0,
    currency: form.currency.trim().toUpperCase(),
    validity_days: form.validityDays,
    validity_unit: form.validityUnit,
    sort_order: form.sortOrder || 0,
    for_sale: form.forSale,
    features: featureLines(form.features).join('\n'),
  }
}

export interface CnyCharge {
  /** The price in yuan at the configured rate. */
  amount: number
  /** The fee on top, in percent; zero when no fee is charged. */
  feeRate: number
  /** What is charged in all: the amount, with the fee when there is one. */
  total: number
}

const roundToCents = (value: number) => Math.round(value * 100) / 100
const ceilToCents = (value: number) => Math.ceil(value * 100) / 100

/**
 * What a buyer who pays in yuan is charged for a plan of this price; null while there is no price or
 * no exchange rate is configured.
 */
export function cnyCharge(
  price: number | null,
  config: { subscription_usd_to_cny_rate?: number | null; recharge_fee_rate?: number | null } | null | undefined,
): CnyCharge | null {
  const priced = Number(price) || 0
  const rate = Number(config?.subscription_usd_to_cny_rate) || 0
  if (priced <= 0 || rate <= 0) return null
  const amount = roundToCents(priced * rate)
  const feeRate = Number(config?.recharge_fee_rate) || 0
  if (feeRate <= 0) return { amount, feeRate: 0, total: amount }
  const fee = ceilToCents((amount * feeRate) / 100)
  return { amount, feeRate, total: roundToCents(amount + fee) }
}
