import { describe, expect, it } from 'vitest'
import {
  NEWEST_FIRST,
  USAGE_RANGE_PRESETS,
  buildUsageErrorParams,
  buildUsageFilterParams,
  buildUsageListParams,
  emptyUsageErrorFilters,
  emptyUsageFilters,
  granularityForRange,
  last24HoursRange,
  latestPickableDate,
  mergeModelOptions,
  nextSort,
  type UsageFilters,
} from './usageQuery'

// Local times: a range is made of the calendar days of the browser, whatever its time zone.
const NOW = new Date(2026, 10, 21, 9, 30)
const NEW_YEAR = new Date(2027, 0, 1, 0, 10)

const preset = (labelKey: string, now: Date) => {
  const found = USAGE_RANGE_PRESETS.find((item) => item.labelKey === labelKey)
  if (!found) throw new Error(`no preset named ${labelKey}`)
  return found.range(now)
}
const filters = (patch: Partial<UsageFilters>): UsageFilters => ({ ...emptyUsageFilters(NOW), ...patch })
/** What actually goes on the wire: a parameter that is undefined is not sent. */
const sent = (query: object) => JSON.parse(JSON.stringify(query))

describe('the date ranges', () => {
  it('opens on the two calendar days the last 24 hours fall on', () => {
    expect(last24HoursRange(NOW)).toEqual({ start: '2026-11-20', end: '2026-11-21' })
    expect(last24HoursRange(NEW_YEAR)).toEqual({ start: '2026-12-31', end: '2027-01-01' })
  })

  it('counts today as the last of "the last N days"', () => {
    expect(preset('dates.today', NOW)).toEqual({ start: '2026-11-21', end: '2026-11-21' })
    expect(preset('dates.last7Days', NOW)).toEqual({ start: '2026-11-15', end: '2026-11-21' })
    expect(preset('dates.last14Days', NOW)).toEqual({ start: '2026-11-08', end: '2026-11-21' })
    expect(preset('dates.last30Days', NOW)).toEqual({ start: '2026-10-23', end: '2026-11-21' })
  })

  it('gives yesterday as a single day, across a year end too', () => {
    expect(preset('dates.yesterday', NOW)).toEqual({ start: '2026-11-20', end: '2026-11-20' })
    expect(preset('dates.yesterday', NEW_YEAR)).toEqual({ start: '2026-12-31', end: '2026-12-31' })
  })

  it('runs this month from its first day to today, and last month over all of its days', () => {
    expect(preset('dates.thisMonth', NOW)).toEqual({ start: '2026-11-01', end: '2026-11-21' })
    expect(preset('dates.lastMonth', NOW)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(preset('dates.lastMonth', NEW_YEAR)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
    expect(preset('dates.lastMonth', new Date(2028, 2, 15))).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('offers the eight quick ranges of the Vue date picker, in its order', () => {
    expect(USAGE_RANGE_PRESETS.map((item) => item.labelKey)).toEqual([
      'dates.today',
      'dates.yesterday',
      'dates.last24Hours',
      'dates.last7Days',
      'dates.last14Days',
      'dates.last30Days',
      'dates.thisMonth',
      'dates.lastMonth',
    ])
    expect(preset('dates.last24Hours', NOW)).toEqual(last24HoursRange(NOW))
  })

  it('lets tomorrow be picked, and no day after it', () => {
    expect(latestPickableDate(NOW)).toBe('2026-11-22')
    expect(latestPickableDate(new Date(2026, 11, 31, 23, 59))).toBe('2027-01-01')
  })
})

describe('granularityForRange', () => {
  it('plots by the hour while the range ends at most a day after it starts', () => {
    expect(granularityForRange({ start: '2026-11-21', end: '2026-11-21' })).toBe('hour')
    expect(granularityForRange({ start: '2026-11-20', end: '2026-11-21' })).toBe('hour')
  })

  it('plots by the day beyond that', () => {
    expect(granularityForRange({ start: '2026-11-19', end: '2026-11-21' })).toBe('day')
    expect(granularityForRange({ start: '2026-10-23', end: '2026-11-21' })).toBe('day')
  })
})

describe('buildUsageFilterParams', () => {
  it('sends only the dates when nothing is filtered', () => {
    expect(sent(buildUsageFilterParams(emptyUsageFilters(NOW)))).toEqual({
      start_date: '2026-11-20',
      end_date: '2026-11-21',
    })
  })

  it('sends every filter that is set', () => {
    const params = buildUsageFilterParams(
      filters({
        range: { start: '2026-11-01', end: '2026-11-21' },
        apiKeyId: 7,
        model: 'gpt-5',
        groupId: 3,
        requestType: 'stream',
        isCompactedOnly: true,
        billingType: 1,
        billingMode: 'per_request',
      }),
    )
    expect(sent(params)).toEqual({
      start_date: '2026-11-01',
      end_date: '2026-11-21',
      api_key_id: 7,
      model: 'gpt-5',
      group_id: 3,
      request_type: 'stream',
      stream: true,
      native_compaction_v2: true,
      billing_type: 1,
      billing_mode: 'per_request',
    })
  })

  it('keeps the balance billing type, whose number is zero', () => {
    expect(sent(buildUsageFilterParams(filters({ billingType: 0 }))).billing_type).toBe(0)
  })

  it('sends the older stream flag only for the types that have one', () => {
    const streamFlag = (requestType: UsageFilters['requestType']) =>
      sent(buildUsageFilterParams(filters({ requestType }))).stream
    expect(streamFlag('sync')).toBe(false)
    expect(streamFlag('stream')).toBe(true)
    expect(streamFlag('ws_v2')).toBe(true)
    expect(streamFlag('live')).toBeUndefined()
    expect(streamFlag(null)).toBeUndefined()
  })

  it('never asks for "not compacted": the filter is either on or absent', () => {
    expect('native_compaction_v2' in sent(buildUsageFilterParams(filters({ isCompactedOnly: false })))).toBe(false)
  })
})

describe('buildUsageListParams', () => {
  it('adds the page and the sort order to the filters', () => {
    expect(sent(buildUsageListParams(filters({ model: 'gpt-5' }), 2, 50, { by: 'model', order: 'asc' }))).toEqual({
      page: 2,
      page_size: 50,
      start_date: '2026-11-20',
      end_date: '2026-11-21',
      model: 'gpt-5',
      sort_by: 'model',
      sort_order: 'asc',
    })
  })

  it('lists the newest first by default', () => {
    const params = buildUsageListParams(emptyUsageFilters(NOW), 1, 20, NEWEST_FIRST)
    expect([params.sort_by, params.sort_order]).toEqual(['created_at', 'desc'])
  })
})

describe('nextSort', () => {
  it('takes the order the table asks for', () => {
    expect(nextSort(NEWEST_FIRST, { by: 'model', order: 'asc' })).toEqual({ by: 'model', order: 'asc' })
    expect(nextSort({ by: 'model', order: 'asc' }, { by: 'model', order: 'desc' })).toEqual({ by: 'model', order: 'desc' })
  })

  it('goes back to newest first when another order is cleared', () => {
    expect(nextSort({ by: 'model', order: 'desc' }, null)).toEqual(NEWEST_FIRST)
    expect(nextSort({ by: 'status_code', order: 'desc' }, null)).toEqual(NEWEST_FIRST)
  })

  it('turns newest first around when it is the order cleared, and comes back from there', () => {
    const oldestFirst = nextSort(NEWEST_FIRST, null)
    expect(oldestFirst).toEqual({ by: 'created_at', order: 'asc' })
    expect(nextSort(oldestFirst, null)).toEqual(NEWEST_FIRST)
    expect(nextSort(oldestFirst, { by: 'created_at', order: 'desc' })).toEqual(NEWEST_FIRST)
  })
})

describe('buildUsageErrorParams', () => {
  const range = { start: '2026-11-20', end: '2026-11-21' } as const

  it('sends the range, the page and the sort order when nothing is filtered', () => {
    expect(sent(buildUsageErrorParams(range, emptyUsageErrorFilters(), 1, 20, NEWEST_FIRST))).toEqual({
      page: 1,
      page_size: 20,
      start_date: '2026-11-20',
      end_date: '2026-11-21',
      sort_by: 'created_at',
      sort_order: 'desc',
    })
  })

  it('trims the model text and sends the filters that are set', () => {
    const params = buildUsageErrorParams(
      range,
      { apiKeyId: 7, model: '  claude ', category: 'rate_limit', statusCode: 429 },
      3,
      50,
      { by: 'status_code', order: 'asc' },
    )
    expect(sent(params)).toEqual({
      page: 3,
      page_size: 50,
      start_date: '2026-11-20',
      end_date: '2026-11-21',
      model: 'claude',
      category: 'rate_limit',
      api_key_id: 7,
      status_code: 429,
      sort_by: 'status_code',
      sort_order: 'asc',
    })
  })

  it('leaves out a model that is only spaces', () => {
    const params = buildUsageErrorParams(range, { ...emptyUsageErrorFilters(), model: '   ' }, 1, 20, NEWEST_FIRST)
    expect('model' in sent(params)).toBe(false)
  })
})

describe('mergeModelOptions', () => {
  it('keeps the names seen before, adds the new ones, and sorts them', () => {
    expect(mergeModelOptions(['gpt-5', 'claude-opus'], [{ model: 'gemini-pro' }, { model: 'gpt-5' }], null)).toEqual([
      'claude-opus',
      'gemini-pro',
      'gpt-5',
    ])
  })

  it('keeps the model filtered by on offer even when the new figures no longer name it', () => {
    expect(mergeModelOptions([], [{ model: 'gpt-5' }], 'o3')).toEqual(['gpt-5', 'o3'])
  })

  it('skips figures without a model name', () => {
    expect(mergeModelOptions([], [{ model: '' }, { model: 'gpt-5' }], null)).toEqual(['gpt-5'])
  })
})
