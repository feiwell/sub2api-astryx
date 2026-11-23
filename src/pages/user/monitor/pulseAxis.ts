import type { MonitorCoverage, MonitorMatrixBucket, MonitorMatrixRow } from '@/api/channelMonitorV2'

/** One interval of a row: when it starts, and what was measured in it if the row saw traffic then. */
export interface PulseSlot {
  start: string
  bucket?: MonitorMatrixBucket
}

interface AxisBounds {
  start: number
  end: number
  step: number
}

/** The chosen range in milliseconds, or null when the server did not send a usable one. */
function axisBounds(coverage: MonitorCoverage | null | undefined): AxisBounds | null {
  if (!coverage) return null
  const step = Math.max(60, coverage.bucket_seconds || 0) * 1000
  const start = new Date(coverage.requested_start).getTime()
  const requestedEnd = coverage.requested_end ? new Date(coverage.requested_end).getTime() : Number.NaN
  // An older server does not say where the range ends; the data it has then marks the end.
  const end = Number.isFinite(requestedEnd) && requestedEnd > start ? requestedEnd : new Date(coverage.data_through).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null
  return { start, end, step }
}

/**
 * The start of every interval of the chosen range, oldest first. The axis covers the whole range even where
 * nothing was measured, so an interval without traffic keeps its place.
 */
export function bucketStarts(coverage: MonitorCoverage | null | undefined): string[] {
  const bounds = axisBounds(coverage)
  if (!bounds) return []
  const starts: string[] = []
  for (let cursor = Math.floor(bounds.start / bounds.step) * bounds.step; cursor < bounds.end; cursor += bounds.step) {
    starts.push(new Date(cursor).toISOString())
  }
  return starts
}

/**
 * Names the axis a zoom belongs to: how long the range is and how long one interval. A refresh moves the same
 * range forward and keeps the name, so a zoom survives it; choosing another range changes the name.
 */
export function zoomScope(coverage: MonitorCoverage | null | undefined): string {
  const bounds = axisBounds(coverage)
  if (!bounds) return ''
  return `${bounds.step / 1000}:${Math.round((bounds.end - bounds.start) / bounds.step)}`
}

/** The intervals of each row laid along the axis. Where a row has nothing for an interval the slot stays empty. */
export function alignRows(rows: readonly MonitorMatrixRow[], starts: readonly string[]): PulseSlot[][] {
  const indexByStart = new Map(starts.map((start, index) => [start, index]))
  return rows.map((row) => {
    const slots: PulseSlot[] = starts.map((start) => ({ start }))
    for (const bucket of row.buckets || []) {
      const time = new Date(bucket.bucket_start).getTime()
      if (!Number.isFinite(time)) continue
      const index = indexByStart.get(new Date(time).toISOString())
      if (index != null) slots[index] = { start: starts[index], bucket }
    }
    return slots
  })
}

/** How long one interval is, in the largest unit that leaves it under a day: the key of the text and the number. */
export function bucketSize(bucketSeconds: number | null | undefined): { key: string; count: number } | null {
  if (!bucketSeconds || !Number.isFinite(bucketSeconds) || bucketSeconds <= 0) return null
  const minutes = bucketSeconds / 60
  if (minutes < 60) return { key: 'channelMonitorV2.bucket.minutes', count: minutes }
  const hours = minutes / 60
  if (hours < 24) return { key: 'channelMonitorV2.bucket.hours', count: hours }
  return { key: 'channelMonitorV2.bucket.days', count: hours / 24 }
}

export interface TimeFormats {
  /** Day and time, for the ends of the axis and the start of an interval. */
  axis: Intl.DateTimeFormat
  /** Time alone, for the end of an interval. */
  clock: Intl.DateTimeFormat
}

/** The two ways a moment on the axis is written. Building them once spares doing so for every block. */
export function timeFormats(locale: string, timeZone?: string): TimeFormats {
  return {
    axis: new Intl.DateTimeFormat(locale || undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone }),
    clock: new Intl.DateTimeFormat(locale || undefined, { hour: '2-digit', minute: '2-digit', timeZone }),
  }
}

/** From when to when an interval runs: day and time of its start, time of its end. */
export function bucketRange(start: string, bucketSeconds: number, formats: TimeFormats): string {
  const from = new Date(start)
  const to = new Date(from.getTime() + (bucketSeconds || 0) * 1000)
  return `${formats.axis.format(from)} - ${formats.clock.format(to)}`
}

export interface CellPosition {
  row: number
  col: number
}

/**
 * Where a key moves the keyboard from a block: the arrows go one block on within the matrix, Home and End go
 * to the ends of the row. Null for a key that does not move.
 */
export function moveCell(from: CellPosition, key: string, rowCount: number, colCount: number): CellPosition | null {
  if (rowCount <= 0 || colCount <= 0) return null
  const row = Math.min(rowCount - 1, Math.max(0, from.row))
  const col = Math.min(colCount - 1, Math.max(0, from.col))
  if (key === 'ArrowLeft') return { row, col: Math.max(0, col - 1) }
  if (key === 'ArrowRight') return { row, col: Math.min(colCount - 1, col + 1) }
  if (key === 'ArrowUp') return { row: Math.max(0, row - 1), col }
  if (key === 'ArrowDown') return { row: Math.min(rowCount - 1, row + 1), col }
  if (key === 'Home') return { row, col: 0 }
  if (key === 'End') return { row, col: colCount - 1 }
  return null
}

export type WheelTurn = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'shiftKey'>

/**
 * A turn of the wheel in the one form the zoom reads. With Shift held, some browsers report the turn as
 * movement sideways and others as movement up or down with the key noted. The zoom takes the amount of a
 * Shift turn from its movement up or down, and would find none in the first form.
 */
export function wheelTurn(event: WheelTurn): WheelTurn {
  if (event.shiftKey && event.deltaY === 0 && event.deltaX !== 0) return { deltaX: 0, deltaY: event.deltaX, shiftKey: true }
  return { deltaX: event.deltaX, deltaY: event.deltaY, shiftKey: event.shiftKey }
}
