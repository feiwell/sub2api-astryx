import { describe, expect, it } from 'vitest'
import type { LatencyMetric, MonitorHealth, MonitorMatrixBucket, MonitorMatrixRow, MonitorMetric } from '@/api/channelMonitorV2'
import { bucketLines, cellName, emptyLines, rowKey, rowLabel, scoreText, successRateText } from './pulseText'

/** Stands in for the translation: the last part of the key, then the values put into the text. */
const t = (key: string, params?: Record<string, unknown>) => [key.split('.').pop(), ...Object.values(params ?? {})].join(' ')

function latency(patch: Partial<LatencyMetric> = {}): LatencyMetric {
  return { sample_count: 40, p50_ms: 400, p90_ms: 800, p95_ms: 950, avg_ms: 475, ...patch }
}

function metrics(patch: Partial<MonitorMetric> = {}): MonitorMetric {
  return {
    success_requests: 95,
    error_requests: 5,
    request_count: 100,
    token_count: 6000,
    rpm: 12,
    tpm: 600,
    error_rate: 0.05,
    cache_rate: 0.4,
    cache_rate_numerator: 4,
    cache_rate_denominator: 10,
    ttft: latency(),
    duration: latency({ p50_ms: 2000, p90_ms: 4000, avg_ms: 2500 }),
    ...patch,
  }
}

function health(patch: Partial<MonitorHealth> = {}): MonitorHealth {
  return { overall: 'healthy', error_rate: 'healthy', ttft: 'healthy', minimum_sample: 20, ...patch } as MonitorHealth
}

function row(patch: Partial<MonitorMatrixRow>): MonitorMatrixRow {
  return { platform: 'openai', metrics: metrics(), health: health(), buckets: [], ...patch }
}

function bucket(patch: Partial<MonitorMatrixBucket> = {}): MonitorMatrixBucket {
  return { bucket_start: '2026-11-21T08:00:00Z', metrics: metrics(), health: health({ score: 86.6 }), ...patch }
}

const RANGE = '11/21 08:00 - 08:05'

describe('rowKey', () => {
  it('tells rows apart by platform, group and model', () => {
    expect(rowKey(row({}))).toBe('openai:0:')
    expect(rowKey(row({ group_id: 3 }))).toBe('openai:3:')
    expect(rowKey(row({ group_id: 3, model: 'gpt-4o' }))).toBe('openai:3:gpt-4o')
    expect(rowKey(row({ model: 'gpt-4o' }))).toBe('openai:0:gpt-4o')
  })
})

describe('rowLabel', () => {
  it('names the platform alone when the rows are not split further', () => {
    expect(rowLabel(row({}), 'Other')).toBe('openai')
  })

  it('adds the group and the model the row is split by', () => {
    expect(rowLabel(row({ group_id: 3, group_name: 'default' }), 'Other')).toBe('openai / default')
    expect(rowLabel(row({ model: 'gpt-4o' }), 'Other')).toBe('openai / gpt-4o')
    expect(rowLabel(row({ group_id: 3, group_name: 'default', model: 'gpt-4o' }), 'Other')).toBe('openai / default / gpt-4o')
  })

  it('falls back on the number of a group without a name', () => {
    expect(rowLabel(row({ group_id: 3 }), 'Other')).toBe('openai / #3')
  })

  it('names the models the server lumps together', () => {
    expect(rowLabel(row({ model: '__other__' }), 'Other')).toBe('openai / Other')
  })
})

describe('successRateText', () => {
  it('is the share of requests that did not fail', () => {
    expect(successRateText(metrics(), true)).toBe('95.0%')
    expect(successRateText(metrics({ error_rate: 0 }), true)).toBe('100.0%')
  })

  it('is a dash when there was no traffic', () => {
    expect(successRateText(metrics({ request_count: 0, rpm: 0, tpm: 0, error_rate: 0 }), true)).toBe('-')
  })

  it('takes throughput alone as a sign of traffic', () => {
    expect(successRateText(metrics({ request_count: 0, rpm: 3, tpm: 0 }), true)).toBe('95.0%')
    expect(successRateText(metrics({ request_count: 0, rpm: 0, tpm: 90 }), true)).toBe('95.0%')
  })

  it('does not read missing throughput as no traffic for a viewer who is never sent it', () => {
    expect(successRateText(metrics({ request_count: 0, rpm: 0, tpm: 0, error_rate: 0.05 }), false)).toBe('95.0%')
  })
})

