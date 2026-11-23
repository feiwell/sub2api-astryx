import { describe, expect, it } from 'vitest'
import type { PlatformDashboardStats } from '@/api/usage'
import type { PlatformQuotaItem } from '@/types'
import {
  OTHER_PLATFORM,
  buildPlatformCards,
  countPlatforms,
  formatCost,
  formatDuration,
  formatResetTime,
  formatTokens,
  formatUsd,
  hasAnyLimit,
  lastDaysRange,
  platformLabel,
  quotaPercent,
  quotaTone,
  quotaWindows,
} from './dashboardModel'

function usage(platform: string, cost: number): PlatformDashboardStats {
  return {
    platform,
    total_requests: 1,
    total_tokens: 10,
    total_actual_cost: cost,
    today_requests: 1,
    today_tokens: 10,
    today_actual_cost: cost,
  }
}

function quota(over: Partial<PlatformQuotaItem> & { platform: string }): PlatformQuotaItem {
  return {
    daily_limit_usd: null,
    weekly_limit_usd: null,
    monthly_limit_usd: null,
    daily_usage_usd: 0,
    weekly_usage_usd: 0,
    monthly_usage_usd: 0,
    ...over,
  }
}

/** The cards for a total spend, the same today unless told, and what each platform used. */
function cards(total: number, used: PlatformDashboardStats[], quotas: PlatformQuotaItem[] = [], today = total) {
  return buildPlatformCards({ total_actual_cost: total, today_actual_cost: today, by_platform: used }, quotas)
}

const platformsOf = (list: ReturnType<typeof cards>) => list.map((card) => card.platform)

