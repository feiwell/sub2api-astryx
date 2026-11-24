import type { DateRange, ISODateString } from '@astryxdesign/core/Calendar'
import type { DashboardSnapshotV2Params, ModelStatsParams, UserBreakdownParams } from '@/api/admin/dashboard'
import type { OpsErrorListQueryParams } from '@/api/admin/ops'
import type { AdminUsageQueryParams, CreateUsageCleanupTaskRequest } from '@/api/admin/usage'
import type { UsageRequestType } from '@/types'
import { requestTypeToLegacyStream } from '@/utils/usageRequestType'
import { type Granularity, type UsageSort } from '~/pages/user/usage/usageQuery'

/** Something picked from a search box: the id that is sent and the name shown for it. */
export interface PickedOption {
  id: number
  label: string
}

export type ModelSource = 'requested' | 'upstream' | 'mapping'
export type EndpointSource = 'inbound' | 'upstream' | 'path'
export type RankingSortKey = NonNullable<UserBreakdownParams['sort_by']>

/** What the admin usage page is narrowed to. `null` means "not filtered by this". */
export interface AdminUsageFilters {
  range: DateRange
  user: PickedOption | null
  apiKey: PickedOption | null
  account: PickedOption | null
  model: string | null
  groupId: number | null
  requestType: UsageRequestType | null
  /** Only natively compacted requests. The API has no filter for the opposite. */
  isCompactedOnly: boolean
  billingType: number | null
  /** Narrows the list and the figure cards only: the charts and the ranking cannot be asked by billing mode. */
  billingMode: string | null
  /** True: only requests the upstream answered as another model. False: only those answered as asked. */
  hasModelMismatch: boolean | null
  /** Where a failed request went wrong. This and the two below narrow the failed requests only. */
  errorPhase: string | null
  errorCategory: string | null
  statusCode: number | null
}

