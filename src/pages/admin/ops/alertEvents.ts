import type { AlertEvent } from '~/lib/api/admin/ops'

export type AlertBadgeVariant = 'error' | 'warning' | 'info' | 'success' | 'neutral'
export type SilenceDuration = '1h' | '24h' | '7d'

type Translate = (key: string) => string
type Dimensions = Pick<AlertEvent, 'dimensions'>

const NO_VALUE = '-'
const HOUR_MS = 60 * 60 * 1000
const SILENCE_MS: Record<SilenceDuration, number> = { '1h': HOUR_MS, '24h': 24 * HOUR_MS, '7d': 7 * 24 * HOUR_MS }

const lower = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()

/** A dimension of the alert as text; '' when it is missing or not a plain value. */
export function alertDimension(event: Dimensions, key: string): string {
  const value: unknown = event.dimensions?.[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** The scope the alert fired for, as `key=value` pairs: platform, group, region. */
export function alertDimensionPairs(event: Dimensions): string[] {
  const pairs: string[] = []
  const platform = alertDimension(event, 'platform')
  if (platform) pairs.push(`platform=${platform}`)
  const groupId: unknown = event.dimensions?.group_id
  if (groupId != null && groupId !== '') pairs.push(`group_id=${String(groupId)}`)
  const region = alertDimension(event, 'region')
  if (region) pairs.push(`region=${region}`)
  return pairs
}

/** The group of the alert as an id that can filter by; null when it has none. */
export function alertGroupId(event: Dimensions): number | null {
  const groupId = Number.parseInt(String(event.dimensions?.group_id ?? ''), 10)
  return Number.isFinite(groupId) && groupId > 0 ? groupId : null
}

/** When the alert fired; an event without that instant is dated by its record. */
export function alertFiredAt(event: Pick<AlertEvent, 'fired_at' | 'created_at'>): string {
  return event.fired_at || event.created_at
}

/** `45s`, `12m`, `3h` or `2d`: a duration in its largest whole unit. */
export function formatAlertDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** How long the alert lasted, or has lasted so far, behind the name of its state. */
export function alertDurationLabel(
  event: Pick<AlertEvent, 'fired_at' | 'created_at' | 'resolved_at' | 'status'>,
  t: Translate,
  now: number = Date.now(),
): string {
  const firedAt = new Date(alertFiredAt(event)).getTime()
  if (Number.isNaN(firedAt)) return NO_VALUE
  const resolvedAt = event.resolved_at ? new Date(event.resolved_at).getTime() : Number.NaN
  if (!Number.isNaN(resolvedAt)) {
    const state =
      lower(event.status) === 'manual_resolved'
        ? t('admin.ops.alertEvents.status.manualResolved')
        : t('admin.ops.alertEvents.status.resolved')
    return `${state} ${formatAlertDuration(resolvedAt - firedAt)}`
  }
  return `${t('admin.ops.alertEvents.status.firing')} ${formatAlertDuration(now - firedAt)}`
}

/** A state the page has no name for is shown as the server sent it, in capitals. */
export function alertStatusLabel(status: string | undefined, t: Translate): string {
  const name = lower(status)
  if (!name) return NO_VALUE
  if (name === 'firing') return t('admin.ops.alertEvents.status.firing')
  if (name === 'resolved') return t('admin.ops.alertEvents.status.resolved')
  if (name === 'manual_resolved') return t('admin.ops.alertEvents.status.manualResolved')
  return name.toUpperCase()
}

/** Firing red, resolved by itself green, closed by hand grey. */
export function alertStatusVariant(status: string | undefined): AlertBadgeVariant {
  const name = lower(status)
  if (name === 'firing') return 'error'
  if (name === 'resolved') return 'success'
  return 'neutral'
}

export function isManuallyResolved(status: string | undefined): boolean {
  return lower(status) === 'manual_resolved'
}

/** P0 red, P1 amber, P2 blue, P3 and anything else grey. Rules may also name a level in words. */
export function alertSeverityVariant(severity: string | undefined): AlertBadgeVariant {
  const level = lower(severity)
  if (level === 'p0' || level === 'critical') return 'error'
  if (level === 'p1' || level === 'warning') return 'warning'
  if (level === 'p2' || level === 'info') return 'info'
  return 'neutral'
}

/** `1.20 / 5.00`: what was measured against the limit of the rule. */
export function alertMetricLabel(event: Pick<AlertEvent, 'metric_value' | 'threshold_value'>): string {
  const { metric_value: metric, threshold_value: threshold } = event
  if (typeof metric !== 'number' || typeof threshold !== 'number') return NO_VALUE
  return `${metric.toFixed(2)} / ${threshold.toFixed(2)}`
}

/** The instant a silence of this length ends, counted from now. */
export function silenceUntil(duration: SilenceDuration, now: number = Date.now()): string {
  return new Date(now + SILENCE_MS[duration]).toISOString()
}

/** Whether an event comes from that rule, for the same platform and the same group. */
export function isInAlertSeries(
  event: Pick<AlertEvent, 'rule_id' | 'dimensions'>,
  series: { ruleId: number; platform: string; groupId: unknown },
): boolean {
  if (event.rule_id !== series.ruleId) return false
  if (alertDimension(event, 'platform') !== series.platform) return false
  return (event.dimensions?.group_id ?? null) === (series.groupId ?? null)
}
