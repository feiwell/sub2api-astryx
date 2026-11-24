import type { Account } from '@/types'
import { supportsAccountQuota } from '@/utils/accountQuota'
import { isOfficialGeminiBaseUrl } from '@/utils/geminiExplicitCache'
import { isMultiProtocolApiKeyPlatform } from '@/components/account/credentialsBuilder'

/** Fields the usage column reads from an account row (list items included). */
export type UsageAccount = Pick<Account, 'platform' | 'type'> &
  Partial<
    Pick<
      Account,
      | 'id'
      | 'credentials'
      | 'extra'
      | 'quota_limit'
      | 'quota_used'
      | 'quota_daily_limit'
      | 'quota_daily_used'
      | 'quota_weekly_limit'
      | 'quota_weekly_used'
      | 'quota_daily_reset_mode'
      | 'quota_weekly_reset_mode'
      | 'quota_daily_reset_at'
      | 'quota_weekly_reset_at'
    >
  >

/** Frontend usage cache lifetime (Vue: AccountUsageCell USAGE_CACHE_TTL). */
export const USAGE_CACHE_TTL_MS = 5 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

// ===== Eligibility (Vue: AccountUsageCell showUsageWindows / shouldFetchUsage) =====

/** Gemini API Key pointing at a third-party upstream: no AI Studio tier or simulated quota. */
export function isGeminiThirdPartyApiKey(account: UsageAccount): boolean {
  if (account.platform !== 'gemini' || account.type !== 'apikey') return false
  const base = account.credentials?.base_url
  return (base != null && typeof base !== 'string') || !isOfficialGeminiBaseUrl(base)
}

export function isGeminiVertex(account: UsageAccount): boolean {
  return account.platform === 'gemini' && account.type === 'service_account'
}

/**
 * Whether the row renders usage windows (5h / 7d / platform quota).
 * Rows that don't fall back to inline today stats and local quota bars.
 */
export function accountShowsUsageWindows(account: UsageAccount): boolean {
  // Gemini: local usage windows are always computable from DB logs (simulated quotas)
  if (account.platform === 'gemini') return !isGeminiThirdPartyApiKey(account)
  // Multi-protocol API Key providers probe their own quota / balance cells
  if (isMultiProtocolApiKeyPlatform(account.platform)) return true
  return account.type === 'oauth' || account.type === 'setup-token'
}

/** Whether the row's usage comes from the batch usage endpoint (Vertex and third-party Gemini keys never do). */
export function accountSupportsBatchUsage(account: UsageAccount): boolean {
  if (account.platform === 'anthropic') {
    return account.type === 'oauth' || account.type === 'setup-token'
  }
  if (account.platform === 'gemini') {
    return !isGeminiThirdPartyApiKey(account) && !isGeminiVertex(account)
  }
  if (account.platform === 'antigravity') return account.type === 'oauth'
  if (account.platform === 'grok') return account.type === 'oauth'
  if (account.platform === 'openai') return account.type === 'oauth'
  return false
}

/** Rows that show inline today stats (plain API Key, Bedrock, service_account, third-party Gemini Key). */
export function accountShowsInlineTodayStats(account: UsageAccount): boolean {
  return isGeminiVertex(account) || !accountShowsUsageWindows(account)
}

/** Rows that support Claude / OpenAI / Antigravity single-row active usage queries. */
export function accountSupportsActiveUsageQuery(account: UsageAccount): boolean {
  if (account.platform === 'anthropic') return account.type === 'oauth' || account.type === 'setup-token'
  return (account.platform === 'openai' || account.platform === 'antigravity') && account.type === 'oauth'
}

// ===== Local account quota (Vue: AccountUsageCell makeQuotaBar / hasApiKeyQuota) =====

export interface QuotaBarInfo {
  utilization: number
  resetsAt: string | null
}

export interface LocalQuotaBars {
  daily: QuotaBarInfo | null
  weekly: QuotaBarInfo | null
  total: QuotaBarInfo | null
}

function extraString(account: UsageAccount, key: string): string | undefined {
  const extra = account.extra as Record<string, unknown> | undefined
  const value = extra?.[key]
  return typeof value === 'string' && value ? value : undefined
}

