import type { OpsErrorLog } from '~/lib/api/admin/ops'

/** The two error lists of the ops page: errors answered to clients, and errors the upstream accounts answered with. */
export type OpsErrorKind = 'request' | 'upstream'

export type OpsBadgeVariant = 'error' | 'warning' | 'info' | 'orange' | 'purple' | 'neutral'
export type OpsStatusColor = 'red' | 'purple' | 'orange' | 'gray'

type Translate = (key: string) => string
type ModelFields = Pick<OpsErrorLog, 'model' | 'requested_model' | 'upstream_model'>
type OriginFields = Pick<OpsErrorLog, 'phase' | 'error_owner'>

const lower = (value: unknown): string => String(value || '').toLowerCase()
const trimmed = (value: unknown): string => String(value || '').trim()

/** An error the upstream provider answered with, as opposed to one raised by the client or by the gateway. */
export function isUpstreamError(log: OriginFields): boolean {
  return lower(log.phase) === 'upstream' && lower(log.error_owner) === 'provider'
}

/** The request asked for one model and the gateway sent another one upstream. */
export function hasModelMapping(log: ModelFields): boolean {
  const requested = trimmed(log.requested_model)
  const upstream = trimmed(log.upstream_model)
  return requested !== '' && upstream !== '' && requested !== upstream
}

/** The model that served the request, falling back to the one that was asked for. */
export function displayModel(log: ModelFields): string {
  return trimmed(log.upstream_model) || trimmed(log.requested_model) || trimmed(log.model)
}

// An entry without an owner matches whoever owns the error.
const ERROR_TYPES: ReadonlyArray<{ phase: string; owner?: string; labelKey: string; variant: OpsBadgeVariant }> = [
  { phase: 'upstream', owner: 'provider', labelKey: 'admin.ops.errorLog.typeUpstream', variant: 'error' },
  { phase: 'request', owner: 'client', labelKey: 'admin.ops.errorLog.typeRequest', variant: 'warning' },
  { phase: 'auth', owner: 'client', labelKey: 'admin.ops.errorLog.typeAuth', variant: 'info' },
  { phase: 'account_auth', labelKey: 'admin.ops.errorLog.typeAccountAuth', variant: 'orange' },
  { phase: 'routing', owner: 'platform', labelKey: 'admin.ops.errorLog.typeRouting', variant: 'purple' },
  { phase: 'internal', owner: 'platform', labelKey: 'admin.ops.errorLog.typeInternal', variant: 'neutral' },
]

/** Where an error arose, read from its phase and owner. A pair without a name is shown by its raw phase or owner. */
export function errorTypeBadge(log: OriginFields, t: Translate): { label: string; variant: OpsBadgeVariant } {
  const phase = lower(log.phase)
  const owner = lower(log.error_owner)
  const known = ERROR_TYPES.find((type) => type.phase === phase && (type.owner == null || type.owner === owner))
  if (known) return { label: t(known.labelKey), variant: known.variant }
  return { label: phase || owner || t('common.unknown'), variant: 'neutral' }
}

/** Server errors red, rate limits purple, other client errors orange. */
export function statusColor(code: number): OpsStatusColor {
  if (code >= 500) return 'red'
  if (code === 429) return 'purple'
  if (code >= 400) return 'orange'
  return 'gray'
}

const SEVERITY_VARIANTS: Record<string, OpsBadgeVariant> = { P0: 'error', P1: 'orange', P2: 'warning', P3: 'info' }

export function severityVariant(severity: string): OpsBadgeVariant {
  return SEVERITY_VARIANTS[severity] ?? 'info'
}

const REQUEST_TYPE_NAMES: Record<number, 'Sync' | 'Stream' | 'Ws'> = { 1: 'Sync', 2: 'Stream', 3: 'Ws' }

/** `Sync`, `Stream` or `Ws`, the ending of the `requestType…` message keys; null for a type that was not recorded. */
export function requestTypeName(type: number | null | undefined): 'Sync' | 'Stream' | 'Ws' | null {
  return type == null ? null : (REQUEST_TYPE_NAMES[type] ?? null)
}

/**
 * An error message cut down to a line: the text inside a JSON body, a plain name for
 * the common network failures, or the start of a long message.
 */
export function summarizeMessage(message: string, t: Translate): string {
  if (!message) return ''
  if (message.startsWith('{') || message.startsWith('[')) {
    try {
      const body = JSON.parse(message)
      if (body?.error?.message) return String(body.error.message)
      if (body?.message) return String(body.message)
      if (body?.detail) return String(body.detail)
      if (typeof body === 'object') return JSON.stringify(body).substring(0, 150)
    } catch {
      // It only looked like JSON: read it as plain text.
    }
  }
  if (message.includes('context deadline exceeded')) return t('admin.ops.errorLog.commonErrors.contextDeadlineExceeded')
  if (message.includes('connection refused')) return t('admin.ops.errorLog.commonErrors.connectionRefused')
  if (message.toLowerCase().includes('rate limit')) return t('admin.ops.errorLog.commonErrors.rateLimit')
  return message.length > 200 ? `${message.substring(0, 200)}...` : message
}

/** The payload as text, or '' when it holds nothing worth showing: blank, `[]`, `{}` or `null`. */
export function meaningfulPayload(candidate: unknown): string {
  const value = trimmed(candidate)
  if (!value || value === '[]' || value === '{}' || value.toLowerCase() === 'null') return ''
  return value
}

/** A payload ready to read: JSON comes back indented, any other text as it is. */
export function readablePayload(raw: string): { code: string; isJson: boolean } {
  try {
    return { code: JSON.stringify(JSON.parse(raw), null, 2), isJson: true }
  } catch {
    return { code: raw, isJson: false }
  }
}
