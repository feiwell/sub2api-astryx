import type { LatencyMetric, MonitorHealth, MonitorMatrixGroupBy, MonitorMatrixRow } from '@/api/channelMonitorV2'
import { formatLatencyPrivacy, tokensPerSecondFromTpm } from '@/features/channel-monitor-v2/monitorFormat'
import { healthStateVariant, healthVariant, type StatusVariant } from '~/components/monitor/monitorStatus'

/** The server puts every model outside the configured list under this name. */
export const OTHER_MODELS = '__other__'

/** The measures in the line under a headline figure ("AVG 475ms · P90 800ms"), one entry for each. */
export function detailParts(detail: string | undefined): string[] {
  const text = (detail || '').trim()
  if (!text || text === '-') return []
  return text
    .split(/\s*[·|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** A figure that could not be measured. It has no health to show either. */
export function isMissingValue(value: string): boolean {
  const text = value.trim()
  return text === '' || text === '-' || text === '—'
}

/** Average, median and 90th percentile of a latency, as far as the server sent them. */
export function latencyDetail(metric: LatencyMetric): string {
  return formatLatencyPrivacy(metric.p50_ms, metric.p90_ms, metric.avg_ms, metric.p95_ms)
}

/** Requests a minute in full, where the headline figure is shortened ("1.2K"). */
export function exactRate(value: number | null | undefined, locale: string): string {
  return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 2 }).format(value || 0)
}

/** Tokens a second in full, from the tokens a minute the server counts. */
export function exactTokensPerSecond(tpm: number | null | undefined, locale: string): string {
  return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 3 }).format(tokensPerSecondFromTpm(tpm))
}

/** How far the first fill of the history has come, as a whole percent between 0 and 100. */
export function bootstrapPercent(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0
  return Math.min(100, Math.max(0, Math.round(raw)))
}

/**
 * Seconds between two automatic refreshes: the interval the administrator configured, never under a minute.
 * While the history is being filled the page refreshes every ten seconds so the progress moves.
 */
export function refreshSeconds(isBootstrapping: boolean, configured: number | null | undefined): number {
  return isBootstrapping ? 10 : Math.max(60, configured || 300)
}

/** The rows of the matrix to show. Grouped by group, only rows of a real group count. */
export function visibleMatrixRows(items: MonitorMatrixRow[] | undefined, groupBy: MonitorMatrixGroupBy): MonitorMatrixRow[] {
  const rows = items || []
  if (groupBy !== 'platform_group' && groupBy !== 'platform_group_model') return rows
  return rows.filter((row) => row.group_id != null && Number(row.group_id) > 0)
}

/** The width of the bar of an error category, in percent. A category that occurred at all stays visible. */
export function errorBarPercent(rate: number): number {
  return Math.min(100, Math.max(2, (rate || 0) * 100))
}

export type RankKind = 'gold' | 'silver' | 'bronze' | 'place' | 'unranked'

/** The place of a user in the ranking, or null for one who is not ranked (the server sends 0). */
export function rankPlace(rank: number | null | undefined): number | null {
  const value = Number(rank)
  const place = Number.isFinite(value) ? Math.floor(value) : 0
  return place >= 1 ? place : null
}

export function rankKind(rank: number | null | undefined): RankKind {
  const place = rankPlace(rank)
  if (place == null) return 'unranked'
  return place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'place'
}

export function rankLabel(rank: number | null | undefined): string {
  const place = rankPlace(rank)
  return place == null ? '—' : `#${place}`
}

/**
 * The colour of the dot before a row. The blended score decides when the server sent one; a server that
 * sends none still says whether the row is healthy overall.
 */
export function rowHealthVariant(health: MonitorHealth | undefined): StatusVariant {
  if (!health) return 'neutral'
  return health.score != null ? healthVariant(health, 'overall', 0) : healthStateVariant(health.overall)
}

/** The text key that says what a colour of dot means. */
export function healthLegendKey(variant: StatusVariant): string {
  if (variant === 'success') return 'channelMonitorV2.matrix.healthyLegend'
  if (variant === 'warning') return 'channelMonitorV2.matrix.warningLegend'
  if (variant === 'error') return 'channelMonitorV2.matrix.criticalLegend'
  return 'channelMonitorV2.matrix.unknownLegend'
}
