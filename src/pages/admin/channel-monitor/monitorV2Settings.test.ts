import { describe, expect, it } from 'vitest'
import { MONITOR_ERROR_CATEGORIES, type MonitorConfig } from '@/api/channelMonitorV2'
import {
  countedCategoryCount,
  DEFAULT_IGNORED_CATEGORIES,
  DEFAULT_THRESHOLDS,
  ignoredCategories,
  isSameConfig,
  namedModelCount,
  normalConfig,
  percentOf,
  platformsToAdd,
  rateOf,
  settingsPlatformName,
  unlistedGroupIds,
  withGroups,
  withIgnoredCategories,
  withPlatformAdded,
  withPlatformEnabled,
  withPlatformModels,
  withPlatformModelsAdded,
  withThreshold,
} from './monitorV2Settings'

function config(change: Partial<MonitorConfig> = {}): MonitorConfig {
  return {
    version: 3,
    enabled: true,
    refresh_interval_seconds: 300,
    platforms: [
      { platform: 'anthropic', enabled: true, models: ['claude-fable-5', 'claude-sonnet-4-5'] },
      { platform: 'openai', enabled: false, models: ['gpt-5'] },
      { platform: 'gemini', enabled: true, models: [] },
    ],
    group_ids: [4, 9],
    health_thresholds: { ...DEFAULT_THRESHOLDS },
    ignored_error_categories: ['timeout', 'authentication'],
    ...change,
  }
}

const modelsOf = (value: MonitorConfig, platform: string) =>
  value.platforms.find((setting) => setting.platform === platform)?.models

describe('normalConfig', () => {
  it('fills in the thresholds the server left out and keeps the ones it sent', () => {
    const sent = { minimum_sample: 80, warning_error_rate: 0.1 } as MonitorConfig['health_thresholds']
    const normal = normalConfig(config({ health_thresholds: sent }))
    expect(normal.health_thresholds).toEqual({ ...DEFAULT_THRESHOLDS, minimum_sample: 80, warning_error_rate: 0.1 })
  })

  it('takes the default ignored categories when the server names none', () => {
    const normal = normalConfig(config({ ignored_error_categories: undefined }))
    expect(normal.ignored_error_categories).toEqual([...DEFAULT_IGNORED_CATEGORIES].sort())
  })

  it('keeps an empty list of ignored categories empty', () => {
    expect(normalConfig(config({ ignored_error_categories: [] })).ignored_error_categories).toEqual([])
  })

  it('sorts the ignored categories without touching the config it was given', () => {
    const given = config()
    expect(normalConfig(given).ignored_error_categories).toEqual(['authentication', 'timeout'])
    expect(given.ignored_error_categories).toEqual(['timeout', 'authentication'])
  })

  it('only ignores categories the monitor knows by default', () => {
    const known: readonly string[] = MONITOR_ERROR_CATEGORIES
    expect(DEFAULT_IGNORED_CATEGORIES.filter((category) => !known.includes(category))).toEqual([])
  })
})

describe('isSameConfig', () => {
  it('tells an edited config from the saved one', () => {
    const saved = normalConfig(config())
    expect(isSameConfig(saved, normalConfig(config()))).toBe(true)
    expect(isSameConfig(saved, { ...saved, enabled: false })).toBe(false)
    expect(isSameConfig(saved, withGroups(saved, [9, 4]))).toBe(true)
    expect(isSameConfig(saved, null)).toBe(false)
    expect(isSameConfig(null, null)).toBe(true)
  })
})

describe('percentOf and rateOf', () => {
  it('shows a share as a clean percentage', () => {
    expect(percentOf(0.07)).toBe(7)
    expect(percentOf(0.05)).toBe(5)
    expect(percentOf(0.85)).toBe(85)
    expect(percentOf(0.0725)).toBe(7.25)
    expect(percentOf(0)).toBe(0)
    expect(percentOf(1)).toBe(100)
  })

  it('turns a percentage into a share', () => {
    expect(rateOf(7)).toBe(0.07)
    expect(rateOf(12.5)).toBe(0.125)
    expect(rateOf(7.25)).toBe(0.0725)
  })

  it('brings a percentage outside 0 to 100 to the nearer end', () => {
    expect(rateOf(150)).toBe(1)
    expect(rateOf(-3)).toBe(0)
    expect(rateOf(Number.NaN)).toBe(0)
  })

  it('gives back every tenth of a percent as typed', () => {
    const changed: number[] = []
    for (let tenths = 0; tenths <= 1000; tenths++) {
      if (percentOf(rateOf(tenths / 10)) !== tenths / 10) changed.push(tenths / 10)
    }
    expect(changed).toEqual([])
  })
})