/** The day the admin usage page opens on: today only, in the browser's local calendar. */
export function todayRange(now = new Date()): DateRange {
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` as ISODateString
  return { start: day, end: day }
}

export function emptyAdminUsageFilters(now = new Date()): AdminUsageFilters {
  return {
    range: todayRange(now),
    user: null,
    apiKey: null,
    account: null,
    model: null,
    groupId: null,
    requestType: null,
    isCompactedOnly: false,
    billingType: null,
    billingMode: null,
    hasModelMismatch: null,
    errorPhase: null,
    errorCategory: null,
    statusCode: null,
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The filters a link to the page asks for: `?user_id=7&start_date=2026-03-01&end_date=2026-03-08`. A user comes
 * with its id as its name until the page has looked the user up; a date that is not a calendar day is ignored.
 */
export function filtersFromRoute(search: string, now = new Date()): AdminUsageFilters {
  const query = new URLSearchParams(search)
  const filters = emptyAdminUsageFilters(now)
  const day = (name: string) => {
    const value = query.get(name) ?? ''
    return ISO_DAY.test(value) ? (value as ISODateString) : null
  }
  const userId = Number(query.get('user_id') || NaN)
  // A link may carry only one end of the range. The page now opens on today, so an
  // end_date in the past would leave start > end; clamp the start to the end.
  const start = day('start_date') ?? filters.range.start
  const end = day('end_date') ?? filters.range.end
  const range: DateRange = start > end ? { start: end, end } : { start, end }
  return {
    ...filters,
    range,
    user: Number.isFinite(userId) && userId > 0 ? { id: userId, label: String(userId) } : null,
  }
}

/** The filters every usage figure can be asked by: the list, the cards, the charts. A filter not set is left out. */
function sharedParams(filters: AdminUsageFilters): ModelStatsParams {
  return {
    start_date: filters.range.start,
    end_date: filters.range.end,
    user_id: filters.user?.id,
    api_key_id: filters.apiKey?.id,
    account_id: filters.account?.id,
    group_id: filters.groupId ?? undefined,
    model: filters.model ?? undefined,
    request_type: filters.requestType ?? undefined,
    // Sent beside request_type for servers that only know the older flag; a type with no such meaning sends none.
    stream: requestTypeToLegacyStream(filters.requestType) ?? undefined,
    native_compaction_v2: filters.isCompactedOnly ? true : undefined,
    billing_type: filters.billingType ?? undefined,
    upstream_model_mismatch: filters.hasModelMismatch ?? undefined,
  }
}

/** The filters as the list and the figure cards take them. */
export function buildAdminUsageParams(filters: AdminUsageFilters): AdminUsageQueryParams {
  return { ...sharedParams(filters), billing_mode: filters.billingMode ?? undefined }
}

/**
 * One page of the list. `isTotalExact` asks the server to count every matching row instead of estimating: the
 * export needs the true number, a page of the table does not.
 */
export function buildAdminListParams(
  filters: AdminUsageFilters,
  page: number,
  pageSize: number,
  sort: UsageSort,
  isTotalExact: boolean,
): AdminUsageQueryParams {
  return {
    page,
    page_size: pageSize,
    exact_total: isTotalExact,
    ...buildAdminUsageParams(filters),
    sort_by: sort.by,
    sort_order: sort.order,
  }
}

/** The model distribution, by the model asked for, the one sent upstream, or the mapping between the two. */
export function buildModelStatsParams(filters: AdminUsageFilters, source: ModelSource): ModelStatsParams {
  return { ...sharedParams(filters), model_source: source }
}

/** The token trend and the group distribution, which come in one answer. */
export function buildSnapshotParams(filters: AdminUsageFilters, granularity: Granularity): DashboardSnapshotV2Params {
  return {
    ...sharedParams(filters),
    granularity,
    include_stats: false,
    include_trend: true,
    include_model_stats: false,
    include_group_stats: true,
    include_users_trend: false,
  }
}

/** The filters usage can be split by user under. Fewer than the list takes: no billing mode, no model audit. */
function perUserParams(filters: AdminUsageFilters): UserBreakdownParams {
  return {
    start_date: filters.range.start,
    end_date: filters.range.end,
    user_id: filters.user?.id,
    api_key_id: filters.apiKey?.id,
    account_id: filters.account?.id,
    group_id: filters.groupId ?? undefined,
    model: filters.model ?? undefined,
    request_type: filters.requestType ?? undefined,
    native_compaction_v2: filters.isCompactedOnly ? true : undefined,
    billing_type: filters.billingType ?? undefined,
  }
}

/** The users who used the most. */
export function buildUserRankingParams(
  filters: AdminUsageFilters,
  sortBy: RankingSortKey,
  limit: number,
): UserBreakdownParams {
  return { ...perUserParams(filters), sort_by: sortBy, limit }
}

/** One row of a distribution chart: a model or an endpoint as its chart counts them, or a group. */
export type DistributionRowRef =
  | { model: string; source: ModelSource }
  | { groupId: number }
  | { endpoint: string; source: EndpointSource }

/** The users behind one row of a distribution chart. The row takes the place of the page's filter of its kind. */
export function buildUserBreakdownParams(filters: AdminUsageFilters, row: DistributionRowRef): UserBreakdownParams {
  const params = perUserParams(filters)
  if ('model' in row) return { ...params, model: row.model, model_source: row.source }
  if ('groupId' in row) return { ...params, group_id: row.groupId }
  return { ...params, endpoint: row.endpoint, endpoint_type: row.source }
}

/**
 * The filters a list of the users behind a chart row was asked under, as text. A list asked under other ones is
 * out of date, whichever row it is behind.
 */
export function userBreakdownScope(filters: AdminUsageFilters): string {
  return JSON.stringify(perUserParams(filters))
}

/**
 * The moment a calendar day starts or ends where the browser is, as the error log takes it. The day is read as
 * local time on purpose, like every other date of the page.
 */
function dayBound(day: string, isEnd: boolean): string {
  return new Date(`${day}${isEnd ? 'T23:59:59.999' : 'T00:00:00'}`).toISOString()
}

/** One page of the failed requests. They share the page's filters except the ones that only fit a successful request. */
export function buildAdminErrorParams(
  filters: AdminUsageFilters,
  page: number,
  pageSize: number,
  sort: UsageSort,
): OpsErrorListQueryParams {
  return {
    page,
    page_size: pageSize,
    view: 'all',
    start_time: dayBound(filters.range.start, false),
    end_time: dayBound(filters.range.end, true),
    user_id: filters.user?.id,
    api_key_id: filters.apiKey?.id,
    account_id: filters.account?.id,
    group_id: filters.groupId ?? undefined,
    model: filters.model ?? undefined,
    phase: filters.errorPhase ?? undefined,
    category: filters.errorCategory ?? undefined,
    status_codes: filters.statusCode == null ? undefined : String(filters.statusCode),
    sort_by: sort.by,
    sort_order: sort.order,
  }
}

/** The filters a cleanup task can delete by. The others cannot narrow a cleanup and must not be offered for one. */
export type CleanupFilters = Pick<
  AdminUsageFilters,
  'range' | 'user' | 'apiKey' | 'account' | 'model' | 'groupId' | 'requestType' | 'billingType'
>

export function cleanupFiltersOf(filters: AdminUsageFilters): CleanupFilters {
  const { range, user, apiKey, account, model, groupId, requestType, billingType } = filters
  return { range, user, apiKey, account, model, groupId, requestType, billingType }
}

/** What a cleanup task is created with: every usage record the filters match, in the days of the range, is deleted. */
export function buildCleanupRequest(filters: CleanupFilters, timezone: string): CreateUsageCleanupTaskRequest {
  const request: CreateUsageCleanupTaskRequest = {
    start_date: filters.range.start,
    end_date: filters.range.end,
    timezone,
  }
  if (filters.user) request.user_id = filters.user.id
  if (filters.apiKey) request.api_key_id = filters.apiKey.id
  if (filters.account) request.account_id = filters.account.id
  if (filters.groupId != null) request.group_id = filters.groupId
  if (filters.model) request.model = filters.model
  if (filters.requestType) {
    request.request_type = filters.requestType
    const stream = requestTypeToLegacyStream(filters.requestType)
    if (stream != null) request.stream = stream
  }
  if (filters.billingType != null) request.billing_type = filters.billingType
  return request
}
