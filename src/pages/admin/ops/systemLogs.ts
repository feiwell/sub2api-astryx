import type {
  OpsRuntimeLogConfig,
  OpsSystemLog,
  OpsSystemLogCleanupRequest,
  OpsSystemLogQuery,
} from '~/lib/api/admin/ops'

export type SystemLogTimeRange = NonNullable<OpsSystemLogQuery['time_range']>
export type LogLevelVariant = 'error' | 'warning' | 'info' | 'neutral'

export const SYSTEM_LOG_TIME_RANGES: readonly SystemLogTimeRange[] = ['5m', '30m', '1h', '6h', '24h', '7d', '30d']
export const DEFAULT_SYSTEM_LOG_TIME_RANGE: SystemLogTimeRange = '1h'

/** The filter fields of the system log, each as the text its field holds. */
export interface SystemLogFilters {
  timeRange: SystemLogTimeRange
  /** Local date and time as the date field gives it (`2026-11-20T09:30`); '' when not set. */
  startTime: string
  endTime: string
  host: string
  level: string
  component: string
  requestId: string
  clientRequestId: string
  userId: string
  apiKeyId: string
  accountId: string
  platform: string
  model: string
  keyword: string
}

/** No filter but the last hour, and the platform the page is narrowed to. */
export function initialSystemLogFilters(platform: string): SystemLogFilters {
  return {
    timeRange: DEFAULT_SYSTEM_LOG_TIME_RANGE,
    startTime: '',
    endTime: '',
    host: '',
    level: '',
    component: '',
    requestId: '',
    clientRequestId: '',
    userId: '',
    apiKeyId: '',
    accountId: '',
    platform,
    model: '',
    keyword: '',
  }
}

const text = (value: string): string | undefined => value.trim() || undefined

