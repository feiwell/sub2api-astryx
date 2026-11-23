import type {
  ContentModerationModelFilter,
  ModerationEngine,
  TestContentModerationAPIKeysPayload,
  UpdateContentModerationConfig,
  UpdateModerationEngineConfig,
} from '~/lib/api/admin/riskControl'
import { clampPercent } from './riskFormat'
import {
  ENGINES,
  RISK_THRESHOLD_CATEGORIES,
  SETTING_DEFAULTS,
  SETTING_RANGES,
  selectedEngine,
  type EngineDraft,
  type RiskDraft,
} from './riskForm'
import { normalizeModelNames } from './riskModel'

/** The most keywords the server keeps. */
export const BLOCKED_KEYWORD_MAX = 10000

const lines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trim())

/** The keys typed one a line: trimmed, without blank lines, each once. */
export function parseApiKeys(text: string): string[] {
  return lines(text).filter((key, index, all) => key !== '' && all.indexOf(key) === index)
}

/** The keywords typed one a line: trimmed, without blank lines, each once whatever its letter case. */
export function parseBlockedKeywords(text: string): string[] {
  const seen = new Set<string>()
  const keywords: string[] = []
  for (const keyword of lines(text)) {
    if (!keyword) continue
    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    keywords.push(keyword)
  }
  return keywords
}

/**
 * Thresholds as the server takes them: shares of one, by category. `decimals` is how finely a
 * share is told; 12 only trims what the division adds (65.1 / 100 is 0.6509999999999999).
 */
function thresholdShares(percents: Record<string, number>, decimals: number): Record<string, number> {
  const shares: Record<string, number> = {}
  for (const category of RISK_THRESHOLD_CATEGORIES) {
    shares[category] = Number((clampPercent(percents[category]) / 100).toFixed(decimals))
  }
  return shares
}

/** The thresholds of the engine fields a save or a test sends beside the profiles. */
export const thresholdPayload = (percents: Record<string, number>): Record<string, number> =>
  thresholdShares(percents, 4)

/** What a save sends as the model filter: "all models" without a list, a list without repeats. */
export function modelFilterPayload(draft: Pick<RiskDraft, 'model_filter_type' | 'model_filter_models'>): ContentModerationModelFilter {
  return draft.model_filter_type === 'all'
    ? { type: 'all', models: [] }
    : { type: draft.model_filter_type, models: normalizeModelNames(draft.model_filter_models) }
}

/** A save in "replace" mode needs keys to replace with, unless it clears the keys anyway. */
const replacesWithNothing = (engine: EngineDraft): boolean =>
  !engine.clear_api_key && engine.api_keys_mode === 'replace' && parseApiKeys(engine.api_keys_text).length === 0

/** An engine's own entry in a save. Every engine is sent, so the one not selected keeps its edits too. */
export function engineProfilePayload(engine: EngineDraft): UpdateModerationEngineConfig {
  const keys = parseApiKeys(engine.api_keys_text)
  return {
    base_url: engine.base_url,
    model: engine.model,
    // 0 is a direct connection; leaving the field out would keep the saved proxy.
    proxy_id: engine.proxy_id ?? 0,
    timeout_ms: engine.timeout_ms,
    retry_count: engine.retry_count,
    thresholds: thresholdShares(engine.thresholds, 12),
    clear_api_key: engine.clear_api_key,
    api_keys: keys.length > 0 ? keys : undefined,
    api_keys_mode: engine.api_keys_mode,
    delete_api_key_hashes: [...engine.pendingDeletes],
  }
}

/** Why a draft cannot be saved as it stands. */
export type SaveProblem =
  /** The model filter names no model. */
  | { kind: 'modelFilterModels' }
  /** An engine is to have its keys replaced and no key was typed for it. */
  | { kind: 'replaceWithoutKeys'; engine: ModerationEngine }

/** What stops a save, or null when the draft can be sent. */
export function saveProblem(draft: RiskDraft): SaveProblem | null {
  const filter = modelFilterPayload(draft)
  if (filter.type !== 'all' && filter.models.length === 0) return { kind: 'modelFilterModels' }
  // The selected engine first: its fields are the ones in view.
  const engines = [draft.engine, ...ENGINES.filter((engine) => engine !== draft.engine)]
  const engine = engines.find((name) => replacesWithNothing(draft.engines[name]))
  return engine ? { kind: 'replaceWithoutKeys', engine } : null
}

