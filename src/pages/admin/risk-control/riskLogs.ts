import type { ContentModerationLog, ListContentModerationLogsParams } from '~/lib/api/admin/riskControl'
import { formatMs, formatScore } from './riskFormat'
import { engineLabel } from './riskModel'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** What a record shows where it has nothing to tell. */
export const NO_VALUE = '-'

/** The filters of the audit records, as the fields hold them. A filter left empty takes in everything. */
export interface RiskLogFilters {
  /** 'hit' (flagged), 'blocked' (refused), 'pass' or 'error'. */
  result: string
  /** A group id, as text. */
  group_id: string
  endpoint: string
  /** Looked for in the user, the API key, the model, the request id and the input. */
  search: string
  /** Local date-times as a date-and-time input holds them (`2026-11-20T09:30`). */
  from: string
  to: string
}

export const emptyLogFilters = (): RiskLogFilters => ({
  result: '',
  group_id: '',
  endpoint: '',
  search: '',
  from: '',
  to: '',
})

/** The endpoints the audit covers. */
export const LOG_ENDPOINTS: readonly string[] = [
  '/v1/messages',
  '/v1/responses',
  '/v1/chat/completions',
  '/v1beta/models',
  '/v1/images/generations',
  '/v1/images/edits',
]

const toInstant = (local: string): string | undefined => {
  if (!local) return undefined
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** The query for one page of records, as RiskControlView.vue sends it: a filter left empty is left out. */
export function buildLogQuery(filters: RiskLogFilters, page: number, pageSize: number): ListContentModerationLogsParams {
  const groupId = Number(filters.group_id)
  return {
    page,
    page_size: pageSize,
    result: filters.result || undefined,
    group_id: Number.isInteger(groupId) && groupId > 0 ? groupId : undefined,
    endpoint: filters.endpoint || undefined,
    search: filters.search.trim() || undefined,
    from: toInstant(filters.from),
    to: toInstant(filters.to),
  }
}

export type LogOutcome = 'cyberPolicy' | 'keywordBlock' | 'block' | 'error' | 'hit' | 'pass'

/**
 * How a record ended, read in the order RiskControlView.vue reads it: a refused request first,
 * then an audit that failed, then a hit that was let through. A request refused for repeating a
 * known input (`hash_block`) has no name of its own there and reads as a hit.
 */
export function logOutcome(log: Pick<ContentModerationLog, 'action' | 'error' | 'flagged'>): LogOutcome {
  if (log.action === 'cyber_policy') return 'cyberPolicy'
  if (log.action === 'keyword_block') return 'keywordBlock'
  if (log.action === 'block') return 'block'
  if (log.action === 'error' || log.error) return 'error'
  if (log.flagged) return 'hit'
  return 'pass'
}

export function outcomeLabel(outcome: LogOutcome, t: Translate): string {
  switch (outcome) {
    case 'cyberPolicy':
      return t('admin.riskControl.action.cyberPolicy')
    case 'keywordBlock':
      return t('admin.riskControl.action.keywordBlock')
    case 'block':
      return t('admin.riskControl.action.block')
    case 'error':
      return t('admin.riskControl.action.error')
    case 'hit':
      return t('admin.riskControl.result.hit')
    default:
      return t('admin.riskControl.result.pass')
  }
}

/** A refused request red, a failed audit amber, a hit that went through pink, the rest green. */
export const outcomeVariant = (outcome: LogOutcome): 'error' | 'warning' | 'pink' | 'success' =>
  outcome === 'error' ? 'warning' : outcome === 'hit' ? 'pink' : outcome === 'pass' ? 'success' : 'error'

/** Who sent the request, under the email: the user id and the name of the API key. */
export const callerText = (log: Pick<ContentModerationLog, 'user_id' | 'api_key_name'>): string =>
  [log.user_id ? `UID ${log.user_id}` : '', log.api_key_name].filter(Boolean).join(' · ')

/** Where the request went: `anthropic / claude-sonnet-4-5`. */
export const routeText = (log: Pick<ContentModerationLog, 'provider' | 'model'>): string =>
  `${log.provider || NO_VALUE} / ${log.model || NO_VALUE}`

/** The category that scored highest, with its score: `sexual · 93.1%`. */
export const highestText = (log: Pick<ContentModerationLog, 'highest_category' | 'highest_score'>): string =>
  `${log.highest_category || NO_VALUE} · ${formatScore(log.highest_score)}`

/** How many violations the hit brought its user to. A hit that does not count toward a ban says so. */
export function violationText(log: Pick<ContentModerationLog, 'flagged' | 'violation_count'>, t: Translate): string {
  if (!log.flagged) return NO_VALUE
  if (log.violation_count === 0) return t('admin.riskControl.violationNotCounted')
  // A hit that carries no count is at least the first one.
  return t('admin.riskControl.violationCount', { count: log.violation_count || 1 })
}

/** Whether the user was mailed, and whether the hit got them banned. */
export function noticeText(log: Pick<ContentModerationLog, 'email_sent' | 'auto_banned'>, t: Translate): string {
  const mail = log.email_sent ? t('admin.riskControl.emailSent') : t('admin.riskControl.emailNotSent')
  return log.auto_banned ? `${mail} / ${t('admin.riskControl.autoBanned')}` : mail
}

/** The unban is offered on the record that banned its user, for as long as that user stays disabled. */
export const canUnban = (log: Pick<ContentModerationLog, 'auto_banned' | 'user_id' | 'user_status'>): boolean =>
  Boolean(log.auto_banned && log.user_id && log.user_status === 'disabled')

/** The records, with every record of one user carrying that user's new state. */
export const withUserStatus = <T extends Pick<ContentModerationLog, 'user_id' | 'user_status'>>(
  logs: readonly T[],
  userId: number,
  status: string,
): T[] => logs.map((log) => (log.user_id === userId ? { ...log, user_status: status } : log))

/** How long the audit engine took. A record decided without asking it has no time to tell. */
export const latencyText = (value: number | null | undefined, locale?: string): string =>
  value == null ? NO_VALUE : formatMs(value, locale)

/** What the record keeps of the request: the stored input, or why the audit failed when there is none. */
export const inputText = (log: Pick<ContentModerationLog, 'input_excerpt' | 'error'>): string =>
  log.input_excerpt || log.error || NO_VALUE

// Ended without the audit engine: refused by the upstream, by a keyword, or for repeating a known input.
const ENGINELESS_ACTIONS: readonly string[] = ['cyber_policy', 'keyword_block', 'hash_block']

/**
 * Which engine, model and rule set audited the record, and how many images it left out. Records
 * from before this was stored were all audited by OpenAI.
 */
export function auditSourceText(log: Pick<ContentModerationLog, 'engine_meta' | 'action'>, t: Translate): string {
  const meta = log.engine_meta
  if (!meta) return ENGINELESS_ACTIONS.includes(log.action) ? NO_VALUE : t('admin.riskControl.legacyAuditSource')
  const parts = [engineLabel(meta.engine), meta.model || NO_VALUE, meta.rules_version || NO_VALUE]
  if (meta.skipped_images) parts.push(t('admin.riskControl.skippedImages', { count: meta.skipped_images }))
  return parts.join(' · ')
}
