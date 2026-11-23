import { describe, expect, it, vi } from 'vitest'
import type { AdminUsageQueryParams } from '@/api/admin/usage'
import type { AdminUsageLog, PaginatedResponse } from '@/types'
import {
  ADMIN_EXPORT_PAGE_SIZE,
  adminExportHeaders,
  adminExportRow,
  buildAdminUsageCsv,
  exportPercent,
  fetchAllAdminUsageLogs,
} from './adminUsageExport'

// Under vitest `@/utils/format` is this app's test stub, which has no formatReasoningEffort. The stand-in marks
// its output, so the test shows the columns go through the formatter without repeating the formatter's rules.
vi.mock('@/utils/format', () => ({
  formatReasoningEffort: (effort: string | null | undefined) => (effort ? `effort:${effort}` : '-'),
}))

/** The words of the page as the catalog would give them; the test only needs them to be told apart. */
const t = (key: string) => `<${key}>`

const log = (patch: Partial<AdminUsageLog> = {}): AdminUsageLog =>
  ({
    id: 1,
    created_at: '2026-11-21T01:02:03Z',
    request_id: 'req-1',
    upstream_request_id: 'up-1',
    model: 'gpt-5',
    upstream_model: 'gpt-5-pro',
    upstream_response_model: 'gpt-5-pro-2026',
    upstream_model_mismatch: true,
    reasoning_effort: 'high',
    upstream_reasoning_effort: 'medium',
    inbound_endpoint: '/v1/responses',
    upstream_endpoint: '/v1/chat/completions',
    request_type: 'stream',
    stream: true,
    input_tokens: 1200,
    output_tokens: 340,
    cache_read_tokens: 50,
    cache_creation_tokens: 60,
    input_cost: 0.001,
    output_cost: 0.002,
    cache_read_cost: 0.0003,
    cache_creation_cost: 0.0004,
    rate_multiplier: 1.5,
    account_rate_multiplier: 0.8,
    total_cost: 0.0037,
    actual_cost: 0.00555,
    account_stats_cost: 0.004,
    first_token_ms: 850,
    duration_ms: 4200,
    user_agent: 'curl/8.4',
    ip_address: '203.0.113.7',
    user: { email: 'alice@example.test' },
    api_key: { name: 'ci-runner' },
    account: { name: 'claude-max' },
    group: { name: 'vip' },
    ...patch,
  }) as AdminUsageLog

/** A page of `count` rows whose ids start at `firstId`, from a list the server says has `total` rows. */
const pageOf = (count: number, total: number, firstId = 1): PaginatedResponse<AdminUsageLog> =>
  ({
    items: Array.from({ length: count }, (_, index) => log({ id: firstId + index })),
    total,
    page: 1,
    page_size: ADMIN_EXPORT_PAGE_SIZE,
    pages: 1,
  }) as PaginatedResponse<AdminUsageLog>

type Query = (asked: AdminUsageQueryParams) => Promise<PaginatedResponse<AdminUsageLog>>

describe('adminExportHeaders', () => {
  it('names the thirty-three columns in the order of the Vue export', () => {
    expect(adminExportHeaders(t)).toEqual([
      '<usage.time>',
      '<admin.usage.user>',
      '<usage.apiKeyFilter>',
      '<admin.usage.account>',
      '<usage.requestedModel>',
      '<usage.sentUpstreamModel>',
      '<usage.upstreamResponseModel>',
      '<usage.upstreamModelMismatch>',
      '<usage.requestedReasoningEffort>',
      '<usage.reasoningEffort>',
      '<admin.usage.group>',
      '<usage.inboundEndpoint>',
      '<usage.upstreamEndpoint>',
      '<usage.type>',
      '<admin.usage.inputTokens>',
      '<admin.usage.outputTokens>',
      '<admin.usage.cacheReadTokens>',
      '<admin.usage.cacheCreationTokens>',
      '<admin.usage.inputCost>',
      '<admin.usage.outputCost>',
      '<admin.usage.cacheReadCost>',
      '<admin.usage.cacheCreationCost>',
      '<usage.rate>',
      '<usage.accountMultiplier>',
      '<usage.original>',
      '<usage.userBilled>',
      '<usage.accountBilled>',
      '<usage.firstToken>',
      '<usage.duration>',
      '<admin.usage.requestId>',
      '<admin.usage.upstreamRequestId>',
      '<usage.userAgent>',
      '<admin.usage.ipAddress>',
    ])
  })
})