export function hasLocalQuota(account: UsageAccount): boolean {
  if (!supportsAccountQuota(account.type)) return false
  return (
    (account.quota_daily_limit ?? 0) > 0 ||
    (account.quota_weekly_limit ?? 0) > 0 ||
    (account.quota_limit ?? 0) > 0
  )
}

/**
 * Next reset of a daily / weekly window. Fixed mode uses the precomputed
 * reset time; rolling mode adds the period to the window start.
 */
export function resolveQuotaResetAt(account: UsageAccount, period: 'daily' | 'weekly'): string | null {
  const isDaily = period === 'daily'
  const mode =
    extraString(account, isDaily ? 'quota_daily_reset_mode' : 'quota_weekly_reset_mode') ??
    (isDaily ? account.quota_daily_reset_mode : account.quota_weekly_reset_mode) ??
    'rolling'

  if (mode === 'fixed') {
    return (
      extraString(account, isDaily ? 'quota_daily_reset_at' : 'quota_weekly_reset_at') ??
      (isDaily ? account.quota_daily_reset_at : account.quota_weekly_reset_at) ??
      null
    )
  }

  const start = extraString(account, isDaily ? 'quota_daily_start' : 'quota_weekly_start')
  if (!start) return null
  const startMs = new Date(start).getTime()
  if (Number.isNaN(startMs)) return null
  return new Date(startMs + (isDaily ? DAY_MS : WEEK_MS)).toISOString()
}

function makeQuotaBar(used: number, limit: number, resetsAt: string | null): QuotaBarInfo {
  return { utilization: limit > 0 ? (used / limit) * 100 : 0, resetsAt }
}

export function computeLocalQuotaBars(account: UsageAccount): LocalQuotaBars {
  if (!supportsAccountQuota(account.type)) return { daily: null, weekly: null, total: null }
  const dailyLimit = account.quota_daily_limit ?? 0
  const weeklyLimit = account.quota_weekly_limit ?? 0
  const totalLimit = account.quota_limit ?? 0
  return {
    daily: dailyLimit > 0 ? makeQuotaBar(account.quota_daily_used ?? 0, dailyLimit, resolveQuotaResetAt(account, 'daily')) : null,
    weekly: weeklyLimit > 0 ? makeQuotaBar(account.quota_weekly_used ?? 0, weeklyLimit, resolveQuotaResetAt(account, 'weekly')) : null,
    total: totalLimit > 0 ? makeQuotaBar(account.quota_used ?? 0, totalLimit, null) : null,
  }
}

// ===== Progress bar (Vue: UsageProgressBar) =====

export type UsageVariant = 'success' | 'warning' | 'error'

/** Low / medium / high at the Vue thresholds 75 and 90. */
export function usageVariant(utilization: number): UsageVariant {
  if (utilization >= 90) return 'error'
  if (utilization >= 75) return 'warning'
  return 'success'
}

/** Percentage label, capped at >999% for runaway overage. */
export function formatUtilization(utilization: number): string {
  if (!Number.isFinite(utilization)) return '-'
  const rounded = Math.round(Math.max(utilization, 0))
  return rounded > 999 ? '>999%' : `${rounded}%`
}

export type ResetCountdown =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'now' }
  | { kind: 'remaining'; days: number; hours: number; minutes: number }

/**
 * Countdown to a reset time against the shared minute clock: past the reset
 * a nonempty window awaits fresh data and an empty window is immediately available.
 */
export function resetCountdown(resetsAt: string | null | undefined, nowMs: number, utilization: number, showNowWhenIdle = false): ResetCountdown {
  if (!resetsAt) return { kind: showNowWhenIdle && utilization <= 0 ? 'now' : 'none' }
  const target = new Date(resetsAt).getTime()
  if (Number.isNaN(target)) return { kind: 'none' }
  const diff = target - nowMs
  if (diff <= 0) return { kind: utilization > 0 ? 'pending' : 'now' }
  const totalMinutes = Math.floor(diff / 60_000)
  return {
    kind: 'remaining',
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  }
}

/** Compact remaining text: "2d 3h", "3h 12m", "12m". */
export function formatRemaining(countdown: Extract<ResetCountdown, { kind: 'remaining' }>): string {
  const { days, hours, minutes } = countdown
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
