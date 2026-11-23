import type { MonitorSnapshot } from '@/api/channelMonitorV2'

export type TrendPoint = MonitorSnapshot['trend'][number]

/**
 * Evens out a series by averaging each value with its two neighbours. A missing value stays missing and is
 * left out of the averages around it; a series of one or two values is returned as it is.
 */
export function smoothTrend(values: ReadonlyArray<number | null>): Array<number | null> {
  if (values.length <= 2) return [...values]
  return values.map((value, index) => {
    if (value == null) return null
    const around = values.slice(Math.max(0, index - 1), index + 2).filter((item): item is number => item != null)
    return around.reduce((sum, item) => sum + item, 0) / around.length
  })
}

export interface TrendSeries {
  /** Share of failed requests, in percent. */
  errorRate: Array<number | null>
  /** Share of tokens read from the cache, in percent. */
  cacheRate: Array<number | null>
  /** Median time to the first token in milliseconds; missing where nothing streamed. */
  ttft: Array<number | null>
}

/** The three lines of the trend chart, evened out. */
export function trendSeries(points: readonly TrendPoint[]): TrendSeries {
  return {
    errorRate: smoothTrend(points.map((point) => (point.metrics.error_rate || 0) * 100)),
    cacheRate: smoothTrend(points.map((point) => (point.metrics.cache_rate || 0) * 100)),
    ttft: smoothTrend(points.map((point) => point.metrics.ttft?.p50_ms ?? null)),
  }
}

/**
 * How far across the plotted area a pointer is, from 0 at its left edge to 1 at its right. `left` and `right`
 * are the edges of the area on screen. The middle is assumed when the area has no width yet.
 */
export function plotRatio(clientX: number, left: number, right: number): number {
  if (!(right > left)) return 0.5
  return Math.min(1, Math.max(0, (clientX - left) / (right - left)))
}
