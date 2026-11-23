import type { AdminUsageQueryParams } from '@/api/admin/usage'
import type { AdminUsageLog, PaginatedResponse } from '@/types'
import { requestTypeLabelKey } from '@/utils/errorBadges'
import { formatReasoningEffort } from '@/utils/format'
import { resolveUsageRequestType } from '@/utils/usageRequestType'
import { escapeCsvValue } from '~/pages/user/usage/usageExport'

/** How many rows one request of the export asks for. */
export const ADMIN_EXPORT_PAGE_SIZE = 100

type Translate = (key: string) => string

/** The columns of the exported file, in the words of the page. They are the ones the Vue page exports. */
export function adminExportHeaders(t: Translate): string[] {
  return [
    t('usage.time'),
    t('admin.usage.user'),
    t('usage.apiKeyFilter'),
    t('admin.usage.account'),
    t('usage.requestedModel'),
    t('usage.sentUpstreamModel'),
    t('usage.upstreamResponseModel'),
    t('usage.upstreamModelMismatch'),
    t('usage.requestedReasoningEffort'),
    t('usage.reasoningEffort'),
    t('admin.usage.group'),
    t('usage.inboundEndpoint'),
    t('usage.upstreamEndpoint'),
    t('usage.type'),
    t('admin.usage.inputTokens'),
    t('admin.usage.outputTokens'),
    t('admin.usage.cacheReadTokens'),
    t('admin.usage.cacheCreationTokens'),
    t('admin.usage.inputCost'),
    t('admin.usage.outputCost'),
    t('admin.usage.cacheReadCost'),
    t('admin.usage.cacheCreationCost'),
    t('usage.rate'),
    t('usage.accountMultiplier'),
    t('usage.original'),
    t('usage.userBilled'),
    t('usage.accountBilled'),
    t('usage.firstToken'),
    t('usage.duration'),
    t('admin.usage.requestId'),
    t('admin.usage.upstreamRequestId'),
    t('usage.userAgent'),
    t('admin.usage.ipAddress'),
  ]
}

const money = (value: number | null | undefined) => (value ?? 0).toFixed(6)

/** One request as a line of the file: a value for each of the headers above. */
export function adminExportRow(log: AdminUsageLog, t: Translate): unknown[] {
  const accountMultiplier = log.account_rate_multiplier ?? 1
  const wasAnsweredAsAnotherModel =
    log.upstream_model_mismatch == null ? '' : log.upstream_model_mismatch ? t('common.yes') : t('common.no')
  return [
    log.created_at,
    log.user?.email || '',
    log.api_key?.name || '',
    log.account?.name || '',
    log.model,
    // A request sent on under the name it came with has no upstream model of its own.
    log.upstream_model || log.model,
    log.upstream_response_model || '',
    wasAnsweredAsAnotherModel,
    formatReasoningEffort(log.reasoning_effort),
    formatReasoningEffort(log.upstream_reasoning_effort || log.reasoning_effort),
    log.group?.name || '',
    log.inbound_endpoint || '',
    log.upstream_endpoint || '',
    t(requestTypeLabelKey(resolveUsageRequestType(log))),
    log.input_tokens,
    log.output_tokens,
    log.cache_read_tokens,
    log.cache_creation_tokens,
    money(log.input_cost),
    money(log.output_cost),
    money(log.cache_read_cost),
    money(log.cache_creation_cost),
    (log.rate_multiplier ?? 1).toPrecision(4),
    accountMultiplier.toPrecision(4),
    money(log.total_cost),
    money(log.actual_cost),
    // What the account was charged: its own cost where the account is counted apart, times its multiplier.
    ((log.account_stats_cost ?? log.total_cost ?? 0) * accountMultiplier).toFixed(6),
    log.first_token_ms ?? '',
    log.duration_ms ?? '',
    log.request_id || '',
    log.upstream_request_id || '',
    log.user_agent || '',
    log.ip_address || '',
  ]
}

export function buildAdminUsageCsv(logs: AdminUsageLog[], t: Translate): string {
  const lines = [adminExportHeaders(t), ...logs.map((log) => adminExportRow(log, t))]
  return lines.map((fields) => fields.map(escapeCsvValue).join(',')).join('\n')
}

/** How far an export is, in whole percent. Nothing is known to be done before the first page says how many rows there are. */
export function exportPercent(current: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
}

/**
 * Every row of the list under `params`, asked for a page at a time. The first answer says how many rows there
 * are, counted exactly; `onProgress` is told after each page. Null when `isCancelled` says so once a page is in:
 * the rows fetched so far are dropped.
 */
export async function fetchAllAdminUsageLogs({
  params,
  query,
  isCancelled,
  onProgress,
}: {
  params: AdminUsageQueryParams
  query: (params: AdminUsageQueryParams) => Promise<PaginatedResponse<AdminUsageLog>>
  isCancelled: () => boolean
  onProgress: (current: number, total: number) => void
}): Promise<AdminUsageLog[] | null> {
  const logs: AdminUsageLog[] = []
  let total = 0
  for (let page = 1; ; page++) {
    const answer = await query({ ...params, page, page_size: ADMIN_EXPORT_PAGE_SIZE, exact_total: true })
    if (isCancelled()) return null
    const items = answer.items || []
    // Rows that arrive while the export runs do not move its goal.
    if (page === 1) total = answer.total || 0
    logs.push(...items)
    onProgress(logs.length, total)
    // A short page is the last one, whatever the count said.
    if (logs.length >= total || items.length < ADMIN_EXPORT_PAGE_SIZE) return logs
  }
}
