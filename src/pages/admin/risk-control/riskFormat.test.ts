import { describe, expect, it } from 'vitest'
import { clampPercent, formatCount, formatMs, formatPercent, formatScore } from './riskFormat'

describe('formatCount', () => {
  it('groups digits the way the language does', () => {
    expect(formatCount(18452, 'en')).toBe('18,452')
    expect(formatCount(18452, 'zh')).toBe('18,452')
    expect(formatCount(18452, 'de')).toBe('18.452')
  })

  it('leaves small counts alone', () => {
    expect(formatCount(0, 'en')).toBe('0')
    expect(formatCount(327, 'en')).toBe('327')
  })

  it('counts what is not a number as none', () => {
    expect(formatCount(null, 'en')).toBe('0')
    expect(formatCount(undefined, 'en')).toBe('0')
    expect(formatCount(Number.NaN, 'en')).toBe('0')
    expect(formatCount(Number.POSITIVE_INFINITY, 'en')).toBe('0')
    expect(formatCount('12' as unknown as number, 'en')).toBe('0')
  })
})

describe('formatMs', () => {
  it('rounds to whole milliseconds', () => {
    expect(formatMs(412.4, 'en')).toBe('412 ms')
    expect(formatMs(412.6, 'en')).toBe('413 ms')
  })

  it('groups long durations', () => {
    expect(formatMs(12345, 'en')).toBe('12,345 ms')
  })

  it('shows a missing duration as zero', () => {
    expect(formatMs(null, 'en')).toBe('0 ms')
    expect(formatMs(undefined, 'en')).toBe('0 ms')
    expect(formatMs(Number.NaN, 'en')).toBe('0 ms')
  })
})

describe('clampPercent', () => {
  it('keeps a share between none and all', () => {
    expect(clampPercent(37.5)).toBe(37.5)
    expect(clampPercent(0)).toBe(0)
    expect(clampPercent(100)).toBe(100)
  })

  it('pulls shares outside the range back in', () => {
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(250)).toBe(100)
  })

  it('reads numbers written as text', () => {
    expect(clampPercent('42.5')).toBe(42.5)
  })

  it('reads what is not a number as none', () => {
    expect(clampPercent(undefined)).toBe(0)
    expect(clampPercent(null)).toBe(0)
    expect(clampPercent('half')).toBe(0)
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('formatPercent', () => {
  it('shows one decimal', () => {
    expect(formatPercent(3.77)).toBe('3.8%')
    expect(formatPercent(50)).toBe('50.0%')
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('never shows more than all or less than none', () => {
    expect(formatPercent(250)).toBe('100.0%')
    expect(formatPercent(-1)).toBe('0.0%')
    expect(formatPercent(undefined)).toBe('0.0%')
  })
})

describe('formatScore', () => {
  it('shows a score between 0 and 1 as a share of a hundred', () => {
    expect(formatScore(0.931)).toBe('93.1%')
    expect(formatScore(0.65)).toBe('65.0%')
    expect(formatScore(0)).toBe('0.0%')
    expect(formatScore(1)).toBe('100.0%')
  })

  it('shows a missing score as a dash', () => {
    expect(formatScore(null)).toBe('-')
    expect(formatScore(undefined)).toBe('-')
    expect(formatScore(Number.NaN)).toBe('-')
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe('-')
  })
})
