import type {
  ContentModerationAPIKeyStatus,
  ContentModerationConfig,
  ContentModerationModelFilterType,
  KeywordBlockingMode,
  ModerationEngine,
  ModerationMode,
} from '~/lib/api/admin/riskControl'
import { clampPercent } from './riskFormat'
import { normalizeModelFilter, normalizeModelFilterType } from './riskModel'

/** The audit engines, in the order the settings offer them. */
export const ENGINES: readonly ModerationEngine[] = ['openai', 'typesafe']

/** Where an engine is reached and the model it is asked for, when a config names neither. */
export const ENGINE_DEFAULTS: Readonly<Record<ModerationEngine, { base_url: string; model: string }>> = {
  openai: { base_url: 'https://api.openai.com', model: 'omni-moderation-latest' },
  typesafe: { base_url: 'https://api.typesafe.ai', model: 'jev-latest' },
}

/** What the server falls back to for a number a config does not hold. */
export const SETTING_DEFAULTS = {
  timeout_ms: 3000,
  retry_count: 2,
  sample_rate: 100,
  worker_count: 4,
  queue_size: 32768,
  block_status: 403,
  ban_threshold: 10,
  violation_window_hours: 720,
  hit_retention_days: 180,
  non_hit_retention_days: 3,
} as const

/** The least and the most the server accepts for each number; a field cannot hold one outside. */
export const SETTING_RANGES = {
  timeout_ms: { min: 500, max: 30000 },
  retry_count: { min: 0, max: 5 },
  sample_rate: { min: 0, max: 100 },
  worker_count: { min: 1, max: 32 },
  queue_size: { min: 100, max: 100000 },
  block_status: { min: 400, max: 599 },
  ban_threshold: { min: 1, max: 1000 },
  violation_window_hours: { min: 1, max: 8760 },
  hit_retention_days: { min: 1, max: 3650 },
  non_hit_retention_days: { min: 1, max: 3 },
} as const

/**
 * The thresholds a fresh config starts with, as shares of a hundred: a score at or above its
 * category's threshold is a hit. Both engines start from the same ones.
 */
export const RISK_THRESHOLD_DEFAULTS: Readonly<Record<string, number>> = {
  harassment: 98,
  'harassment/threatening': 90,
  hate: 65,
  'hate/threatening': 65,
  illicit: 95,
  'illicit/violent': 95,
  'self-harm': 65,
  'self-harm/intent': 85,
  'self-harm/instructions': 65,
  sexual: 65,
  'sexual/minors': 65,
  violence: 95,
  'violence/graphic': 95,
}

/** The audited categories, in the order they are listed. */
export const RISK_THRESHOLD_CATEGORIES: readonly string[] = Object.keys(RISK_THRESHOLD_DEFAULTS)

// 0.58 × 100 is 57.99999999999999: the conversion's noise must not reach the field.
const PERCENT_DECIMALS = 4

/** Thresholds as the fields hold them: shares of a hundred, the default where the config has none. */
export function thresholdsFromConfig(thresholds: Record<string, number> | null | undefined): Record<string, number> {
  const percents: Record<string, number> = { ...RISK_THRESHOLD_DEFAULTS }
  for (const category of RISK_THRESHOLD_CATEGORIES) {
    const share = thresholds?.[category]
    if (typeof share === 'number' && Number.isFinite(share)) {
      percents[category] = Number(clampPercent(share * 100).toFixed(PERCENT_DECIMALS))
    }
  }
  return percents
}

export const normalizeKeywordBlockingMode = (value: unknown): KeywordBlockingMode =>
  value === 'keyword_only' || value === 'api_only' || value === 'keyword_and_api' ? value : 'keyword_and_api'

/** Whether typed keys join the saved ones or take their place. */
export type KeysWriteMode = 'append' | 'replace'

/** What the settings hold for one engine. Each engine keeps its own, whichever one is selected. */
export interface EngineDraft {
  base_url: string
  model: string
  /** Null is a direct connection. */
  proxy_id: number | null
  timeout_ms: number
  retry_count: number
  /** By category, as shares of a hundred. */
  thresholds: Record<string, number>
  /** Keys typed in, one a line. The server never sends keys back, so this starts empty. */
  api_keys_text: string
  api_keys_mode: KeysWriteMode
  /** A save is to delete every saved key. */
  clear_api_key: boolean
  /** Hashes of the saved keys a save is to delete. */
  pendingDeletes: string[]
  /** What the server told of the saved keys. */
  api_key_configured: boolean
  api_key_count: number
  api_key_statuses: ContentModerationAPIKeyStatus[]
}

/**
 * The settings as the dialog edits them: a copy of the saved config that a save sends back and a
 * cancel throws away. `engine` is the engine a save makes the running one.
 */
export interface RiskDraft {
  engine: ModerationEngine
  engines: Record<ModerationEngine, EngineDraft>
  enabled: boolean
  mode: ModerationMode
  sample_rate: number
  all_groups: boolean
  group_ids: number[]
  record_non_hits: boolean
  worker_count: number
  queue_size: number
  block_status: number
  block_message: string
  email_on_hit: boolean
  auto_ban_enabled: boolean
  cyber_policy_exclude_from_ban_count: boolean
  ban_threshold: number
  violation_window_hours: number
  hit_retention_days: number
  non_hit_retention_days: number
  pre_hash_check_enabled: boolean
  /** One keyword a line. */
  blocked_keywords_text: string
  keyword_blocking_mode: KeywordBlockingMode
  model_filter_type: ContentModerationModelFilterType
  model_filter_models: string[]
}

