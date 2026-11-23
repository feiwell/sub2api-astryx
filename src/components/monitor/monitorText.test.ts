import { describe, expect, it } from 'vitest'
import {
  checkModeLabel,
  formatAvailability,
  formatLatency,
  formatLatencyMs,
  formatMonitorModel,
  formatPercent,
  providerLabel,
  quotaBalances,
  quotaResetText,
  quotaTierLabel,
  quotaUsedLevel,
  quotaUsedText,
  statusLabel,
} from './monitorText'

// Stands in for the text lookup: answers with the key it was asked for.
const t = (key: string) => key
const hasEvery = () => true
const hasNone = () => false

const NOW = Date.parse('2026-11-21T12:00:00Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const at = (offset: number) => new Date(NOW + offset).toISOString()

describe('the name of a check result', () => {
  it('is looked up by the status', () => {
    expect(statusLabel('operational', t)).toBe('monitorCommon.status.operational')
    expect(statusLabel('failed', t)).toBe('monitorCommon.status.failed')
  })

  it('is the one of "unknown" for a monitor that was never checked', () => {
    expect(statusLabel('', t)).toBe('monitorCommon.status.unknown')
    expect(statusLabel(null, t)).toBe('monitorCommon.status.unknown')
    expect(statusLabel(undefined, t)).toBe('monitorCommon.status.unknown')
  })
})

describe('the name of a provider', () => {
  it('is looked up for a provider this app knows', () => {
    expect(providerLabel('openai', t)).toBe('monitorCommon.providers.openai')
    expect(providerLabel('opencode_go', t)).toBe('monitorCommon.providers.opencode_go')
  })

  it('is the name the server uses for one it does not know', () => {
    expect(providerLabel('some-new-provider', t)).toBe('some-new-provider')
  })

  it('is a dash when there is none', () => {
    expect(providerLabel('', t)).toBe('-')
    expect(providerLabel(null, t)).toBe('-')
  })
})

describe('the name of the way a monitor checks', () => {
  it('is looked up for the three ways there are', () => {
    expect(checkModeLabel('probe', t)).toBe('monitorCommon.checkMode.probe')
    expect(checkModeLabel('quota', t)).toBe('monitorCommon.checkMode.quota')
    expect(checkModeLabel('quota_probe', t)).toBe('monitorCommon.checkMode.quota_probe')
  })

  it('is "probe" for a monitor saved without one', () => {
    expect(checkModeLabel('', t)).toBe('monitorCommon.checkMode.probe')
    expect(checkModeLabel(undefined, t)).toBe('monitorCommon.checkMode.probe')
  })

  it('is the word the server sent for a way this app does not know', () => {
    expect(checkModeLabel('ping', t)).toBe('ping')
  })
})

describe('the model of a monitor', () => {
  it('is shown as it is', () => {
    expect(formatMonitorModel('gpt-5', t)).toBe('gpt-5')
  })

  it('is "quota" in words for a monitor that checks no model', () => {
    expect(formatMonitorModel('quota', t)).toBe('monitorCommon.checkMode.quota')
  })
})

describe('a latency', () => {
  it('is rounded to whole milliseconds', () => {
    expect(formatLatency(123.6, t)).toBe('124')
    expect(formatLatency(0, t)).toBe('0')
    expect(formatLatencyMs(123.6, t)).toBe('124 ms')
  })

  it('is the empty mark when none was measured, without a unit after it', () => {
    expect(formatLatency(null, t)).toBe('monitorCommon.latencyEmpty')
    expect(formatLatency(undefined, t)).toBe('monitorCommon.latencyEmpty')
    expect(formatLatencyMs(null, t)).toBe('monitorCommon.latencyEmpty')
  })
})

describe('a share in percent', () => {
  it('has two decimals', () => {
    expect(formatPercent(99.456)).toBe('99.46%')
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('is a dash when there is no number', () => {
    expect(formatPercent(null)).toBe('-')
    expect(formatPercent(undefined)).toBe('-')
    expect(formatPercent(Number.NaN)).toBe('-')
  })
})

describe('the availability of a monitor', () => {
  it('is the share of the last seven days once the monitor was checked', () => {
    expect(formatAvailability({ primary_status: 'operational', availability_7d: 99.5 })).toBe('99.50%')
    expect(formatAvailability({ primary_status: 'failed', availability_7d: 0 })).toBe('0.00%')
  })

  it('is a dash, not 0%, for a monitor that was never checked', () => {
    expect(formatAvailability({ primary_status: '', availability_7d: 0 })).toBe('-')
  })

  it('is a dash when the server sent no share', () => {
    expect(formatAvailability({ primary_status: 'operational', availability_7d: null })).toBe('-')
  })
})

describe('what a window of a quota is called', () => {
  it('is the window when the server names nothing it counts', () => {
    expect(quotaTierLabel({ window: '5h' }, t, hasEvery)).toBe('monitorCommon.quota.windows.5h')
    expect(quotaTierLabel({ window: '7d-sonnet' }, t, hasEvery)).toBe('monitorCommon.quota.windows.7dSonnet')
  })

  it('has what the window counts before it', () => {
    expect(quotaTierLabel({ window: '7d', label: 'pro' }, t, hasEvery)).toBe(
      'monitorCommon.quota.labels.pro/monitorCommon.quota.windows.7d',
    )
  })

  it('shows a word this app does not know as it came', () => {
    expect(quotaTierLabel({ window: '90d' }, t, hasEvery)).toBe('90d')
    expect(quotaTierLabel({ window: 'daily', label: 'gemini-3-pro' }, t, hasEvery)).toBe(
      'gemini-3-pro/monitorCommon.quota.windows.daily',
    )
  })

  it('shows a word as it came when the language on show has no text for it', () => {
    expect(quotaTierLabel({ window: '5h', label: 'pro' }, t, hasNone)).toBe('pro/5h')
  })

  it('does not take the name of something every object has for a known word', () => {
    expect(quotaTierLabel({ window: 'constructor', label: 'toString' }, t, hasEvery)).toBe('toString/constructor')
  })
})

describe('how much of a window is used', () => {
  it('is shown in whole percent', () => {
    expect(quotaUsedText(42.4)).toBe('42%')
    expect(quotaUsedText(0)).toBe('0%')
    expect(quotaUsedText(130)).toBe('130%')
  })

  it('is cut short far past the quota', () => {
    expect(quotaUsedText(999.4)).toBe('999%')
    expect(quotaUsedText(1500)).toBe('>999%')
  })

  it('warns from three quarters and is an error from nine tenths', () => {
    expect(quotaUsedLevel(0)).toBe('success')
    expect(quotaUsedLevel(74.9)).toBe('success')
    expect(quotaUsedLevel(75)).toBe('warning')
    expect(quotaUsedLevel(89.9)).toBe('warning')
    expect(quotaUsedLevel(90)).toBe('error')
    expect(quotaUsedLevel(250)).toBe('error')
  })
})

describe('when a window starts over', () => {
  it('is nothing when the server gave no time, or one that cannot be read', () => {
    expect(quotaResetText({ used_percent: 10 }, NOW, t)).toBeNull()
    expect(quotaResetText({ used_percent: 10, reset_at: '' }, NOW, t)).toBeNull()
    expect(quotaResetText({ used_percent: 10, reset_at: 'soon' }, NOW, t)).toBeNull()
  })

  it('is counted in minutes, then hours and minutes, then days and hours', () => {
    expect(quotaResetText({ used_percent: 10, reset_at: at(30 * MINUTE) }, NOW, t)).toBe('30m')
    expect(quotaResetText({ used_percent: 10, reset_at: at(2 * HOUR + 5 * MINUTE) }, NOW, t)).toBe('2h 5m')
    expect(quotaResetText({ used_percent: 10, reset_at: at(49 * HOUR + 20 * MINUTE) }, NOW, t)).toBe('2d 1h')
    expect(quotaResetText({ used_percent: 10, reset_at: at(24 * HOUR) }, NOW, t)).toBe('1d 0h')
  })

  it('is "pending" once the time has passed with usage still counted', () => {
    expect(quotaResetText({ used_percent: 10, reset_at: at(-MINUTE) }, NOW, t)).toBe('usage.resetPending')
    expect(quotaResetText({ used_percent: 10, reset_at: at(0) }, NOW, t)).toBe('usage.resetPending')
  })

  it('is "now" once the time has passed and nothing is used', () => {
    expect(quotaResetText({ used_percent: 0, reset_at: at(-MINUTE) }, NOW, t)).toBe('usage.resetNow')
  })
})

describe('the balances of a quota', () => {
  it('are the ones listed by currency when the server lists them', () => {
    const balances = [
      { currency: 'CNY', balance: 12.5 },
      { currency: 'USD', balance: 0 },
    ]
    expect(quotaBalances({ balances, balance: 99, currency: 'EUR' })).toEqual(balances)
  })

  it('is the single one otherwise, a zero one too', () => {
    expect(quotaBalances({ balance: 3.2, currency: 'CNY' })).toEqual([{ currency: 'CNY', balance: 3.2 }])
    expect(quotaBalances({ balances: [], balance: 0, currency: 'USD' })).toEqual([{ currency: 'USD', balance: 0 }])
  })

  it('marks a balance that came without its currency', () => {
    expect(quotaBalances({ balance: 5 })).toEqual([{ currency: '?', balance: 5 }])
  })

  it('is empty when the server sent none', () => {
    expect(quotaBalances({})).toEqual([])
    expect(quotaBalances({ balance: null })).toEqual([])
  })
})
