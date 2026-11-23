import { describe, expect, it } from 'vitest'
import {
  AUTO_REFRESH_KEY,
  AUTO_REFRESH_SECONDS,
  countdownDigits,
  DEFAULT_AUTO_REFRESH,
  parseAutoRefresh,
  serializeAutoRefresh,
  tickCountdown,
} from './autoRefresh'

describe('the choice of a viewer who never chose', () => {
  it('refreshes every minute', () => {
    expect(DEFAULT_AUTO_REFRESH).toEqual({ enabled: true, seconds: 60 })
  })

  it('is one of the intervals offered', () => {
    expect(AUTO_REFRESH_SECONDS).toEqual([30, 60, 120])
    expect(AUTO_REFRESH_SECONDS).toContain(DEFAULT_AUTO_REFRESH.seconds)
  })

  it('is kept where the Vue app keeps it', () => {
    expect(AUTO_REFRESH_KEY).toBe('channel-status-auto-refresh')
  })
})

describe('parseAutoRefresh', () => {
  it('gives the default when nothing was saved', () => {
    expect(parseAutoRefresh(null)).toEqual(DEFAULT_AUTO_REFRESH)
    expect(parseAutoRefresh(undefined)).toEqual(DEFAULT_AUTO_REFRESH)
    expect(parseAutoRefresh('')).toEqual(DEFAULT_AUTO_REFRESH)
  })

  it('reads what the Vue app saved', () => {
    expect(parseAutoRefresh('{"enabled":true,"interval_seconds":120}')).toEqual({ enabled: true, seconds: 120 })
    expect(parseAutoRefresh('{"enabled":false,"interval_seconds":30}')).toEqual({ enabled: false, seconds: 30 })
  })

  it('takes anything but true as switched off', () => {
    expect(parseAutoRefresh('{"interval_seconds":30}').enabled).toBe(false)
    expect(parseAutoRefresh('{"enabled":"true","interval_seconds":30}').enabled).toBe(false)
    expect(parseAutoRefresh('{"enabled":1,"interval_seconds":30}').enabled).toBe(false)
  })

  it('falls back to the default interval for one that is not offered, and keeps the switch', () => {
    expect(parseAutoRefresh('{"enabled":false,"interval_seconds":45}')).toEqual({ enabled: false, seconds: 60 })
    expect(parseAutoRefresh('{"enabled":true,"interval_seconds":"fast"}')).toEqual({ enabled: true, seconds: 60 })
    expect(parseAutoRefresh('{"enabled":true}')).toEqual({ enabled: true, seconds: 60 })
  })

  it('gives the default for something that cannot be read', () => {
    expect(parseAutoRefresh('{enabled')).toEqual(DEFAULT_AUTO_REFRESH)
    expect(parseAutoRefresh('null')).toEqual(DEFAULT_AUTO_REFRESH)
    expect(parseAutoRefresh('30')).toEqual(DEFAULT_AUTO_REFRESH)
    expect(parseAutoRefresh('"on"')).toEqual(DEFAULT_AUTO_REFRESH)
  })
})

describe('serializeAutoRefresh', () => {
  it('writes the form the Vue app reads', () => {
    expect(JSON.parse(serializeAutoRefresh({ enabled: false, seconds: 120 }))).toEqual({ enabled: false, interval_seconds: 120 })
  })

  it('gives back the same choice when read again', () => {
    for (const enabled of [true, false]) {
      for (const seconds of AUTO_REFRESH_SECONDS) {
        expect(parseAutoRefresh(serializeAutoRefresh({ enabled, seconds }))).toEqual({ enabled, seconds })
      }
    }
  })
})

describe('tickCountdown', () => {
  it('takes a second off', () => {
    expect(tickCountdown(60, 60)).toEqual({ remaining: 59, isDue: false })
    expect(tickCountdown(2, 60)).toEqual({ remaining: 1, isDue: false })
  })

  it('is due at the last second, and starts over', () => {
    expect(tickCountdown(1, 60)).toEqual({ remaining: 60, isDue: true })
    expect(tickCountdown(1, 30)).toEqual({ remaining: 30, isDue: true })
  })

  it('is due at once when nothing is left', () => {
    expect(tickCountdown(0, 120)).toEqual({ remaining: 120, isDue: true })
    expect(tickCountdown(-4, 120)).toEqual({ remaining: 120, isDue: true })
  })

  it('refreshes once in each interval', () => {
    let remaining = 30
    let due = 0
    for (let second = 0; second < 90; second += 1) {
      const next = tickCountdown(remaining, 30)
      remaining = next.remaining
      if (next.isDue) due += 1
    }
    expect(due).toBe(3)
  })
})

describe('countdownDigits', () => {
  it('shows the seconds as they are while they have as many digits as the interval', () => {
    expect(countdownDigits(60, 60)).toBe('60')
    expect(countdownDigits(10, 30)).toBe('10')
    expect(countdownDigits(120, 120)).toBe('120')
  })

  it('puts a space as wide as a digit where a digit dropped away', () => {
    expect(countdownDigits(9, 60)).toBe('\u20079')
    expect(countdownDigits(99, 120)).toBe('\u200799')
    expect(countdownDigits(5, 120)).toBe('\u2007\u20075')
  })

  it('keeps the same length through a whole countdown', () => {
    for (const seconds of AUTO_REFRESH_SECONDS) {
      for (let remaining = seconds; remaining >= 1; remaining -= 1) {
        expect(countdownDigits(remaining, seconds)).toHaveLength(String(seconds).length)
      }
    }
  })
})
