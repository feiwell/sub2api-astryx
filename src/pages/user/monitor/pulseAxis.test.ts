import { describe, expect, it } from 'vitest'
import type { MonitorCoverage, MonitorHealth, MonitorMatrixBucket, MonitorMatrixRow, MonitorMetric } from '@/api/channelMonitorV2'
import { applyWheelZoom } from '@/features/channel-monitor-v2/monitorZoom'
import { alignRows, bucketRange, bucketSize, bucketStarts, moveCell, timeFormats, wheelTurn, zoomScope } from './pulseAxis'

/** An hour in five-minute intervals, unless told otherwise. */
function coverage(patch: Partial<MonitorCoverage> = {}): MonitorCoverage {
  return {
    requested_start: '2026-11-21T00:00:00Z',
    requested_end: '2026-11-21T01:00:00Z',
    coverage_start: '2026-11-21T00:00:00Z',
    data_through: '2026-11-21T01:00:00Z',
    computed_at: '2026-11-21T01:00:05Z',
    aggregation_lag_seconds: 5,
    coverage_complete: true,
    bucket_seconds: 300,
    ...patch,
  }
}

function bucket(start: string): MonitorMatrixBucket {
  return { bucket_start: start, metrics: {} as MonitorMetric, health: {} as MonitorHealth }
}

function row(buckets: MonitorMatrixBucket[]): MonitorMatrixRow {
  return { platform: 'openai', metrics: {} as MonitorMetric, health: {} as MonitorHealth, buckets }
}

describe('bucketStarts', () => {
  it('lists the start of every interval of the range, oldest first', () => {
    const starts = bucketStarts(coverage())
    expect(starts).toHaveLength(12)
    expect(starts[0]).toBe('2026-11-21T00:00:00.000Z')
    expect(starts[1]).toBe('2026-11-21T00:05:00.000Z')
    expect(starts[11]).toBe('2026-11-21T00:55:00.000Z')
  })

  it('begins with the interval the range starts in', () => {
    const starts = bucketStarts(coverage({ requested_start: '2026-11-21T00:02:30Z', requested_end: '2026-11-21T01:02:30Z' }))
    expect(starts).toHaveLength(13)
    expect(starts[0]).toBe('2026-11-21T00:00:00.000Z')
    expect(starts[12]).toBe('2026-11-21T01:00:00.000Z')
  })

  it('ends with the data when the server does not say where the range ends', () => {
    const starts = bucketStarts(coverage({ requested_end: undefined, data_through: '2026-11-21T00:30:00Z' }))
    expect(starts).toHaveLength(6)
    expect(starts[5]).toBe('2026-11-21T00:25:00.000Z')
  })

  it('never takes an interval for shorter than a minute', () => {
    expect(bucketStarts(coverage({ bucket_seconds: 10, requested_end: '2026-11-21T00:05:00Z' }))).toHaveLength(5)
  })

  it('is empty without a usable range', () => {
    expect(bucketStarts(null)).toEqual([])
    expect(bucketStarts(undefined)).toEqual([])
    expect(bucketStarts(coverage({ requested_start: 'nonsense' }))).toEqual([])
    expect(bucketStarts(coverage({ requested_start: '2026-11-21T02:00:00Z' }))).toEqual([])
  })
})

describe('zoomScope', () => {
  it('stays the same while a refresh moves the range forward', () => {
    const later = coverage({
      requested_start: '2026-11-21T00:01:10Z',
      requested_end: '2026-11-21T01:01:10Z',
      data_through: '2026-11-21T01:01:10Z',
    })
    expect(zoomScope(later)).toBe(zoomScope(coverage()))
    // The range that moved on does cut the axis into one interval more.
    expect(bucketStarts(later).length).not.toBe(bucketStarts(coverage()).length)
  })

  it('changes with the length of the range and with the length of an interval', () => {
    expect(zoomScope(coverage({ requested_end: '2026-11-21T06:00:00Z' }))).not.toBe(zoomScope(coverage()))
    expect(zoomScope(coverage({ bucket_seconds: 60 }))).not.toBe(zoomScope(coverage()))
  })

  it('is empty without a usable range', () => {
    expect(zoomScope(null)).toBe('')
    expect(zoomScope(coverage({ requested_start: 'nonsense' }))).toBe('')
  })
})

describe('alignRows', () => {
  const starts = bucketStarts(coverage({ requested_end: '2026-11-21T00:20:00Z' }))

  it('puts each interval of a row in its place on the axis and leaves the others empty', () => {
    const second = bucket('2026-11-21T00:05:00Z')
    // The same moment as 00:15 UTC, written with an offset.
    const fourth = bucket('2026-11-21T08:15:00+08:00')
    const [slots] = alignRows([row([fourth, second])], starts)
    expect(slots.map((slot) => slot.start)).toEqual(starts)
    expect(slots.map((slot) => slot.bucket)).toEqual([undefined, second, undefined, fourth])
  })

  it('leaves out intervals off the axis and intervals without a readable start', () => {
    const [slots] = alignRows([row([bucket('2026-11-20T23:55:00Z'), bucket('2026-11-21T00:20:00Z'), bucket('nonsense')])], starts)
    expect(slots.every((slot) => slot.bucket === undefined)).toBe(true)
  })

  it('gives every row a slot for each interval, also a row that has none', () => {
    const first = bucket('2026-11-21T00:00:00Z')
    const aligned = alignRows([row([first]), row(undefined as unknown as MonitorMatrixBucket[])], starts)
    expect(aligned).toHaveLength(2)
    expect(aligned[0][0].bucket).toBe(first)
    expect(aligned[1].map((slot) => slot.start)).toEqual(starts)
    expect(aligned[1].every((slot) => slot.bucket === undefined)).toBe(true)
  })

  it('has no slots when the axis is empty', () => {
    expect(alignRows([row([bucket('2026-11-21T00:00:00Z')])], [])).toEqual([[]])
  })
})