// The cases of components/user/dashboard/__tests__/UserDashboardStats.spec.ts of the Vue app.
describe('the platform cards', () => {
  it('has a card for a platform that was used, and none for a limits record that sets no limit', () => {
    const list = cards(
      0.03,
      [usage('grok', 0.03)],
      [quota({ platform: 'anthropic' }), quota({ platform: 'openai' }), quota({ platform: 'gemini' }), quota({ platform: 'grok' })],
    )
    expect(platformsOf(list)).toEqual(['grok'])
    expect(countPlatforms(list)).toBe(1)
    expect(quotaWindows(list[0].quota)).toEqual([])
  })

  it('has a card for a platform with a limit that was not used, in the fixed order', () => {
    const list = cards(
      0.03,
      [usage('grok', 0.03)],
      [quota({ platform: 'openai', daily_limit_usd: 10, daily_usage_usd: 2.5 }), quota({ platform: 'anthropic' })],
    )
    expect(platformsOf(list)).toEqual(['openai', 'grok'])
    expect(countPlatforms(list)).toBe(2)
    expect(list[0]).toMatchObject({ totalCost: 0, todayCost: 0, requests: 0, tokens: 0 })
    expect(quotaWindows(list[0].quota).map((window) => window.name)).toEqual(['daily'])
  })

  it('has one card for a platform that was used and has a limit', () => {
    const list = cards(1, [usage('openai', 1)], [quota({ platform: 'openai', daily_limit_usd: 10, daily_usage_usd: 1 })])
    expect(platformsOf(list)).toEqual(['openai'])
    expect(list[0]).toMatchObject({ totalCost: 1, todayCost: 1, requests: 1, tokens: 10 })
    expect(quotaWindows(list[0].quota)).toHaveLength(1)
  })

  it('takes a limit of zero for a limit: the platform is shut off', () => {
    const list = cards(0, [], [quota({ platform: 'gemini', weekly_limit_usd: 0 })])
    expect(platformsOf(list)).toEqual(['gemini'])
    expect(countPlatforms(list)).toBe(1)
    expect(quotaWindows(list[0].quota)).toMatchObject([{ name: 'weekly', isDisabled: true, percent: 100, tone: 'error' }])
  })

  it('puts platforms outside the fixed order after it, by name', () => {
    const list = cards(0.5, [usage('kimi', 0.3), usage('anthropic', 0.2)], [], 0)
    expect(platformsOf(list)).toEqual(['anthropic', 'kimi'])
    expect(platformLabel('kimi')).toBe('Kimi')
    expect(platformsOf(cards(0.6, [usage('zhipu', 0.2), usage('deepseek', 0.2), usage('kimi', 0.2)]))).toEqual([
      'deepseek',
      'kimi',
      'zhipu',
    ])
  })

  it('names TypeSafe by its Jev label and keeps it before the platforms outside the order', () => {
    const list = cards(0.5, [usage('kimi', 0.3), usage('typesafe', 0.2)], [], 0)
    expect(platformsOf(list)).toEqual(['typesafe', 'kimi'])
    expect(platformLabel('typesafe')).toBe('TypeSafe / Jev')
  })

  it('adds a card for what the platforms do not add up to, which is not counted as a platform', () => {
    const list = cards(1.0, [usage('anthropic', 0.4)], [], 0)
    expect(platformsOf(list)).toEqual(['anthropic', OTHER_PLATFORM])
    expect(countPlatforms(list)).toBe(1)
    expect(list[1].isOther).toBe(true)
    expect(list[1].totalCost).toBeCloseTo(0.6)
    // Today the platform alone spent more than the total says; nothing is left over, never less than nothing.
    expect(list[1]).toMatchObject({ todayCost: 0, requests: 0, tokens: 0 })
    expect(list[1].quota).toBeUndefined()
  })

  it('has no card at all when nothing was used and no limit is set', () => {
    expect(cards(0, [], [quota({ platform: 'anthropic' }), quota({ platform: 'openai' })])).toEqual([])
  })

  it('reads figures without a platform list as no platform used', () => {
    expect(buildPlatformCards({ total_actual_cost: 0, today_actual_cost: 0 }, [])).toEqual([])
    const list = buildPlatformCards({ total_actual_cost: 2, today_actual_cost: 1 }, [])
    expect(list).toEqual([{ platform: OTHER_PLATFORM, totalCost: 2, todayCost: 1, requests: 0, tokens: 0, isOther: true }])
  })

  it('adds the card for the rest when only today is short', () => {
    const list = buildPlatformCards(
      { total_actual_cost: 0.5, today_actual_cost: 0.3, by_platform: [{ ...usage('openai', 0.5), today_actual_cost: 0.1 }] },
      [],
    )
    expect(platformsOf(list)).toEqual(['openai', OTHER_PLATFORM])
    expect(list[1].totalCost).toBe(0)
    expect(list[1].todayCost).toBeCloseTo(0.2)
  })

  it('does not take a rounding difference for a missing share', () => {
    expect(platformsOf(cards(0.30005, [usage('openai', 0.1), usage('gemini', 0.2)]))).toEqual(['openai', 'gemini'])
    expect(platformsOf(cards(0.3002, [usage('openai', 0.1), usage('gemini', 0.2)]))).toEqual([
      'openai',
      'gemini',
      OTHER_PLATFORM,
    ])
  })

  it('shows a platform it has no label for by its id', () => {
    expect(platformLabel('anthropic')).toBe('Claude')
    expect(platformLabel('some-new-platform')).toBe('some-new-platform')
  })
})

