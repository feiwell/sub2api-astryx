import type { OpsQueryMode } from '~/lib/api/admin/ops'

export type OpsPresetTimeRange = '5m' | '30m' | '1h' | '6h' | '24h'
export type OpsTimeRange = OpsPresetTimeRange | 'custom'
export type RealtimeWindow = '1min' | '5min' | '30min' | '1h'

export const OPS_PRESET_TIME_RANGES: readonly OpsPresetTimeRange[] = ['5m', '30m', '1h', '6h', '24h']
export const DEFAULT_TIME_RANGE: OpsTimeRange = '1h'

const TIME_RANGES: readonly string[] = [...OPS_PRESET_TIME_RANGES, 'custom']
const QUERY_MODES: readonly string[] = ['auto', 'raw', 'preagg']

/** A custom window as two ISO instants. It is not kept in the URL, so a reload falls back to the last hour. */
export interface OpsCustomRange {
  start: string
  end: string
}

export interface OpsFilters {
  timeRange: OpsTimeRange
  platform: string
  groupId: number | null
  queryMode: OpsQueryMode
}

/** The filters a user can change from the toolbar. */
export type OpsFilterChange = Partial<Pick<OpsFilters, 'timeRange' | 'platform' | 'groupId'>>

export interface OpsApiParams {
  time_range?: OpsPresetTimeRange
  start_time?: string
  end_time?: string
  platform?: string
  group_id?: number
  mode?: OpsQueryMode
}

/** Same query keys as the Vue page, so links into the ops page keep working. */
const QUERY_KEYS = {
  timeRange: 'tr',
  platform: 'platform',
  groupId: 'group_id',
  queryMode: 'mode',
} as const

export function readOpsFilters(params: URLSearchParams, defaultQueryMode: string): OpsFilters {
  const timeRange = params.get(QUERY_KEYS.timeRange) ?? ''
  const groupId = Number.parseInt(params.get(QUERY_KEYS.groupId) ?? '', 10)
  const mode = params.get(QUERY_KEYS.queryMode) ?? ''
  const queryMode = QUERY_MODES.includes(mode) ? mode : QUERY_MODES.includes(defaultQueryMode) ? defaultQueryMode : 'auto'
  return {
    timeRange: TIME_RANGES.includes(timeRange) ? (timeRange as OpsTimeRange) : DEFAULT_TIME_RANGE,
    platform: params.get(QUERY_KEYS.platform) ?? '',
    groupId: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
    queryMode: queryMode as OpsQueryMode,
  }
}

/** A copy of `params` with the changed filters applied. Default values are left out of the URL. */
export function withOpsFilters(params: URLSearchParams, change: OpsFilterChange): URLSearchParams {
  const next = new URLSearchParams(params)
  const put = (key: string, value: string) => {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  if (change.timeRange !== undefined) {
    put(QUERY_KEYS.timeRange, change.timeRange === DEFAULT_TIME_RANGE ? '' : change.timeRange)
  }
  if (change.platform !== undefined) put(QUERY_KEYS.platform, change.platform)
  if (change.groupId !== undefined) put(QUERY_KEYS.groupId, change.groupId ? String(change.groupId) : '')
  return next
}

/** The time window as query parameters: a preset by its name, a custom window by its two ends. */
export function buildOpsWindowParams(
  timeRange: OpsTimeRange,
  custom: OpsCustomRange | null,
): Pick<OpsApiParams, 'time_range' | 'start_time' | 'end_time'> {
  if (timeRange !== 'custom') return { time_range: timeRange }
  // The backend knows no "custom": without a picked window (after a reload) it gets the last hour.
  return custom ? { start_time: custom.start, end_time: custom.end } : { time_range: '1h' }
}

export function buildOpsApiParams(filters: OpsFilters, custom: OpsCustomRange | null): OpsApiParams {
  return {
    platform: filters.platform || undefined,
    group_id: filters.groupId ?? undefined,
    mode: filters.queryMode,
    ...buildOpsWindowParams(filters.timeRange, custom),
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `2026-11-20T09:30` in local time: the value format of DateTimeInput. */
export function toLocalDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `11-20 09:30 ~ 11-20 10:30`, shown beside "custom" in the time range selector. */
export function formatCustomRange(range: OpsCustomRange): string {
  const short = (iso: string) => {
    const date = new Date(iso)
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  return `${short(range.start)} ~ ${short(range.end)}`
}

const REALTIME_WINDOWS: ReadonlyArray<{ value: RealtimeWindow; minutes: number }> = [
  { value: '1min', minutes: 1 },
  { value: '5min', minutes: 5 },
  { value: '30min', minutes: 30 },
  { value: '1h', minutes: 60 },
]

const TIME_RANGE_MINUTES: Record<OpsPresetTimeRange, number> = {
  '5m': 5,
  '30m': 30,
  '1h': 60,
  '6h': 6 * 60,
  '24h': 24 * 60,
}

/** Minutes a time range spans. "custom" counts as the hour that stands in for a window nobody picked. */
export function timeRangeMinutes(timeRange: OpsTimeRange): number {
  return timeRange === 'custom' ? 60 : TIME_RANGE_MINUTES[timeRange]
}

/** The window as two instants. A preset window ends now, so every call moves it forward. */
export function resolveOpsWindow(timeRange: OpsTimeRange, custom: OpsCustomRange | null): OpsCustomRange {
  if (timeRange === 'custom' && custom) return custom
  const end = new Date()
  const start = new Date(end.getTime() - timeRangeMinutes(timeRange) * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Whether the window reaches a full day: chart labels then carry the date beside the time of day. */
export function reachesADay(timeRange: OpsTimeRange, custom: OpsCustomRange | null): boolean {
  if (timeRange !== 'custom') return TIME_RANGE_MINUTES[timeRange] >= 24 * 60
  if (!custom) return false
  return new Date(custom.end).getTime() - new Date(custom.start).getTime() >= 24 * 60 * 60 * 1000
}

/** The realtime window never reaches past the page's time range. */
export function realtimeWindowsFor(timeRange: OpsTimeRange): RealtimeWindow[] {
  const limit = timeRangeMinutes(timeRange)
  return REALTIME_WINDOWS.filter((window) => window.minutes <= limit).map((window) => window.value)
}
