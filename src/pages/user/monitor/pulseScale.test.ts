import { describe, expect, it } from 'vitest'
import type { MonitorHealth } from '@/api/channelMonitorV2'
import { BAND_FILLS, healthFill, LEGEND_ENTRIES, UNKNOWN_FILL } from './pulseScale'

function health(patch: Partial<MonitorHealth>): MonitorHealth {
  return { overall: 'unknown', error_rate: 'unknown', ttft: 'unknown', minimum_sample: 20, ...patch } as MonitorHealth
}

describe('BAND_FILLS', () => {
  it('has a fill of its own for each of the eleven bands', () => {
    expect(BAND_FILLS).toHaveLength(11)
    expect(new Set(BAND_FILLS).size).toBe(11)
    expect(BAND_FILLS).not.toContain(UNKNOWN_FILL)
  })

  it('takes every fill from the data colours of the design system', () => {
    for (const fill of [...BAND_FILLS, UNKNOWN_FILL]) expect(fill).toMatch(/^var\(--color-data-[a-z]+(-\d)?\)$/)
  })
})

describe('healthFill', () => {
  it('fills by the band the score falls in', () => {
    expect(healthFill(health({ score: 100 }), 'overall', 10)).toBe(BAND_FILLS[10])
    expect(healthFill(health({ score: 95 }), 'overall', 10)).toBe(BAND_FILLS[10])
    expect(healthFill(health({ score: 94 }), 'overall', 10)).toBe(BAND_FILLS[9])
    expect(healthFill(health({ score: 50 }), 'overall', 10)).toBe(BAND_FILLS[5])
    expect(healthFill(health({ score: 4 }), 'overall', 10)).toBe(BAND_FILLS[0])
    expect(healthFill(health({ score: 0 }), 'overall', 10)).toBe(BAND_FILLS[0])
  })

  it('keeps a score outside 0 to 100 at the end of the scale', () => {
    expect(healthFill(health({ score: 130 }), 'overall', 10)).toBe(BAND_FILLS[10])
    expect(healthFill(health({ score: -5 }), 'overall', 10)).toBe(BAND_FILLS[0])
  })

  it('goes by the score of the measure the viewer chose', () => {
    const mixed = health({ score: 90, error_rate_score: 20, ttft_score: 60, cache_score: 100 })
    expect(healthFill(mixed, 'overall', 10)).toBe(BAND_FILLS[9])
    expect(healthFill(mixed, 'success', 10)).toBe(BAND_FILLS[2])
    expect(healthFill(mixed, 'ttft', 10)).toBe(BAND_FILLS[6])
    expect(healthFill(mixed, 'cache', 10)).toBe(BAND_FILLS[10])
  })

  it('goes by the state of the measure when the server sent no score', () => {
    expect(healthFill(health({ overall: 'healthy' }), 'overall', 10)).toBe(BAND_FILLS[9])
    expect(healthFill(health({ overall: 'warning' }), 'overall', 10)).toBe(BAND_FILLS[4])
    expect(healthFill(health({ overall: 'critical' }), 'overall', 10)).toBe(BAND_FILLS[1])
    expect(healthFill(health({ overall: 'healthy', error_rate: 'critical' }), 'success', 10)).toBe(BAND_FILLS[1])
    expect(healthFill(health({ overall: 'healthy', cache: 'warning' }), 'cache', 10)).toBe(BAND_FILLS[4])
  })

  it('is grey where there is nothing to score', () => {
    expect(healthFill(undefined, 'overall', 10)).toBe(UNKNOWN_FILL)
    expect(healthFill(health({ overall: 'critical' }), 'overall', 0)).toBe(UNKNOWN_FILL)
    expect(healthFill(health({ overall: 'unknown' }), 'overall', 10)).toBe(UNKNOWN_FILL)
    expect(healthFill(health({ overall: 'healthy' }), 'cache', 10)).toBe(UNKNOWN_FILL)
  })

  it('is grey for a first-token time that was not measured, however the rest scored', () => {
    expect(healthFill(health({ score: 10, overall: 'critical', ttft: 'critical' }), 'ttft', 10)).toBe(UNKNOWN_FILL)
  })
})

describe('LEGEND_ENTRIES', () => {
  it('shows for each range of scores a fill that a score in that range gets', () => {
    const fillOf = (score: number) => healthFill(health({ score }), 'overall', 10)
    expect(LEGEND_ENTRIES.map((entry) => entry.fill)).toEqual([fillOf(100), fillOf(60), fillOf(20), UNKNOWN_FILL])
  })

  it('names the text of each range', () => {
    expect(LEGEND_ENTRIES.map((entry) => entry.key)).toEqual([
      'channelMonitorV2.matrix.healthyLegend',
      'channelMonitorV2.matrix.warningLegend',
      'channelMonitorV2.matrix.criticalLegend',
      'channelMonitorV2.matrix.unknownLegend',
    ])
  })
})
