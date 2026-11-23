/** A count, with the digits grouped as the language groups them. What is not a number counts as none. */
export function formatCount(value: number | null | undefined, locale?: string): string {
  const count = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(locale).format(count)
}

/** A duration in whole milliseconds. */
export const formatMs = (value: number | null | undefined, locale?: string): string =>
  `${formatCount(typeof value === 'number' ? Math.round(value) : value, locale)} ms`

/** A share of a hundred, kept between none and all. What is not a number is none. */
export function clampPercent(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(100, Math.max(0, numeric))
}

/** A share of a hundred, to one decimal: 3.8%. */
export const formatPercent = (value: unknown): string => `${clampPercent(value).toFixed(1)}%`

/** A score between 0 and 1 as a share of a hundred: 0.931 is 93.1%. */
export const formatScore = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-'
