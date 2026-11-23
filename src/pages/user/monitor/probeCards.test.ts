import { describe, expect, it } from 'vitest'
import type { MonitorTimelinePoint, UserMonitorDetail, UserMonitorModelDetail } from '@/api/channelMonitor'
import {
  availabilityFill,
  checkText,
  moveBar,
  overallStatus,
  relativeTime,
  timelineBars,
  windowAvailability,
} from './probeCards'
import { BAND_FILLS, UNKNOWN_FILL } from './pulseScale'

const NOW = Date.parse('2026-11-21T08:00:00Z')

/** Says which text was asked for, and with what. */
const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}(${String(params.n)})` : key)

function point(status: string, secondsAgo = 0, latency: number | null = 400): MonitorTimelinePoint {
  return {
    status,
    latency_ms: latency,
    ping_latency_ms: null,
    checked_at: new Date(NOW - secondsAgo * 1000).toISOString(),
  } as MonitorTimelinePoint
}

function detail(...models: Array<Partial<UserMonitorModelDetail>>): Pick<UserMonitorDetail, 'models'> {
  return { models: models as UserMonitorModelDetail[] }
}

describe('overallStatus', () => {
  it('is operational when the latest check of every monitor passed', () => {
    expect(overallStatus([{ primary_status: 'operational' }, { primary_status: 'operational' }])).toBe('operational')
  })

  it('is degraded as soon as one monitor did not pass', () => {
    expect(overallStatus([{ primary_status: 'operational' }, { primary_status: 'degraded' }])).toBe('degraded')
    expect(overallStatus([{ primary_status: 'failed' }])).toBe('degraded')
    expect(overallStatus([{ primary_status: 'error' }])).toBe('degraded')
  })

  it('counts a monitor that was never checked as not passing', () => {
    expect(overallStatus([{ primary_status: '' }])).toBe('degraded')
  })

  it('finds nothing wrong where there are no monitors', () => {
    expect(overallStatus([])).toBe('operational')
  })
})

describe('windowAvailability', () => {
  const item = { primary_model: 'gpt-5', primary_status: 'operational', availability_7d: 99.456 } as const
  const longer = detail(
    { model: 'gpt-5-mini', availability_15d: 50, availability_30d: 40 },
    { model: 'gpt-5', availability_15d: 98.1, availability_30d: 97.25 },
  )

  it('reads the seven days from the list', () => {
    expect(windowAvailability(item, '7d', undefined)).toBe(99.456)
    expect(windowAvailability(item, '7d', longer)).toBe(99.456)
  })

  it('reads the longer windows from the main model of the detail', () => {
    expect(windowAvailability(item, '15d', longer)).toBe(98.1)
    expect(windowAvailability(item, '30d', longer)).toBe(97.25)
  })

  it('has no value while the detail is not here', () => {
    expect(windowAvailability(item, '15d', undefined)).toBeNull()
    expect(windowAvailability(item, '30d', undefined)).toBeNull()
  })

  it('has no value when the detail lacks the main model', () => {
    expect(windowAvailability(item, '15d', detail({ model: 'gpt-5-mini', availability_15d: 50 }))).toBeNull()
    expect(windowAvailability(item, '30d', detail())).toBeNull()
  })

  it('has no value for a monitor that was never checked, whatever number came with it', () => {
    const unchecked = { primary_model: 'gpt-5', primary_status: '', availability_7d: 0 } as const
    expect(windowAvailability(unchecked, '7d', undefined)).toBeNull()
    expect(windowAvailability(unchecked, '30d', longer)).toBeNull()
  })

  it('keeps a real 0% apart from no value', () => {
    const down = { primary_model: 'gpt-5', primary_status: 'failed', availability_7d: 0 } as const
    expect(windowAvailability(down, '7d', undefined)).toBe(0)
    expect(windowAvailability(down, '15d', detail({ model: 'gpt-5', availability_15d: 0 }))).toBe(0)
  })
})

describe('availabilityFill', () => {
  it('puts each availability in the band of the matrix scale it rounds to', () => {
    expect(availabilityFill(100)).toBe(BAND_FILLS[10])
    expect(availabilityFill(99.456)).toBe(BAND_FILLS[10])
    expect(availabilityFill(95)).toBe(BAND_FILLS[10])
    expect(availabilityFill(94.9)).toBe(BAND_FILLS[9])
    expect(availabilityFill(61.2)).toBe(BAND_FILLS[6])
    expect(availabilityFill(4.9)).toBe(BAND_FILLS[0])
    expect(availabilityFill(0)).toBe(BAND_FILLS[0])
  })

  it('keeps a number outside 0 to 100 on the scale', () => {
    expect(availabilityFill(140)).toBe(BAND_FILLS[10])
    expect(availabilityFill(-3)).toBe(BAND_FILLS[0])
  })

  it('is the neutral fill where there is no value', () => {
    expect(availabilityFill(null)).toBe(UNKNOWN_FILL)
    expect(availabilityFill(undefined)).toBe(UNKNOWN_FILL)
    expect(availabilityFill(Number.NaN)).toBe(UNKNOWN_FILL)
  })
})

describe('timelineBars', () => {
  it('puts the newest check last', () => {
    const newest = point('failed', 0)
    const middle = point('degraded', 60)
    const oldest = point('operational', 120)
    const bars = timelineBars([newest, middle, oldest], 3)
    expect(bars.map((bar) => bar.point)).toEqual([oldest, middle, newest])
  })

  it('fills the places before the first check with empty bars', () => {
    const only = point('operational')
    const bars = timelineBars([only], 4)
    expect(bars).toHaveLength(4)
    expect(bars.slice(0, 3).map((bar) => bar.point)).toEqual([null, null, null])
    expect(bars.slice(0, 3).every((bar) => bar.fill === UNKNOWN_FILL && bar.height === '15%')).toBe(true)
    expect(bars[3].point).toBe(only)
  })

  it('keeps the newest checks when there are more than fit', () => {
    const points = Array.from({ length: 70 }, (_, index) => point('operational', index * 60))
    const bars = timelineBars(points)
    expect(bars).toHaveLength(60)
    expect(bars[59].point).toBe(points[0])
    expect(bars[0].point).toBe(points[59])
  })

  it('makes a bar taller the better the check went', () => {
    const [error, failed, degraded, operational] = timelineBars(
      [point('operational'), point('degraded'), point('failed'), point('error')],
      4,
    )
    expect([operational.height, degraded.height, failed.height, error.height]).toEqual(['100%', '65%', '35%', '35%'])
    expect([operational.fill, degraded.fill, failed.fill, error.fill]).toEqual([
      BAND_FILLS[10],
      BAND_FILLS[6],
      BAND_FILLS[2],
      BAND_FILLS[2],
    ])
  })

  it('draws a check with a result it does not know as an empty bar that still stands for the check', () => {
    const odd = point('paused')
    const [bar] = timelineBars([odd], 1)
    expect(bar).toEqual({ point: odd, fill: UNKNOWN_FILL, height: '15%' })
  })

  it('is all empty bars for a monitor without checks', () => {
    expect(timelineBars([], 3).map((bar) => bar.point)).toEqual([null, null, null])
    expect(timelineBars(null, 2)).toHaveLength(2)
    expect(timelineBars(undefined)).toHaveLength(60)
  })

  it('does not change the checks it was given', () => {
    const points = [point('failed', 0), point('operational', 60)]
    const copy = [...points]
    timelineBars(points, 2)
    expect(points).toEqual(copy)
  })
})

describe('relativeTime', () => {
  const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

  it('uses the largest unit that fits', () => {
    expect(relativeTime(ago(0), NOW, t)).toBe('monitorCommon.relativeSecondsAgo(0)')
    expect(relativeTime(ago(59), NOW, t)).toBe('monitorCommon.relativeSecondsAgo(59)')
    expect(relativeTime(ago(60), NOW, t)).toBe('monitorCommon.relativeMinutesAgo(1)')
    expect(relativeTime(ago(3599), NOW, t)).toBe('monitorCommon.relativeMinutesAgo(59)')
    expect(relativeTime(ago(3600), NOW, t)).toBe('monitorCommon.relativeHoursAgo(1)')
    expect(relativeTime(ago(86399), NOW, t)).toBe('monitorCommon.relativeHoursAgo(23)')
    expect(relativeTime(ago(86400), NOW, t)).toBe('monitorCommon.relativeDaysAgo(1)')
    expect(relativeTime(ago(86400 * 9 + 5), NOW, t)).toBe('monitorCommon.relativeDaysAgo(9)')
  })

  it('counts a time ahead of the clock of this machine as now', () => {
    expect(relativeTime(ago(-30), NOW, t)).toBe('monitorCommon.relativeSecondsAgo(0)')
  })

  it('shows the dash for a time that is missing or cannot be read', () => {
    expect(relativeTime('', NOW, t)).toBe('monitorCommon.latencyEmpty')
    expect(relativeTime(null, NOW, t)).toBe('monitorCommon.latencyEmpty')
    expect(relativeTime('yesterday-ish', NOW, t)).toBe('monitorCommon.latencyEmpty')
  })
})

describe('checkText', () => {
  it('says when the check was, how it went and how long the answer took', () => {
    expect(checkText(point('degraded', 125, 812.4), NOW, t)).toBe(
      'monitorCommon.relativeMinutesAgo(2) · monitorCommon.status.degraded · 812 ms',
    )
  })

  it('shows the dash without a unit for a check that timed nothing', () => {
    expect(checkText(point('failed', 5, null), NOW, t)).toBe(
      'monitorCommon.relativeSecondsAgo(5) · monitorCommon.status.failed · monitorCommon.latencyEmpty',
    )
  })
})

describe('moveBar', () => {
  it('steps one bar with the arrow keys', () => {
    expect(moveBar(57, 'ArrowLeft', 50, 59)).toBe(56)
    expect(moveBar(57, 'ArrowRight', 50, 59)).toBe(58)
  })

  it('jumps to the oldest and the newest check', () => {
    expect(moveBar(57, 'Home', 50, 59)).toBe(50)
    expect(moveBar(57, 'End', 50, 59)).toBe(59)
  })

  it('stays where it is at either end', () => {
    expect(moveBar(50, 'ArrowLeft', 50, 59)).toBeNull()
    expect(moveBar(59, 'ArrowRight', 50, 59)).toBeNull()
    expect(moveBar(50, 'Home', 50, 59)).toBeNull()
    expect(moveBar(59, 'End', 50, 59)).toBeNull()
  })

  it('never lands on a place without a check', () => {
    expect(moveBar(50, 'ArrowLeft', 50, 59)).toBeNull()
    expect(moveBar(3, 'ArrowRight', 50, 59)).toBe(50)
  })

  it('leaves other keys alone', () => {
    expect(moveBar(57, 'ArrowUp', 50, 59)).toBeNull()
    expect(moveBar(57, 'Enter', 50, 59)).toBeNull()
    expect(moveBar(57, ' ', 50, 59)).toBeNull()
  })

  it('goes nowhere on a timeline without checks', () => {
    expect(moveBar(0, 'ArrowRight', -1, -1)).toBeNull()
    expect(moveBar(0, 'End', 5, 2)).toBeNull()
  })
})
