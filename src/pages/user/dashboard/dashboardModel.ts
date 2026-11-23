import type { DateRange, ISODateString } from '@astryxdesign/core/Calendar'
import type { UserDashboardStats } from '@/api/usage'
import type { PlatformQuotaItem } from '@/types'

/** The id of the card for spend no platform accounts for. No endpoint reports a platform by this name. */
export const OTHER_PLATFORM = '__other__'

/** The recent requests are always the newest few of this many days, whatever range the charts show. */
export const RECENT_DAYS = 7
export const RECENT_LIMIT = 5

const PLATFORM_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
  kimi: 'Kimi',
  zhipu: 'Zhipu GLM',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  typesafe: 'TypeSafe / Jev',
}

/** These platforms come first, in this order; any other follows by name. */
const PLATFORM_ORDER = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok', 'typesafe']

// Sums of fractions never match to the last digit; a difference this small is not a missing share.
const OTHER_THRESHOLD = 0.0001

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

export interface PlatformCard {
  platform: string
  totalCost: number
  todayCost: number
  requests: number
  tokens: number
  /** The limits record of the platform, when there is one. It may set no limit at all. */
  quota?: PlatformQuotaItem
  /** The card for the spend the platforms do not add up to; it is not a platform. */
  isOther: boolean
}

/** A record with all three limits empty is the same as no limit. Zero is a limit: it shuts the platform off. */
export function hasAnyLimit(quota: PlatformQuotaItem | undefined): boolean {
  if (!quota) return false
  return quota.daily_limit_usd != null || quota.weekly_limit_usd != null || quota.monthly_limit_usd != null
}

function byPlatformOrder(a: PlatformCard, b: PlatformCard): number {
  const ai = PLATFORM_ORDER.indexOf(a.platform)
  const bi = PLATFORM_ORDER.indexOf(b.platform)
  if (ai === -1 && bi === -1) return a.platform.localeCompare(b.platform)
  if (ai === -1) return 1
  if (bi === -1) return -1
  return ai - bi
}

/**
 * One card per platform that was used or has a limit set, in a fixed order. The server leaves out usage it
 * cannot tie to a platform, so the platforms can add up to less than the totals above them; the rest is shown
 * as a card of its own rather than left unexplained.
 */
export function buildPlatformCards(
  stats: Pick<UserDashboardStats, 'total_actual_cost' | 'today_actual_cost' | 'by_platform'>,
  quotas: PlatformQuotaItem[],
): PlatformCard[] {
  const usageOf = new Map((stats.by_platform ?? []).map((item) => [item.platform, item]))
  const quotaOf = new Map(quotas.map((quota) => [quota.platform, quota]))
  const platforms = new Set(usageOf.keys())
  for (const quota of quotaOf.values()) {
    if (hasAnyLimit(quota)) platforms.add(quota.platform)
  }

  const cards = [...platforms]
    .map((platform): PlatformCard => {
      const usage = usageOf.get(platform)
      return {
        platform,
        totalCost: usage?.total_actual_cost ?? 0,
        todayCost: usage?.today_actual_cost ?? 0,
        requests: usage?.total_requests ?? 0,
        tokens: usage?.total_tokens ?? 0,
        quota: quotaOf.get(platform),
        isOther: false,
      }
    })
    .sort(byPlatformOrder)

  const restTotal = Math.max(0, (stats.total_actual_cost ?? 0) - cards.reduce((sum, card) => sum + card.totalCost, 0))
  const restToday = Math.max(0, (stats.today_actual_cost ?? 0) - cards.reduce((sum, card) => sum + card.todayCost, 0))
  if (restTotal > OTHER_THRESHOLD || restToday > OTHER_THRESHOLD) {
    cards.push({
      platform: OTHER_PLATFORM,
      totalCost: restTotal,
      todayCost: restToday,
      requests: 0,
      tokens: 0,
      isOther: true,
    })
  }
  return cards
}

/** How many platforms the cards show; the card for the rest is not one. */
export function countPlatforms(cards: PlatformCard[]): number {
  return cards.filter((card) => !card.isOther).length
}

export type QuotaWindowName = 'daily' | 'weekly' | 'monthly'
export type QuotaTone = 'success' | 'warning' | 'error'

export interface QuotaWindow {
  name: QuotaWindowName
  limit: number
  usage: number
  /** How full the window is, 0 to 100. A window that is shut off counts as full. */
  percent: number
  tone: QuotaTone
  /** A limit of zero: the platform cannot be used at all. */
  isDisabled: boolean
  /** When the window starts over, as the server sent it. Not told for a window that is shut off. */
  resetsAt: string | null
}

const QUOTA_WINDOWS: QuotaWindowName[] = ['daily', 'weekly', 'monthly']

/** How much of a limit is used, in whole percent, never past 100. */
export function quotaPercent(usage: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((usage / limit) * 100)))
}

export function quotaTone(percent: number): QuotaTone {
  if (percent >= 95) return 'error'
  if (percent >= 75) return 'warning'
  return 'success'
}

/** The windows of a platform that have a limit, shortest first. */
export function quotaWindows(quota: PlatformQuotaItem | undefined): QuotaWindow[] {
  if (!quota) return []
  const windows: QuotaWindow[] = []
  for (const name of QUOTA_WINDOWS) {
    const limit = quota[`${name}_limit_usd`]
    if (limit == null) continue
    const usage = quota[`${name}_usage_usd`] ?? 0
    const isDisabled = limit === 0
    const percent = isDisabled ? 100 : quotaPercent(usage, limit)
    windows.push({
      name,
      limit,
      usage,
      percent,
      tone: isDisabled ? 'error' : quotaTone(percent),
      isDisabled,
      resetsAt: isDisabled ? null : quota[`${name}_window_resets_at`] || null,
    })
  }
  return windows
}

// Dollar amounts are written the same way in every language of the app.
const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A balance or a limit: two decimals, thousands grouped. */
export function formatUsd(value: number): string {
  return Number.isFinite(value) ? usd.format(value) : '0.00'
}

/** What requests cost: four decimals, as single requests cost fractions of a cent. */
export function formatCost(value: number): string {
  return value.toFixed(4)
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toString()
}

export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`
}

/** When a quota window starts over: day and time, in the language of the app. Unreadable input is shown as sent. */
export function formatResetTime(iso: string, locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // Not `hour12: false`, which makes midnight 24:00 in some languages.
    hourCycle: 'h23',
  })
}

const twoDigits = (value: number) => String(value).padStart(2, '0')
/** The calendar day of a moment where the browser is, not in UTC: ranges are picked and sent in local days. */
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}` as ISODateString

/** The last `days` calendar days, today included. */
export function lastDaysRange(days: number, now = new Date()): DateRange {
  return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))), end: isoDate(now) }
}
