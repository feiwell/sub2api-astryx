import type { AuditLogQuery } from '~/lib/api/admin/audit'

/** Preset windows, by the names the ops page gives them (`admin.ops.timeRange.*`). Each ends now. */
export const AUDIT_PRESET_RANGES = ['30m', '1h', '6h', '24h', '7d', '30d'] as const
export type AuditPresetRange = (typeof AUDIT_PRESET_RANGES)[number]
/** '' is the whole log. */
export type AuditTimeRange = '' | AuditPresetRange | 'custom'

const RANGE_MINUTES: Record<AuditPresetRange, number> = {
  '30m': 30,
  '1h': 60,
  '6h': 6 * 60,
  '24h': 24 * 60,
  '7d': 7 * 24 * 60,
  '30d': 30 * 24 * 60,
}

/** A window picked by hand, as local date-times (`2026-11-20T09:30`). */
export interface AuditCustomRange {
  start: string
  end: string
}

export interface AuditFilters {
  /** Matches the path, the action or the operator's email. */
  q: string
  actor_email: string
  action: string
  client_ip: string
  /** HTTP method, '' for any. */
  method: string
  auth_method: string
  /** 'true' for operations that succeeded, 'false' for those that failed, '' for both. */
  success: string
  timeRange: AuditTimeRange
  /** Read only while the time range is "custom"; kept otherwise, to start the next pick from. */
  customRange: AuditCustomRange | null
}

export const emptyAuditFilters = (): AuditFilters => ({
  q: '',
  actor_email: '',
  action: '',
  client_ip: '',
  method: '',
  auth_method: '',
  success: '',
  timeRange: '',
  customRange: null,
})

export const isPresetRange = (value: string): value is AuditPresetRange =>
  (AUDIT_PRESET_RANGES as readonly string[]).includes(value)

const pad = (value: number) => String(value).padStart(2, '0')

/** A moment as the local date-time a date-and-time input holds. */
export const toLocalDateTime = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`

/** `11-20 09:30 ~ 11-20 10:30`, shown beside "custom" in the time range selector. */
export function formatCustomRange(range: AuditCustomRange): string {
  const short = (local: string) => {
    const date = new Date(local)
    if (Number.isNaN(date.getTime())) return local
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  return `${short(range.start)} ~ ${short(range.end)}`
}

const toInstant = (local: string | undefined): string | undefined => {
  if (!local) return undefined
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function windowOf(filters: AuditFilters, now: number): Pick<AuditLogQuery, 'start_time' | 'end_time'> {
  if (filters.timeRange === '') return {}
  if (filters.timeRange === 'custom') {
    return { start_time: toInstant(filters.customRange?.start), end_time: toInstant(filters.customRange?.end) }
  }
  // A preset window is left open-ended, so it takes in what gets logged while the request is on its way.
  return { start_time: new Date(now - RANGE_MINUTES[filters.timeRange] * 60 * 1000).toISOString() }
}

/** The query for one page of the log, as AuditLogView.vue sends it: a filter left empty is left out. */
export function buildAuditQuery(
  filters: AuditFilters,
  page: number,
  pageSize: number,
  now: number = Date.now(),
): AuditLogQuery {
  const text = (value: string) => value.trim() || undefined
  return {
    page,
    page_size: pageSize,
    q: text(filters.q),
    actor_email: text(filters.actor_email),
    action: text(filters.action),
    client_ip: text(filters.client_ip),
    method: filters.method || undefined,
    auth_method: filters.auth_method || undefined,
    success: filters.success || undefined,
    ...windowOf(filters, now),
  }
}
