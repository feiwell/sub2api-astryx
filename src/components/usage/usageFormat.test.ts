import { describe, expect, it } from 'vitest'
import type { UsageLog } from '@/types'
import {
  costDetails,
  formatAverageDuration,
  formatLatency,
  formatTokenTotal,
  tokenDetails,
  type DetailLine,
} from './usageFormat'

const log = (patch: Partial<UsageLog> = {}): UsageLog =>
  ({
    id: 1,
    model: 'gpt-5',
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_5m_tokens: 0,
    cache_creation_1h_tokens: 0,
    input_cost: 0,
    output_cost: 0,
    cache_creation_cost: 0,
    cache_read_cost: 0,
    total_cost: 0,
    actual_cost: 0,
    rate_multiplier: 1,
    image_count: 0,
    image_input_tokens: 0,
    image_input_cost: 0,
    image_output_tokens: 0,
    image_output_cost: 0,
    cache_ttl_overridden: false,
    ...patch,
  }) as UsageLog

/** Stands in for the catalog: a line is told by its key. */
const t = (key: string) => key
const n = (value: number) => value.toLocaleString()
const labels = (lines: DetailLine[]) => lines.map((line) => line.label)
const valueOf = (lines: DetailLine[], label: string) => lines.find((line) => line.label === label)?.value

describe('formatLatency', () => {
  it('writes a dash for a time that was not measured', () => {
    expect(formatLatency(null)).toBe('-')
    expect(formatLatency(undefined)).toBe('-')
  })

  it('writes milliseconds under a second, and seconds under a minute', () => {
    expect(formatLatency(0)).toBe('0ms')
    expect(formatLatency(999)).toBe('999ms')
    expect(formatLatency(1000)).toBe('1.00s')
    expect(formatLatency(59_994)).toBe('59.99s')
  })

  it('writes minutes and seconds from a minute on', () => {
    expect(formatLatency(60_000)).toBe('1m 0s')
    expect(formatLatency(185_400)).toBe('3m 5s')
    expect(formatLatency(3_599_000)).toBe('59m 59s')
  })

  it('writes hours and minutes from an hour on', () => {
    expect(formatLatency(3_600_000)).toBe('1h 0m')
    expect(formatLatency(5_430_000)).toBe('1h 30m')
  })
})

describe('formatTokenTotal', () => {
  it('keeps a total under a thousand whole', () => {
    expect(formatTokenTotal(0)).toBe('0')
    expect(formatTokenTotal(999)).toBe('999')
  })

  it('shortens thousands, millions and billions to two decimals', () => {
    expect(formatTokenTotal(1000)).toBe('1.00K')
    expect(formatTokenTotal(1_234_567)).toBe('1.23M')
    expect(formatTokenTotal(7_890_000_000)).toBe('7.89B')
  })
})

describe('formatAverageDuration', () => {
  it('rounds milliseconds under a second and writes seconds beyond it', () => {
    expect(formatAverageDuration(0)).toBe('0ms')
    expect(formatAverageDuration(812.6)).toBe('813ms')
    expect(formatAverageDuration(4250)).toBe('4.25s')
  })
})

describe('tokenDetails', () => {
  it('lists input, output and cache of a plain request and sums them', () => {
    const { lines, total } = tokenDetails(
      log({ input_tokens: 1200, output_tokens: 340, cache_creation_tokens: 60, cache_read_tokens: 50 }),
      t,
    )
    expect(lines).toEqual([
      { label: 'admin.usage.inputTokens', value: n(1200), tag: undefined },
      { label: 'admin.usage.outputTokens', value: n(340), tag: undefined },
      { label: 'admin.usage.cacheCreationTokens', value: n(60), tag: undefined },
      { label: 'admin.usage.cacheReadTokens', value: n(50), tag: undefined },
    ])
    expect(total).toBe(1650)
  })

  it('leaves out the parts that are zero', () => {
    expect(labels(tokenDetails(log({ output_tokens: 5 }), t).lines)).toEqual(['admin.usage.outputTokens'])
  })

  it('lists image tokens apart from the text share of the input and output', () => {
    const { lines, total } = tokenDetails(
      log({ input_tokens: 1000, image_input_tokens: 300, output_tokens: 900, image_output_tokens: 900 }),
      t,
    )
    expect(lines.map((line) => [line.label, line.value])).toEqual([
      ['admin.usage.inputTokens', n(700)],
      ['usage.imageInputTokens', n(300)],
      // All of the output was image output: no text line.
      ['usage.imageOutputTokens', n(900)],
    ])
    // Image tokens are inside the input and output totals, so they are not added twice.
    expect(total).toBe(1900)
  })

  it('splits cache writes by the lifetimes the upstream reported, in the order 5m, 1h, 30m, 12h', () => {
    const { lines } = tokenDetails(
      log({
        cache_creation_tokens: 1000,
        cache_creation_5m_tokens: 100,
        cache_creation_1h_tokens: 200,
        cache_creation_30m_tokens: 300,
        cache_creation_12h_tokens: 400,
      }),
      t,
    )
    expect(lines).toEqual([
      { label: 'admin.usage.cacheCreation5mTokens', value: n(100), tag: '5m' },
      { label: 'admin.usage.cacheCreation1hTokens', value: n(200), tag: '1h' },
      { label: 'admin.usage.cacheCreationTokens', value: n(300), tag: '30m' },
      { label: 'admin.usage.cacheCreationTokens', value: n(400), tag: '12h' },
    ])
  })

  it('says how an overridden cache lifetime is billed', () => {
    const fiveMinutes = tokenDetails(log({ cache_ttl_overridden: true }), t).lines
    expect(fiveMinutes).toEqual([
      { label: 'usage.cacheTtlOverriddenLabel', value: 'usage.cacheTtlOverridden5m', tag: 'R-1H' },
    ])
    const oneHour = tokenDetails(
      log({ cache_ttl_overridden: true, cache_creation_tokens: 10, cache_creation_1h_tokens: 10 }),
      t,
    ).lines
    expect(oneHour[1]).toEqual({ label: 'usage.cacheTtlOverriddenLabel', value: 'usage.cacheTtlOverridden1h', tag: 'R-5m' })
  })
})

