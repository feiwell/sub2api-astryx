import { describe, expect, it } from 'vitest'
import { NEWEST_FIRST } from '~/pages/user/usage/usageQuery'
import {
  buildAdminErrorParams,
  buildAdminListParams,
  buildAdminUsageParams,
  buildCleanupRequest,
  buildModelStatsParams,
  buildSnapshotParams,
  buildUserBreakdownParams,
  buildUserRankingParams,
  cleanupFiltersOf,
  emptyAdminUsageFilters,
  filtersFromRoute,
  userBreakdownScope,
  type AdminUsageFilters,
} from './adminUsageQuery'

// A local time: a range is made of the calendar days of the browser, whatever its time zone.
const NOW = new Date(2026, 10, 21, 9, 30)
const filters = (patch: Partial<AdminUsageFilters>): AdminUsageFilters => ({ ...emptyAdminUsageFilters(NOW), ...patch })
/** What actually goes on the wire: a parameter that is undefined is not sent. */
const sent = (query: object) => JSON.parse(JSON.stringify(query))

const OPENING_RANGE = { start_date: '2026-11-21', end_date: '2026-11-21' }

// Every filter of the page set at once.
const NARROWED = filters({
  range: { start: '2026-03-01', end: '2026-03-08' },
  user: { id: 7, label: 'ann@example.test' },
  apiKey: { id: 31, label: 'ci' },
  account: { id: 5, label: 'claude-1' },
  model: 'claude-sonnet-4',
  groupId: 3,
  requestType: 'stream',
  isCompactedOnly: true,
  billingType: 1,
  billingMode: 'image',
  hasModelMismatch: true,
  errorPhase: 'upstream',
  errorCategory: 'rate_limit',
  statusCode: 429,
})
// What every usage figure is asked by when all of them are set.
const SHARED = {
  start_date: '2026-03-01',
  end_date: '2026-03-08',
  user_id: 7,
  api_key_id: 31,
  account_id: 5,
  group_id: 3,
  model: 'claude-sonnet-4',
  request_type: 'stream',
  stream: true,
  native_compaction_v2: true,
  billing_type: 1,
  upstream_model_mismatch: true,
}

describe('the filters the page opens with', () => {
  it('opens on today with nothing else narrowed', () => {
    expect(sent(buildAdminUsageParams(emptyAdminUsageFilters(NOW)))).toEqual(OPENING_RANGE)
  })

  it('takes a user and a range from the link that opened the page', () => {
    const opened = filtersFromRoute('?user_id=7&start_date=2026-03-01&end_date=2026-03-08', NOW)
    expect(opened.range).toEqual({ start: '2026-03-01', end: '2026-03-08' })
    // The id stands in for the name until the user has been looked up.
    expect(opened.user).toEqual({ id: 7, label: '7' })
  })

  it('takes one end of the range and keeps the other', () => {
    expect(filtersFromRoute('?start_date=2026-11-01', NOW).range).toEqual({ start: '2026-11-01', end: '2026-11-21' })
    expect(filtersFromRoute('?end_date=2026-11-20', NOW).range).toEqual({ start: '2026-11-20', end: '2026-11-20' })
  })

  it('ignores what a link cannot mean', () => {
    for (const search of ['', '?user_id=abc', '?user_id=0', '?user_id=-4', '?start_date=yesterday&end_date=2026/03/08']) {
      expect(filtersFromRoute(search, NOW)).toEqual(emptyAdminUsageFilters(NOW))
    }
  })
})

