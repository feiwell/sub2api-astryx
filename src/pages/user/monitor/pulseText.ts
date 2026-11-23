import type { MonitorHealth, MonitorMatrixBucket, MonitorMatrixRow, MonitorMetric } from '@/api/channelMonitorV2'
import {
  formatMonitorPercent,
  formatMonitorSuccessRateFromError,
  formatMonitorThroughput,
  formatMonitorTokensPerSecond,
  healthModeScore,
  type HealthDisplayMode,
} from '@/features/channel-monitor-v2/monitorFormat'
import { latencyDetail, OTHER_MODELS } from './statusFormat'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Tells the rows of the matrix apart. */
export function rowKey(row: MonitorMatrixRow): string {
  return [row.platform, row.group_id || 0, row.model || ''].join(':')
}

/** What a row stands for: its platform, then its group and its model as far as the rows are split by them. */
export function rowLabel(row: MonitorMatrixRow, otherModels: string): string {
  const parts = [row.platform]
  if (row.group_name || row.group_id) parts.push(row.group_name || `#${row.group_id}`)
  if (row.model) parts.push(row.model === OTHER_MODELS ? otherModels : row.model)
  return parts.join(' / ')
}

/**
 * The share of requests that succeeded, or a dash when there was no traffic to succeed. A viewer who may not
 * see throughput always gets it as zero, so for them its absence does not mean there was no traffic.
 */
export function successRateText(metrics: MonitorMetric, showThroughput: boolean): string {
  const hasTraffic = metrics.request_count > 0 || (metrics.rpm || 0) > 0 || (metrics.tpm || 0) > 0
  if (!hasTraffic && showThroughput) return '-'
  return formatMonitorSuccessRateFromError(metrics.error_rate)
}

/** The score under the chosen health measure as a whole number, or a dash when there is none. */
export function scoreText(health: MonitorHealth, mode: HealthDisplayMode): string {
  const score = healthModeScore(health, mode)
  return score == null ? '—' : String(Math.round(score))
}

export interface PulseTextOptions {
  healthMode: HealthDisplayMode
  showThroughput: boolean
  t: Translate
}

/** Everything measured in one interval, a line for each figure, under the time the interval covers. */
export function bucketLines(bucket: MonitorMatrixBucket, range: string, { healthMode, showThroughput, t }: PulseTextOptions): string[] {
  const { metrics } = bucket
  const lines = [
    range,
    t('channelMonitorV2.matrix.scoreLine', { score: scoreText(bucket.health, healthMode) }),
    t('channelMonitorV2.metrics.successRateValue', { value: successRateText(metrics, showThroughput) }),
    t('channelMonitorV2.metrics.ttftValue', { value: latencyDetail(metrics.ttft) }),
  ]
  if (showThroughput) lines.push(t('channelMonitorV2.metrics.tpsValue', { value: formatMonitorTokensPerSecond(metrics.tpm) }))
  lines.push(
    t('channelMonitorV2.metrics.cacheRateValue', { value: formatMonitorPercent(metrics.cache_rate) }),
    t('channelMonitorV2.metrics.errorRateValue', { value: formatMonitorPercent(metrics.error_rate) }),
  )
  if (showThroughput) lines.push(t('channelMonitorV2.metrics.rpmValue', { value: formatMonitorThroughput(metrics.rpm) }))
  lines.push(t('channelMonitorV2.metrics.durationValue', { value: latencyDetail(metrics.duration) }))
  return lines
}

/** What there is to say about an interval in which the row saw no traffic. */
export function emptyLines(range: string, t: Translate): string[] {
  return [range, t('channelMonitorV2.matrix.noTraffic')]
}

/**
 * The name of a block for assistive technology: when it is and how it scored. The figures behind the score
 * are in the tooltip, which describes the block while it is focused.
 */
export function cellName(bucket: MonitorMatrixBucket | undefined, range: string, healthMode: HealthDisplayMode, t: Translate): string {
  if (!bucket) return t('channelMonitorV2.matrix.noTrafficAt', { time: range })
  return `${range} · ${t('channelMonitorV2.matrix.scoreLine', { score: scoreText(bucket.health, healthMode) })}`
}
