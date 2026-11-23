import type {
  UserAvailableChannel,
  UserAvailableGroup,
  UserChannelPlatformSection,
  UserSupportedModelPricing,
} from '@/api/channels'
import {
  BILLING_MODE_IMAGE,
  BILLING_MODE_PER_REQUEST,
  BILLING_MODE_TOKEN,
  BILLING_MODE_VIDEO,
} from '@/constants/channel'
import { formatScaled, resolveIntervalPrices } from '@/utils/pricing'

/** The user's own rate per group id, for the groups that have one. */
export type GroupRates = Record<number, number>

// Token prices are kept per token and told per million.
const PER_MILLION = 1_000_000

/**
 * The channels that match what was typed. A hit in the name or the description keeps the whole channel;
 * otherwise only its platforms stay whose name, a group or a model matches, and a channel left without
 * a platform is dropped. Same rules as AvailableChannelsView.vue.
 */
export function filterChannels(channels: UserAvailableChannel[], search: string): UserAvailableChannel[] {
  const query = search.trim().toLowerCase()
  if (!query) return channels
  const has = (text: string | null | undefined) => (text ?? '').toLowerCase().includes(query)
  const kept: UserAvailableChannel[] = []
  for (const channel of channels) {
    if (has(channel.name) || has(channel.description)) {
      kept.push(channel)
      continue
    }
    const platforms = channel.platforms.filter(
      (section) =>
        has(section.platform) ||
        section.groups.some((group) => has(group.name)) ||
        section.supported_models.some((model) => has(model.name)),
    )
    if (platforms.length > 0) kept.push({ ...channel, platforms })
  }
  return kept
}

/** One platform of one channel, as a row of the table. */
export interface ChannelRow extends Record<string, unknown> {
  key: string
  channel: string
  section: UserChannelPlatformSection
}

/** A row per platform, in the order the channels and their platforms came in. Channel names are unique. */
export function channelRows(channels: UserAvailableChannel[]): ChannelRow[] {
  return channels.flatMap((channel) =>
    channel.platforms.map((section) => ({
      // A platform id holds no slash, so the last one always parts the two.
      key: `${channel.name}/${section.platform}`,
      channel: channel.name,
      section,
    })),
  )
}

/** The groups granted to the user apart from the ones open to everyone, each in the order it came in. */
export function splitGroups(groups: UserAvailableGroup[]) {
  return {
    exclusive: groups.filter((group) => group.is_exclusive),
    open: groups.filter((group) => !group.is_exclusive),
  }
}

/** The user's own rate for a group, or null where none is set or it is the group's default anyway. */
export function ownRateOf(group: UserAvailableGroup, rates: GroupRates): number | null {
  const own = rates[group.id]
  return own != null && own !== group.rate_multiplier ? own : null
}

/** `1.2x`, or `1.2x → 0.8x` where the user has a rate of their own. */
export function rateText(group: UserAvailableGroup, rates: GroupRates): string {
  const own = ownRateOf(group, rates)
  return own === null ? `${group.rate_multiplier}x` : `${group.rate_multiplier}x → ${own}x`
}

export function isSubscriptionGroup(group: UserAvailableGroup): boolean {
  return group.subscription_type === 'subscription'
}

/** Keys under `availableChannels.pricing`. */
export type BillingModeKey = 'billingModeToken' | 'billingModePerRequest' | 'billingModeImage' | 'billingModeVideo'
export type PriceLabelKey =
  | 'inputPrice'
  | 'outputPrice'
  | 'cacheWrite5mPrice'
  | 'cacheWrite1hPrice'
  | 'cacheWrite12hPrice'
  | 'cacheReadPrice'
  | 'imageInputPrice'
  | 'imageOutputPrice'
  | 'perRequestPrice'
  | 'videoPrice'
export type PriceUnitKey = 'unitPerMillion' | 'unitPerRequest' | 'unitPerSecond'

/** One price of a model: what it is for, the amount, and what the amount buys. */
export interface PriceLine {
  label: PriceLabelKey
  /** `$3`, or `-` where no price is set. */
  amount: string
  /** Null beside a `-`: an unset price has no unit. */
  unit: PriceUnitKey | null
}