const clampNonHitDays = (days: number): number => {
  const { min, max } = SETTING_RANGES.non_hit_retention_days
  return Math.min(Math.max(Number(days) || SETTING_DEFAULTS.non_hit_retention_days, min), max)
}

/**
 * What a save sends. The selected engine becomes the running one: its fields go at the top level,
 * as the server took them before engines had profiles, and both engines go in `engine_configs`.
 * Call it only for a draft `saveProblem` finds nothing wrong with.
 */
export function savePayload(draft: RiskDraft, defaultBlockMessage: string): UpdateContentModerationConfig {
  const engine = selectedEngine(draft)
  const payload: UpdateContentModerationConfig = {
    engine: draft.engine,
    enabled: draft.enabled,
    mode: draft.mode,
    base_url: engine.base_url,
    model: engine.model,
    proxy_id: engine.proxy_id ?? 0,
    timeout_ms: Number(engine.timeout_ms) || SETTING_DEFAULTS.timeout_ms,
    retry_count: Number(engine.retry_count) || 0,
    sample_rate: Number(draft.sample_rate) || 0,
    all_groups: draft.all_groups,
    group_ids: draft.all_groups ? [] : [...draft.group_ids],
    record_non_hits: draft.record_non_hits,
    clear_api_key: engine.clear_api_key,
    worker_count: Number(draft.worker_count) || SETTING_DEFAULTS.worker_count,
    queue_size: Number(draft.queue_size) || SETTING_DEFAULTS.queue_size,
    block_status: Number(draft.block_status) || SETTING_DEFAULTS.block_status,
    block_message: draft.block_message.trim() || defaultBlockMessage,
    email_on_hit: draft.email_on_hit,
    auto_ban_enabled: draft.auto_ban_enabled,
    cyber_policy_exclude_from_ban_count: draft.cyber_policy_exclude_from_ban_count,
    ban_threshold: Number(draft.ban_threshold) || SETTING_DEFAULTS.ban_threshold,
    violation_window_hours: Number(draft.violation_window_hours) || SETTING_DEFAULTS.violation_window_hours,
    hit_retention_days: Number(draft.hit_retention_days) || SETTING_DEFAULTS.hit_retention_days,
    non_hit_retention_days: clampNonHitDays(draft.non_hit_retention_days),
    pre_hash_check_enabled: draft.pre_hash_check_enabled,
    thresholds: thresholdPayload(engine.thresholds),
    blocked_keywords: parseBlockedKeywords(draft.blocked_keywords_text),
    keyword_blocking_mode: draft.keyword_blocking_mode,
    model_filter: modelFilterPayload(draft),
  }
  const keys = parseApiKeys(engine.api_keys_text)
  if (keys.length > 0) {
    payload.api_keys = keys
    payload.api_keys_mode = engine.api_keys_mode
    payload.clear_api_key = false
  }
  // Replacing the keys drops the saved ones anyway, and so does clearing them.
  if (!payload.clear_api_key && engine.api_keys_mode !== 'replace' && engine.pendingDeletes.length > 0) {
    payload.delete_api_key_hashes = [...engine.pendingDeletes]
  }
  payload.engine_configs = {
    openai: engineProfilePayload(draft.engines.openai),
    typesafe: engineProfilePayload(draft.engines.typesafe),
  }
  return payload
}

/** What a trial run is asked with. */
export interface AuditTestInput {
  /** The keys to try; none tries the saved ones. */
  keys: string[]
  prompt: string
  /** Images as data URLs. */
  images: string[]
}

/**
 * What a key test sends: the selected engine as the draft has it, saved or not, so an engine can
 * be tried before it is made the running one.
 */
export function testPayload(draft: RiskDraft, input: AuditTestInput): TestContentModerationAPIKeysPayload {
  const engine = selectedEngine(draft)
  return {
    engine: draft.engine,
    thresholds: thresholdPayload(engine.thresholds),
    api_keys: input.keys,
    base_url: engine.base_url,
    model: engine.model,
    timeout_ms: Number(engine.timeout_ms) || SETTING_DEFAULTS.timeout_ms,
    // As in a save: 0 is a direct connection, above it the proxy with that id.
    proxy_id: engine.proxy_id ?? 0,
    prompt: input.prompt,
    images: input.images,
  }
}
