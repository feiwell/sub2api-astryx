import { describe, expect, it } from 'vitest'
import type {
  UserAvailableChannel,
  UserAvailableGroup,
  UserPricingInterval,
  UserSupportedModelPricing,
} from '@/api/channels'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'
import {
  billingModeKey,
  channelRows,
  filterChannels,
  isSubscriptionGroup,
  ownRateOf,
  priceLines,
  rateText,
  splitGroups,
  tierLines,
} from './channelsModel'

function group(id: number, name: string, patch: Partial<UserAvailableGroup> = {}): UserAvailableGroup {
  return {
    id,
    name,
    platform: 'anthropic',
    subscription_type: 'standard',
    rate_multiplier: 1,
    peak_rate_enabled: false,
    peak_start: '',
    peak_end: '',
    peak_rate_multiplier: 1,
    is_exclusive: false,
    ...patch,
  }
}

function pricing(patch: Partial<UserSupportedModelPricing> = {}): UserSupportedModelPricing {
  return {
    billing_mode: 'token',
    input_price: null,
    output_price: null,
    cache_write_price: null,
    cache_read_price: null,
    image_input_price: null,
    image_output_price: null,
    per_request_price: null,
    intervals: [],
    ...patch,
  }
}

function tier(patch: Partial<UserPricingInterval> = {}): UserPricingInterval {
  return {
    min_tokens: 0,
    max_tokens: null,
    input_price: null,
    output_price: null,
    cache_write_price: null,
    cache_read_price: null,
    per_request_price: null,
    ...patch,
  }
}

const channels: UserAvailableChannel[] = [
  {
    name: 'Primary channel',
    description: 'Fast and reliable access',
    platforms: [
      {
        platform: 'anthropic',
        groups: [group(1, 'Exclusive Pro', { is_exclusive: true }), group(2, 'Public')],
        supported_models: [{ name: 'claude-test', platform: 'anthropic', pricing: null }],
      },
      {
        platform: 'openai',
        groups: [group(3, 'Codex', { platform: 'openai' })],
        supported_models: [{ name: 'gpt-test', platform: 'openai', pricing: null }],
      },
    ],
  },
  {
    name: 'Backup',
    description: '',
    platforms: [
      {
        platform: 'gemini',
        groups: [group(4, 'Gemini Flash', { platform: 'gemini' })],
        supported_models: [],
      },
    ],
  },
]

const names = (list: UserAvailableChannel[]) =>
  list.map((channel) => `${channel.name}: ${channel.platforms.map((section) => section.platform).join(',')}`)

describe('filterChannels', () => {
  it('keeps every channel, untouched, when nothing is typed', () => {
    expect(filterChannels(channels, '')).toBe(channels)
    expect(filterChannels(channels, '   ')).toBe(channels)
  })

  it('keeps a whole channel whose name or description matches', () => {
    expect(names(filterChannels(channels, 'primary'))).toEqual(['Primary channel: anthropic,openai'])
    expect(names(filterChannels(channels, ' RELIABLE '))).toEqual(['Primary channel: anthropic,openai'])
  })

  it('keeps only the platforms whose id, a group or a model matches', () => {
    expect(names(filterChannels(channels, 'openai'))).toEqual(['Primary channel: openai'])
    expect(names(filterChannels(channels, 'exclusive'))).toEqual(['Primary channel: anthropic'])
    expect(names(filterChannels(channels, 'gpt-'))).toEqual(['Primary channel: openai'])
    expect(names(filterChannels(channels, 'flash'))).toEqual(['Backup: gemini'])
  })

  it('finds a word in more than one channel', () => {
    // Both names hold a "c".
    expect(names(filterChannels(channels, 'c'))).toEqual(['Primary channel: anthropic,openai', 'Backup: gemini'])
  })

  it('drops a channel left without a platform', () => {
    expect(filterChannels(channels, 'no such thing')).toEqual([])
  })

  it('does not change the channels it was given', () => {
    const filtered = filterChannels(channels, 'openai')
    expect(filtered[0]).not.toBe(channels[0])
    expect(channels[0].platforms).toHaveLength(2)
  })

  it('reads a missing description as empty', () => {
    const odd = [{ ...channels[1], description: null as unknown as string }]
    expect(filterChannels(odd, 'backup')).toHaveLength(1)
    expect(filterChannels(odd, 'null')).toEqual([])
  })
})

