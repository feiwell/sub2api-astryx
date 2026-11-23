import { extractApiErrorMessage } from '@/utils/apiError'
import { t } from '~/i18n'

export const NO_VALUE = '—'

export const HTTP_METHODS: readonly string[] = ['POST', 'PUT', 'PATCH', 'DELETE', 'GET']

/** The ways an operator can be signed in. These are product names, the same in every language. */
export const AUTH_METHODS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'jwt', label: 'JWT' },
  { value: 'admin_api_key', label: 'Admin API Key' },
  { value: 'mcp_oauth', label: 'MCP OAuth' },
]

/** The name of an auth method; one this app does not know is shown as the server sent it. */
export const authMethodLabel = (method: string): string =>
  AUTH_METHODS.find((item) => item.value === method)?.label ?? method

/** Whether an operation went through, going by the status its request was answered with. */
export const isSuccessStatus = (status: number): boolean => status < 400

/** Server errors red, refused requests orange, the rest green. */
export function statusColor(status: number): 'red' | 'orange' | 'green' {
  if (status >= 500) return 'red'
  if (status >= 400) return 'orange'
  return 'green'
}

/** A server time in the reader's language, to the second; a value that is no date is shown as sent. */
export function formatAuditTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(date)
}

/** A stored request body: indented when it is JSON, as stored when it is not. */
export function readBody(body: string): { text: string; isJson: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(body), null, 2), isJson: true }
  } catch {
    return { text: body, isJson: false }
  }
}

/** What to tell about a failed request: the server's own message, else the text behind `fallbackKey`. */
export const auditErrorMessage = (error: unknown, fallbackKey: string): string =>
  extractApiErrorMessage(error, t(fallbackKey))
