import { describe, expect, it } from 'vitest'
import type { MonitorHealth, MonitorMetric } from '@/api/channelMonitorV2'
import { plotRatio, smoothTrend, trendSeries, type TrendPoint } from './trendSeries'

function point(errorRate: number, cacheRate: number, ttft: number | null): TrendPoint {
  return {
    bucket_start: '2026-11-21T08:00:00Z',
    metrics: { error_rate: errorRate, cache_rate: cacheRate, ttft: { p50_ms: ttft } } as MonitorMetric,
    health: {} as MonitorHealth,
  }
}

describe('smoothTrend', () => {
  it('averages each value with its two neighbours', () => {
    expect(smoothTrend([1, 2, 3, 4])).toEqual([1.5, 2, 3, 3.5])
    expect(smoothTrend([0, 0, 9, 0, 0])).toEqual([0, 3, 3, 3, 0])
  })

  it('keeps a missing value missing and leaves it out of the averages around it', () => {
    expect(smoothTrend([2, null, 6, 10])).toEqual([2, null, 8, 8])
    expect(smoothTrend([null, null, null])).toEqual([null, null, null])
  })

  it('returns a series of one or two values as it is', () => {
    expect(smoothTrend([])).toEqual([])
    expect(smoothTrend([5])).toEqual([5])
    expect(smoothTrend([5, 9])).toEqual([5, 9])
  })

  it('does not change the series it was given', () => {
    const values = [1, 2, 3]
    smoothTrend(values)
    expect(values).toEqual([1, 2, 3])
    const short = [5, 9]
    expect(smoothTrend(short)).not.toBe(short)
  })
})

describe('trendSeries', () => {
  it('turns the rates into percent', () => {
    const series = trendSeries([point(0.05, 0.4, 400), point(0.05, 0.4, 400)])
    expect(series.errorRate).toEqual([5, 5])
    expect(series.cacheRate).toEqual([40, 40])
    expect(series.ttft).toEqual([400, 400])
  })

  it('evens out all three lines', () => {
    const series = trendSeries([point(0, 0, 300), point(0.03, 0.6, 600), point(0, 0, 300)])
    expect(series.errorRate.map((value) => Math.round(value ?? -1))).toEqual([2, 1, 2])
    expect(series.cacheRate.map((value) => Math.round(value ?? -1))).toEqual([30, 20, 30])
    expect(series.ttft).toEqual([450, 400, 450])
  })

  it('leaves a gap where the first token was never timed', () => {
    const series = trendSeries([point(0, 0, 300), point(0, 0, null), point(0, 0, 500)])
    expect(series.ttft).toEqual([300, null, 500])
  })

  it('counts a rate the server left out as zero', () => {
    const blank = { bucket_start: '2026-11-21T08:00:00Z', metrics: {} as MonitorMetric, health: {} as MonitorHealth }
    const series = trendSeries([blank])
    expect(series.errorRate).toEqual([0])
    expect(series.cacheRate).toEqual([0])
    expect(series.ttft).toEqual([null])
  })

  it('has no values without points', () => {
    expect(trendSeries([])).toEqual({ errorRate: [], cacheRate: [], ttft: [] })
  })
})

describe('plotRatio', () => {
  it('runs from 0 at the left edge of the plotted area to 1 at the right', () => {
    expect(plotRatio(100, 100, 500)).toBe(0)
    expect(plotRatio(300, 100, 500)).toBe(0.5)
    expect(plotRatio(500, 100, 500)).toBe(1)
  })

  it('stays within the area for a pointer beside it', () => {
    expect(plotRatio(40, 100, 500)).toBe(0)
    expect(plotRatio(640, 100, 500)).toBe(1)
  })

  it('takes the middle while the area has no width', () => {
    expect(plotRatio(300, 100, 100)).toBe(0.5)
    expect(plotRatio(300, 500, 100)).toBe(0.5)
    expect(plotRatio(300, Number.NaN, 500)).toBe(0.5)
  })
})
