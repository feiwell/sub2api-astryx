import type { UsageLog } from '@/types'
import { BILLING_MODE_TOKEN, imageUnitPrice, isImageUsage } from '@/utils/billingMode'
import { formatMultiplier } from '@/utils/formatters'
import {
  formatImageBillingSize,
  formatImageInputSize,
  formatImageOutputSize,
  formatImageSizeBreakdown,
  formatImageSizeSource,
  hasImageInputCost,
  hasImageInputTokens,
  hasImageOutputCost,
  hasImageOutputTokens,
  textInputTokens,
  textOutputTokens,
} from '@/utils/imageUsage'
import { formatTokenPricePerMillion } from '@/utils/usagePricing'
import { getUsageServiceTierLabel } from '@/utils/usageServiceTier'

type Translate = (key: string) => string

/** One line of a breakdown: what is counted, its figure, and a short mark beside the name (a cache lifetime). */
export interface DetailLine {
  label: string
  value: string
  tag?: string
}

const count = (value: number) => value.toLocaleString()
const dollars = (value: number | null | undefined) => `$${(value ?? 0).toFixed(8)}`

/** How long a request took. From a minute on it is written in minutes and seconds, from an hour on in hours and minutes. */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
  const seconds = Math.round(ms / 1000)
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

/** A token total short enough for a figure card: 1.23K, 4.56M, 7.89B. */
export function formatTokenTotal(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return count(value)
}

export function formatAverageDuration(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`
}

/** The tokens of one request, line by line, and their sum. */
export function tokenDetails(row: UsageLog, t: Translate): { lines: DetailLine[]; total: number } {
  const lines: DetailLine[] = []
  const add = (label: string, value: string, tag?: string) => lines.push({ label, value, tag })

  // Image tokens are counted inside the input and output totals; a request that has them lists its text share apart.
  const input = hasImageInputTokens(row) ? textInputTokens(row) : row.input_tokens
  if (input > 0) add(t('admin.usage.inputTokens'), count(input))
  if (hasImageInputTokens(row)) add(t('usage.imageInputTokens'), count(row.image_input_tokens))
  const output = hasImageOutputTokens(row) ? textOutputTokens(row) : row.output_tokens
  if (output > 0) add(t('admin.usage.outputTokens'), count(output))
  if (hasImageOutputTokens(row)) add(t('usage.imageOutputTokens'), count(row.image_output_tokens))

  if (row.cache_creation_tokens > 0) {
    const lifetimes = [
      { tag: '5m', tokens: row.cache_creation_5m_tokens, label: t('admin.usage.cacheCreation5mTokens') },
      { tag: '1h', tokens: row.cache_creation_1h_tokens, label: t('admin.usage.cacheCreation1hTokens') },
      { tag: '30m', tokens: row.cache_creation_30m_tokens ?? 0, label: t('admin.usage.cacheCreationTokens') },
      { tag: '12h', tokens: row.cache_creation_12h_tokens ?? 0, label: t('admin.usage.cacheCreationTokens') },
    ].filter((lifetime) => lifetime.tokens > 0)
    // Only the lifetimes the upstream reported are listed; when it reported none, the one total stands for them.
    if (lifetimes.length > 0) {
      for (const lifetime of lifetimes) add(lifetime.label, count(lifetime.tokens), lifetime.tag)
    } else {
      add(t('admin.usage.cacheCreationTokens'), count(row.cache_creation_tokens))
    }
  }
  if (row.cache_ttl_overridden) {
    // The mark names the lifetime that was asked for, the figure the one that is billed.
    const isBilledAsOneHour = row.cache_creation_1h_tokens > 0
    add(
      t('usage.cacheTtlOverriddenLabel'),
      t(isBilledAsOneHour ? 'usage.cacheTtlOverridden1h' : 'usage.cacheTtlOverridden5m'),
      isBilledAsOneHour ? 'R-5m' : 'R-1H',
    )
  }
  if (row.cache_read_tokens > 0) add(t('admin.usage.cacheReadTokens'), count(row.cache_read_tokens))

  const total =
    (row.input_tokens || 0) + (row.output_tokens || 0) + (row.cache_creation_tokens || 0) + (row.cache_read_tokens || 0)
  return { lines, total }
}

/**
 * What one request cost: `breakdown` is how the price came about (per part, with the unit prices behind it),
 * `summary` is the tier and the multiplier applied to it, and what was charged in the end.
 */
export function costDetails(row: UsageLog, t: Translate): { breakdown: DetailLine[]; summary: DetailLine[] } {
  const breakdown: DetailLine[] = []
  const add = (label: string, value: string) => breakdown.push({ label, value })
  const perMillion = (cost: number | null | undefined, tokens: number) =>
    `${formatTokenPricePerMillion(cost, tokens)} ${t('usage.perMillionTokens')}`

  if (row.input_cost > 0) add(t('admin.usage.inputCost'), dollars(row.input_cost))
  if (hasImageInputCost(row)) add(t('usage.imageInputCost'), dollars(row.image_input_cost))
  if (row.output_cost > 0) add(t('admin.usage.outputCost'), dollars(row.output_cost))
  if (hasImageOutputCost(row)) add(t('usage.imageOutputCost'), dollars(row.image_output_cost))

  if (isImageUsage(row)) {
    add(t('usage.imageCount'), `${row.image_count}${t('usage.imageUnit')}`)
    add(t('usage.imageBillingSize'), formatImageBillingSize(row, t))
    add(t('usage.imageSizeSource'), formatImageSizeSource(row, t))
    add(t('usage.imageInputSize'), formatImageInputSize(row, t))
    add(t('usage.imageOutputSize'), formatImageOutputSize(row, t))
    const sizes = formatImageSizeBreakdown(row)
    if (sizes) add(t('usage.imageSizeBreakdown'), sizes)
    add(t('usage.imageUnitPrice'), dollars(imageUnitPrice(row)))
    add(t('usage.imageTotalPrice'), dollars(row.total_cost))
  } else if (!row.billing_mode || row.billing_mode === BILLING_MODE_TOKEN) {
    if (textInputTokens(row) > 0) add(t('usage.inputTokenPrice'), perMillion(row.input_cost, textInputTokens(row)))
    if (hasImageInputTokens(row)) {
      add(t('usage.imageInputTokenPrice'), perMillion(row.image_input_cost ?? 0, row.image_input_tokens))
    }
    if (row.output_cost > 0 && textOutputTokens(row) > 0) {
      add(t('usage.outputTokenPrice'), perMillion(row.output_cost, textOutputTokens(row)))
    }
    if (hasImageOutputTokens(row)) {
      add(t('usage.imageOutputTokenPrice'), perMillion(row.image_output_cost ?? 0, row.image_output_tokens))
    }
  } else {
    // Billed per request (or per video): the whole price is the unit price.
    add(t('usage.unitPrice'), dollars(row.total_cost))
  }

  if (row.cache_creation_cost > 0) add(t('admin.usage.cacheCreationCost'), dollars(row.cache_creation_cost))
  if (row.cache_read_cost > 0) add(t('admin.usage.cacheReadCost'), dollars(row.cache_read_cost))

  const summary: DetailLine[] = [
    { label: t('usage.serviceTier'), value: getUsageServiceTierLabel(row.service_tier, t) },
    { label: t('usage.rate'), value: `${formatMultiplier(row.rate_multiplier ?? 1)}x` },
    { label: t('usage.original'), value: dollars(row.total_cost) },
    { label: t('usage.userBilled'), value: dollars(row.actual_cost) },
  ]
  return { breakdown, summary }
}