describe('the quota of a platform', () => {
  it('has a limit when any of the three windows has one', () => {
    expect(hasAnyLimit(undefined)).toBe(false)
    expect(hasAnyLimit(quota({ platform: 'openai' }))).toBe(false)
    expect(hasAnyLimit(quota({ platform: 'openai', daily_limit_usd: 5 }))).toBe(true)
    expect(hasAnyLimit(quota({ platform: 'openai', weekly_limit_usd: 0 }))).toBe(true)
    expect(hasAnyLimit(quota({ platform: 'openai', monthly_limit_usd: 100 }))).toBe(true)
  })

  it('lists the windows that have a limit, shortest first', () => {
    const windows = quotaWindows(
      quota({
        platform: 'openai',
        monthly_limit_usd: 100,
        monthly_usage_usd: 96,
        daily_limit_usd: 20,
        daily_usage_usd: 7.5,
        daily_window_resets_at: '2026-11-23T00:00:00Z',
      }),
    )
    expect(windows).toEqual([
      { name: 'daily', limit: 20, usage: 7.5, percent: 38, tone: 'success', isDisabled: false, resetsAt: '2026-11-23T00:00:00Z' },
      { name: 'monthly', limit: 100, usage: 96, percent: 96, tone: 'error', isDisabled: false, resetsAt: null },
    ])
    expect(quotaWindows(undefined)).toEqual([])
  })

  it('does not say when a window that is shut off starts over', () => {
    const [window] = quotaWindows(
      quota({ platform: 'gemini', weekly_limit_usd: 0, weekly_usage_usd: 3, weekly_window_resets_at: '2026-11-23T00:00:00Z' }),
    )
    expect(window).toMatchObject({ isDisabled: true, percent: 100, tone: 'error', resetsAt: null })
  })

  it('works out how full a window is, in whole percent, from 0 to 100', () => {
    expect(quotaPercent(2.5, 10)).toBe(25)
    expect(quotaPercent(1, 3)).toBe(33)
    expect(quotaPercent(15, 10)).toBe(100)
    expect(quotaPercent(-1, 10)).toBe(0)
    expect(quotaPercent(5, 0)).toBe(0)
    expect(quotaPercent(5, -10)).toBe(0)
  })

  it('warns from three quarters and alarms from 95 percent', () => {
    expect(quotaTone(0)).toBe('success')
    expect(quotaTone(74)).toBe('success')
    expect(quotaTone(75)).toBe('warning')
    expect(quotaTone(94)).toBe('warning')
    expect(quotaTone(95)).toBe('error')
    expect(quotaTone(100)).toBe('error')
  })
})

describe('figures', () => {
  it('writes a balance with two decimals and grouped thousands', () => {
    expect(formatUsd(9999)).toBe('9,999.00')
    expect(formatUsd(7.5)).toBe('7.50')
    expect(formatUsd(0)).toBe('0.00')
    expect(formatUsd(Number.NaN)).toBe('0.00')
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('0.00')
  })

  it('writes a cost with four decimals', () => {
    expect(formatCost(0.34312)).toBe('0.3431')
    expect(formatCost(0)).toBe('0.0000')
    expect(formatCost(12)).toBe('12.0000')
  })

  it('shortens tokens from a thousand up', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1000)).toBe('1.0K')
    expect(formatTokens(103_700)).toBe('103.7K')
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(1_340_000)).toBe('1.3M')
  })

  it('writes a duration in milliseconds below a second and in seconds from there', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(999.4)).toBe('999ms')
    expect(formatDuration(1000)).toBe('1.00s')
    expect(formatDuration(2391)).toBe('2.39s')
  })

  it('writes when a window starts over as a day and a time on the 24-hour clock', () => {
    const morning = new Date(2026, 10, 23, 8, 5).toISOString()
    expect(formatResetTime(morning, 'zh')).toBe('11/23 08:05')
    expect(formatResetTime(morning, 'en')).toBe('11/23, 08:05')
    expect(formatResetTime(new Date(2026, 10, 23, 15, 30).toISOString(), 'en')).toBe('11/23, 15:30')
    // Midnight is 00:00, not 24:00.
    expect(formatResetTime(new Date(2026, 10, 23, 0, 0).toISOString(), 'en')).toBe('11/23, 00:00')
    expect(formatResetTime(new Date(2026, 10, 23, 0, 0).toISOString(), 'zh')).toBe('11/23 00:00')
  })

  it('shows a reset time it cannot read as it was sent', () => {
    expect(formatResetTime('soon')).toBe('soon')
  })
})

describe('the last days', () => {
  it('are whole calendar days where the browser is, today included', () => {
    expect(lastDaysRange(7, new Date(2026, 10, 22, 23, 59))).toEqual({ start: '2026-11-16', end: '2026-11-22' })
    expect(lastDaysRange(7, new Date(2026, 10, 22, 0, 1))).toEqual({ start: '2026-11-16', end: '2026-11-22' })
    expect(lastDaysRange(1, new Date(2026, 10, 22, 12))).toEqual({ start: '2026-11-22', end: '2026-11-22' })
  })

  it('reach back over the start of a month and of a year', () => {
    expect(lastDaysRange(7, new Date(2026, 2, 3, 9))).toEqual({ start: '2026-02-25', end: '2026-03-03' })
    expect(lastDaysRange(7, new Date(2027, 0, 2, 9))).toEqual({ start: '2026-12-27', end: '2027-01-02' })
  })
})
