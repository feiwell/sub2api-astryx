import { describe, expect, it, vi } from 'vitest'
import type { PaginatedResponse, UsageLog, UsageQueryParams } from '@/types'
import { EXPORT_PAGE_SIZE, buildUsageCsv, escapeCsvValue, fetchAllUsageLogs, rateLimitWaitSeconds } from './usageExport'

// Under vitest `@/utils/format` is this app's test stub, which has no formatReasoningEffort. The stand-in marks
// its output, so the test shows the column goes through the formatter without repeating the formatter's rules.
vi.mock('@/utils/format', () => ({
  formatReasoningEffort: (effort: string | null | undefined) => (effort ? `effort:${effort}` : '-'),
}))

const log = (patch: Partial<UsageLog> = {}): UsageLog =>
  ({
    id: 1,
    created_at: '2026-11-21T01:02:03Z',
    model: 'gpt-5',
    reasoning_effort: 'high',
    inbound_endpoint: '/v1/responses',
    ip_address: '203.0.113.7',
    stream: true,
    input_tokens: 1200,
    output_tokens: 340,
    cache_read_tokens: 50,
    cache_creation_tokens: 60,
    rate_multiplier: 1.5,
    actual_cost: 0.0123,
    total_cost: 0.0082,
    first_token_ms: 850,
    duration_ms: 4200,
    image_count: 0,
    api_key: { name: 'ci-runner' },
    ...patch,
  }) as UsageLog

/** The billing-mode names as the catalog would give them; the test only needs them to be told apart. */
const t = (key: string) => `<${key}>`

const page = (items: UsageLog[]): PaginatedResponse<UsageLog> =>
  ({ items, total: items.length, page: 1, page_size: EXPORT_PAGE_SIZE, pages: 1 }) as PaginatedResponse<UsageLog>

describe('escapeCsvValue', () => {
  it('leaves plain text and numbers as they are', () => {
    expect(escapeCsvValue('gpt-5')).toBe('gpt-5')
    expect(escapeCsvValue(1200)).toBe('1200')
    expect(escapeCsvValue(0)).toBe('0')
  })

  it('writes nothing for a missing value', () => {
    expect(escapeCsvValue(null)).toBe('')
    expect(escapeCsvValue(undefined)).toBe('')
  })

  it('quotes text that holds a comma, a quote or a line break, doubling its quotes', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"')
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"')
  })

  it('defuses text a spreadsheet would run as a formula', () => {
    expect(escapeCsvValue('=SUM(A1:A9)')).toBe('"\'=SUM(A1:A9)"')
    expect(escapeCsvValue('+1')).toBe('"\'+1"')
    expect(escapeCsvValue('-1')).toBe('"\'-1"')
    expect(escapeCsvValue('@cmd')).toBe('"\'@cmd"')
    expect(escapeCsvValue('=1+"x"')).toBe('"\'=1+""x"""')
  })

  it('keeps the lone dash that stands for "nothing"', () => {
    expect(escapeCsvValue('-')).toBe('-')
  })
})

describe('buildUsageCsv', () => {
  it('starts with the seventeen column names', () => {
    const header = buildUsageCsv([], t)
    expect(header.split(',')).toHaveLength(17)
    expect(header).toBe(
      'Time,API Key Name,Model,Reasoning Effort,Inbound Endpoint,IP Address,Type,Billing Mode,Input Tokens,' +
        'Output Tokens,Cache Read Tokens,Cache Creation Tokens,Rate Multiplier,Billed Cost,Original Cost,' +
        'First Token (ms),Duration (ms)',
    )
  })

  it('writes one line per request, costs to eight decimals', () => {
    const [, line] = buildUsageCsv([log()], t).split('\n')
    expect(line).toBe(
      '2026-11-21T01:02:03Z,ci-runner,gpt-5,effort:high,/v1/responses,203.0.113.7,Stream,<admin.usage.billingModeToken>,' +
        '1200,340,50,60,1.5,0.01230000,0.00820000,850,4200',
    )
  })

  it('leaves the fields of a request that has no key, endpoint, address or timings empty', () => {
    const [, line] = buildUsageCsv(
      [log({ api_key: undefined, inbound_endpoint: null, ip_address: null, first_token_ms: null, duration_ms: null })],
      t,
    ).split('\n')
    const fields = line.split(',')
    expect([fields[1], fields[4], fields[5], fields[15], fields[16]]).toEqual(['', '', '', '', ''])
  })

  it('names the request type in English, whatever the language of the page', () => {
    const typeOf = (patch: Partial<UsageLog>) => buildUsageCsv([log(patch)], t).split('\n')[1].split(',')[6]
    expect(typeOf({ request_type: 'ws_v2' })).toBe('WS')
    expect(typeOf({ request_type: 'live' })).toBe('Live')
    expect(typeOf({ request_type: 'cyber' })).toBe('Cyber')
    expect(typeOf({ request_type: 'unknown' })).toBe('Unknown')
    expect(typeOf({ request_type: undefined, stream: false })).toBe('Sync')
    expect(typeOf({ request_type: undefined, stream: false, openai_ws_mode: true })).toBe('WS')
  })

  it('bills a request that made images as an image request when no mode was recorded', () => {
    const modeOf = (patch: Partial<UsageLog>) => buildUsageCsv([log(patch)], t).split('\n')[1].split(',')[7]
    expect(modeOf({ image_count: 2, billing_mode: null })).toBe('<admin.usage.billingModeImage>')
    expect(modeOf({ image_count: 2, billing_mode: 'token' })).toBe('<admin.usage.billingModeToken>')
    expect(modeOf({ billing_mode: 'per_request' })).toBe('<admin.usage.billingModePerRequest>')
  })

  it('quotes a key name that would break the line or run as a formula', () => {
    const csv = buildUsageCsv([log({ api_key: { name: '=cmd, "x"' } as UsageLog['api_key'] })], t)
    expect(csv.split('\n')[1]).toContain(',"\'=cmd, ""x""",gpt-5,')
  })
})

