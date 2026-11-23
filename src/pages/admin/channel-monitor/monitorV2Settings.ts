import { MONITOR_ERROR_CATEGORIES, type MonitorConfig } from '@/api/channelMonitorV2'
import { platformDisplayName } from '@/constants/platformCatalog'

export type HealthThresholds = MonitorConfig['health_thresholds']
export type PlatformSetting = MonitorConfig['platforms'][number]
export type RefreshInterval = MonitorConfig['refresh_interval_seconds']

/** The thresholds stored as a share (0 to 1) and edited as a percentage. */
export type RateThreshold =
  | 'warning_error_rate'
  | 'critical_error_rate'
  | 'warning_cache_rate'
  | 'critical_cache_rate'

export const REFRESH_INTERVALS: readonly RefreshInterval[] = [60, 300]

/** What a threshold is taken to be when the server sends a config without it. */
export const DEFAULT_THRESHOLDS: HealthThresholds = {
  minimum_sample: 50,
  warning_error_rate: 0.05,
  critical_error_rate: 0.2,
  target_ttft_ms: 3000,
  warning_ttft_ms: 3000,
  critical_ttft_ms: 10000,
  // For the cache rate higher is better: under 85% is a warning, under 60% critical.
  warning_cache_rate: 0.85,
  critical_cache_rate: 0.6,
  error_weight: 0.6,
  ttft_weight: 0.2,
  cache_weight: 0.2,
}

/** The categories the server leaves out of the error rate until an admin decides otherwise. */
export const DEFAULT_IGNORED_CATEGORIES: readonly string[] = [
  'authentication',
  'client_cancelled',
  'content_policy',
  'context_limit',
  'group_access',
  'model_unsupported',
  'not_found',
  'quota_or_balance',
]

/** A config with nothing left out, so the one being edited and the saved one compare like for like. */
export function normalConfig(config: MonitorConfig): MonitorConfig {
  const ignored = config.ignored_error_categories
  return {
    ...config,
    health_thresholds: { ...DEFAULT_THRESHOLDS, ...(config.health_thresholds || {}) },
    // An empty list stays empty: it says an admin cleared every category.
    ignored_error_categories: [...(ignored == null ? DEFAULT_IGNORED_CATEGORIES : ignored)].sort(),
  }
}

export const isSameConfig = (left: MonitorConfig | null, right: MonitorConfig | null): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** A share as the percentage shown for it: 0.07 is 7, not 7.000000000000001. */
export const percentOf = (rate: number): number => Math.round(rate * 1e6) / 1e4

/** The share a percentage stands for; one outside 0 to 100 is brought to the nearer end. */
export const rateOf = (percent: number): number =>
  Number.isFinite(percent) ? Math.round(Math.max(0, Math.min(100, percent)) * 1e4) / 1e6 : 0

export const withThreshold = (config: MonitorConfig, key: keyof HealthThresholds, value: number): MonitorConfig => ({
  ...config,
  health_thresholds: { ...config.health_thresholds, [key]: value },
})

/** Model names as the config keeps them: each once, sorted. */
const modelList = (models: readonly string[]): string[] => [...new Set(models)].sort()

/** The model names an entry gives: one entry can name several, such as a pasted list. */
const namesIn = (entry: string): string[] =>
  entry
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean)

const withPlatform = (
  config: MonitorConfig,
  platform: string,
  change: (setting: PlatformSetting) => PlatformSetting,
): MonitorConfig => ({
  ...config,
  platforms: config.platforms.map((setting) => (setting.platform === platform ? change(setting) : setting)),
})

export const withPlatformEnabled = (config: MonitorConfig, platform: string, enabled: boolean): MonitorConfig =>
  withPlatform(config, platform, (setting) => ({ ...setting, enabled }))

export const withPlatformModels = (config: MonitorConfig, platform: string, models: readonly string[]): MonitorConfig =>
  withPlatform(config, platform, (setting) => ({ ...setting, models: modelList(models) }))

/** The config with the models an entry names added to a platform; unchanged when it names none that are new. */
export function withPlatformModelsAdded(config: MonitorConfig, platform: string, entry: string): MonitorConfig {
  const setting = config.platforms.find((item) => item.platform === platform)
  if (!setting) return config
  const models = modelList([...setting.models, ...namesIn(entry)])
  return models.length > setting.models.length ? withPlatformModels(config, platform, models) : config
}

/** A platform starts switched on and with no models named, which shows every model it has. */
export function withPlatformAdded(config: MonitorConfig, platform: string): MonitorConfig {
  if (!platform || config.platforms.some((setting) => setting.platform === platform)) return config
  return { ...config, platforms: [...config.platforms, { platform, enabled: true, models: [] }] }
}

/** The platforms that can still be added: the ones the config has no setting for. */
export const platformsToAdd = <T extends { value: string }>(config: MonitorConfig, options: readonly T[]): T[] =>
  options.filter((option) => !config.platforms.some((setting) => setting.platform === option.value))

/** How many models get a row of their own: the ones named for the platforms that are switched on. */
export const namedModelCount = (config: MonitorConfig): number =>
  config.platforms.filter((setting) => setting.enabled).reduce((sum, setting) => sum + setting.models.length, 0)

/** No group named means every group is monitored. */
export const withGroups = (config: MonitorConfig, ids: readonly number[]): MonitorConfig => ({
  ...config,
  group_ids: [...new Set(ids)].sort((a, b) => a - b),
})

/** Ids the config names that the list of groups does not have: groups deleted since. */
export const unlistedGroupIds = (config: MonitorConfig, groups: readonly { id: number }[]): number[] =>
  config.group_ids.filter((id) => !groups.some((group) => group.id === id))

export const ignoredCategories = (config: MonitorConfig): string[] => config.ignored_error_categories ?? []

export const withIgnoredCategories = (config: MonitorConfig, categories: readonly string[]): MonitorConfig => ({
  ...config,
  ignored_error_categories: [...new Set(categories)].sort(),
})

/** How many categories still count toward the error rate. */
export const countedCategoryCount = (config: MonitorConfig): number =>
  MONITOR_ERROR_CATEGORIES.length - ignoredCategories(config).length

const PLATFORM_NAMES: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  grok: 'Grok',
  kiro: 'Kiro',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  kimi: 'Kimi',
  zhipu: 'Zhipu GLM',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  composite: 'Composite',
}

/**
 * A platform by the name the monitor shows for it. One the monitor has no name of its own for goes by the
 * name the list of platforms gives it, which is also what the list to add a platform from calls it, and
 * one that list does not know goes by its id.
 */
export const settingsPlatformName = (platform: string): string =>
  PLATFORM_NAMES[platform] || platformDisplayName(platform)
