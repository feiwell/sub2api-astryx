import type { MonitorTimelinePoint, UserMonitorDetail, UserMonitorView } from '@/api/channelMonitor'
import { formatLatencyMs, statusLabel, type Translate } from '~/components/monitor/monitorText'
import { BAND_FILLS, UNKNOWN_FILL } from './pulseScale'

/** The spans of time a card can show availability over. */
export const PROBE_WINDOWS = ['7d', '15d', '30d'] as const
export type ProbeWindow = (typeof PROBE_WINDOWS)[number]

/** How many of the latest checks the timeline of a card holds. */
export const TIMELINE_LENGTH = 60

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

/**
 * How the latest check of a monitor went. The server sends an empty text for a monitor that was never
 * checked, which the type of the list leaves out.
 */
interface LatestCheck {
  primary_status: string
}

/** Whether the latest check of every monitor passed. With no monitors, nothing is wrong. */
export function overallStatus(items: readonly LatestCheck[]): 'operational' | 'degraded' {
  return items.every((item) => item.primary_status === 'operational') ? 'operational' : 'degraded'
}

/**
 * The share of the checks of a monitor's main model that passed over `window`, in percent. The list of
 * monitors carries the seven days; the longer windows are in the detail of each monitor. Null while that
 * detail is not here, when it does not have the model, and for a monitor that was never checked: the server
 * sends 0 for it, but it has no share, not 0%.
 */
export function windowAvailability(
  item: Pick<UserMonitorView, 'primary_model' | 'availability_7d'> & LatestCheck,
  window: ProbeWindow,
  detail: Pick<UserMonitorDetail, 'models'> | undefined,
): number | null {
  if (!item.primary_status) return null
  if (window === '7d') return item.availability_7d ?? null
  const model = detail?.models.find((entry) => entry.model === item.primary_model)
  if (!model) return null
  return (window === '15d' ? model.availability_15d : model.availability_30d) ?? null
}

/** The fill that says how good an availability is, on the scale the matrix of the traffic view uses. */
export function availabilityFill(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) return UNKNOWN_FILL
  return BAND_FILLS[Math.round(Math.min(100, Math.max(0, percent)) / 10)]
}

/** One place on the timeline of a card. */
export interface TimelineBar {
  /** The check this place stands for; null where fewer checks were made than the timeline holds. */
  point: MonitorTimelinePoint | null
  fill: string
  /** How much of the height of the timeline the bar takes: the better the check went, the taller. */
  height: string
}

const EMPTY_BAR: TimelineBar = { point: null, fill: UNKNOWN_FILL, height: '15%' }

function barOf(point: MonitorTimelinePoint): TimelineBar {
  if (point.status === 'operational') return { point, fill: BAND_FILLS[10], height: '100%' }
  if (point.status === 'degraded') return { point, fill: BAND_FILLS[6], height: '65%' }
  if (point.status === 'failed' || point.status === 'error') return { point, fill: BAND_FILLS[2], height: '35%' }
  return { ...EMPTY_BAR, point }
}

/**
 * The latest checks of a monitor as the bars of its timeline, the oldest first, so the last bar is now. The
 * server sends the newest check first. A monitor with fewer checks than the timeline holds gets empty places
 * before its first, which keeps the bars of all cards the same width.
 */
export function timelineBars(
  points: readonly MonitorTimelinePoint[] | null | undefined,
  length: number = TIMELINE_LENGTH,
): TimelineBar[] {
  const bars = (points ?? []).slice(0, length).reverse().map(barOf)
  const missing = Math.max(0, length - bars.length)
  return [...Array.from({ length: missing }, () => EMPTY_BAR), ...bars]
}

/** How long before `now` something happened, in the largest unit that fits. */
export function relativeTime(iso: string | null | undefined, now: number, t: Translate): string {
  const at = iso ? Date.parse(iso) : Number.NaN
  if (Number.isNaN(at)) return t('monitorCommon.latencyEmpty')
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < SECONDS_PER_MINUTE) return t('monitorCommon.relativeSecondsAgo', { n: seconds })
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  if (minutes < MINUTES_PER_HOUR) return t('monitorCommon.relativeMinutesAgo', { n: minutes })
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  if (hours < HOURS_PER_DAY) return t('monitorCommon.relativeHoursAgo', { n: hours })
  return t('monitorCommon.relativeDaysAgo', { n: Math.floor(hours / HOURS_PER_DAY) })
}

/** What one check of the timeline says: how long ago it was, how it went, and how long the answer took. */
export function checkText(point: MonitorTimelinePoint, now: number, t: Translate): string {
  return [relativeTime(point.checked_at, now, t), statusLabel(point.status, t), formatLatencyMs(point.latency_ms, t)].join(' · ')
}

/**
 * Where the keyboard goes from the bar at `from`, among the bars that stand for a check: `first` is the
 * oldest of them and `last` the newest. Null for a key that does not move, or when there is nowhere to go.
 */
export function moveBar(from: number, key: string, first: number, last: number): number | null {
  if (first < 0 || last < first) return null
  const to =
    key === 'ArrowLeft' ? from - 1 : key === 'ArrowRight' ? from + 1 : key === 'Home' ? first : key === 'End' ? last : null
  if (to == null) return null
  const clamped = Math.min(last, Math.max(first, to))
  return clamped === from ? null : clamped
}