describe('scoreText', () => {
  it('rounds the score of the chosen measure to a whole number', () => {
    const scored = health({ score: 86.6, error_rate_score: 99.4, ttft_score: 40, cache_score: 0 })
    expect(scoreText(scored, 'overall')).toBe('87')
    expect(scoreText(scored, 'success')).toBe('99')
    expect(scoreText(scored, 'ttft')).toBe('40')
    expect(scoreText(scored, 'cache')).toBe('0')
  })

  it('is a dash without a score', () => {
    expect(scoreText(health(), 'overall')).toBe('—')
    expect(scoreText(health({ score: 90 }), 'ttft')).toBe('—')
  })
})

describe('bucketLines', () => {
  const names = (lines: string[]) => lines.slice(1).map((line) => line.split(' ')[0])

  it('gives the time of the interval, then a line for each figure', () => {
    const lines = bucketLines(bucket(), RANGE, { healthMode: 'overall', showThroughput: true, t })
    expect(lines[0]).toBe(RANGE)
    expect(names(lines)).toEqual([
      'scoreLine',
      'successRateValue',
      'ttftValue',
      'tpsValue',
      'cacheRateValue',
      'errorRateValue',
      'rpmValue',
      'durationValue',
    ])
  })

  it('writes each figure the way the rest of the page does', () => {
    const lines = bucketLines(bucket(), RANGE, { healthMode: 'overall', showThroughput: true, t })
    expect(lines[1]).toBe('scoreLine 87')
    expect(lines[2]).toBe('successRateValue 95.0%')
    expect(lines[3]).toBe('ttftValue AVG 475ms · P50 400ms · P90 800ms')
    expect(lines[4]).toBe('tpsValue 10')
    expect(lines[5]).toBe('cacheRateValue 40.0%')
    expect(lines[6]).toBe('errorRateValue 5.0%')
    expect(lines[7]).toBe('rpmValue 12')
    expect(lines[8]).toBe('durationValue AVG 2.5s · P50 2.0s · P90 4.0s')
  })

  it('leaves throughput out for a viewer who may not see it', () => {
    const lines = bucketLines(bucket(), RANGE, { healthMode: 'overall', showThroughput: false, t })
    expect(names(lines)).toEqual(['scoreLine', 'successRateValue', 'ttftValue', 'cacheRateValue', 'errorRateValue', 'durationValue'])
  })

  it('scores by the measure the viewer chose', () => {
    const scored = bucket({ health: health({ score: 86.6, ttft_score: 40 }) })
    expect(bucketLines(scored, RANGE, { healthMode: 'ttft', showThroughput: true, t })[1]).toBe('scoreLine 40')
    expect(bucketLines(scored, RANGE, { healthMode: 'cache', showThroughput: true, t })[1]).toBe('scoreLine —')
  })

  it('says so when the first token was never timed', () => {
    const unstreamed = bucket({ metrics: metrics({ ttft: latency({ p50_ms: null, p90_ms: null, p95_ms: null, avg_ms: null }) }) })
    expect(bucketLines(unstreamed, RANGE, { healthMode: 'overall', showThroughput: true, t })[3]).toBe('ttftValue -')
  })
})

describe('emptyLines', () => {
  it('gives the time of the interval and that it saw no traffic', () => {
    expect(emptyLines(RANGE, t)).toEqual([RANGE, 'noTraffic'])
  })
})

describe('cellName', () => {
  it('names a block by its time and its score', () => {
    expect(cellName(bucket(), RANGE, 'overall', t)).toBe(`${RANGE} · scoreLine 87`)
    expect(cellName(bucket(), RANGE, 'cache', t)).toBe(`${RANGE} · scoreLine —`)
  })

  it('names an interval without traffic as such', () => {
    expect(cellName(undefined, RANGE, 'overall', t)).toBe(`noTrafficAt ${RANGE}`)
  })
})