describe('the list and the figure cards', () => {
  it('send every filter of a successful request, and none of the failed-request ones', () => {
    expect(sent(buildAdminUsageParams(NARROWED))).toEqual({ ...SHARED, billing_mode: 'image' })
  })

  it('ask for one page in the order of the table, with an estimated total', () => {
    expect(sent(buildAdminListParams(NARROWED, 3, 50, { by: 'model', order: 'asc' }, false))).toEqual({
      ...SHARED,
      billing_mode: 'image',
      page: 3,
      page_size: 50,
      exact_total: false,
      sort_by: 'model',
      sort_order: 'asc',
    })
  })

  it('ask for the true total when every row is going to be fetched', () => {
    expect(sent(buildAdminListParams(filters({}), 1, 100, NEWEST_FIRST, true))).toEqual({
      ...OPENING_RANGE,
      page: 1,
      page_size: 100,
      exact_total: true,
      sort_by: 'created_at',
      sort_order: 'desc',
    })
  })

  it('send the older stream flag only for the types that have one', () => {
    const streamFlag = (requestType: AdminUsageFilters['requestType']) =>
      sent(buildAdminUsageParams(filters({ requestType }))).stream
    expect(streamFlag('sync')).toBe(false)
    expect(streamFlag('stream')).toBe(true)
    expect(streamFlag('ws_v2')).toBe(true)
    expect(streamFlag('live')).toBeUndefined()
    expect(streamFlag('cyber')).toBeUndefined()
    expect(streamFlag(null)).toBeUndefined()
  })

  it('tell "answered as asked" from "not filtered by it"', () => {
    const audit = (hasModelMismatch: boolean | null) =>
      sent(buildAdminUsageParams(filters({ hasModelMismatch }))).upstream_model_mismatch
    expect(audit(true)).toBe(true)
    expect(audit(false)).toBe(false)
    expect(audit(null)).toBeUndefined()
  })

  it('keep a balance billing type, which is zero', () => {
    expect(sent(buildAdminUsageParams(filters({ billingType: 0 }))).billing_type).toBe(0)
  })
})

describe('the charts', () => {
  it('ask the model distribution by its source, without the billing mode', () => {
    expect(sent(buildModelStatsParams(NARROWED, 'upstream'))).toEqual({ ...SHARED, model_source: 'upstream' })
    expect(sent(buildModelStatsParams(filters({}), 'mapping'))).toEqual({ ...OPENING_RANGE, model_source: 'mapping' })
  })

  it('ask for the trend and the groups only, without the billing mode', () => {
    expect(sent(buildSnapshotParams(NARROWED, 'hour'))).toEqual({
      ...SHARED,
      granularity: 'hour',
      include_stats: false,
      include_trend: true,
      include_model_stats: false,
      include_group_stats: true,
      include_users_trend: false,
    })
  })
})

describe('the user ranking', () => {
  it('takes the filters the ranking knows: no stream flag, billing mode or model audit', () => {
    expect(sent(buildUserRankingParams(NARROWED, 'total_tokens', 50))).toEqual({
      start_date: '2026-03-01',
      end_date: '2026-03-08',
      user_id: 7,
      api_key_id: 31,
      account_id: 5,
      group_id: 3,
      model: 'claude-sonnet-4',
      request_type: 'stream',
      native_compaction_v2: true,
      billing_type: 1,
      sort_by: 'total_tokens',
      limit: 50,
    })
  })

  it('asks for the range alone when nothing is narrowed', () => {
    expect(sent(buildUserRankingParams(filters({}), 'actual_cost', 200))).toEqual({
      ...OPENING_RANGE,
      sort_by: 'actual_cost',
      limit: 200,
    })
  })
})

describe('the users behind a row of a chart', () => {
  // What the ranking and the breakdowns share when every filter is set.
  const PER_USER = {
    start_date: '2026-03-01',
    end_date: '2026-03-08',
    user_id: 7,
    api_key_id: 31,
    account_id: 5,
    group_id: 3,
    model: 'claude-sonnet-4',
    request_type: 'stream',
    native_compaction_v2: true,
    billing_type: 1,
  }

  it('are asked by the model of the row, as the chart counts models, in place of the model filter', () => {
    expect(sent(buildUserBreakdownParams(NARROWED, { model: 'claude-opus-4', source: 'upstream' }))).toEqual({
      ...PER_USER,
      model: 'claude-opus-4',
      model_source: 'upstream',
    })
  })

  it('are asked by the group of the row in place of the group filter', () => {
    expect(sent(buildUserBreakdownParams(NARROWED, { groupId: 12 }))).toEqual({ ...PER_USER, group_id: 12 })
  })

  it('are asked by the endpoint of the row, as the chart counts endpoints', () => {
    expect(sent(buildUserBreakdownParams(NARROWED, { endpoint: '/v1/messages', source: 'path' }))).toEqual({
      ...PER_USER,
      endpoint: '/v1/messages',
      endpoint_type: 'path',
    })
    expect(sent(buildUserBreakdownParams(filters({}), { endpoint: '/v1/responses', source: 'inbound' }))).toEqual({
      ...OPENING_RANGE,
      endpoint: '/v1/responses',
      endpoint_type: 'inbound',
    })
  })

  it('are out of date once a filter they were asked under changes, the group filter included', () => {
    const scope = userBreakdownScope(filters({ groupId: 2 }))
    expect(userBreakdownScope(filters({ groupId: 3 }))).not.toBe(scope)
    expect(userBreakdownScope(filters({ groupId: 2, model: 'gpt-5' }))).not.toBe(scope)
    expect(userBreakdownScope(filters({ groupId: 2, user: { id: 7, label: 'ann@example.test' } }))).not.toBe(scope)
  })

  it('stay as they are when a filter they cannot be asked under changes', () => {
    const scope = userBreakdownScope(filters({ groupId: 2 }))
    expect(userBreakdownScope(filters({ groupId: 2, billingMode: 'image', hasModelMismatch: true }))).toBe(scope)
    expect(userBreakdownScope(filters({ groupId: 2, errorPhase: 'upstream', statusCode: 429 }))).toBe(scope)
  })
})

