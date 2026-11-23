import { describe, expect, it } from 'vitest'
import type { ContentModerationAPIKeyStatus, ContentModerationConfig } from '~/lib/api/admin/riskControl'
import {
  ENGINE_DEFAULTS,
  RISK_THRESHOLD_CATEGORIES,
  RISK_THRESHOLD_DEFAULTS,
  draftFromConfig,
  engineDraftFromConfig,
  normalizeKeywordBlockingMode,
  selectedEngine,
  thresholdsFromConfig,
  withDefaultThresholds,
  withEngine,
  withModelFilterType,
} from './riskForm'

const BLOCK_MESSAGE = 'blocked by the audit'

const key = (index: number, status: ContentModerationAPIKeyStatus['status']): ContentModerationAPIKeyStatus => ({
  index,
  key_hash: `hash-${index}`,
  masked: `fixture-***${index}`,
  status,
  failure_count: 0,
  success_count: 0,
  last_error: '',
  last_latency_ms: 0,
  last_http_status: 0,
  last_tested: false,
  configured: true,
})

/** A saved config that runs OpenAI and has not been given engine profiles. */
const config = (over: Partial<ContentModerationConfig> = {}): ContentModerationConfig => ({
  engine: 'openai',
  enabled: true,
  mode: 'pre_block',
  base_url: 'https://api.openai.com',
  model: 'omni-moderation-latest',
  proxy_id: null,
  api_key_configured: true,
  api_key_masked: 'fixture-***1',
  api_key_count: 1,
  api_key_masks: ['fixture-***1'],
  api_key_statuses: [key(1, 'ok')],
  timeout_ms: 3000,
  sample_rate: 100,
  all_groups: false,
  group_ids: [1, 3],
  record_non_hits: true,
  thresholds: {},
  worker_count: 4,
  queue_size: 32768,
  block_status: 403,
  block_message: 'stop',
  email_on_hit: true,
  auto_ban_enabled: true,
  ban_threshold: 10,
  violation_window_hours: 720,
  retry_count: 2,
  hit_retention_days: 180,
  non_hit_retention_days: 3,
  pre_hash_check_enabled: true,
  blocked_keywords: ['alpha', 'beta'],
  keyword_blocking_mode: 'keyword_and_api',
  model_filter: { type: 'include', models: ['gpt-5.5'] },
  cyber_policy_exclude_from_ban_count: false,
  ...over,
})

describe('thresholdsFromConfig', () => {
  it('starts every category at its default', () => {
    expect(thresholdsFromConfig(undefined)).toEqual(RISK_THRESHOLD_DEFAULTS)
    expect(thresholdsFromConfig(null)).toEqual(RISK_THRESHOLD_DEFAULTS)
    expect(thresholdsFromConfig({})).toEqual(RISK_THRESHOLD_DEFAULTS)
    expect(RISK_THRESHOLD_CATEGORIES).toHaveLength(13)
  })

  it('shows saved shares as percents and keeps the default for the rest', () => {
    const thresholds = thresholdsFromConfig({ sexual: 0.8, harassment: 0.8 })
    expect(thresholds.sexual).toBe(80)
    expect(thresholds.harassment).toBe(80)
    expect(thresholds.hate).toBe(65)
    expect(thresholds['violence/graphic']).toBe(95)
  })

  it('does not let the conversion leave its noise in a field', () => {
    // 0.58 * 100 is 57.99999999999999.
    expect(thresholdsFromConfig({ sexual: 0.58 }).sexual).toBe(58)
    expect(thresholdsFromConfig({ sexual: 0.07 }).sexual).toBe(7)
    expect(thresholdsFromConfig({ sexual: 0.725 }).sexual).toBe(72.5)
  })

  it('keeps a percent between none and all', () => {
    expect(thresholdsFromConfig({ sexual: 1.5 }).sexual).toBe(100)
    expect(thresholdsFromConfig({ sexual: -0.2 }).sexual).toBe(0)
    expect(thresholdsFromConfig({ sexual: 0 }).sexual).toBe(0)
  })

  it('ignores what is not a number and categories it does not list', () => {
    const thresholds = thresholdsFromConfig({
      sexual: Number.NaN,
      hate: 'high' as unknown as number,
      spam: 0.5,
    })
    expect(thresholds.sexual).toBe(65)
    expect(thresholds.hate).toBe(65)
    expect(thresholds).not.toHaveProperty('spam')
  })
})

