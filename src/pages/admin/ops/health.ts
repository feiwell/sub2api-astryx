import type { OpsDashboardOverview, OpsJobHeartbeat, OpsMetricThresholds } from '~/lib/api/admin/ops'

/** Colour of a status mark: the variants StatusDot and ProgressBar share. */
export type OpsTone = 'success' | 'warning' | 'error' | 'neutral'

type Translate = (key: string, params?: Record<string, unknown>) => string

export const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** A share (0..1) as a percentage, or null when the backend sent none. */
export const toPercent = (share: unknown): number | null => {
  const value = finite(share)
  return value == null ? null : value * 100
}

/** Some labels carry their own trailing colon; the cards separate label and figure by spacing instead. */
export const bare = (label: string): string => label.replace(/[:：]\s*$/, '')

/** A per-second rate with one decimal and thousands separators, e.g. 61,234.5. */
export const formatRate = (value: unknown, fallback = '-'): string =>
  finite(value)?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? fallback

/** Tone of a "lower is better" figure: the warning mark first, then the critical one. */
export function ceilingTone(value: number | null, warnAt: number, criticalAt: number): OpsTone {
  if (value == null) return 'neutral'
  if (value >= criticalAt) return 'error'
  if (value >= warnAt) return 'warning'
  return 'success'
}

/** Against an admin-set maximum: critical from the maximum on, warning from 80% of it. */
function maxThresholdTone(value: number | null, max: number | null | undefined): OpsTone {
  if (value == null) return 'neutral'
  if (max == null) return 'success'
  return ceilingTone(value, max * 0.8, max)
}

/** SLA is "higher is better": below the minimum is critical, within 0.1 point above it a warning. */
export function slaTone(percent: number | null, thresholds: OpsMetricThresholds | null): OpsTone {
  if (percent == null) return 'neutral'
  const min = thresholds?.sla_percent_min
  if (min == null) return 'success'
  if (percent < min) return 'error'
  if (percent < min + 0.1) return 'warning'
  return 'success'
}

export const ttftTone = (ms: number | null, thresholds: OpsMetricThresholds | null): OpsTone =>
  maxThresholdTone(ms, thresholds?.ttft_p99_ms_max)

export const requestErrorTone = (percent: number | null, thresholds: OpsMetricThresholds | null): OpsTone =>
  maxThresholdTone(percent, thresholds?.request_error_rate_percent_max)

export const upstreamErrorTone = (percent: number | null, thresholds: OpsMetricThresholds | null): OpsTone =>
  maxThresholdTone(percent, thresholds?.upstream_error_rate_percent_max)

/** No traffic and no errors: the health score says nothing, so the page shows "idle" instead. */
export function isSystemIdle(overview: OpsDashboardOverview): boolean {
  return (overview.qps?.current ?? 0) === 0 && (overview.error_rate ?? 0) === 0
}

export function healthTone(overview: OpsDashboardOverview): OpsTone {
  const score = finite(overview.health_score)
  if (isSystemIdle(overview) || score == null) return 'neutral'
  if (score >= 90) return 'success'
  if (score >= 60) return 'warning'
  return 'error'
}

export interface DiagnosisItem {
  key: string
  type: 'critical' | 'warning' | 'info'
  message: string
  impact: string
  action?: string
}

/**
 * What the current figures point at, most urgent source first: resources, time to first token,
 * error rates, SLA, then the overall score. Same rules and marks as the Vue header.
 */
export function buildDiagnosis(overview: OpsDashboardOverview, t: Translate): DiagnosisItem[] {
  const report: DiagnosisItem[] = []
  const add = (type: DiagnosisItem['type'], key: string, params?: Record<string, unknown>) => {
    report.push({
      key,
      type,
      message: t(`admin.ops.diagnosis.${key}`, params),
      impact: t(`admin.ops.diagnosis.${key}Impact`),
      action: type === 'info' ? undefined : t(`admin.ops.diagnosis.${key}Action`),
    })
  }

  if (isSystemIdle(overview)) {
    add('info', 'idle')
    return report
  }

  const metrics = overview.system_metrics
  if (metrics) {
    if (metrics.db_ok === false) add('critical', 'dbDown')
    if (metrics.redis_ok === false) add('warning', 'redisDown')

    const cpu = metrics.cpu_usage_percent ?? 0
    if (cpu > 90) add('critical', 'cpuCritical', { usage: cpu.toFixed(1) })
    else if (cpu > 80) add('warning', 'cpuHigh', { usage: cpu.toFixed(1) })

    const memory = metrics.memory_usage_percent ?? 0
    if (memory > 90) add('critical', 'memoryCritical', { usage: memory.toFixed(1) })
    else if (memory > 85) add('warning', 'memoryHigh', { usage: memory.toFixed(1) })
  }

  const ttftP99 = overview.ttft?.p99_ms ?? 0
  if (ttftP99 > 500) add('warning', 'ttftHigh', { ttft: ttftP99.toFixed(0) })

  const upstreamRate = (overview.upstream_error_rate ?? 0) * 100
  if (upstreamRate > 5) add('critical', 'upstreamCritical', { rate: upstreamRate.toFixed(2) })
  else if (upstreamRate > 2) add('warning', 'upstreamHigh', { rate: upstreamRate.toFixed(2) })

  const errorRate = (overview.error_rate ?? 0) * 100
  if (errorRate > 3) add('critical', 'errorHigh', { rate: errorRate.toFixed(2) })
  else if (errorRate > 0.5) add('warning', 'errorElevated', { rate: errorRate.toFixed(2) })

  const sla = (overview.sla ?? 0) * 100
  if (sla < 90) add('critical', 'slaCritical', { sla: sla.toFixed(2) })
  else if (sla < 98) add('warning', 'slaLow', { sla: sla.toFixed(2) })

  const score = finite(overview.health_score)
  if (score != null) {
    if (score < 60) add('critical', 'healthCritical', { score })
    else if (score < 90) add('warning', 'healthLow', { score })
  }

  if (report.length === 0) add('info', 'healthy')
  return report
}

/** How full a connection pool is, 0..100, or null when either figure is missing. */
export function poolUsagePercent(used: number | null, size: number | null): number | null {
  if (used == null || size == null || size <= 0) return null
  return Math.min(100, Math.max(0, (used / size) * 100))
}

export const GOROUTINES_WARN_AT = 8_000
export const GOROUTINES_CRITICAL_AT = 15_000

/** Jobs whose latest run failed: the last error is newer than the last success. */
export function countFailingJobs(jobs: OpsJobHeartbeat[]): number {
  return jobs.filter((job) => isJobFailing(job)).length
}

export function isJobFailing(job: OpsJobHeartbeat): boolean {
  return !!job.last_error_at && (!job.last_success_at || job.last_error_at > job.last_success_at)
}