describe('channelRows', () => {
  it('makes a row per platform, in the order they came in', () => {
    const rows = channelRows(channels)
    expect(rows.map((row) => row.key)).toEqual(['Primary channel/anthropic', 'Primary channel/openai', 'Backup/gemini'])
    expect(rows.map((row) => row.channel)).toEqual(['Primary channel', 'Primary channel', 'Backup'])
    expect(rows[1].section).toBe(channels[0].platforms[1])
  })

  it('has no row when there is no channel', () => {
    expect(channelRows([])).toEqual([])
  })
})

describe('groups', () => {
  it('parts the groups granted to the user from the ones open to everyone', () => {
    const { exclusive, open } = splitGroups(channels[0].platforms[0].groups)
    expect(exclusive.map((item) => item.name)).toEqual(['Exclusive Pro'])
    expect(open.map((item) => item.name)).toEqual(['Public'])
    expect(splitGroups([])).toEqual({ exclusive: [], open: [] })
  })

  it('tells the default rate when the user has none of their own', () => {
    expect(rateText(group(1, 'A', { rate_multiplier: 1.2 }), {})).toBe('1.2x')
    expect(ownRateOf(group(1, 'A', { rate_multiplier: 1.2 }), {})).toBeNull()
  })

  it('tells the rate of the user after the default one', () => {
    const rated = group(1, 'A', { rate_multiplier: 1.2 })
    expect(ownRateOf(rated, { 1: 0.8 })).toBe(0.8)
    expect(rateText(rated, { 1: 0.8 })).toBe('1.2x → 0.8x')
    // A rate of zero is a rate.
    expect(rateText(rated, { 1: 0 })).toBe('1.2x → 0x')
  })

  it('tells the rate once when the one of the user is the default anyway', () => {
    expect(rateText(group(1, 'A', { rate_multiplier: 1.2 }), { 1: 1.2 })).toBe('1.2x')
  })

  it('does not take the rate of another group', () => {
    expect(rateText(group(1, 'A'), { 2: 0.5 })).toBe('1x')
  })

  it('knows a subscription group', () => {
    expect(isSubscriptionGroup(group(1, 'A', { subscription_type: 'subscription' }))).toBe(true)
    expect(isSubscriptionGroup(group(1, 'A'))).toBe(false)
  })
})

describe('billingModeKey', () => {
  it('names the four billing modes', () => {
    expect(billingModeKey(pricing({ billing_mode: 'token' }))).toBe('billingModeToken')
    expect(billingModeKey(pricing({ billing_mode: 'per_request' }))).toBe('billingModePerRequest')
    expect(billingModeKey(pricing({ billing_mode: 'image' }))).toBe('billingModeImage')
    expect(billingModeKey(pricing({ billing_mode: 'video' }))).toBe('billingModeVideo')
  })

  it('has no name for a mode it does not know', () => {
    expect(billingModeKey(pricing({ billing_mode: 'audio' as never }))).toBeNull()
  })
})

