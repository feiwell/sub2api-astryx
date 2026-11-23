import type { PromptAuditEvent, PromptIssueSummary } from '@/features/prompt-audit/types'
import { SCANNER_CATALOG } from '@/features/prompt-audit/viewModel'
import { extractApiErrorCode, extractApiErrorMessage } from '@/utils/apiError'
import { t, te } from '~/i18n'

export const NO_VALUE = '—'
export const DECISIONS: readonly string[] = ['pass', 'flag', 'critical']
export const RISK_LEVELS: readonly string[] = ['low', 'medium', 'high', 'critical']
const ACTIONS: readonly string[] = ['Allow', 'Warn', 'Block']

/** A value the server sends as a code: its name when it is one of the known ones, else as sent. */
const named = (group: string, known: readonly string[], value: string): string =>
  known.includes(value) ? t(`admin.promptAudit.${group}.${value}`) : value

export const decisionLabel = (decision: string): string => named('decisions', DECISIONS, decision)
export const riskLabel = (risk: string): string => named('riskLevels', RISK_LEVELS, risk)
export const actionLabel = (action: string): string => named('actions', ACTIONS, action)

export const categoryLabel = (category: string): string =>
  SCANNER_CATALOG.some((scanner) => scanner.id === category) ? t(`admin.promptAudit.scanners.${category}`) : category

export const categoriesLabel = (categories: string[] | null | undefined): string =>
  categories?.length ? categories.map(categoryLabel).join(', ') : NO_VALUE

/** Critical red, flagged amber, passed green; a decision this app does not know gets no colour of its own. */
export function decisionVariant(decision: string): 'error' | 'warning' | 'success' | 'neutral' {
  if (decision === 'critical') return 'error'
  if (decision === 'flag') return 'warning'
  if (decision === 'pass') return 'success'
  return 'neutral'
}

/** The prompt as stored with the event; an event kept without it still has its redacted preview. */
export const displayPrompt = (event: PromptAuditEvent): string =>
  event.snapshot.full_prompt || event.snapshot.redacted_preview || NO_VALUE

/** Guard evidence is often just the category that matched, by id or by its English label. */
export function evidenceLabel(value: string): string {
  const scanner = SCANNER_CATALOG.find((item) => item.id === value || item.label === value)
  return scanner ? t(`admin.promptAudit.scanners.${scanner.id}`) : value
}

/** What the guard decided, as the JSON an admin reads: the normalized result, not the raw response. */
export function guardReturn(event: PromptAuditEvent): string {
  const evidence: Record<string, string> = {}
  for (const [key, value] of Object.entries(event.scanner_evidence || {})) {
    evidence[key] = evidenceLabel(value)
  }
  return JSON.stringify(
    {
      decision: decisionLabel(event.decision),
      risk_level: riskLabel(event.risk_level),
      action: actionLabel(event.action),
      categories: (event.categories || []).map(categoryLabel),
      matched_scanners: (event.matched_scanners || []).map(categoryLabel),
      scanner_scores: event.scanner_scores,
      scanner_evidence: evidence,
      scanner_backend: event.scanner_backend,
      scanner_version: event.scanner_version,
      guard_endpoint_id: event.guard_endpoint_id,
      chunk_total: event.chunk_total,
      latency_ms: event.latency_ms,
    },
    null,
    2,
  )
}

export const issueCategory = (issue: PromptIssueSummary): string => issue.category || issue.scanner_id

export const issueTitle = (issue: PromptIssueSummary): string => categoryLabel(issueCategory(issue)) || issue.title

/** The description this app has for the category; the server's own text for a category it does not know. */
export function issueDescription(issue: PromptIssueSummary): string {
  const key = `admin.promptAudit.scannerDescriptions.${issueCategory(issue)}`
  return te(key) ? t(key) : issue.description
}

export const issueSeverity = (issue: PromptIssueSummary): string =>
  RISK_LEVELS.includes(issue.severity) ? riskLabel(issue.severity) : issue.severity_label || issue.severity

export const issueAction = (issue: PromptIssueSummary): string =>
  ACTIONS.includes(issue.action) ? actionLabel(issue.action) : issue.action_label || issue.action

/** A server time in the reader's language; a value that is no date is shown as sent. */
export function formatAuditDate(value: string | null | undefined, locale: string, dateStyle: 'short' | 'medium'): string {
  if (!value) return NO_VALUE
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle: 'medium' }).format(date)
}

/**
 * What to tell the admin about a failed request: the text this app has for the server's error code,
 * else the server's own message, else the text behind `fallbackKey`.
 */
export function auditErrorMessage(error: unknown, fallbackKey: string): string {
  const code = extractApiErrorCode(error)
  if (code) {
    const key = `admin.promptAudit.errors.${code}`
    if (te(key)) return t(key)
  }
  return extractApiErrorMessage(error, t(fallbackKey))
}