describe('adminExportRow', () => {
  it('has a value for each column: costs to six decimals, multipliers to four digits', () => {
    const row = adminExportRow(log(), t)
    expect(row).toHaveLength(adminExportHeaders(t).length)
    expect(row).toEqual([
      '2026-11-21T01:02:03Z',
      'alice@example.test',
      'ci-runner',
      'claude-max',
      'gpt-5',
      'gpt-5-pro',
      'gpt-5-pro-2026',
      '<common.yes>',
      'effort:high',
      'effort:medium',
      'vip',
      '/v1/responses',
      '/v1/chat/completions',
      '<usage.stream>',
      1200,
      340,
      50,
      60,
      '0.001000',
      '0.002000',
      '0.000300',
      '0.000400',
      '1.500',
      '0.8000',
      '0.003700',
      '0.005550',
      // The account's own cost, 0.004, times its multiplier.
      '0.003200',
      850,
      4200,
      'req-1',
      'up-1',
      'curl/8.4',
      '203.0.113.7',
    ])
  })

  it('gives the requested model and effort where the upstream ones were not recorded', () => {
    const row = adminExportRow(log({ upstream_model: null, upstream_reasoning_effort: null }), t)
    expect([row[5], row[9]]).toEqual(['gpt-5', 'effort:high'])
  })

  it('says yes, no or nothing about the upstream answering as another model', () => {
    const answer = (mismatch: boolean | null | undefined) => adminExportRow(log({ upstream_model_mismatch: mismatch }), t)[7]
    expect(answer(true)).toBe('<common.yes>')
    expect(answer(false)).toBe('<common.no>')
    expect(answer(null)).toBe('')
    expect(answer(undefined)).toBe('')
  })

  it('names the request type in the words of the page', () => {
    const typeOf = (patch: Partial<AdminUsageLog>) => adminExportRow(log(patch), t)[13]
    expect(typeOf({ request_type: 'ws_v2' })).toBe('<usage.ws>')
    expect(typeOf({ request_type: 'live' })).toBe('<usage.live>')
    expect(typeOf({ request_type: 'cyber' })).toBe('<usage.cyber>')
    expect(typeOf({ request_type: 'unknown' })).toBe('<usage.unknown>')
    expect(typeOf({ request_type: undefined, stream: false })).toBe('<usage.sync>')
  })

  it('bills the account by the request cost, times one, when the account has no figures of its own', () => {
    const row = adminExportRow(log({ account_rate_multiplier: null, account_stats_cost: null }), t)
    expect([row[23], row[26]]).toEqual(['1.000', '0.003700'])
  })

  it('leaves empty what a request does not have', () => {
    const row = adminExportRow(
      log({
        user: undefined,
        api_key: undefined,
        account: undefined,
        group: undefined,
        upstream_response_model: null,
        inbound_endpoint: null,
        upstream_endpoint: null,
        first_token_ms: null,
        duration_ms: null,
        upstream_request_id: null,
        user_agent: null,
        ip_address: null,
      }),
      t,
    )
    expect([1, 2, 3, 6, 10, 11, 12, 27, 28, 30, 31, 32].map((index) => row[index])).toEqual(Array(12).fill(''))
  })
})

describe('buildAdminUsageCsv', () => {
  it('writes the column names, then one line per request', () => {
    const lines = buildAdminUsageCsv([log({ id: 1 }), log({ id: 2, model: 'claude-sonnet-4-5' })], t).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0].split(',')).toHaveLength(33)
    expect(lines[0].startsWith('<usage.time>,<admin.usage.user>,')).toBe(true)
    expect(lines[1].split(',')[4]).toBe('gpt-5')
    expect(lines[2].split(',')[4]).toBe('claude-sonnet-4-5')
  })

  it('is only the column names when there is nothing to export', () => {
    expect(buildAdminUsageCsv([], t).split('\n')).toHaveLength(1)
  })

  it('quotes a user agent that holds a comma and defuses one a spreadsheet would run', () => {
    const agentOf = (userAgent: string) => buildAdminUsageCsv([log({ user_agent: userAgent })], t).split('\n')[1]
    expect(agentOf('Mozilla/5.0 (X11, Linux)')).toContain(',"Mozilla/5.0 (X11, Linux)",')
    expect(agentOf('=HYPERLINK(1)')).toContain(',"\'=HYPERLINK(1)",')
  })
})

