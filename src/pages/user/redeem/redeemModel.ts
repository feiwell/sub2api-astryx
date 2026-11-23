import type { RedeemHistoryItem } from '@/api'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The sizes a page of the history can have, as in the Vue page. */
export const PAGE_SIZES = [20, 50, 100]
export const DEFAULT_PAGE_SIZE = 20

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const numberOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

/** `$12.50`, and `-$5.00` for an amount below nothing. */
export function formatMoney(value: number): string {
  const digits = Math.abs(numberOf(value)).toFixed(2)
  // An amount that rounds to nothing carries no sign.
  return `${value < 0 && Number(digits) !== 0 ? '-' : ''}$${digits}`
}

/** An amount as a change: `+$10.00`, `-$5.00`. */
export function formatMoneyChange(value: number): string {
  const money = formatMoney(value)
  return money.startsWith('-') ? money : `+${money}`
}

/** What a line of the history is about. `other` is a type this page has no words for. */
export type EntryKind = 'balance' | 'concurrency' | 'subscription' | 'invitation' | 'other'

export function entryKind(type: string): EntryKind {
  switch (type) {
    case 'balance':
    case 'admin_balance':
      return 'balance'
    case 'concurrency':
    case 'admin_concurrency':
      return 'concurrency'
    case 'subscription':
      return 'subscription'
    // The invitation code an account was registered with is among the codes it used.
    case 'invitation':
      return 'invitation'
    default:
      return 'other'
  }
}

/** Whether an administrator made the change, not a code the user entered. */
export const isAdminEntry = (type: string): boolean => type === 'admin_balance' || type === 'admin_concurrency'

type Entry = Pick<RedeemHistoryItem, 'type' | 'value'>

/** The colour of a line's icon: what came in and what was taken away differ, as in the Vue page. */
export function entryColor(item: Entry): 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'secondary' {
  const isGain = numberOf(item.value) >= 0
  switch (entryKind(item.type)) {
    case 'balance':
      return isGain ? 'green' : 'red'
    case 'concurrency':
      return isGain ? 'blue' : 'orange'
    case 'subscription':
      return 'purple'
    default:
      return 'secondary'
  }
}

/** The entry that names a line of the history. */
export function entryTitleKey(item: Entry): string {
  const isGain = numberOf(item.value) >= 0
  switch (item.type) {
    case 'balance':
      return 'redeem.balanceAddedRedeem'
    case 'admin_balance':
      return isGain ? 'redeem.balanceAddedAdmin' : 'redeem.balanceDeductedAdmin'
    case 'concurrency':
      return 'redeem.concurrencyAddedRedeem'
    case 'admin_concurrency':
      return isGain ? 'redeem.concurrencyAddedAdmin' : 'redeem.concurrencyReducedAdmin'
    case 'subscription':
      return 'redeem.subscriptionAssigned'
    case 'invitation':
      return 'admin.redeem.types.invitation'
    default:
      return 'common.unknown'
  }
}

/**
 * What a line of the history gave or took: money, parallel requests, or the days of a subscription and its
 * group. Empty for a line that changes none of them.
 */
export function entryValue(
  item: Pick<RedeemHistoryItem, 'type' | 'value' | 'validity_days' | 'group'>,
  t: Translate,
): string {
  const value = numberOf(item.value)
  switch (entryKind(item.type)) {
    case 'balance':
      return formatMoneyChange(value)
    case 'concurrency':
      return `${value >= 0 ? '+' : ''}${value} ${t('redeem.requests')}`
    case 'subscription': {
      // As in the Vue page: where no days are given, the value stands for them.
      const days = `${numberOf(item.validity_days) || Math.round(value)}${t('redeem.days')}`
      const group = textOf(item.group?.name)
      return group ? `${days} - ${group}` : days
    }
    default:
      return ''
  }
}

const CODE_PREFIX_LENGTH = 8