describe('costDetails', () => {
  it('prices a token-billed request per million tokens', () => {
    const { breakdown, summary } = costDetails(
      log({
        input_tokens: 1_000_000,
        output_tokens: 500_000,
        input_cost: 3,
        output_cost: 7.5,
        cache_creation_cost: 0.25,
        cache_read_cost: 0.125,
        total_cost: 10.875,
        actual_cost: 16.3125,
        rate_multiplier: 1.5,
        service_tier: 'priority',
      }),
      t,
    )
    expect(breakdown.map((line) => [line.label, line.value])).toEqual([
      ['admin.usage.inputCost', '$3.00000000'],
      ['admin.usage.outputCost', '$7.50000000'],
      ['usage.inputTokenPrice', '$3.0000 usage.perMillionTokens'],
      ['usage.outputTokenPrice', '$15.0000 usage.perMillionTokens'],
      ['admin.usage.cacheCreationCost', '$0.25000000'],
      ['admin.usage.cacheReadCost', '$0.12500000'],
    ])
    expect(summary.map((line) => [line.label, line.value])).toEqual([
      ['usage.serviceTier', 'usage.serviceTierPriority'],
      ['usage.rate', '1.50x'],
      ['usage.original', '$10.87500000'],
      ['usage.userBilled', '$16.31250000'],
    ])
  })

  it('prices the image tokens of a token-billed request on their own lines', () => {
    const { breakdown } = costDetails(
      log({
        billing_mode: 'token',
        input_tokens: 1000,
        image_input_tokens: 400,
        input_cost: 0.0006,
        image_input_cost: 0.004,
        output_tokens: 2000,
        image_output_tokens: 2000,
        output_cost: 0,
        image_output_cost: 0.08,
      }),
      t,
    )
    expect(breakdown.map((line) => [line.label, line.value])).toEqual([
      ['admin.usage.inputCost', '$0.00060000'],
      ['usage.imageInputCost', '$0.00400000'],
      ['usage.imageOutputCost', '$0.08000000'],
      ['usage.inputTokenPrice', '$1.0000 usage.perMillionTokens'],
      ['usage.imageInputTokenPrice', '$10.0000 usage.perMillionTokens'],
      ['usage.imageOutputTokenPrice', '$40.0000 usage.perMillionTokens'],
    ])
  })

  it('describes a request billed per image by its images, not by tokens', () => {
    const { breakdown } = costDetails(
      log({
        billing_mode: 'image',
        image_count: 4,
        image_size: '2K',
        image_size_source: 'output',
        image_input_size: null,
        image_output_size: '2048x2048',
        image_size_breakdown: { '2K': 3, '4K': 1 },
        total_cost: 0.2,
      }),
      t,
    )
    expect(breakdown.map((line) => [line.label, line.value])).toEqual([
      ['usage.imageCount', '4usage.imageUnit'],
      ['usage.imageBillingSize', '2K'],
      ['usage.imageSizeSource', 'usage.imageSizeSourceOutput'],
      ['usage.imageInputSize', 'usage.imageSizeUnknown'],
      ['usage.imageOutputSize', '2048x2048'],
      ['usage.imageSizeBreakdown', '2K x 3, 4K x 1'],
      ['usage.imageUnitPrice', '$0.05000000'],
      ['usage.imageTotalPrice', '$0.20000000'],
    ])
  })

  it('gives a request billed per request its whole price as the unit price', () => {
    const { breakdown } = costDetails(log({ billing_mode: 'per_request', total_cost: 0.01, input_tokens: 500 }), t)
    expect(breakdown).toEqual([{ label: 'usage.unitPrice', value: '$0.01000000' }])
  })

  it('treats a request with no recorded mode as token-billed, and a missing multiplier as 1', () => {
    const { breakdown, summary } = costDetails(
      log({ billing_mode: null, input_tokens: 2_000_000, input_cost: 1, rate_multiplier: undefined }),
      t,
    )
    expect(labels(breakdown)).toEqual(['admin.usage.inputCost', 'usage.inputTokenPrice'])
    expect(valueOf(breakdown, 'usage.inputTokenPrice')).toBe('$0.5000 usage.perMillionTokens')
    expect(valueOf(summary, 'usage.rate')).toBe('1.00x')
    expect(valueOf(summary, 'usage.serviceTier')).toBe('usage.serviceTierStandard')
  })
})