describe('the failed requests', () => {
  it('cover the days of the range from their first moment to their last, where the browser is', () => {
    const params = buildAdminErrorParams(NARROWED, 2, 20, NEWEST_FIRST)
    expect(params.start_time).toBe(new Date(2026, 2, 1, 0, 0, 0, 0).toISOString())
    expect(params.end_time).toBe(new Date(2026, 2, 8, 23, 59, 59, 999).toISOString())
  })

  it('send who and what failed and how, but nothing that only a successful request has', () => {
    const { start_time: _start, end_time: _end, ...rest } = sent(buildAdminErrorParams(NARROWED, 2, 20, NEWEST_FIRST))
    expect(rest).toEqual({
      page: 2,
      page_size: 20,
      view: 'all',
      user_id: 7,
      api_key_id: 31,
      account_id: 5,
      group_id: 3,
      model: 'claude-sonnet-4',
      phase: 'upstream',
      category: 'rate_limit',
      status_codes: '429',
      sort_by: 'created_at',
      sort_order: 'desc',
    })
  })

  it('leave out every filter that is not set', () => {
    expect(Object.keys(sent(buildAdminErrorParams(filters({}), 1, 20, NEWEST_FIRST))).sort()).toEqual(
      ['end_time', 'page', 'page_size', 'sort_by', 'sort_order', 'start_time', 'view'].sort(),
    )
  })
})

describe('a cleanup task', () => {
  it('deletes by the filters a cleanup can use, and drops the rest', () => {
    expect(cleanupFiltersOf(NARROWED)).toEqual({
      range: { start: '2026-03-01', end: '2026-03-08' },
      user: { id: 7, label: 'ann@example.test' },
      apiKey: { id: 31, label: 'ci' },
      account: { id: 5, label: 'claude-1' },
      model: 'claude-sonnet-4',
      groupId: 3,
      requestType: 'stream',
      billingType: 1,
    })
    expect(buildCleanupRequest(cleanupFiltersOf(NARROWED), 'Asia/Shanghai')).toEqual({
      start_date: '2026-03-01',
      end_date: '2026-03-08',
      timezone: 'Asia/Shanghai',
      user_id: 7,
      api_key_id: 31,
      account_id: 5,
      group_id: 3,
      model: 'claude-sonnet-4',
      request_type: 'stream',
      stream: true,
      billing_type: 1,
    })
  })

  it('is asked for the range and the time zone alone when nothing is narrowed', () => {
    expect(buildCleanupRequest(cleanupFiltersOf(filters({})), 'UTC')).toEqual({
      start_date: '2026-11-21',
      end_date: '2026-11-21',
      timezone: 'UTC',
    })
  })

  it('names a type that has no stream flag without one, and keeps a balance billing type', () => {
    const request = buildCleanupRequest(cleanupFiltersOf(filters({ requestType: 'live', billingType: 0 })), 'UTC')
    expect(request.request_type).toBe('live')
    expect('stream' in request).toBe(false)
    expect(request.billing_type).toBe(0)
  })
})
