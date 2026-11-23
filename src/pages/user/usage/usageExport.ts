import type { PaginatedResponse, UsageLog, UsageQueryParams, UsageRequestType } from '@/types'
import { getBillingModeLabel, getDisplayBillingMode } from '@/utils/billingMode'
import { formatReasoningEffort } from '@/utils/format'
import { resolveUsageRequestType } from '@/utils/usageRequestType'

export const EXPORT_PAGE_SIZE = 1000
const RATE_LIMIT_MAX_RETRIES = 3
const RATE_LIMIT_MAX_WAIT_SECONDS = 60

type Translate = (key: string) => string

// The file is read by scripts as well as people: its headers and its request types stay in English.
const CSV_HEADERS = [
  'Time',
  'API Key Name',
  'Model',
  'Reasoning Effort',
  'Inbound Endpoint',
  'IP Address',
  'Type',
  'Billing Mode',
  'Input Tokens',
  'Output Tokens',
  'Cache Read Tokens',
  'Cache Creation Tokens',
  'Rate Multiplier',
  'Billed Cost',
  'Original Cost',
  'First Token (ms)',
  'Duration (ms)',
]

const REQUEST_TYPE_TEXT: Record<UsageRequestType, string> = {
  cyber: 'Cyber',
  live: 'Live',
  ws_v2: 'WS',
  stream: 'Stream',
  sync: 'Sync',
  unknown: 'Unknown',
}

/**
 * One field of a CSV line. Text a spreadsheet would run as a formula is quoted behind an apostrophe; a lone "-"
 * is the placeholder for "nothing", not a formula.
 */
export function escapeCsvValue(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  const escaped = text.replace(/"/g, '""')
  if (text === '-') return text
  if (/^[=+\-@\t\r]/.test(text)) return `"'${escaped}"`
  if (/[,"\n\r]/.test(text)) return `"${escaped}"`
  return text
}

function csvFields(log: UsageLog, t: Translate): unknown[] {
  return [
    log.created_at,
    log.api_key?.name || '',
    log.model,
    formatReasoningEffort(log.reasoning_effort),
    log.inbound_endpoint || '',
    log.ip_address || '',
    REQUEST_TYPE_TEXT[resolveUsageRequestType(log)],
    getBillingModeLabel(getDisplayBillingMode(log), t),
    log.input_tokens,
    log.output_tokens,
    log.cache_read_tokens,
    log.cache_creation_tokens,
    log.rate_multiplier,
    log.actual_cost.toFixed(8),
    log.total_cost.toFixed(8),
    log.first_token_ms ?? '',
    log.duration_ms ?? '',
  ]
}

export function buildUsageCsv(logs: UsageLog[], t: Translate): string {
  const lines = [CSV_HEADERS, ...logs.map((log) => csvFields(log, t))]
  return lines.map((fields) => fields.map(escapeCsvValue).join(',')).join('\n')
}

/**
 * How many seconds to wait before asking again, for an error that says "too many requests"; null for any other
 * error. The server's own figure is used, kept between one second and a minute; a minute when it names none.
 */
export function rateLimitWaitSeconds(error: unknown): number | null {
  const answer = error as { status?: number; retry_after_seconds?: number } | null
  if (answer?.status !== 429) return null
  return Math.min(Math.max(answer.retry_after_seconds ?? RATE_LIMIT_MAX_WAIT_SECONDS, 1), RATE_LIMIT_MAX_WAIT_SECONDS)
}

const sleep = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))

/**
 * Every row of a list of `total` rows, fetched a page at a time. Export pages count against the per-user limit
 * on heavy queries: a page refused for that reason is asked for again after the wait the server names, three
 * times at most. Any other failure ends the export.
 */
export async function fetchAllUsageLogs({
  total,
  params,
  query,
  onRateLimited,
  wait = sleep,
}: {
  total: number
  params: UsageQueryParams
  query: (params: UsageQueryParams) => Promise<PaginatedResponse<UsageLog>>
  onRateLimited: (waitSeconds: number) => void
  wait?: (seconds: number) => Promise<void>
}): Promise<UsageLog[]> {
  const logs: UsageLog[] = []
  const pages = Math.ceil(total / EXPORT_PAGE_SIZE)
  for (let page = 1; page <= pages; page++) {
    for (let attempt = 0; ; attempt++) {
      try {
        const answer = await query({ ...params, page, page_size: EXPORT_PAGE_SIZE })
        logs.push(...answer.items)
        break
      } catch (error) {
        const waitSeconds = rateLimitWaitSeconds(error)
        if (waitSeconds == null || attempt >= RATE_LIMIT_MAX_RETRIES) throw error
        onRateLimited(waitSeconds)
        await wait(waitSeconds)
      }
    }
  }
  return logs
}

/** Hands the text to the browser as a download. The byte-order mark makes Excel read it as UTF-8. */
export function downloadCsv(fileName: string, content: string) {
  const url = window.URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(url)
}