describe('priceLines', () => {
  const text = (value: UserSupportedModelPricing) =>
    priceLines(value).map((line) => `${line.label} ${line.amount}${line.unit ? ` ${line.unit}` : ''}`)

  it('lists the token prices per million', () => {
    expect(
      text(
        pricing({
          input_price: 3e-6,
          output_price: 15e-6,
          cache_write_price: 3.75e-6,
          cache_read_price: 0.3e-6,
        }),
      ),
    ).toEqual([
      'inputPrice $3 unitPerMillion',
      'outputPrice $15 unitPerMillion',
      'cacheWrite5mPrice $3.75 unitPerMillion',
      'cacheReadPrice $0.3 unitPerMillion',
    ])
  })

  it('shows a dash without a unit for a token price that is not set', () => {
    expect(text(pricing({ input_price: 3e-6 }))).toEqual([
      'inputPrice $3 unitPerMillion',
      'outputPrice -',
      'cacheWrite5mPrice -',
      'cacheReadPrice -',
    ])
  })

  it('adds the longer cache lifetimes only where they are priced', () => {
    expect(
      text(pricing({ cache_write_price: 1e-6, cache_write_1h_price: 2e-6, cache_write_12h_price: 0 })),
    ).toEqual([
      'inputPrice -',
      'outputPrice -',
      'cacheWrite5mPrice $1 unitPerMillion',
      'cacheWrite1hPrice $2 unitPerMillion',
      'cacheWrite12hPrice $0 unitPerMillion',
      'cacheReadPrice -',
    ])
  })

  it('adds the image prices of a token model only above zero', () => {
    expect(text(pricing({ image_input_price: 5e-6, image_output_price: 40e-6 })).slice(4)).toEqual([
      'imageInputPrice $5 unitPerMillion',
      'imageOutputPrice $40 unitPerMillion',
    ])
    expect(text(pricing({ image_input_price: 0, image_output_price: 0 }))).toHaveLength(4)
  })

  it('tells a price per request', () => {
    expect(text(pricing({ billing_mode: 'per_request', per_request_price: 0.5 }))).toEqual([
      'perRequestPrice $0.5 unitPerRequest',
    ])
  })

  it('tells a price per image', () => {
    expect(text(pricing({ billing_mode: 'image', image_output_price: 0.04 }))).toEqual([
      'imageOutputPrice $0.04 unitPerRequest',
    ])
  })

  it('tells a video price per second', () => {
    expect(text(pricing({ billing_mode: 'video', per_request_price: 0.05 }))).toEqual([
      'videoPrice $0.05 unitPerSecond',
    ])
  })

  it('shows a price of zero and leaves out one that is not set', () => {
    expect(text(pricing({ billing_mode: 'video', per_request_price: 0 }))).toEqual(['videoPrice $0 unitPerSecond'])
    expect(text(pricing({ billing_mode: 'video', per_request_price: null }))).toEqual([])
    expect(text(pricing({ billing_mode: 'per_request', per_request_price: null }))).toEqual([])
    expect(text(pricing({ billing_mode: 'image', image_output_price: null }))).toEqual([])
  })

  it('does not take the price of another mode', () => {
    // A per-image model is priced by its image output price, not by a price per request.
    expect(text(pricing({ billing_mode: 'image', per_request_price: 0.5 }))).toEqual([])
    expect(text(pricing({ billing_mode: 'per_request', input_price: 3e-6, per_request_price: 0.5 }))).toHaveLength(1)
  })

  it('has no line for a mode it does not know', () => {
    expect(text(pricing({ billing_mode: 'audio' as never, per_request_price: 1 }))).toEqual([])
  })

  it('shows no rounding noise', () => {
    expect(text(pricing({ input_price: 0.1e-6 + 0.2e-6 }))[0]).toBe('inputPrice $0.3 unitPerMillion')
  })
})

