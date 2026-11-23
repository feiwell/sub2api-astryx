import { describe, expect, it } from 'vitest'
import type { LatencyMetric, MonitorHealth, MonitorMatrixRow } from '@/api/channelMonitorV2'
import {
  bootstrapPercent,
  detailParts,
  errorBarPercent,
  exactRate,
  exactTokensPerSecond,
  healthLegendKey,
  isMissingValue,
  latencyDetail,
  rankKind,
  rankLabel,
  rankPlace,
  refreshSeconds,
  rowHealthVariant,
  visibleMatrixRows,
} from './statusFormat'

function health(patch: Partial<MonitorHealth>): MonitorHealth {
  return { overall: 'unknown', error_rate: 'unknown', ttft: 'unknown', minimum_sample: 20, ...patch } as MonitorHealth
}

function matrixRow(patch: Partial<MonitorMatrixRow>): MonitorMatrixRow {
  return { platform: 'openai', buckets: [], ...patch } as MonitorMatrixRow
}

describe('detailParts', () => {
  it('splits a line of measures at the dots and bars', () => {
    expect(detailParts('AVG 475ms · P90 800ms')).toEqual(['AVG 475ms', 'P90 800ms'])
    expect(detailParts('a | b|c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps a plain sentence whole', () => {
    expect(detailParts('输出令牌 / 秒')).toEqual(['输出令牌 / 秒'])
  })

  it('has nothing to show for an empty line or a dash', () => {
    expect(detailParts(undefined)).toEqual([])
    expect(detailParts('')).toEqual([])
    expect(detailParts('  ')).toEqual([])
    expect(detailParts('-')).toEqual([])
    expect(detailParts(' · ')).toEqual([])
  })
})

describe('isMissingValue', () => {
  it('recognises the placeholders for a figure that was not measured', () => {
    expect(isMissingValue('')).toBe(true)
    expect(isMissingValue(' - ')).toBe(true)
    expect(isMissingValue('—')).toBe(true)
  })

  it('takes any figure as present, zero included', () => {
    expect(isMissingValue('0')).toBe(false)
    expect(isMissingValue('0.0%')).toBe(false)
    expect(isMissingValue('420ms')).toBe(false)
  })
})

describe('latencyDetail', () => {
  it('names the average, the median and the 90th percentile', () => {
    const metric: LatencyMetric = { sample_count: 40, p50_ms: 400, p90_ms: 800, p95_ms: 950, avg_ms: 475 }
    const text = latencyDetail(metric)
    expect(text).toContain('475ms')
    expect(text).toContain('400ms')
    expect(text).toContain('800ms')
  })
})

describe('exact figures', () => {
  it('writes requests a minute with at most two decimals', () => {
    expect(exactRate(1234.567, 'en')).toBe('1,234.57')
    expect(exactRate(12, 'en')).toBe('12')
    expect(exactRate(null, 'en')).toBe('0')
    expect(exactRate(undefined, 'en')).toBe('0')
  })

  it('writes tokens a second from tokens a minute, with at most three decimals', () => {
    expect(exactTokensPerSecond(90, 'en')).toBe('1.5')
    expect(exactTokensPerSecond(100, 'en')).toBe('1.667')
    expect(exactTokensPerSecond(72000, 'en')).toBe('1,200')
    expect(exactTokensPerSecond(null, 'en')).toBe('0')
  })
})

describe('bootstrapPercent', () => {
  it('rounds to a whole percent between 0 and 100', () => {
    expect(bootstrapPercent(42.4)).toBe(42)
    expect(bootstrapPercent(42.5)).toBe(43)
    expect(bootstrapPercent(-5)).toBe(0)
    expect(bootstrapPercent(150)).toBe(100)
  })

  it('is 0 for anything that is not a number', () => {
    expect(bootstrapPercent(undefined)).toBe(0)
    expect(bootstrapPercent(null)).toBe(0)
    expect(bootstrapPercent(Number.NaN)).toBe(0)
    expect(bootstrapPercent('50')).toBe(0)
  })
})

describe('refreshSeconds', () => {
  it('refreshes every ten seconds while the history is being filled', () => {
    expect(refreshSeconds(true, 300)).toBe(10)
    expect(refreshSeconds(true, undefined)).toBe(10)
  })

  it('follows the configured interval, never under a minute', () => {
    expect(refreshSeconds(false, 600)).toBe(600)
    expect(refreshSeconds(false, 60)).toBe(60)
    expect(refreshSeconds(false, 30)).toBe(60)
  })

  it('refreshes every five minutes when no interval is configured', () => {
    expect(refreshSeconds(false, undefined)).toBe(300)
    expect(refreshSeconds(false, null)).toBe(300)
    expect(refreshSeconds(false, 0)).toBe(300)
  })
})

describe('visibleMatrixRows', () => {
  const rows = [
    matrixRow({ group_id: 3, group_name: 'default' }),
    matrixRow({ group_id: 0 }),
    matrixRow({ group_id: null as unknown as undefined }),
    matrixRow({}),
  ]

  it('keeps only rows of a real group when grouped by group', () => {
    expect(visibleMatrixRows(rows, 'platform_group')).toEqual([rows[0]])
    expect(visibleMatrixRows(rows, 'platform_group_model')).toEqual([rows[0]])
  })

  it('keeps every row otherwise', () => {
    expect(visibleMatrixRows(rows, 'platform')).toEqual(rows)
    expect(visibleMatrixRows(rows, 'platform_model')).toEqual(rows)
  })

  it('has no rows before the matrix has loaded', () => {
    expect(visibleMatrixRows(undefined, 'platform_group')).toEqual([])
  })
})

describe('errorBarPercent', () => {
  it('is the share in percent', () => {
    expect(errorBarPercent(0.5)).toBe(50)
    expect(errorBarPercent(1)).toBe(100)
  })

  it('stays visible for a small share and inside the bar for a share above one', () => {
    expect(errorBarPercent(0)).toBe(2)
    expect(errorBarPercent(0.005)).toBe(2)
    expect(errorBarPercent(1.5)).toBe(100)
    expect(errorBarPercent(Number.NaN)).toBe(2)
  })
})

describe('rank', () => {
  it('gives the first three their medal', () => {
    expect(rankKind(1)).toBe('gold')
    expect(rankKind(2)).toBe('silver')
    expect(rankKind(3)).toBe('bronze')
    expect(rankKind(4)).toBe('place')
    expect(rankKind(120)).toBe('place')
  })

  it('labels a place with its number', () => {
    expect(rankLabel(1)).toBe('#1')
    expect(rankLabel(27)).toBe('#27')
    expect(rankLabel(2.9)).toBe('#2')
    expect(rankPlace(2.9)).toBe(2)
  })

  it('treats zero, negatives and missing ranks as not ranked', () => {
    for (const rank of [0, -1, 0.5, null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rankPlace(rank)).toBeNull()
      expect(rankKind(rank)).toBe('unranked')
      expect(rankLabel(rank)).toBe('—')
    }
  })
})

describe('rowHealthVariant', () => {
  it('follows the blended score when the server sent one', () => {
    expect(rowHealthVariant(health({ score: 95, overall: 'critical' }))).toBe('success')
    expect(rowHealthVariant(health({ score: 60, overall: 'healthy' }))).toBe('warning')
    expect(rowHealthVariant(health({ score: 20, overall: 'healthy' }))).toBe('error')
  })

  it('follows the overall state when there is no score', () => {
    expect(rowHealthVariant(health({ overall: 'healthy' }))).toBe('success')
    expect(rowHealthVariant(health({ overall: 'warning' }))).toBe('warning')
    expect(rowHealthVariant(health({ overall: 'critical' }))).toBe('error')
    expect(rowHealthVariant(health({ overall: 'unknown' }))).toBe('neutral')
  })

  it('is neutral for a row without health', () => {
    expect(rowHealthVariant(undefined)).toBe('neutral')
  })
})

describe('healthLegendKey', () => {
  it('names the legend entry of each colour', () => {
    expect(healthLegendKey('success')).toBe('channelMonitorV2.matrix.healthyLegend')
    expect(healthLegendKey('warning')).toBe('channelMonitorV2.matrix.warningLegend')
    expect(healthLegendKey('error')).toBe('channelMonitorV2.matrix.criticalLegend')
    expect(healthLegendKey('neutral')).toBe('channelMonitorV2.matrix.unknownLegend')
  })
})