/** One tier of a model with tiered prices. */
export interface TierLine {
  /** The name given to the tier, or its token range as `(min, max]`. */
  label: string
  /** One price, or the input and output prices as `$3 / $15`. */
  amount: string
  unit: PriceUnitKey | null
}

/** The label key of a billing mode, or null for one this page does not know. */
export function billingModeKey(pricing: UserSupportedModelPricing): BillingModeKey | null {
  switch (pricing.billing_mode) {
    case BILLING_MODE_TOKEN:
      return 'billingModeToken'
    case BILLING_MODE_PER_REQUEST:
      return 'billingModePerRequest'
    case BILLING_MODE_IMAGE:
      return 'billingModeImage'
    case BILLING_MODE_VIDEO:
      return 'billingModeVideo'
    default:
      return null
  }
}

function priceLine(
  label: PriceLabelKey,
  value: number | null | undefined,
  scale: number,
  unit: PriceUnitKey,
): PriceLine {
  return value == null ? { label, amount: '-', unit: null } : { label, amount: formatScaled(value, scale), unit }
}

/**
 * The prices of a model in the order they are listed. Which ones there are depends on how the model is
 * billed: per token, per request, per image or per second of video. Same rules as SupportedModelChip.vue.
 */
export function priceLines(pricing: UserSupportedModelPricing): PriceLine[] {
  const perMillion = (label: PriceLabelKey, value: number | null | undefined) =>
    priceLine(label, value, PER_MILLION, 'unitPerMillion')

  if (pricing.billing_mode === BILLING_MODE_TOKEN) {
    const lines = [
      perMillion('inputPrice', pricing.input_price),
      perMillion('outputPrice', pricing.output_price),
      perMillion('cacheWrite5mPrice', pricing.cache_write_price),
    ]
    // The longer cache lifetimes are priced on few models, and are left out where they are not.
    if (pricing.cache_write_1h_price != null) lines.push(perMillion('cacheWrite1hPrice', pricing.cache_write_1h_price))
    if (pricing.cache_write_12h_price != null) {
      lines.push(perMillion('cacheWrite12hPrice', pricing.cache_write_12h_price))
    }
    lines.push(perMillion('cacheReadPrice', pricing.cache_read_price))
    if (pricing.image_input_price != null && pricing.image_input_price > 0) {
      lines.push(perMillion('imageInputPrice', pricing.image_input_price))
    }
    if (pricing.image_output_price != null && pricing.image_output_price > 0) {
      lines.push(perMillion('imageOutputPrice', pricing.image_output_price))
    }
    return lines
  }
  // A price of zero is a price and is shown; one that is not set has no line.
  if (pricing.billing_mode === BILLING_MODE_PER_REQUEST && pricing.per_request_price != null) {
    return [priceLine('perRequestPrice', pricing.per_request_price, 1, 'unitPerRequest')]
  }
  if (pricing.billing_mode === BILLING_MODE_IMAGE && pricing.image_output_price != null) {
    return [priceLine('imageOutputPrice', pricing.image_output_price, 1, 'unitPerRequest')]
  }
  if (pricing.billing_mode === BILLING_MODE_VIDEO && pricing.per_request_price != null) {
    return [priceLine('videoPrice', pricing.per_request_price, 1, 'unitPerSecond')]
  }
  return []
}

/** The tiers of a model with tiered prices, in the order they came in. */
export function tierLines(pricing: UserSupportedModelPricing): TierLine[] {
  return (pricing.intervals ?? []).map((tier) => {
    const label = tier.tier_label || `(${tier.min_tokens}, ${tier.max_tokens ?? '∞'}]`
    if (pricing.billing_mode === BILLING_MODE_VIDEO) {
      const amount = formatScaled(tier.per_request_price, 1)
      return { label, amount, unit: tier.per_request_price == null ? null : 'unitPerSecond' }
    }
    if (pricing.billing_mode === BILLING_MODE_PER_REQUEST || pricing.billing_mode === BILLING_MODE_IMAGE) {
      return { label, amount: formatScaled(tier.per_request_price, 1), unit: null }
    }
    // A tier may name its prices or only multiply the model's own.
    const prices = resolveIntervalPrices(tier, pricing)
    const input = formatScaled(prices.input_price, PER_MILLION)
    const output = formatScaled(prices.output_price, PER_MILLION)
    return { label, amount: `${input} / ${output}`, unit: null }
  })
}