describe('exportPercent', () => {
  it('is the share of the rows fetched, in whole percent', () => {
    expect(exportPercent(50, 200)).toBe(25)
    expect(exportPercent(1, 3)).toBe(33)
    expect(exportPercent(200, 200)).toBe(100)
  })

  it('is nothing while the number of rows is not known, and never more than all', () => {
    expect(exportPercent(0, 0)).toBe(0)
    expect(exportPercent(250, 200)).toBe(100)
  })
})

describe('fetchAllAdminUsageLogs', () => {
  const params: AdminUsageQueryParams = { start_date: '2026-11-20', end_date: '2026-11-21', user_id: 7, sort_by: 'created_at' }
  const never = () => false

  it('asks page after page, a hundred rows each and counted exactly, until it has them all', async () => {
    const query = vi
      .fn<Query>()
      .mockResolvedValueOnce(pageOf(100, 250, 1))
      .mockResolvedValueOnce(pageOf(100, 250, 101))
      .mockResolvedValueOnce(pageOf(50, 250, 201))
    const onProgress = vi.fn()
    const logs = await fetchAllAdminUsageLogs({ params, query, isCancelled: never, onProgress })
    expect(query.mock.calls.map(([asked]) => asked)).toEqual([
      { ...params, page: 1, page_size: 100, exact_total: true },
      { ...params, page: 2, page_size: 100, exact_total: true },
      { ...params, page: 3, page_size: 100, exact_total: true },
    ])
    expect(logs?.map((item) => item.id)).toEqual(Array.from({ length: 250 }, (_, index) => index + 1))
    expect(onProgress.mock.calls).toEqual([
      [100, 250],
      [200, 250],
      [250, 250],
    ])
  })

  it('does not ask for a page past the last full one', async () => {
    const query = vi.fn<Query>().mockResolvedValueOnce(pageOf(100, 200, 1)).mockResolvedValueOnce(pageOf(100, 200, 101))
    const logs = await fetchAllAdminUsageLogs({ params, query, isCancelled: never, onProgress: vi.fn() })
    expect(query).toHaveBeenCalledTimes(2)
    expect(logs).toHaveLength(200)
  })

  it('takes a short page for the last one, whatever the count said', async () => {
    const query = vi.fn<Query>().mockResolvedValueOnce(pageOf(100, 500, 1)).mockResolvedValueOnce(pageOf(30, 500, 101))
    const logs = await fetchAllAdminUsageLogs({ params, query, isCancelled: never, onProgress: vi.fn() })
    expect(query).toHaveBeenCalledTimes(2)
    expect(logs).toHaveLength(130)
  })

  it('keeps the count of the first page as its goal', async () => {
    const query = vi.fn<Query>().mockResolvedValueOnce(pageOf(100, 150, 1)).mockResolvedValueOnce(pageOf(100, 999, 101))
    const onProgress = vi.fn()
    const logs = await fetchAllAdminUsageLogs({ params, query, isCancelled: never, onProgress })
    expect(query).toHaveBeenCalledTimes(2)
    expect(logs).toHaveLength(200)
    expect(onProgress.mock.calls).toEqual([
      [100, 150],
      [200, 150],
    ])
  })

  it('gives no rows for an empty list, after asking once', async () => {
    const query = vi.fn<Query>().mockResolvedValueOnce(pageOf(0, 0))
    const onProgress = vi.fn()
    expect(await fetchAllAdminUsageLogs({ params, query, isCancelled: never, onProgress })).toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
    expect(onProgress.mock.calls).toEqual([[0, 0]])
  })

  it('gives null, and asks for nothing more, once it is cancelled', async () => {
    let isCancelled = false
    const query = vi.fn<Query>().mockImplementation(async (asked) => {
      // Cancelled while the second page is on its way.
      if (asked.page === 2) isCancelled = true
      return pageOf(100, 500, ((asked.page ?? 1) - 1) * 100 + 1)
    })
    const onProgress = vi.fn()
    expect(await fetchAllAdminUsageLogs({ params, query, isCancelled: () => isCancelled, onProgress })).toBeNull()
    expect(query).toHaveBeenCalledTimes(2)
    expect(onProgress.mock.calls).toEqual([[100, 500]])
  })

  it('ends at once when a page cannot be fetched', async () => {
    const failure = { status: 500 }
    const query = vi.fn<Query>().mockResolvedValueOnce(pageOf(100, 500, 1)).mockRejectedValueOnce(failure)
    await expect(fetchAllAdminUsageLogs({ params, query, isCancelled: never, onProgress: vi.fn() })).rejects.toBe(failure)
    expect(query).toHaveBeenCalledTimes(2)
  })
})