describe('bucketSize', () => {
  it('counts in minutes under an hour', () => {
    expect(bucketSize(60)).toEqual({ key: 'channelMonitorV2.bucket.minutes', count: 1 })
    expect(bucketSize(300)).toEqual({ key: 'channelMonitorV2.bucket.minutes', count: 5 })
  })

  it('counts in hours under a day', () => {
    expect(bucketSize(3600)).toEqual({ key: 'channelMonitorV2.bucket.hours', count: 1 })
    expect(bucketSize(21600)).toEqual({ key: 'channelMonitorV2.bucket.hours', count: 6 })
  })

  it('counts in days from a day on', () => {
    expect(bucketSize(86400)).toEqual({ key: 'channelMonitorV2.bucket.days', count: 1 })
    expect(bucketSize(172800)).toEqual({ key: 'channelMonitorV2.bucket.days', count: 2 })
  })

  it('has nothing to say without a length', () => {
    for (const seconds of [0, -60, null, undefined, Number.NaN]) expect(bucketSize(seconds)).toBeNull()
  })
})

describe('bucketRange', () => {
  const formats = timeFormats('zh', 'UTC')

  it('writes the day and time an interval starts and the time it ends', () => {
    expect(bucketRange('2026-11-21T08:00:00.000Z', 300, formats)).toBe('11/21 08:00 - 08:05')
    expect(bucketRange('2026-11-21T08:00:00.000Z', 3600, formats)).toBe('11/21 08:00 - 09:00')
  })

  it('gives the end as a time also when it falls on the next day', () => {
    expect(bucketRange('2026-11-21T23:55:00.000Z', 300, formats)).toBe('11/21 23:55 - 00:00')
  })
})

describe('moveCell', () => {
  const from = { row: 1, col: 2 }

  it('moves one block on with the arrows', () => {
    expect(moveCell(from, 'ArrowLeft', 3, 5)).toEqual({ row: 1, col: 1 })
    expect(moveCell(from, 'ArrowRight', 3, 5)).toEqual({ row: 1, col: 3 })
    expect(moveCell(from, 'ArrowUp', 3, 5)).toEqual({ row: 0, col: 2 })
    expect(moveCell(from, 'ArrowDown', 3, 5)).toEqual({ row: 2, col: 2 })
  })

  it('goes to the ends of the row with Home and End', () => {
    expect(moveCell(from, 'Home', 3, 5)).toEqual({ row: 1, col: 0 })
    expect(moveCell(from, 'End', 3, 5)).toEqual({ row: 1, col: 4 })
  })

  it('stops at the edges of the matrix', () => {
    expect(moveCell({ row: 0, col: 0 }, 'ArrowLeft', 3, 5)).toEqual({ row: 0, col: 0 })
    expect(moveCell({ row: 0, col: 0 }, 'ArrowUp', 3, 5)).toEqual({ row: 0, col: 0 })
    expect(moveCell({ row: 2, col: 4 }, 'ArrowRight', 3, 5)).toEqual({ row: 2, col: 4 })
    expect(moveCell({ row: 2, col: 4 }, 'ArrowDown', 3, 5)).toEqual({ row: 2, col: 4 })
  })

  it('comes back inside from a block that is no longer there', () => {
    expect(moveCell({ row: 9, col: 9 }, 'ArrowLeft', 3, 5)).toEqual({ row: 2, col: 3 })
  })

  it('does not move for any other key, or in an empty matrix', () => {
    expect(moveCell(from, 'Enter', 3, 5)).toBeNull()
    expect(moveCell(from, 'Tab', 3, 5)).toBeNull()
    expect(moveCell(from, 'ArrowLeft', 0, 5)).toBeNull()
    expect(moveCell(from, 'ArrowLeft', 3, 0)).toBeNull()
  })
})

describe('wheelTurn', () => {
  it('reads a Shift turn reported as sideways movement as one reported up or down', () => {
    expect(wheelTurn({ deltaX: 100, deltaY: 0, shiftKey: true })).toEqual({ deltaX: 0, deltaY: 100, shiftKey: true })
    expect(wheelTurn({ deltaX: -100, deltaY: 0, shiftKey: true })).toEqual({ deltaX: 0, deltaY: -100, shiftKey: true })
  })

  it('leaves every other turn as it is', () => {
    for (const turn of [
      { deltaX: 0, deltaY: 100, shiftKey: true },
      { deltaX: 0, deltaY: -100, shiftKey: false },
      { deltaX: 100, deltaY: 0, shiftKey: false },
      { deltaX: 30, deltaY: 100, shiftKey: true },
      { deltaX: 0, deltaY: 0, shiftKey: true },
    ]) {
      expect(wheelTurn(turn)).toEqual(turn)
    }
  })

  it('moves a zoomed range the same way in whichever form a Shift turn arrives', () => {
    const zoomed = { span: 0.5, offset: 0.2 }
    const upOrDown = applyWheelZoom(zoomed, wheelTurn({ deltaX: 0, deltaY: 100, shiftKey: true }), 0.5)
    const sideways = applyWheelZoom(zoomed, wheelTurn({ deltaX: 100, deltaY: 0, shiftKey: true }), 0.5)
    expect(upOrDown.offset).toBeCloseTo(0.325)
    expect(sideways).toEqual(upOrDown)
    // Read as it arrives, the sideways form moves nothing.
    expect(applyWheelZoom(zoomed, { deltaX: 100, deltaY: 0, shiftKey: true }, 0.5)).toEqual(zoomed)
  })
})
