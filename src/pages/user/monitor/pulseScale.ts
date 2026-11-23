import type { MonitorHealth } from '@/api/channelMonitorV2'
import { healthScoreClass, type HealthDisplayMode } from '@/features/channel-monitor-v2/monitorFormat'

/**
 * The fill of each of the eleven score bands, from the worst (a score under 5) to the best (95 and up).
 * Hue says which side a score is on: red and orange for failing, yellow for one to watch, green for healthy.
 * Within a hue the darker fill is the more extreme score. The fills are the data ramps of the design system.
 */
export const BAND_FILLS: readonly string[] = [
  'var(--color-data-red-5)',
  'var(--color-data-red-4)',
  'var(--color-data-red-3)',
  'var(--color-data-orange-4)',
  'var(--color-data-orange-3)',
  'var(--color-data-yellow-4)',
  'var(--color-data-yellow-3)',
  'var(--color-data-yellow-2)',
  'var(--color-data-shamrock-2)',
  'var(--color-data-shamrock-3)',
  'var(--color-data-shamrock-4)',
]

/** The fill of something that cannot be scored: no traffic, or too few samples. */
export const UNKNOWN_FILL = 'var(--color-data-neutral)'

/** One fill for each range of scores the legend names, with the key of its text. */
export const LEGEND_ENTRIES: ReadonlyArray<{ key: string; fill: string }> = [
  { key: 'channelMonitorV2.matrix.healthyLegend', fill: BAND_FILLS[10] },
  { key: 'channelMonitorV2.matrix.warningLegend', fill: BAND_FILLS[6] },
  { key: 'channelMonitorV2.matrix.criticalLegend', fill: BAND_FILLS[2] },
  { key: 'channelMonitorV2.matrix.unknownLegend', fill: UNKNOWN_FILL },
]

function fillOfClass(healthClass: string): string {
  const band = /^health-score(\d+)$/.exec(healthClass)
  if (band) return BAND_FILLS[Number(band[1])] ?? UNKNOWN_FILL
  // A server that sends no score still says which of three states something is in.
  if (healthClass === 'health-healthy') return BAND_FILLS[9]
  if (healthClass === 'health-warning') return BAND_FILLS[4]
  if (healthClass === 'health-critical') return BAND_FILLS[1]
  return UNKNOWN_FILL
}

/** The fill of a row or of one interval of it, by the health measure the viewer chose. */
export function healthFill(health: MonitorHealth | undefined, mode: HealthDisplayMode, requestCount: number): string {
  if (!health) return UNKNOWN_FILL
  return fillOfClass(healthScoreClass(health, mode, requestCount))
}