describe('rateLimitWaitSeconds', () => {
  it('is null for anything but "too many requests"', () => {
    expect(rateLimitWaitSeconds({ status: 500 })).toBeNull()
    expect(rateLimitWaitSeconds(new Error('offline'))).toBeNull()
    expect(rateLimitWaitSeconds(null)).toBeNull()
  })

  it('uses the wait the server names, between one second and a minute', () => {
    expect(rateLimitWaitSeconds({ status: 429, retry_after_seconds: 12 })).toBe(12)
    expect(rateLimitWaitSeconds({ status: 429, retry_after_seconds: 0 })).toBe(1)
    expect(rateLimitWaitSeconds({ status: 429, retry_after_seconds: 600 })).toBe(60)
  })

  it('waits a minute when the server names no wait', () => {
    expect(rateLimitWaitSeconds({ status: 429 })).toBe(60)
  })
})

describe('fetchAllUsageLogs', () => {
  const params: UsageQueryParams = { start_date: '2026-11-20', end_date: '2026-11-21', model: 'gpt-5' }
  const tooMany = (seconds?: number) => ({ status: 429, retry_after_seconds: seconds })

  it('asks for every page of a thousand rows, in order, with the filters of the list', async () => {
    const query = vi
      .fn<(asked: UsageQueryParams) => Promise<PaginatedResponse<UsageLog>>>()
      .mockImplementation(async (asked) => page([log({ id: asked.page })]))
    const logs = await fetchAllUsageLogs({ total: 2001, params, query, onRateLimited: vi.fn(), wait: vi.fn() })
    expect(query.mock.calls.map(([asked]) => asked)).toEqual([
      { ...params, page: 1, page_size: 1000 },
      { ...params, page: 2, page_size: 1000 },
      { ...params, page: 3, page_size: 1000 },
    ])
    expect(logs.map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('asks for nothing when the list is empty', async () => {
    const query = vi.fn()
    expect(await fetchAllUsageLogs({ total: 0, params, query, onRateLimited: vi.fn(), wait: vi.fn() })).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('waits as long as the server says and asks for the same page again', async () => {
    const query = vi
      .fn<(asked: UsageQueryParams) => Promise<PaginatedResponse<UsageLog>>>()
      .mockRejectedValueOnce(tooMany(7))
      .mockResolvedValueOnce(page([log({ id: 11 })]))
    const onRateLimited = vi.fn()
    const wait = vi.fn().mockResolvedValue(undefined)
    const logs = await fetchAllUsageLogs({ total: 10, params, query, onRateLimited, wait })
    expect(logs.map((item) => item.id)).toEqual([11])
    expect(query.mock.calls.map(([asked]) => asked.page)).toEqual([1, 1])
    expect(onRateLimited.mock.calls).toEqual([[7]])
    expect(wait.mock.calls).toEqual([[7]])
  })

  it('gives up on a page that is refused a fourth time', async () => {
    const query = vi.fn().mockRejectedValue(tooMany(1))
    const wait = vi.fn().mockResolvedValue(undefined)
    await expect(fetchAllUsageLogs({ total: 10, params, query, onRateLimited: vi.fn(), wait })).rejects.toEqual(tooMany(1))
    expect(query).toHaveBeenCalledTimes(4)
    expect(wait).toHaveBeenCalledTimes(3)
  })

  it('counts the retries of each page on their own', async () => {
    const query = vi
      .fn<(asked: UsageQueryParams) => Promise<PaginatedResponse<UsageLog>>>()
      .mockRejectedValueOnce(tooMany(1))
      .mockRejectedValueOnce(tooMany(1))
      .mockRejectedValueOnce(tooMany(1))
      .mockResolvedValueOnce(page([log({ id: 1 })]))
      .mockRejectedValueOnce(tooMany(1))
      .mockRejectedValueOnce(tooMany(1))
      .mockRejectedValueOnce(tooMany(1))
      .mockResolvedValueOnce(page([log({ id: 2 })]))
    const wait = vi.fn().mockResolvedValue(undefined)
    const logs = await fetchAllUsageLogs({ total: 1001, params, query, onRateLimited: vi.fn(), wait })
    expect(logs.map((item) => item.id)).toEqual([1, 2])
    expect(wait).toHaveBeenCalledTimes(6)
  })

  it('ends the export at once on any other failure', async () => {
    const failure = { status: 500 }
    const query = vi.fn().mockRejectedValue(failure)
    const wait = vi.fn()
    await expect(fetchAllUsageLogs({ total: 10, params, query, onRateLimited: vi.fn(), wait })).rejects.toBe(failure)
    expect(query).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })
})