/** A local date and time as an instant; undefined when the field is empty or unreadable. */
function instant(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** An id typed by hand; anything but a positive whole number is no filter. */
function positiveId(value: string): number | undefined {
  const id = Number.parseInt(value.trim(), 10)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

const RANGE_MINUTES: Record<SystemLogTimeRange, number> = {
  '5m': 5,
  '30m': 30,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  '7d': 10080,
  '30d': 43200,
}

/** The fields a list request and a cleanup both send. The quick time range is not among them. */
function sharedConditions(filters: SystemLogFilters): OpsSystemLogCleanupRequest {
  return {
    start_time: instant(filters.startTime),
    end_time: instant(filters.endTime),
    host: text(filters.host),
    level: text(filters.level),
    component: text(filters.component),
    request_id: text(filters.requestId),
    client_request_id: text(filters.clientRequestId),
    user_id: positiveId(filters.userId),
    api_key_id: positiveId(filters.apiKeyId),
    account_id: positiveId(filters.accountId),
    platform: text(filters.platform),
    model: text(filters.model),
    q: text(filters.keyword),
  }
}

/** True when a field other than the quick time range is filled in: a cleanup asks for at least one. */
export function hasCleanupCondition(filters: SystemLogFilters): boolean {
  return describeSystemLogCleanup(sharedConditions(filters)).length > 0
}

/**
 * What a cleanup matches on: the logs the list shows. With neither a start nor an end time,
 * the quick time range bounds it, sent as the start time it stands for at `now`.
 */
export function buildSystemLogCleanup(filters: SystemLogFilters, now: number = Date.now()): OpsSystemLogCleanupRequest {
  const request = sharedConditions(filters)
  if (!request.start_time && !request.end_time) {
    request.start_time = new Date(now - RANGE_MINUTES[filters.timeRange] * 60_000).toISOString()
  }
  return request
}

/** The conditions of a cleanup as `key=value` pairs, for the question asked before it runs. */
export function describeSystemLogCleanup(request: OpsSystemLogCleanupRequest): string[] {
  return Object.entries(request)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
}

export function buildSystemLogQuery(filters: SystemLogFilters, page: number, pageSize: number): OpsSystemLogQuery {
  return { page, page_size: pageSize, time_range: filters.timeRange, ...sharedConditions(filters) }
}

function extraText(extra: OpsSystemLog['extra'], key: string): string {
  const value: unknown = extra?.[key]
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const pairs = (entries: Array<[string, string | number | null | undefined]>, skipEmpty: boolean): string =>
  entries
    .filter(([, value]) => (skipEmpty ? !!value : value != null))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')

/**
 * A log entry as one text: its message, the access fields, the ids to follow it by, then its errors.
 * Two spaces part the groups; the text wraps wherever the column ends.
 */
export function formatSystemLogDetail(log: OpsSystemLog): string {
  const { extra } = log
  const access = pairs(
    [
      ['status', extraText(extra, 'status_code')],
      ['latency_ms', extraText(extra, 'latency_ms')],
      ['method', extraText(extra, 'method')],
      ['path', extraText(extra, 'path')],
      ['ip', extraText(extra, 'client_ip')],
      ['proto', extraText(extra, 'protocol')],
    ],
    true,
  )
  const requestIds = pairs(
    [
      ['req', log.request_id],
      ['client_req', log.client_request_id],
    ],
    true,
  )
  // An id of 0 is still an id: only a missing one is left out.
  const ownerIds = pairs(
    [
      ['user', log.user_id],
      ['key', log.api_key_id],
      ['acc', log.account_id],
    ],
    false,
  )
  const origin = pairs(
    [
      ['platform', log.platform],
      ['model', log.model],
    ],
    true,
  )
  const errors = extraText(extra, 'errors')
  const error = extraText(extra, 'err') || extraText(extra, 'error')
  return [
    String(log.message || '').trim(),
    access,
    [requestIds, ownerIds, origin].filter(Boolean).join(' '),
    errors && `errors=${errors}`,
    error && `error=${error}`,
  ]
    .filter(Boolean)
    .join('  ')
}

/** Errors red, warnings amber, debug grey, everything else blue. */
export function logLevelVariant(level: string): LogLevelVariant {
  const name = String(level || '').toLowerCase()
  if (name === 'error' || name === 'fatal') return 'error'
  if (name === 'warn' || name === 'warning') return 'warning'
  if (name === 'debug') return 'neutral'
  return 'info'
}

export const RETENTION_PRESETS: readonly number[] = [1, 3, 7, 14, 30, 60, 90, 180, 365]
export const MAX_RETENTION_DAYS = 3650
/** Request logs kept for 0 days are kept for good. */
export const KEEP_FOREVER = 0

export type RuntimeLogSettings = Pick<
  OpsRuntimeLogConfig,
  | 'level'
  | 'persist_access_logs'
  | 'enable_sampling'
  | 'sampling_initial'
  | 'sampling_thereafter'
  | 'caller'
  | 'stacktrace_level'
  | 'retention_days'
  | 'request_retention_days'
>

/** What the form shows until the server answers. */
export const DEFAULT_RUNTIME_LOG_SETTINGS: RuntimeLogSettings = {
  level: 'info',
  persist_access_logs: false,
  enable_sampling: false,
  sampling_initial: 100,
  sampling_thereafter: 100,
  caller: true,
  stacktrace_level: 'error',
  retention_days: 30,
  request_retention_days: 90,
}

/** The fields the form edits. An older server sends no request log retention: it reads as 90 days. */
export function runtimeLogSettings(config: OpsRuntimeLogConfig): RuntimeLogSettings {
  return {
    level: config.level,
    persist_access_logs: config.persist_access_logs,
    enable_sampling: config.enable_sampling,
    sampling_initial: config.sampling_initial,
    sampling_thereafter: config.sampling_thereafter,
    caller: config.caller,
    stacktrace_level: config.stacktrace_level,
    retention_days: config.retention_days,
    request_retention_days: config.request_retention_days ?? 90,
  }
}

/** Ops logs are kept 1 to 3650 days; request logs as long, or for good. */
export function isRetentionValid(settings: Pick<RuntimeLogSettings, 'retention_days' | 'request_retention_days'>): boolean {
  const isWithin = (days: number, min: number) => Number.isInteger(days) && days >= min && days <= MAX_RETENTION_DAYS
  return isWithin(settings.retention_days, 1) && isWithin(settings.request_retention_days, KEEP_FOREVER)
}