describe('normalizeKeywordBlockingMode', () => {
  it('keeps the three known modes and reads anything else as keyword + API', () => {
    expect(normalizeKeywordBlockingMode('keyword_only')).toBe('keyword_only')
    expect(normalizeKeywordBlockingMode('api_only')).toBe('api_only')
    expect(normalizeKeywordBlockingMode('keyword_and_api')).toBe('keyword_and_api')
    expect(normalizeKeywordBlockingMode(undefined)).toBe('keyword_and_api')
    expect(normalizeKeywordBlockingMode('everything')).toBe('keyword_and_api')
  })
})

describe('engineDraftFromConfig', () => {
  it('starts an engine that was never set up from its own defaults, with no keys', () => {
    expect(engineDraftFromConfig(undefined, 'typesafe')).toEqual({
      base_url: 'https://api.typesafe.ai',
      model: 'jev-latest',
      proxy_id: null,
      timeout_ms: 3000,
      retry_count: 2,
      thresholds: RISK_THRESHOLD_DEFAULTS,
      api_keys_text: '',
      api_keys_mode: 'append',
      clear_api_key: false,
      pendingDeletes: [],
      api_key_configured: false,
      api_key_count: 0,
      api_key_statuses: [],
    })
    expect(engineDraftFromConfig(undefined, 'openai')).toMatchObject(ENGINE_DEFAULTS.openai)
  })

  it('takes what the profile saved', () => {
    const draft = engineDraftFromConfig(
      config({
        base_url: 'https://audit.example.test',
        model: 'custom',
        proxy_id: 7,
        timeout_ms: 5000,
        retry_count: 4,
        thresholds: { sexual: 0.7 },
        api_key_count: 2,
        api_key_statuses: [key(1, 'ok'), key(2, 'frozen')],
      }),
      'openai',
    )
    expect(draft).toMatchObject({
      base_url: 'https://audit.example.test',
      model: 'custom',
      proxy_id: 7,
      timeout_ms: 5000,
      retry_count: 4,
      api_key_configured: true,
      api_key_count: 2,
    })
    expect(draft.thresholds.sexual).toBe(70)
    expect(draft.api_key_statuses.map((row) => row.status)).toEqual(['ok', 'frozen'])
  })

  it('fills an empty address or model with the engine default', () => {
    const draft = engineDraftFromConfig(config({ base_url: '', model: '' }), 'typesafe')
    expect(draft.base_url).toBe('https://api.typesafe.ai')
    expect(draft.model).toBe('jev-latest')
  })

  it('reads proxy 0 as a direct connection', () => {
    expect(engineDraftFromConfig(config({ proxy_id: 0 }), 'openai').proxy_id).toBeNull()
    expect(engineDraftFromConfig(config({ proxy_id: null }), 'openai').proxy_id).toBeNull()
  })

  it('keeps zero retries and replaces a zero timeout', () => {
    const draft = engineDraftFromConfig(config({ retry_count: 0, timeout_ms: 0 }), 'openai')
    expect(draft.retry_count).toBe(0)
    expect(draft.timeout_ms).toBe(3000)
  })

  it('never starts with typed keys or pending changes, whatever was saved', () => {
    const draft = engineDraftFromConfig(config(), 'openai')
    expect(draft.api_keys_text).toBe('')
    expect(draft.api_keys_mode).toBe('append')
    expect(draft.clear_api_key).toBe(false)
    expect(draft.pendingDeletes).toEqual([])
  })

  it('does not share the key rows with the config', () => {
    const saved = config()
    const draft = engineDraftFromConfig(saved, 'openai')
    expect(draft.api_key_statuses).toEqual(saved.api_key_statuses)
    expect(draft.api_key_statuses).not.toBe(saved.api_key_statuses)
  })

  it('survives a profile without key rows', () => {
    const saved = config({ api_key_statuses: null as unknown as ContentModerationAPIKeyStatus[] })
    expect(engineDraftFromConfig(saved, 'openai').api_key_statuses).toEqual([])
  })
})

