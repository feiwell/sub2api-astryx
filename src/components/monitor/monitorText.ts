import type { MonitorBalance, MonitorQuotaSnapshot, MonitorQuotaTier } from '@/api/admin/channelMonitor'
import { PROVIDERS } from '@/constants/channelMonitor'

/** Looks a text up by its key, filling in the values it names. */
export type Translate = (key: string, params?: Record<string, unknown>) => string
/** Whether a key has a text. */
export type HasText = (key: string) => boolean

const EMPTY = '-'

/**
 * A monitor that only reads the quota of an account checks no model; the server stores this word where the
 * model would be.
 */
export const QUOTA_ONLY_MODEL = 'quota'

const CHECK_MODES = ['probe', 'quota', 'quota_probe']

// The server names the windows of a quota, and what a window counts, by fixed words. A word that is not
// listed is shown as it came, so one added on the server still shows.
const QUOTA_WINDOW_KEYS = new Map([
  ['5h', 'monitorCommon.quota.windows.5h'],
  ['7d', 'monitorCommon.quota.windows.7d'],
  ['7d-sonnet', 'monitorCommon.quota.windows.7dSonnet'],
  ['7d-fable', 'monitorCommon.quota.windows.7dFable'],
  ['weekly', 'monitorCommon.quota.windows.weekly'],
  ['daily', 'monitorCommon.quota.windows.daily'],
  ['30d', 'monitorCommon.quota.windows.30d'],
  ['total', 'monitorCommon.quota.windows.total'],
])

const QUOTA_KIND_KEYS = new Map([
  ['requests', 'monitorCommon.quota.labels.requests'],
  ['tokens', 'monitorCommon.quota.labels.tokens'],
  ['shared', 'monitorCommon.quota.labels.shared'],
  ['pro', 'monitorCommon.quota.labels.pro'],
  ['flash', 'monitorCommon.quota.labels.flash'],
])

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** The name of a check result; a monitor that was never checked has none. */
export function statusLabel(status: string | null | undefined, t: Translate): string {
  return t(`monitorCommon.status.${status || 'unknown'}`)
}

/** The name of a provider; one this app does not know is shown as the server names it. */
export function providerLabel(provider: string | null | undefined, t: Translate): string {
  if (!provider) return EMPTY
  return (PROVIDERS as readonly string[]).includes(provider) ? t(`monitorCommon.providers.${provider}`) : provider
}

/** The name of the way a monitor checks. A monitor saved without one probes, which is the server's default. */
export function checkModeLabel(mode: string | null | undefined, t: Translate): string {
  const known = mode || 'probe'
  return CHECK_MODES.includes(known) ? t(`monitorCommon.checkMode.${known}`) : known
}

/** The model a monitor checks, or "quota" in words for a monitor that checks none. */
export function formatMonitorModel(model: string, t: Translate): string {
  return model === QUOTA_ONLY_MODEL ? t('monitorCommon.checkMode.quota') : model
}

/** A latency in whole milliseconds, without its unit. */
export function formatLatency(ms: number | null | undefined, t: Translate): string {
  return ms == null ? t('monitorCommon.latencyEmpty') : String(Math.round(ms))
}

/** A latency with its unit; a check that measured none shows the dash alone. */
export function formatLatencyMs(ms: number | null | undefined, t: Translate): string {
  return ms == null ? t('monitorCommon.latencyEmpty') : `${Math.round(ms)} ms`
}

export function formatPercent(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? EMPTY : `${value.toFixed(2)}%`
}

/** The share of the checks of the last seven days that passed. A monitor never checked has no share, not 0%. */
export function formatAvailability(row: {
  primary_status: string | null | undefined
  availability_7d: number | null | undefined
}): string {
  return row.primary_status ? formatPercent(row.availability_7d) : EMPTY
}

/** What a window of a quota is called: the window, with what it counts before it when the server says. */
export function quotaTierLabel(tier: Pick<MonitorQuotaTier, 'window' | 'label'>, t: Translate, has: HasText): string {
  const windowKey = QUOTA_WINDOW_KEYS.get(tier.window)
  const window = windowKey && has(windowKey) ? t(windowKey) : tier.window
  if (!tier.label) return window
  const kindKey = QUOTA_KIND_KEYS.get(tier.label)
  const kind = kindKey && has(kindKey) ? t(kindKey) : tier.label
  return `${kind}/${window}`
}

/** How much of a window is used, in whole percent. Usage can run past the quota; far past it is cut short. */
export function quotaUsedText(usedPercent: number): string {
  const percent = Math.round(usedPercent)
  return percent > 999 ? '>999%' : `${percent}%`
}

/** How close a window is to used up. */
export function quotaUsedLevel(usedPercent: number): 'success' | 'warning' | 'error' {
  if (usedPercent >= 90) return 'error'
  if (usedPercent >= 75) return 'warning'
  return 'success'
}

/** How long from `now` until a window starts over; null when the server gave no time that can be read. */
export function quotaResetText(
  tier: Pick<MonitorQuotaTier, 'reset_at' | 'used_percent'>,
  now: number,
  t: Translate,
): string | null {
  if (!tier.reset_at) return null
  const left = new Date(tier.reset_at).getTime() - now
  if (Number.isNaN(left)) return null
  // Past its time with usage still counted: the server has not read the new window yet.
  if (left <= 0) return tier.used_percent > 0 ? t('usage.resetPending') : t('usage.resetNow')
  const hours = Math.floor(left / HOUR_MS)
  const minutes = Math.floor((left % HOUR_MS) / MINUTE_MS)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/** The balances of a quota: one for each currency, or the single one of a server that sends just one. */
export function quotaBalances(snapshot: Pick<MonitorQuotaSnapshot, 'balances' | 'balance' | 'currency'>): MonitorBalance[] {
  if (snapshot.balances?.length) return snapshot.balances
  if (snapshot.balance != null) return [{ currency: snapshot.currency || '?', balance: snapshot.balance }]
  return []
}