/** Where a line came from: the start of the code that was used, or that an administrator made the change. */
export function entryTrace(item: Pick<RedeemHistoryItem, 'type' | 'code'>, t: Translate): string {
  if (isAdminEntry(item.type)) return t('redeem.adminAdjustment')
  const code = textOf(item.code)
  return code.length > CODE_PREFIX_LENGTH ? `${code.slice(0, CODE_PREFIX_LENGTH)}...` : code
}

/** What a redeemed code did, as far as the server said. */
export interface RedeemOutcome {
  /** Empty when the server named no type. */
  type: string
  value: number
  message: string
  newBalance: number | null
  newConcurrency: number | null
  groupName: string
  validityDays: number
}

/**
 * Reads the answer to a redeemed code. The server answers with the code itself (type, value, group, days);
 * the typed answer of the client (message, new balance, new concurrency) is read as well where it is given.
 */
export function readRedeemOutcome(answer: unknown): RedeemOutcome {
  const data = isRecord(answer) ? answer : {}
  const group = isRecord(data.group) ? data.group : {}
  return {
    type: textOf(data.type),
    value: numberOf(data.value),
    message: textOf(data.message),
    newBalance: typeof data.new_balance === 'number' ? data.new_balance : null,
    newConcurrency: typeof data.new_concurrency === 'number' ? data.new_concurrency : null,
    groupName: textOf(data.group_name) || textOf(group.name),
    validityDays: numberOf(data.validity_days),
  }
}

/** The lines under "redeemed": what the code did, in the words of the Vue page. */
export function outcomeLines(outcome: RedeemOutcome, t: Translate): string[] {
  const lines: string[] = []
  if (outcome.message) lines.push(outcome.message)
  if (outcome.type === 'balance') {
    lines.push(`${t('redeem.added')}: ${formatMoney(outcome.value)}`)
  } else if (outcome.type === 'concurrency') {
    lines.push(`${t('redeem.added')}: ${outcome.value} ${t('redeem.concurrentRequests')}`)
  } else if (outcome.type === 'subscription') {
    const group = outcome.groupName ? ` - ${outcome.groupName}` : ''
    const days = outcome.validityDays ? ` (${t('redeem.subscriptionDays', { days: outcome.validityDays })})` : ''
    lines.push(`${t('redeem.subscriptionAssigned')}${group}${days}`)
  }
  if (outcome.newBalance !== null) lines.push(`${t('redeem.newBalance')}: ${formatMoney(outcome.newBalance)}`)
  if (outcome.newConcurrency !== null) {
    lines.push(`${t('redeem.newConcurrency')}: ${outcome.newConcurrency} ${t('redeem.requests')}`)
  }
  return lines
}

/** A page of the history and its size. */
export interface Position {
  page: number
  pageSize: number
}

export const FIRST_PAGE: Position = { page: 1, pageSize: DEFAULT_PAGE_SIZE }

export const isSamePosition = (a: Position, b: Position): boolean => a.page === b.page && a.pageSize === b.pageSize

/**
 * Where the next request starts from: the request on its way, else the page on screen, else the first page.
 * A request that failed is not among them, so the page and the size on screen stay the ones to go on from.
 */
export function basePosition(inFlight: Position | null, shown: Position | null): Position {
  return inFlight ?? shown ?? FIRST_PAGE
}

export interface HistoryPage extends Position {
  items: RedeemHistoryItem[]
  total: number
}

const wholeNumber = (value: unknown, least: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= least ? value : null

/** Reads a page of the history; what the server leaves out is taken from what was asked for. */
export function readHistoryPage(answer: unknown, asked: Position): HistoryPage {
  const data = isRecord(answer) ? answer : {}
  const items = Array.isArray(data.items) ? (data.items.filter(isRecord) as unknown as RedeemHistoryItem[]) : []
  return {
    items,
    total: wholeNumber(data.total, 0) ?? items.length,
    page: wholeNumber(data.page, 1) ?? asked.page,
    pageSize: wholeNumber(data.page_size, 1) ?? asked.pageSize,
  }
}
