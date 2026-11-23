import { describe, expect, it } from 'vitest'
import type { MonitorDimensions, MonitorFilter } from '@/api/channelMonitorV2'
import { groupOptions, modelOptions, platformOptions, pruneFilter } from './statusOptions'

const DIMENSIONS: MonitorDimensions = {
  platforms: [
    { value: 'openai', label: 'OpenAI', request_count: 900 },
    { value: 'anthropic', label: 'Anthropic', request_count: 400 },
  ],
  groups: [
    { id: 1, name: 'default', platform: 'openai', request_count: 600 },
    { id: 2, name: 'pro', platform: 'anthropic', request_count: 400 },
    { id: 3, name: '', platform: 'openai', request_count: 300 },
    { id: 4, name: 'shared', request_count: 10 },
  ],
  models: [
    { value: 'gpt-4o', label: 'gpt-4o', platform: 'openai', request_count: 500 },
    { value: 'claude-sonnet', label: 'anthropic claude-sonnet', platform: 'anthropic', request_count: 400 },
    { value: 'embedding', label: 'embedding', request_count: 5 },
  ],
}

const EMPTY: MonitorDimensions = { platforms: [], groups: [], models: [] }

describe('platformOptions', () => {
  it('lists every platform', () => {
    expect(platformOptions(DIMENSIONS)).toEqual([
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
    ])
  })

  it('lists a platform the server repeats once', () => {
    const twice = { ...EMPTY, platforms: [...DIMENSIONS.platforms, { value: 'openai', label: 'OpenAI again', request_count: 1 }] }
    expect(platformOptions(twice).map((option) => option.label)).toEqual(['OpenAI', 'Anthropic'])
  })

  it('is empty before the lists have loaded', () => {
    expect(platformOptions(EMPTY)).toEqual([])
  })
})

describe('groupOptions', () => {
  it('names a group by its platform and name, or by its number when it has no name', () => {
    expect(groupOptions(DIMENSIONS, [])).toEqual([
      { value: '1', label: 'openai / default' },
      { value: '2', label: 'anthropic / pro' },
      { value: '3', label: 'openai / #3' },
      { value: '4', label: 'shared' },
    ])
  })

  it('offers the groups of the chosen platforms, and the groups without a platform', () => {
    expect(groupOptions(DIMENSIONS, ['anthropic']).map((option) => option.value)).toEqual(['2', '4'])
    expect(groupOptions(DIMENSIONS, ['openai', 'anthropic']).map((option) => option.value)).toEqual(['1', '2', '3', '4'])
  })
})

describe('modelOptions', () => {
  it('puts the platform before a model name that does not already carry it', () => {
    expect(modelOptions(DIMENSIONS, [])).toEqual([
      { value: 'gpt-4o', label: 'openai / gpt-4o' },
      { value: 'claude-sonnet', label: 'anthropic claude-sonnet' },
      { value: 'embedding', label: 'embedding' },
    ])
  })

  it('offers the models of the chosen platforms, and the models without a platform', () => {
    expect(modelOptions(DIMENSIONS, ['openai']).map((option) => option.value)).toEqual(['gpt-4o', 'embedding'])
  })

  it('lists a model served by two platforms once', () => {
    const shared = {
      ...EMPTY,
      models: [
        { value: 'gpt-4o', label: 'gpt-4o', platform: 'openai', request_count: 5 },
        { value: 'gpt-4o', label: 'gpt-4o', platform: 'azure', request_count: 3 },
      ],
    }
    expect(modelOptions(shared, [])).toEqual([{ value: 'gpt-4o', label: 'openai / gpt-4o' }])
    expect(modelOptions(shared, ['azure'])).toEqual([{ value: 'gpt-4o', label: 'azure / gpt-4o' }])
  })
})

describe('pruneFilter', () => {
  const filter: MonitorFilter = { range: '24h', platforms: ['anthropic'], groupIds: [1, 2], models: ['gpt-4o', 'claude-sonnet'] }

  it('drops the groups and models the chosen platforms no longer offer', () => {
    const groups = groupOptions(DIMENSIONS, filter.platforms)
    const models = modelOptions(DIMENSIONS, filter.platforms)
    expect(pruneFilter(filter, groups, models)).toEqual({
      range: '24h',
      platforms: ['anthropic'],
      groupIds: [2],
      models: ['claude-sonnet'],
    })
  })

  it('returns the filter itself when everything chosen is still offered', () => {
    const groups = groupOptions(DIMENSIONS, [])
    const models = modelOptions(DIMENSIONS, [])
    expect(pruneFilter(filter, groups, models)).toBe(filter)
  })

  it('drops nothing while the lists have not loaded', () => {
    expect(pruneFilter(filter, [], [])).toBe(filter)
  })

  it('prunes groups and models independently', () => {
    const groups = groupOptions(DIMENSIONS, filter.platforms)
    expect(pruneFilter(filter, groups, [])).toEqual({ ...filter, groupIds: [2] })
    const models = modelOptions(DIMENSIONS, filter.platforms)
    expect(pruneFilter(filter, [], models)).toEqual({ ...filter, models: ['claude-sonnet'] })
  })
})
