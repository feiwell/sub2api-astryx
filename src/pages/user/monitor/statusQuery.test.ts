import { describe, expect, it } from 'vitest'
import { allowedTab, hasDimensionFilter, parseStatusQuery, statusQueryParams, type StatusView } from './statusQuery'

const parse = (query: string, canSeeUsers = true) => parseStatusQuery(new URLSearchParams(query), canSeeUsers)

const DEFAULT_VIEW: StatusView = {
  filter: { range: '90m', platforms: [], groupIds: [], models: [] },
  tab: 'models',
  groupBy: 'platform_group',
  healthMode: 'overall',
  trendView: 'pulse',
}

describe('parseStatusQuery', () => {
  it('gives the default view for an address without parameters', () => {
    expect(parse('')).toEqual(DEFAULT_VIEW)
  })

  it('reads every parameter', () => {
    expect(
      parse('range=7d&platform=openai,anthropic&group=3,12&model=gpt-4o,claude&group_by=platform_model&health_mode=ttft&trend_view=line&tab=errors'),
    ).toEqual({
      filter: { range: '7d', platforms: ['openai', 'anthropic'], groupIds: [3, 12], models: ['gpt-4o', 'claude'] },
      tab: 'errors',
      groupBy: 'platform_model',
      healthMode: 'ttft',
      trendView: 'line',
    })
  })

  it('falls back to the default for values it does not know', () => {
    expect(parse('range=1y&group_by=user&health_mode=speed&trend_view=bars&tab=settings')).toEqual(DEFAULT_VIEW)
  })

  it('keeps only group ids that are whole numbers above zero', () => {
    expect(parse('group=5,abc,0,-2,1.5,,8').filter.groupIds).toEqual([5, 8])
  })

  it('skips empty entries in a list', () => {
    expect(parse('platform=,openai,,').filter.platforms).toEqual(['openai'])
  })

  it('opens the models tab for a viewer who may not see the user ranking', () => {
    expect(parse('tab=users', false).tab).toBe('models')
    expect(parse('tab=users', true).tab).toBe('users')
    expect(parse('tab=errors', false).tab).toBe('errors')
  })
})

describe('allowedTab', () => {
  it('replaces only the users tab, and only when it is not allowed', () => {
    expect(allowedTab('users', false)).toBe('models')
    expect(allowedTab('users', true)).toBe('users')
    expect(allowedTab('errors', false)).toBe('errors')
    expect(allowedTab('models', false)).toBe('models')
  })
})

describe('statusQueryParams', () => {
  it('leaves out empty filters and the default trend view', () => {
    expect(statusQueryParams(DEFAULT_VIEW)).toEqual({
      range: '90m',
      group_by: 'platform_group',
      health_mode: 'overall',
      tab: 'models',
    })
  })

  it('writes chosen filters as comma separated lists', () => {
    expect(
      statusQueryParams({
        filter: { range: '24h', platforms: ['openai', 'gemini'], groupIds: [3, 12], models: ['gpt-4o'] },
        tab: 'users',
        groupBy: 'platform',
        healthMode: 'cache',
        trendView: 'line',
      }),
    ).toEqual({
      range: '24h',
      platform: 'openai,gemini',
      group: '3,12',
      model: 'gpt-4o',
      group_by: 'platform',
      health_mode: 'cache',
      trend_view: 'line',
      tab: 'users',
    })
  })

  it('survives a trip through the address', () => {
    const view: StatusView = {
      filter: { range: '30d', platforms: ['openai'], groupIds: [7], models: ['gpt-4o', 'o3'] },
      tab: 'errors',
      groupBy: 'platform_group_model',
      healthMode: 'success',
      trendView: 'line',
    }
    const address = new URLSearchParams(statusQueryParams(view)).toString()
    expect(parse(address)).toEqual(view)
    expect(parse(new URLSearchParams(statusQueryParams(DEFAULT_VIEW)).toString())).toEqual(DEFAULT_VIEW)
  })
})

describe('hasDimensionFilter', () => {
  it('is true once a platform, group or model is chosen', () => {
    const none = DEFAULT_VIEW.filter
    expect(hasDimensionFilter(none)).toBe(false)
    expect(hasDimensionFilter({ ...none, range: '30d' })).toBe(false)
    expect(hasDimensionFilter({ ...none, platforms: ['openai'] })).toBe(true)
    expect(hasDimensionFilter({ ...none, groupIds: [1] })).toBe(true)
    expect(hasDimensionFilter({ ...none, models: ['gpt-4o'] })).toBe(true)
  })
})