/** An engine's part of the draft from its saved profile; an engine never set up starts from the defaults. */
export function engineDraftFromConfig(
  profile: ContentModerationConfig | undefined,
  engine: ModerationEngine,
): EngineDraft {
  return {
    base_url: profile?.base_url || ENGINE_DEFAULTS[engine].base_url,
    model: profile?.model || ENGINE_DEFAULTS[engine].model,
    // The server spells "no proxy" as 0 or null.
    proxy_id: profile?.proxy_id != null && profile.proxy_id > 0 ? profile.proxy_id : null,
    timeout_ms: profile?.timeout_ms || SETTING_DEFAULTS.timeout_ms,
    // Zero retries is a setting, not a missing one.
    retry_count: profile?.retry_count ?? SETTING_DEFAULTS.retry_count,
    thresholds: thresholdsFromConfig(profile?.thresholds),
    api_keys_text: '',
    api_keys_mode: 'append',
    clear_api_key: false,
    pendingDeletes: [],
    api_key_configured: profile?.api_key_configured ?? false,
    api_key_count: profile?.api_key_count ?? 0,
    api_key_statuses: Array.isArray(profile?.api_key_statuses) ? [...profile.api_key_statuses] : [],
  }
}

const clampNonHitDays = (days: number | null | undefined): number => {
  const { min, max } = SETTING_RANGES.non_hit_retention_days
  return Math.min(Math.max(days || SETTING_DEFAULTS.non_hit_retention_days, min), max)
}

/**
 * The draft a saved config opens the settings with. The config's own engine fields speak for the
 * engine in use; the other engine has its entry in `engine_configs`, or none yet.
 */
export function draftFromConfig(config: ContentModerationConfig, defaultBlockMessage: string): RiskDraft {
  // A config saved before engines existed runs OpenAI.
  const engine: ModerationEngine = config.engine === 'typesafe' ? 'typesafe' : 'openai'
  const profileOf = (name: ModerationEngine) => config.engine_configs?.[name] ?? (name === engine ? config : undefined)
  const filter = normalizeModelFilter(config.model_filter)
  return {
    engine,
    engines: {
      openai: engineDraftFromConfig(profileOf('openai'), 'openai'),
      typesafe: engineDraftFromConfig(profileOf('typesafe'), 'typesafe'),
    },
    enabled: config.enabled,
    mode: config.mode,
    sample_rate: config.sample_rate ?? SETTING_DEFAULTS.sample_rate,
    all_groups: config.all_groups,
    group_ids: Array.isArray(config.group_ids) ? [...config.group_ids] : [],
    record_non_hits: config.record_non_hits,
    worker_count: config.worker_count || SETTING_DEFAULTS.worker_count,
    queue_size: config.queue_size || SETTING_DEFAULTS.queue_size,
    block_status: config.block_status || SETTING_DEFAULTS.block_status,
    block_message: config.block_message || defaultBlockMessage,
    email_on_hit: config.email_on_hit ?? true,
    auto_ban_enabled: config.auto_ban_enabled ?? true,
    cyber_policy_exclude_from_ban_count: config.cyber_policy_exclude_from_ban_count ?? false,
    ban_threshold: config.ban_threshold || SETTING_DEFAULTS.ban_threshold,
    violation_window_hours: config.violation_window_hours || SETTING_DEFAULTS.violation_window_hours,
    hit_retention_days: config.hit_retention_days || SETTING_DEFAULTS.hit_retention_days,
    non_hit_retention_days: clampNonHitDays(config.non_hit_retention_days),
    pre_hash_check_enabled: config.pre_hash_check_enabled ?? false,
    blocked_keywords_text: Array.isArray(config.blocked_keywords) ? config.blocked_keywords.join('\n') : '',
    keyword_blocking_mode: normalizeKeywordBlockingMode(config.keyword_blocking_mode),
    model_filter_type: filter.type,
    model_filter_models: filter.models,
  }
}

/** The part of the draft that belongs to the engine now selected. */
export const selectedEngine = (draft: RiskDraft): EngineDraft => draft.engines[draft.engine]

/** The draft with one engine's part changed; the other engine's part is left as it is. */
export function withEngine(
  draft: RiskDraft,
  engine: ModerationEngine,
  change: (current: EngineDraft) => EngineDraft,
): RiskDraft {
  const next = change(draft.engines[engine])
  return next === draft.engines[engine] ? draft : { ...draft, engines: { ...draft.engines, [engine]: next } }
}

/** The draft with another model filter; "all models" carries no list. */
export function withModelFilterType(draft: RiskDraft, type: unknown): RiskDraft {
  const next = normalizeModelFilterType(type)
  return next === 'all'
    ? { ...draft, model_filter_type: next, model_filter_models: [] }
    : { ...draft, model_filter_type: next }
}

/** The selected engine's thresholds put back to the ones a fresh config starts with. */
export const withDefaultThresholds = (engine: EngineDraft): EngineDraft => ({
  ...engine,
  thresholds: { ...RISK_THRESHOLD_DEFAULTS },
})
