import type { DateRange, ISODateString } from '@astryxdesign/core/Calendar'

export type Granularity = 'day' | 'hour'
export type TrendMetric = 'tokens' | 'actual_cost'

export const toFiniteNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const formatNumber = (value: number | null | undefined): string => toFiniteNumber(value).toLocaleString()

export const formatTokens = (value: number | null | undefined): string => {
  const v = toFiniteNumber(value)
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  return v.toLocaleString()
}

export const formatCost = (value: number | null | undefined): string => {
  const v = toFiniteNumber(value)
  if (v >= 1000) return `${(v / 1000).toFixed(2)}K`
  if (v >= 1) return v.toFixed(2)
  if (v >= 0.01) return v.toFixed(3)
  return v.toFixed(4)
}

export const formatDuration = (ms: unknown): string => {
  const v = Number(ms)
  if (ms == null || !Number.isFinite(v)) return '-'
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
}

export const toISODate = (date: Date): ISODateString =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` as ISODateString

const DAY_MS = 24 * 60 * 60 * 1000

const daysAgo = (days: number): ISODateString => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toISODate(date)
}

export const last24HoursRange = (): DateRange => {
  const end = new Date()
  return { start: toISODate(new Date(end.getTime() - DAY_MS)), end: toISODate(end) }
}

/** Quick ranges of the date picker, keyed by their `dates.*` translation key. */
export const DATE_PRESETS: ReadonlyArray<{ labelKey: string; getRange: () => DateRange }> = [
  { labelKey: 'dates.today', getRange: () => ({ start: daysAgo(0), end: daysAgo(0) }) },
  { labelKey: 'dates.yesterday', getRange: () => ({ start: daysAgo(1), end: daysAgo(1) }) },
  { labelKey: 'dates.last24Hours', getRange: last24HoursRange },
  { labelKey: 'dates.last7Days', getRange: () => ({ start: daysAgo(6), end: daysAgo(0) }) },
  { labelKey: 'dates.last14Days', getRange: () => ({ start: daysAgo(13), end: daysAgo(0) }) },
  { labelKey: 'dates.last30Days', getRange: () => ({ start: daysAgo(29), end: daysAgo(0) }) },
  {
    labelKey: 'dates.thisMonth',
    getRange: () => {
      const now = new Date()
      return { start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: toISODate(now) }
    },
  },
  {
    labelKey: 'dates.lastMonth',
    getRange: () => {
      const now = new Date()
      return {
        start: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    },
  },
]

/** Hourly buckets for a range of up to one day, daily buckets beyond that. */
export const granularityFor = (range: DateRange): Granularity => {
  const days = Math.ceil((new Date(range.end).getTime() - new Date(range.start).getTime()) / DAY_MS)
  return days <= 1 ? 'hour' : 'day'
}

/** Display name of a user: username, then email, then the caller's "User #id" fallback. */
export const userLabel = (
  user: { user_id: number; username?: string | null; email?: string | null },
  fallback: (id: number) => string,
): string => user.username?.trim() || user.email?.trim() || fallback(user.user_id)