describe('draftFromConfig', () => {
  it('copies the settings that both engines share', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    expect(draft).toMatchObject({
      engine: 'openai',
      enabled: true,
      mode: 'pre_block',
      sample_rate: 100,
      all_groups: false,
      group_ids: [1, 3],
      record_non_hits: true,
      worker_count: 4,
      queue_size: 32768,
      block_status: 403,
      block_message: 'stop',
      email_on_hit: true,
      auto_ban_enabled: true,
      cyber_policy_exclude_from_ban_count: false,
      ban_threshold: 10,
      violation_window_hours: 720,
      hit_retention_days: 180,
      non_hit_retention_days: 3,
      pre_hash_check_enabled: true,
      blocked_keywords_text: 'alpha\nbeta',
      keyword_blocking_mode: 'keyword_and_api',
      model_filter_type: 'include',
      model_filter_models: ['gpt-5.5'],
    })
  })

  it('reads the running engine from the config itself when it has no profiles', () => {
    const draft = draftFromConfig(config({ base_url: 'https://audit.example.test', thresholds: { sexual: 0.7 } }), BLOCK_MESSAGE)
    expect(draft.engines.openai.base_url).toBe('https://audit.example.test')
    expect(draft.engines.openai.thresholds.sexual).toBe(70)
    expect(draft.engines.openai.api_key_statuses).toHaveLength(1)
    expect(selectedEngine(draft)).toBe(draft.engines.openai)
  })

  it('gives an engine that was never set up an empty key list, not the running engine’s keys', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    expect(draft.engines.typesafe.model).toBe('jev-latest')
    expect(draft.engines.typesafe.api_key_configured).toBe(false)
    expect(draft.engines.typesafe.api_key_statuses).toEqual([])
  })

  it('reads each engine from its own profile when the config has them', () => {
    const draft = draftFromConfig(
      config({
        engine: 'typesafe',
        base_url: 'https://api.typesafe.ai',
        model: 'jev-latest',
        engine_configs: {
          openai: config({ base_url: 'https://openai.example.test', api_key_statuses: [key(1, 'frozen')] }),
          typesafe: config({
            base_url: 'https://typesafe.example.test',
            model: 'jev-2',
            thresholds: { sexual: 0.9 },
            api_key_statuses: [key(2, 'ok')],
          }),
        },
      }),
      BLOCK_MESSAGE,
    )
    expect(draft.engine).toBe('typesafe')
    expect(draft.engines.openai.base_url).toBe('https://openai.example.test')
    expect(draft.engines.openai.api_key_statuses[0].status).toBe('frozen')
    expect(draft.engines.typesafe.base_url).toBe('https://typesafe.example.test')
    expect(draft.engines.typesafe.model).toBe('jev-2')
    expect(draft.engines.typesafe.thresholds.sexual).toBe(90)
    expect(selectedEngine(draft)).toBe(draft.engines.typesafe)
  })

  it('runs OpenAI when the config names no engine', () => {
    const draft = draftFromConfig(config({ engine: undefined, base_url: 'https://old.example.test' }), BLOCK_MESSAGE)
    expect(draft.engine).toBe('openai')
    expect(draft.engines.openai.base_url).toBe('https://old.example.test')
  })

  it('fills what the config does not hold with the defaults the server uses', () => {
    const draft = draftFromConfig(
      config({
        sample_rate: undefined as unknown as number,
        worker_count: 0,
        queue_size: 0,
        block_status: 0,
        block_message: '',
        email_on_hit: undefined as unknown as boolean,
        auto_ban_enabled: undefined as unknown as boolean,
        cyber_policy_exclude_from_ban_count: undefined as unknown as boolean,
        ban_threshold: 0,
        violation_window_hours: 0,
        hit_retention_days: 0,
        non_hit_retention_days: 0,
        pre_hash_check_enabled: undefined as unknown as boolean,
        blocked_keywords: undefined as unknown as string[],
        keyword_blocking_mode: undefined as unknown as 'api_only',
        model_filter: undefined as unknown as ContentModerationConfig['model_filter'],
        group_ids: undefined as unknown as number[],
      }),
      BLOCK_MESSAGE,
    )
    expect(draft).toMatchObject({
      sample_rate: 100,
      worker_count: 4,
      queue_size: 32768,
      block_status: 403,
      block_message: BLOCK_MESSAGE,
      email_on_hit: true,
      auto_ban_enabled: true,
      cyber_policy_exclude_from_ban_count: false,
      ban_threshold: 10,
      violation_window_hours: 720,
      hit_retention_days: 180,
      non_hit_retention_days: 3,
      pre_hash_check_enabled: false,
      blocked_keywords_text: '',
      keyword_blocking_mode: 'keyword_and_api',
      model_filter_type: 'all',
      model_filter_models: [],
      group_ids: [],
    })
  })

  it('keeps a sample rate of zero', () => {
    expect(draftFromConfig(config({ sample_rate: 0 }), BLOCK_MESSAGE).sample_rate).toBe(0)
  })

  it('keeps the days for records without a hit between 1 and 3', () => {
    expect(draftFromConfig(config({ non_hit_retention_days: 30 }), BLOCK_MESSAGE).non_hit_retention_days).toBe(3)
    expect(draftFromConfig(config({ non_hit_retention_days: 2 }), BLOCK_MESSAGE).non_hit_retention_days).toBe(2)
    expect(draftFromConfig(config({ non_hit_retention_days: -4 }), BLOCK_MESSAGE).non_hit_retention_days).toBe(1)
  })

  it('does not share the group list with the config', () => {
    const saved = config()
    const draft = draftFromConfig(saved, BLOCK_MESSAGE)
    draft.group_ids.push(9)
    expect(saved.group_ids).toEqual([1, 3])
  })

  it('drops the model list of a filter that lets every model in', () => {
    const draft = draftFromConfig(config({ model_filter: { type: 'all', models: ['gpt-5.5'] } }), BLOCK_MESSAGE)
    expect(draft.model_filter_type).toBe('all')
    expect(draft.model_filter_models).toEqual([])
  })
})