describe('withThreshold', () => {
  it('changes one threshold and leaves the rest', () => {
    const before = config()
    const after = withThreshold(before, 'critical_ttft_ms', 12000)
    expect(after.health_thresholds).toEqual({ ...DEFAULT_THRESHOLDS, critical_ttft_ms: 12000 })
    expect(before.health_thresholds.critical_ttft_ms).toBe(DEFAULT_THRESHOLDS.critical_ttft_ms)
  })
})

describe('platform settings', () => {
  it('switches one platform on or off', () => {
    const after = withPlatformEnabled(config(), 'openai', true)
    expect(after.platforms.map((setting) => setting.enabled)).toEqual([true, true, true])
    expect(withPlatformEnabled(config(), 'gemini', false).platforms.map((setting) => setting.enabled)).toEqual([
      true,
      false,
      false,
    ])
  })

  it('keeps the models of a platform sorted and each once', () => {
    const after = withPlatformModels(config(), 'openai', ['o3', 'gpt-5', 'o3', 'gpt-4o'])
    expect(modelsOf(after, 'openai')).toEqual(['gpt-4o', 'gpt-5', 'o3'])
    expect(modelsOf(after, 'anthropic')).toEqual(['claude-fable-5', 'claude-sonnet-4-5'])
  })

  it('adds every model an entry names', () => {
    const after = withPlatformModelsAdded(config(), 'openai', ' o3, gpt-5 ,\ngpt-4o,, ')
    expect(modelsOf(after, 'openai')).toEqual(['gpt-4o', 'gpt-5', 'o3'])
  })

  it('leaves the config as it is when an entry names nothing new', () => {
    const before = config()
    expect(withPlatformModelsAdded(before, 'openai', 'gpt-5')).toBe(before)
    expect(withPlatformModelsAdded(before, 'openai', ' , ')).toBe(before)
    expect(withPlatformModelsAdded(before, 'grok', 'grok-4')).toBe(before)
  })

  it('adds a platform switched on and with no models named', () => {
    const after = withPlatformAdded(config(), 'grok')
    expect(after.platforms).toHaveLength(4)
    expect(after.platforms[3]).toEqual({ platform: 'grok', enabled: true, models: [] })
  })

  it('does not add a platform twice, or one without a name', () => {
    const before = config()
    expect(withPlatformAdded(before, 'openai')).toBe(before)
    expect(withPlatformAdded(before, '')).toBe(before)
  })

  it('offers only the platforms that have no setting yet', () => {
    const options = ['anthropic', 'grok', 'openai', 'kimi'].map((value) => ({ value, label: value }))
    expect(platformsToAdd(config(), options).map((option) => option.value)).toEqual(['grok', 'kimi'])
  })

  it('counts the models named for platforms that are switched on', () => {
    expect(namedModelCount(config())).toBe(2)
    expect(namedModelCount(withPlatformEnabled(config(), 'openai', true))).toBe(3)
    expect(namedModelCount(config({ platforms: [] }))).toBe(0)
  })

  it('names a platform the way the monitor shows it', () => {
    expect(settingsPlatformName('anthropic')).toBe('Claude')
    expect(settingsPlatformName('zhipu')).toBe('Zhipu GLM')
    expect(settingsPlatformName('composite')).toBe('Composite')
  })

  it('names a platform the monitor has no name for the way the list of platforms does', () => {
    expect(settingsPlatformName('opencode_go')).toBe('OpenCode')
    expect(settingsPlatformName('my_gateway')).toBe('my_gateway')
  })
})

describe('groups', () => {
  it('keeps the group ids sorted by number and each once', () => {
    expect(withGroups(config(), [10, 9, 9, 2]).group_ids).toEqual([2, 9, 10])
    expect(withGroups(config(), []).group_ids).toEqual([])
  })

  it('finds the ids of groups that are no longer listed', () => {
    expect(unlistedGroupIds(config(), [{ id: 4 }, { id: 7 }])).toEqual([9])
    expect(unlistedGroupIds(config(), [{ id: 4 }, { id: 9 }])).toEqual([])
  })
})

describe('ignored error categories', () => {
  it('takes a config without the list to ignore none', () => {
    expect(ignoredCategories(config({ ignored_error_categories: undefined }))).toEqual([])
  })

  it('keeps the list sorted and each category once', () => {
    const after = withIgnoredCategories(config(), ['timeout', 'internal', 'timeout', 'authentication'])
    expect(after.ignored_error_categories).toEqual(['authentication', 'internal', 'timeout'])
  })

  it('counts the categories that still go into the error rate', () => {
    expect(countedCategoryCount(config())).toBe(MONITOR_ERROR_CATEGORIES.length - 2)
    expect(countedCategoryCount(withIgnoredCategories(config(), []))).toBe(MONITOR_ERROR_CATEGORIES.length)
  })
})
