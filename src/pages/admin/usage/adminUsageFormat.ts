import type { AdminUsageLog } from '@/types'

type ModelFields = Pick<
  AdminUsageLog,
  'model' | 'upstream_model' | 'model_mapping_chain' | 'upstream_response_model' | 'upstream_model_mismatch'
>

/**
 * What the upstream account is charged for a request: the cost worked out by the account's own pricing rules
 * where it has them, else the standard price, times the account's rate.
 */
export function accountBilled(
  row: Pick<AdminUsageLog, 'total_cost' | 'account_stats_cost' | 'account_rate_multiplier'>,
): number {
  const base = row.account_stats_cost ?? row.total_cost ?? 0
  const billed = base * (row.account_rate_multiplier ?? 1)
  return Number.isNaN(billed) ? 0 : billed
}

/** The model names a request went through, the one asked for first: more than one when the model was mapped. */
export function modelSteps(row: ModelFields): string[] {
  const chain = row.model_mapping_chain
  if (chain && chain.includes('→')) return chain.split('→').map((step) => step.trim())
  if (row.upstream_model && row.upstream_model !== row.model) return [row.model, row.upstream_model]
  return [row.model]
}

/** The model name sent upstream: the mapped one, or the one asked for when nothing was mapped. */
export function sentUpstreamModel(row: ModelFields): string {
  return row.upstream_model?.trim() || row.model?.trim() || ''
}

// A dated or "latest" release of a model is the same model under a longer name.
const withoutRelease = (model: string) =>
  model
    .trim()
    .toLowerCase()
    .replace(/-latest$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '')

/**
 * What to make of an upstream that answered as another model than it was sent. Null when the server flagged
 * nothing; 'variant' when the two names are releases of one model, which is expected; 'mismatch' when they are
 * different models.
 */
export function modelAudit(row: ModelFields): 'variant' | 'mismatch' | null {
  const answered = row.upstream_response_model?.trim() || ''
  if (row.upstream_model_mismatch !== true || answered === '') return null
  const sent = sentUpstreamModel(row)
  return sent !== '' && withoutRelease(sent) === withoutRelease(answered) ? 'variant' : 'mismatch'
}

/** The columns of the usage table that are hidden until someone asks for them. */
export const USAGE_HIDDEN_BY_DEFAULT = ['reasoning_effort', 'request_id', 'upstream_request_id', 'user_agent']

// The stored choice of hidden columns carries a version: the name of the last column that was added hidden.
export const USAGE_COLUMNS_VERSION = 'upstream-request-id-hidden-by-default'
const VERSION_BEFORE_UPSTREAM_ID = 'request-id-hidden-by-default'

/**
 * The hidden columns to start from, given the choice a browser has stored and the version it was stored at.
 * The two request-id columns were added, hidden, after people had made their choice: a choice older than such
 * a column gets that column hidden once, and keeps everything else as it was. Same rules as the Vue page,
 * which shares the stored choice.
 */
export function startingHiddenColumns(stored: string[] | null, version: string | null): string[] {
  if (!stored) return [...USAGE_HIDDEN_BY_DEFAULT]
  if (version === USAGE_COLUMNS_VERSION) return stored
  const hidden = new Set(stored)
  if (version !== VERSION_BEFORE_UPSTREAM_ID) hidden.add('request_id')
  hidden.add('upstream_request_id')
  return [...hidden]
}