describe('withEngine', () => {
  it('changes one engine and leaves the other and the shared settings alone', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    const next = withEngine(draft, 'typesafe', (engine) => ({ ...engine, base_url: 'https://typesafe-edited.example.test' }))
    expect(next.engines.typesafe.base_url).toBe('https://typesafe-edited.example.test')
    expect(next.engines.openai).toBe(draft.engines.openai)
    expect(next.engine).toBe('openai')
    expect(draft.engines.typesafe.base_url).toBe('https://api.typesafe.ai')
  })

  it('returns the same draft when nothing changed', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    expect(withEngine(draft, 'openai', (engine) => engine)).toBe(draft)
  })

  it('keeps what was edited for each engine while the selection goes back and forth', () => {
    let draft = draftFromConfig(config({ thresholds: { sexual: 0.7 } }), BLOCK_MESSAGE)
    draft = withEngine(draft, 'openai', (engine) => ({
      ...engine,
      base_url: 'https://openai-edited.example.test',
      thresholds: { ...engine.thresholds, sexual: 73 },
    }))

    draft = { ...draft, engine: 'typesafe' }
    expect(selectedEngine(draft).model).toBe('jev-latest')
    expect(selectedEngine(draft).thresholds.sexual).toBe(65)
    draft = withEngine(draft, 'typesafe', (engine) => ({
      ...engine,
      base_url: 'https://typesafe-edited.example.test',
      thresholds: { ...engine.thresholds, sexual: 91 },
    }))

    draft = { ...draft, engine: 'openai' }
    expect(selectedEngine(draft).base_url).toBe('https://openai-edited.example.test')
    expect(selectedEngine(draft).thresholds.sexual).toBe(73)
    expect(draft.engines.typesafe.base_url).toBe('https://typesafe-edited.example.test')
    expect(draft.engines.typesafe.thresholds.sexual).toBe(91)
  })
})

describe('withModelFilterType', () => {
  it('keeps the list between "only" and "all but"', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    const next = withModelFilterType(draft, 'exclude')
    expect(next.model_filter_type).toBe('exclude')
    expect(next.model_filter_models).toEqual(['gpt-5.5'])
  })

  it('empties the list for "all models", and for a type it does not know', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    expect(withModelFilterType(draft, 'all')).toMatchObject({ model_filter_type: 'all', model_filter_models: [] })
    expect(withModelFilterType(draft, 'some')).toMatchObject({ model_filter_type: 'all', model_filter_models: [] })
  })
})

describe('withDefaultThresholds', () => {
  it.each(['openai', 'typesafe'] as const)('puts the thresholds of %s back to the shared defaults', (engine) => {
    const draft = draftFromConfig(
      config({ engine, thresholds: { sexual: 0.8, harassment: 0.8 } }),
      BLOCK_MESSAGE,
    )
    // Opening the settings shows what was saved, not the defaults.
    expect(selectedEngine(draft).thresholds.sexual).toBe(80)
    expect(selectedEngine(draft).thresholds.harassment).toBe(80)

    const reset = withEngine(draft, engine, withDefaultThresholds)
    expect(RISK_THRESHOLD_CATEGORIES.map((category) => selectedEngine(reset).thresholds[category])).toEqual([
      98, 90, 65, 65, 95, 95, 65, 85, 65, 65, 65, 95, 95,
    ])
    expect(selectedEngine(reset).base_url).toBe(selectedEngine(draft).base_url)
  })

  it('hands out a copy, so an edit after a reset does not change the defaults', () => {
    const draft = draftFromConfig(config(), BLOCK_MESSAGE)
    const reset = withEngine(draft, 'openai', withDefaultThresholds)
    reset.engines.openai.thresholds.sexual = 1
    expect(RISK_THRESHOLD_DEFAULTS.sexual).toBe(65)
  })
})