describe('tierLines', () => {
  const text = (value: UserSupportedModelPricing) =>
    tierLines(value).map((line) => `${line.label}: ${line.amount}${line.unit ? ` ${line.unit}` : ''}`)

  it('has none without tiers', () => {
    expect(tierLines(pricing())).toEqual([])
    expect(tierLines(pricing({ intervals: undefined as never }))).toEqual([])
  })

  it('tells the tiers of a video model per second, a free one too', () => {
    expect(
      text(
        pricing({
          billing_mode: 'video',
          per_request_price: 0.05,
          intervals: [
            tier({ tier_label: '480p', per_request_price: 0 }),
            tier({ tier_label: '720p', per_request_price: 0.12 }),
          ],
        }),
      ),
    ).toEqual(['480p: $0 unitPerSecond', '720p: $0.12 unitPerSecond'])
  })

  it('shows a dash without a unit for a video tier that has no price', () => {
    expect(text(pricing({ billing_mode: 'video', intervals: [tier({ tier_label: '1080p' })] }))).toEqual(['1080p: -'])
  })

  it('tells the tiers of a model billed per request or per image by their one price', () => {
    const intervals = [tier({ tier_label: '1K', per_request_price: 0.02 }), tier({ tier_label: '2K' })]
    expect(text(pricing({ billing_mode: 'per_request', intervals }))).toEqual(['1K: $0.02', '2K: -'])
    expect(text(pricing({ billing_mode: 'image', intervals }))).toEqual(['1K: $0.02', '2K: -'])
  })

  it('works out the prices of a token tier that only multiplies the prices of the model', () => {
    expect(
      text(
        pricing({
          input_price: 10e-6,
          output_price: 50e-6,
          intervals: [tier({ min_tokens: 272000, input_multiplier: 2, output_multiplier: 1.5 })],
        }),
      ),
    ).toEqual(['(272000, ∞]: $20 / $75'])
  })

  it('takes the prices a token tier names over the ones of the model', () => {
    expect(
      text(
        pricing({
          input_price: 10e-6,
          output_price: 50e-6,
          intervals: [
            tier({ min_tokens: 0, max_tokens: 200000, input_price: 3e-6, output_price: 15e-6 }),
            tier({ min_tokens: 200000, input_price: 6e-6 }),
          ],
        }),
      ),
    ).toEqual(['(0, 200000]: $3 / $15', '(200000, ∞]: $6 / $50'])
  })

  it('shows a dash for a token price neither the tier nor the model has', () => {
    expect(text(pricing({ input_price: 10e-6, intervals: [tier({ max_tokens: 1000 })] }))).toEqual([
      '(0, 1000]: $10 / -',
    ])
  })

  it('names a tier by its label rather than its range', () => {
    expect(
      text(pricing({ input_price: 1e-6, output_price: 2e-6, intervals: [tier({ tier_label: 'long' })] })),
    ).toEqual(['long: $1 / $2'])
  })
})

// The page builds these keys at run time, where no check of the source can see them.
describe('the texts of the prices', () => {
  const textOf = (catalog: unknown, key: string) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
        catalog,
      )

  it('has a text in both languages for every key the model can answer with', () => {
    const priced = pricing({
      input_price: 1,
      output_price: 1,
      cache_write_price: 1,
      cache_write_1h_price: 1,
      cache_write_12h_price: 1,
      cache_read_price: 1,
      image_input_price: 1,
      image_output_price: 1,
      per_request_price: 1,
      intervals: [tier({ per_request_price: 1 })],
    })
    const keys = new Set<string>(['billingMode', 'intervals'])
    for (const billing_mode of ['token', 'per_request', 'image', 'video'] as const) {
      const value = { ...priced, billing_mode }
      keys.add(billingModeKey(value) ?? 'unknown')
      for (const line of priceLines(value)) {
        keys.add(line.label)
        if (line.unit) keys.add(line.unit)
      }
      // The label of a tier is its own name or range, not a key.
      for (const line of tierLines(value)) {
        if (line.unit) keys.add(line.unit)
      }
    }
    // 2 headings, 4 billing modes, 10 prices and 3 units.
    expect([...keys].sort()).toHaveLength(19)
    for (const key of keys) {
      expect(typeof textOf(zh, `availableChannels.pricing.${key}`), `zh ${key}`).toBe('string')
      expect(typeof textOf(en, `availableChannels.pricing.${key}`), `en ${key}`).toBe('string')
    }
  })
})
