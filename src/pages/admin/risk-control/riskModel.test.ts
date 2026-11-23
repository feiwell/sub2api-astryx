import { describe, expect, it } from 'vitest'
import {
  API_KEY_STATUS_ORDER,
  apiKeyStatusColor,
  apiKeyStatusLabelKey,
  engineLabel,
  modeLabel,
  modelFilterSummary,
  normalizeModelFilter,
  normalizeModelFilterType,
  normalizeModelNames,
} from './riskModel'

const t = (key: string) => `<${key}>`

describe('engineLabel', () => {
  it('names the two engines', () => {
    expect(engineLabel('openai')).toBe('OpenAI')
    expect(engineLabel('typesafe')).toBe('TypeSafe AI')
  })

  it('reads a config without an engine as OpenAI', () => {
    expect(engineLabel(undefined)).toBe('OpenAI')
  })
})

describe('modeLabel', () => {
  it('translates the three modes', () => {
    expect(modeLabel('pre_block', t)).toBe('<admin.riskControl.modePreBlock>')
    expect(modeLabel('observe', t)).toBe('<admin.riskControl.modeObserve>')
    expect(modeLabel('off', t)).toBe('<admin.riskControl.modeOff>')
  })

  it('shows an unknown mode as the server spells it', () => {
    expect(modeLabel('shadow', t)).toBe('shadow')
  })

  it('does not take object members for modes', () => {
    expect(modeLabel('constructor', t)).toBe('constructor')
    expect(modeLabel('', t)).toBe('')
  })
})

describe('normalizeModelFilterType', () => {
  it('keeps the three known types', () => {
    expect(normalizeModelFilterType('all')).toBe('all')
    expect(normalizeModelFilterType('include')).toBe('include')
    expect(normalizeModelFilterType('exclude')).toBe('exclude')
  })

  it('reads anything else as all', () => {
    expect(normalizeModelFilterType('only')).toBe('all')
    expect(normalizeModelFilterType(undefined)).toBe('all')
    expect(normalizeModelFilterType(null)).toBe('all')
    expect(normalizeModelFilterType(1)).toBe('all')
  })
})

describe('normalizeModelNames', () => {
  it('trims names and drops blanks', () => {
    expect(normalizeModelNames(['  gpt-4o ', '', '   ', 'claude-3'])).toEqual(['gpt-4o', 'claude-3'])
  })

  it('keeps each name once whatever its letter case, in its first spelling', () => {
    expect(normalizeModelNames(['GPT-4o', 'gpt-4o', 'claude-3', 'Claude-3 '])).toEqual(['GPT-4o', 'claude-3'])
  })

  it('keeps the order names were given in', () => {
    expect(normalizeModelNames(['b', 'a', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('reads entries that are not text as text, and missing ones as blank', () => {
    expect(normalizeModelNames([42, null, undefined, 'x'])).toEqual(['42', 'x'])
  })

  it('answers an empty list for what is not a list', () => {
    expect(normalizeModelNames(undefined)).toEqual([])
    expect(normalizeModelNames('gpt-4o')).toEqual([])
    expect(normalizeModelNames({ 0: 'gpt-4o' })).toEqual([])
  })
})

describe('normalizeModelFilter', () => {
  it('reads a missing filter as all models', () => {
    expect(normalizeModelFilter(undefined)).toEqual({ type: 'all', models: [] })
    expect(normalizeModelFilter(null)).toEqual({ type: 'all', models: [] })
    expect(normalizeModelFilter('include')).toEqual({ type: 'all', models: [] })
  })

  it('drops the list of a filter for all models', () => {
    expect(normalizeModelFilter({ type: 'all', models: ['gpt-4o'] })).toEqual({ type: 'all', models: [] })
  })

  it('tidies the list of an include or exclude filter', () => {
    expect(normalizeModelFilter({ type: 'include', models: [' a ', 'A', 'b'] })).toEqual({ type: 'include', models: ['a', 'b'] })
    expect(normalizeModelFilter({ type: 'exclude', models: ['x'] })).toEqual({ type: 'exclude', models: ['x'] })
  })

  it('reads an unknown type as all models', () => {
    expect(normalizeModelFilter({ type: 'only', models: ['gpt-4o'] })).toEqual({ type: 'all', models: [] })
  })

  it('answers an empty list when the filter has none', () => {
    expect(normalizeModelFilter({ type: 'include' })).toEqual({ type: 'include', models: [] })
  })
})

describe('modelFilterSummary', () => {
  const counted = (key: string, params?: Record<string, unknown>) => (params ? `<${key} ${params.count}>` : `<${key}>`)

  it('says that every model is audited', () => {
    expect(modelFilterSummary({ type: 'all', models: [] }, counted)).toBe('<admin.riskControl.modelFilterAllSummary>')
  })

  it('counts the models a filter keeps in or out', () => {
    expect(modelFilterSummary({ type: 'include', models: ['a', 'b', 'c'] }, counted)).toBe(
      '<admin.riskControl.modelFilterIncludeSummary 3>',
    )
    expect(modelFilterSummary({ type: 'exclude', models: ['a'] }, counted)).toBe('<admin.riskControl.modelFilterExcludeSummary 1>')
  })
})

describe('API key states', () => {
  it('tells usable keys first, then the ones that need attention', () => {
    expect(API_KEY_STATUS_ORDER).toEqual(['ok', 'frozen', 'error', 'unknown'])
  })

  it('has a label for each state', () => {
    expect(apiKeyStatusLabelKey('ok')).toBe('admin.riskControl.apiKeyStatusOk')
    expect(apiKeyStatusLabelKey('error')).toBe('admin.riskControl.apiKeyStatusError')
    expect(apiKeyStatusLabelKey('frozen')).toBe('admin.riskControl.apiKeyStatusFrozen')
    expect(apiKeyStatusLabelKey('unknown')).toBe('admin.riskControl.apiKeyStatusUnknown')
  })

  it('labels a state it does not know as not tested', () => {
    expect(apiKeyStatusLabelKey('retired')).toBe('admin.riskControl.apiKeyStatusUnknown')
    expect(apiKeyStatusLabelKey('toString')).toBe('admin.riskControl.apiKeyStatusUnknown')
  })

  it('colours a frozen key red and a failing key orange', () => {
    expect(apiKeyStatusColor('ok')).toBe('green')
    expect(apiKeyStatusColor('error')).toBe('orange')
    expect(apiKeyStatusColor('frozen')).toBe('red')
    expect(apiKeyStatusColor('unknown')).toBe('gray')
    expect(apiKeyStatusColor('retired')).toBe('gray')
  })
})
