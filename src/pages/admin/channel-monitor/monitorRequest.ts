import { DEFAULT_GROK_MODEL } from '@/constants/channelMonitor'
import type { APIMode, BodyOverrideMode, Provider } from '~/lib/api/admin/channelMonitor'

/** One custom header while it is typed in. */
export interface HeaderRow {
  name: string
  value: string
}

/**
 * The custom part of a check request while it is edited: the headers a row each, the body as the text typed.
 * A monitor carries one, and so does a template.
 */
export interface RequestDraft {
  headers: HeaderRow[]
  bodyMode: BodyOverrideMode
  bodyText: string
}

/** The custom part of a check request as the server keeps it. */
export interface RequestSnapshot {
  extra_headers: Record<string, string>
  body_override_mode: BodyOverrideMode
  body_override: Record<string, unknown> | null
}

/** Why the text of a body cannot be sent: it is not JSON, or it is JSON that is not an object. */
export type BodyProblem = { kind: 'syntax'; detail: string } | { kind: 'notObject' }

export interface RequestProblems {
  /** The first header name that cannot be one. */
  headerName?: string
  body?: BodyProblem
}

const blankRow = (): HeaderRow => ({ name: '', value: '' })

// There is always a row to type into.
export const emptyRequestDraft = (): RequestDraft => ({ headers: [blankRow()], bodyMode: 'off', bodyText: '' })

/** What the server keeps, laid out for editing. A server may send nothing where there is nothing. */
export function requestDraftOf(stored: {
  extra_headers?: Record<string, string> | null
  body_override_mode?: BodyOverrideMode | '' | null
  body_override?: Record<string, unknown> | null
}): RequestDraft {
  const headers = Object.entries(stored.extra_headers || {}).map(([name, value]) => ({ name, value }))
  const body = stored.body_override
  return {
    headers: headers.length > 0 ? headers : [blankRow()],
    bodyMode: stored.body_override_mode || 'off',
    bodyText: body && Object.keys(body).length > 0 ? JSON.stringify(body, null, 2) : '',
  }
}

export function withHeaderRow(draft: RequestDraft, index: number, change: Partial<HeaderRow>): RequestDraft {
  return { ...draft, headers: draft.headers.map((row, at) => (at === index ? { ...row, ...change } : row)) }
}

export function withBlankHeaderRow(draft: RequestDraft): RequestDraft {
  return { ...draft, headers: [...draft.headers, blankRow()] }
}

export function withoutHeaderRow(draft: RequestDraft, index: number): RequestDraft {
  const headers = draft.headers.filter((_, at) => at !== index)
  return { ...draft, headers: headers.length > 0 ? headers : [blankRow()] }
}

/** A body is only kept while it is used: going back to the default request drops it. */
export function withBodyMode(draft: RequestDraft, bodyMode: BodyOverrideMode): RequestDraft {
  return { ...draft, bodyMode, bodyText: bodyMode === 'off' ? '' : draft.bodyText }
}

/** The headers the rows spell out. A row without a name is one not filled in yet, and is left out. */
export function headersOf(rows: HeaderRow[]): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (name) headers[name] = row.value
  }
  return headers
}

/** The first header name with a colon or a space in it; such a name would break the request apart. */
export function invalidHeaderName(rows: HeaderRow[]): string | null {
  for (const row of rows) {
    const name = row.name.trim()
    if (name && /[:\s]/.test(name)) return name
  }
  return null
}

/** The body a text spells out; empty text is no body. */
export function readBody(text: string): { body: Record<string, unknown> | null } | { problem: BodyProblem } {
  const trimmed = text.trim()
  if (!trimmed) return { body: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return { problem: { kind: 'syntax', detail: error instanceof Error ? error.message : String(error) } }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { problem: { kind: 'notObject' } }
  return { body: parsed as Record<string, unknown> }
}

/** The same JSON laid out over lines; null for text that is not JSON. */
export function prettyBody(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text.trim()), null, 2)
  } catch {
    return null
  }
}

/** What stands in the way of sending a draft. A body is only read while it is used. */
export function requestProblems(draft: RequestDraft): RequestProblems {
  const problems: RequestProblems = {}
  const headerName = invalidHeaderName(draft.headers)
  if (headerName) problems.headerName = headerName
  if (draft.bodyMode !== 'off') {
    const read = readBody(draft.bodyText)
    if ('problem' in read) problems.body = read.problem
  }
  return problems
}

/** A draft as the server takes it. Call it for a draft without problems: a body that cannot be read is none. */
export function requestSnapshotOf(draft: RequestDraft): RequestSnapshot {
  const read = readBody(draft.bodyText)
  return {
    extra_headers: headersOf(draft.headers),
    body_override_mode: draft.bodyMode,
    body_override: 'body' in read ? read.body : null,
  }
}

const lines = (...text: string[]) => text.join('\n')

/** An example of a body for the kind of request the provider takes, shown while the field is empty. */
export function bodyPlaceholder(provider: Provider, apiMode: APIMode, bodyMode: BodyOverrideMode): string {
  const isMerge = bodyMode === 'merge'
  if (provider === 'openai' && apiMode === 'responses') {
    if (isMerge) return lines('{', '  "max_output_tokens": 20', '}')
    return lines(
      '{',
      '  "model": "gpt-4o-mini",',
      '  "instructions": "You are a health check endpoint. Reply briefly.",',
      '  "input": "Reply with exactly: ok",',
      '  "max_output_tokens": 20,',
      '  "stream": false',
      '}',
    )
  }
  if (provider === 'openai' || provider === 'grok') {
    if (isMerge) return lines('{', '  "max_tokens": 20', '}')
    const model = provider === 'grok' ? DEFAULT_GROK_MODEL : 'gpt-4o-mini'
    return lines(
      '{',
      `  "model": "${model}",`,
      '  "messages": [{"role":"user","content":"Reply with exactly: ok"}],',
      '  "max_tokens": 20,',
      '  "stream": false',
      '}',
    )
  }
  if (isMerge) return lines('{', '  "system": "You are Claude Code..."', '}')
  return lines(
    '{',
    '  "model": "claude-x",',
    '  "messages": [{"role":"user","content":"hi"}],',
    '  "max_tokens": 10',
    '}',
  )
}
