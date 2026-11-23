import type { DateRange, ISODateString } from '@astryxdesign/core/Calendar'
import type { ModelStat, UsageQueryParams, UsageRequestType, UserErrorListParams } from '@/types'
import { requestTypeToLegacyStream } from '@/utils/usageRequestType'

export type Granularity = 'day' | 'hour'

export interface UsageSort {
  by: string
  order: 'asc' | 'desc'
}

/** Newest first: the order both lists open in. */
export const NEWEST_FIRST: UsageSort = { by: 'created_at', order: 'desc' }
const OLDEST_FIRST: UsageSort = { by: 'created_at', order: 'asc' }

/**
 * The order a click on a sortable header leaves a list in. `picked` is the order the table asks for, null when
 * the click cleared it. A list always has an order: clearing gives newest first, and clearing newest first
 * itself turns it around, or a click on the time header would change nothing.
 */
export function nextSort(current: UsageSort, picked: UsageSort | null): UsageSort {
  if (picked) return picked
  return current.by === NEWEST_FIRST.by && current.order === NEWEST_FIRST.order ? OLDEST_FIRST : NEWEST_FIRST
}

/** What the list, the figures above it and the charts are narrowed to. `null` means "not filtered by this". */
export interface UsageFilters {
  range: DateRange
  apiKeyId: number | null
  model: string | null
  groupId: number | null
  requestType: UsageRequestType | null
  /** Only natively compacted requests. The API has no filter for the opposite. */
  isCompactedOnly: boolean
  billingType: number | null
  billingMode: string | null
}

/** The filters of the failed-requests list. It shares the date range of the usage filters. */
export interface UsageErrorFilters {
  apiKeyId: number | null
  /** Any part of a model name; the server matches loosely. */
  model: string
  category: string | null
  statusCode: number | null
}

export const USAGE_ERROR_CATEGORIES = [
  'auth',
  'rate_limit',
  'quota',
  'invalid_request',
  'service_unavailable',
  'upstream',
  'internal',
  'cyber',
]

const DAY_MS = 24 * 60 * 60 * 1000

const twoDigits = (value: number) => String(value).padStart(2, '0')
/** The calendar day of a moment where the browser is, not in UTC: a range is picked and sent in local days. */
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}` as ISODateString
const daysBefore = (now: Date, days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
const lastDays = (now: Date, days: number): DateRange => ({ start: isoDate(daysBefore(now, days - 1)), end: isoDate(now) })

/** The range the page opens on: the calendar days the last 24 hours fall on. */
export function last24HoursRange(now = new Date()): DateRange {
  return { start: isoDate(new Date(now.getTime() - DAY_MS)), end: isoDate(now) }
}

/**
 * The quick ranges of the date picker, by the i18n key of their name. Each is worked out when it is picked, so
 * "today" is still today on a page left open overnight.
 */
export const USAGE_RANGE_PRESETS: { labelKey: string; range: (now?: Date) => DateRange }[] = [
  { labelKey: 'dates.today', range: (now = new Date()) => lastDays(now, 1) },
  {
    labelKey: 'dates.yesterday',
    range: (now = new Date()) => {
      const yesterday = isoDate(daysBefore(now, 1))
      return { start: yesterday, end: yesterday }
    },
  },
  { labelKey: 'dates.last24Hours', range: last24HoursRange },
  { labelKey: 'dates.last7Days', range: (now = new Date()) => lastDays(now, 7) },
  { labelKey: 'dates.last14Days', range: (now = new Date()) => lastDays(now, 14) },
  { labelKey: 'dates.last30Days', range: (now = new Date()) => lastDays(now, 30) },
  {
    labelKey: 'dates.thisMonth',
    range: (now = new Date()) => ({ start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(now) }),
  },
  {
    labelKey: 'dates.lastMonth',
    range: (now = new Date()) => ({
      start: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    }),
  },
]

/**
 * The last day that can be picked. Tomorrow rather than today: the server's "today" is already tomorrow for a
 * user in a time zone behind it.
 */
export function latestPickableDate(now = new Date()): ISODateString {
  return isoDate(daysBefore(now, -1))
}

/** One point per hour while the range ends at most a day after it starts; one per day beyond that. */
export function granularityForRange(range: DateRange): Granularity {
  const start = new Date(`${range.start}T00:00:00`).getTime()
  const end = new Date(`${range.end}T00:00:00`).getTime()
  return Math.ceil((end - start) / DAY_MS) <= 1 ? 'hour' : 'day'
}

export function emptyUsageFilters(now = new Date()): UsageFilters {
  return {
    range: last24HoursRange(now),
    apiKeyId: null,
    model: null,
    groupId: null,
    requestType: null,
    isCompactedOnly: false,
    billingType: null,
    billingMode: null,
  }
}

export function emptyUsageErrorFilters(): UsageErrorFilters {
  return { apiKeyId: null, model: '', category: null, statusCode: null }
}

/** The filters as the usage endpoints take them. A filter that is not set is left out. */
export function buildUsageFilterParams(filters: UsageFilters): UsageQueryParams {
  return {
    start_date: filters.range.start,
    end_date: filters.range.end,
    api_key_id: filters.apiKeyId ?? undefined,
    model: filters.model ?? undefined,
    group_id: filters.groupId ?? undefined,
    request_type: filters.requestType ?? undefined,
    // Sent beside request_type for servers that only know the older flag; a type with no such meaning sends none.
    stream: requestTypeToLegacyStream(filters.requestType) ?? undefined,
    native_compaction_v2: filters.isCompactedOnly ? true : undefined,
    billing_type: filters.billingType ?? undefined,
    billing_mode: filters.billingMode ?? undefined,
  }
}

export function buildUsageListParams(
  filters: UsageFilters,
  page: number,
  pageSize: number,
  sort: UsageSort,
): UsageQueryParams {
  return { page, page_size: pageSize, ...buildUsageFilterParams(filters), sort_by: sort.by, sort_order: sort.order }
}

export function buildUsageErrorParams(
  range: DateRange,
  filters: UsageErrorFilters,
  page: number,
  pageSize: number,
  sort: UsageSort,
): UserErrorListParams {
  return {
    page,
    page_size: pageSize,
    start_date: range.start,
    end_date: range.end,
    model: filters.model.trim() || undefined,
    category: filters.category ?? undefined,
    api_key_id: filters.apiKeyId ?? undefined,
    status_code: filters.statusCode ?? undefined,
    sort_by: sort.by,
    sort_order: sort.order,
  }
}

/**
 * The model names the filter offers: every name seen so far plus the one filtered by, in alphabetical order.
 * Names are kept across loads because a load narrowed to one model reports only that model.
 */
export function mergeModelOptions(known: string[], stats: Pick<ModelStat, 'model'>[], current: string | null): string[] {
  const names = new Set(known)
  for (const item of stats) {
    if (item.model) names.add(item.model)
  }
  if (current) names.add(current)
  return [...names].sort()
}
