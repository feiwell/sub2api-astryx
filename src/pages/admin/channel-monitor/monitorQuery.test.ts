import { describe, expect, it } from 'vitest'
import {
  buildMonitorListParams,
  emptyMonitorFilters,
  extraModelsOf,
  toEnabledFilter,
  toProvider,
} from './monitorQuery'

describe('what the list of monitors asks the server for', () => {
  it('is the page alone while nothing narrows the list', () => {
    expect(buildMonitorListParams(emptyMonitorFilters(), 1, 20)).toEqual({ page: 1, page_size: 20 })
  })

  it('names the provider that was picked', () => {
    const filters = { ...emptyMonitorFilters(), provider: 'anthropic' as const }
    expect(buildMonitorListParams(filters, 2, 50)).toEqual({ page: 2, page_size: 50, provider: 'anthropic' })
  })

  it('sends "enabled" as true or false, not as the text the list holds', () => {
    expect(buildMonitorListParams({ ...emptyMonitorFilters(), enabled: 'true' }, 1, 20)).toEqual({
      page: 1,
      page_size: 20,
      enabled: true,
    })
    expect(buildMonitorListParams({ ...emptyMonitorFilters(), enabled: 'false' }, 1, 20)).toEqual({
      page: 1,
      page_size: 20,
      enabled: false,
    })
  })

  it('sends the search without the blanks around it, and not at all when it is blank', () => {
    expect(buildMonitorListParams({ ...emptyMonitorFilters(), search: '  claude  ' }, 1, 20)).toEqual({
      page: 1,
      page_size: 20,
      search: 'claude',
    })
    expect(buildMonitorListParams({ ...emptyMonitorFilters(), search: '   ' }, 1, 20)).toEqual({
      page: 1,
      page_size: 20,
    })
  })

  it('sends every filter that is set', () => {
    expect(buildMonitorListParams({ search: 'main', provider: 'openai', enabled: 'false' }, 3, 10)).toEqual({
      page: 3,
      page_size: 10,
      provider: 'openai',
      enabled: false,
      search: 'main',
    })
  })
})

describe('a value picked from a filter list', () => {
  it('is a provider when it names one', () => {
    expect(toProvider('gemini')).toBe('gemini')
    expect(toProvider('opencode_go')).toBe('opencode_go')
  })

  it('is no provider otherwise', () => {
    expect(toProvider('__all__')).toBe('')
    expect(toProvider('')).toBe('')
    expect(toProvider('OpenAI')).toBe('')
  })

  it('is an enabled filter only as "true" or "false"', () => {
    expect(toEnabledFilter('true')).toBe('true')
    expect(toEnabledFilter('false')).toBe('false')
    expect(toEnabledFilter('__all__')).toBe('')
    expect(toEnabledFilter('yes')).toBe('')
  })
})

describe('the extra models of a monitor', () => {
  it('are the ones that were checked, as the server lists them', () => {
    const checked = [
      { model: 'gpt-5-mini', status: 'operational' as const, latency_ms: 420 },
      { model: 'gpt-5-nano', status: 'failed' as const, latency_ms: null },
    ]
    expect(extraModelsOf({ extra_models: ['gpt-5-mini', 'gpt-5-nano'], extra_models_status: checked })).toEqual(checked)
  })

  it('list a model added since the last check after them, without a result', () => {
    const checked = [{ model: 'gpt-5-mini', status: 'operational' as const, latency_ms: 420 }]
    expect(extraModelsOf({ extra_models: ['gpt-5-nano', 'gpt-5-mini'], extra_models_status: checked })).toEqual([
      ...checked,
      { model: 'gpt-5-nano', status: '', latency_ms: null },
    ])
  })

  it('list every model of a monitor that was never checked', () => {
    expect(extraModelsOf({ extra_models: ['a', 'b'], extra_models_status: [] })).toEqual([
      { model: 'a', status: '', latency_ms: null },
      { model: 'b', status: '', latency_ms: null },
    ])
  })

  it('list a model once, however often it was entered', () => {
    expect(extraModelsOf({ extra_models: ['a', 'a'], extra_models_status: [] })).toEqual([
      { model: 'a', status: '', latency_ms: null },
    ])
  })

  it('are none for a monitor that has none, or one the server sent without the lists', () => {
    expect(extraModelsOf({ extra_models: [], extra_models_status: [] })).toEqual([])
    const bare = {} as Parameters<typeof extraModelsOf>[0]
    expect(extraModelsOf(bare)).toEqual([])
  })
})
