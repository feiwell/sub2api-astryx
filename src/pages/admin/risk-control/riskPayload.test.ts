import { describe, expect, it } from 'vitest'
import type { ModerationEngine } from '~/lib/api/admin/riskControl'
import { RISK_THRESHOLD_CATEGORIES, engineDraftFromConfig, withEngine, type EngineDraft, type RiskDraft } from './riskForm'
import {
  engineProfilePayload,
  modelFilterPayload,
  parseApiKeys,
  parseBlockedKeywords,
  savePayload,
  saveProblem,
  testPayload,
  thresholdPayload,
} from './riskPayload'

const BLOCK_MESSAGE = 'blocked by the audit'

const engine = (name: ModerationEngine, over: Partial<EngineDraft> = {}): EngineDraft => ({
  ...engineDraftFromConfig(undefined, name),
  ...over,
})

/** Settings as they open for a config that runs OpenAI: nothing typed, nothing pending. */
const draft = (over: Partial<RiskDraft> = {}): RiskDraft => ({
  engine: 'openai',
  engines: { openai: engine('openai'), typesafe: engine('typesafe') },
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
  model_filter_type: 'all',
  model_filter_models: [],
  ...over,
})

const edit = (base: RiskDraft, name: ModerationEngine, over: Partial<EngineDraft>): RiskDraft =>
  withEngine(base, name, (current) => ({ ...current, ...over }))

/** The thresholds a fresh config sends, as shares of one. */
const DEFAULT_SHARES = {
  harassment: 0.98,
  'harassment/threatening': 0.9,
  hate: 0.65,
  'hate/threatening': 0.65,
  illicit: 0.95,
  'illicit/violent': 0.95,
  'self-harm': 0.65,
  'self-harm/intent': 0.85,
  'self-harm/instructions': 0.65,
  sexual: 0.65,
  'sexual/minors': 0.65,
  violence: 0.95,
  'violence/graphic': 0.95,
}

describe('parseApiKeys', () => {
  it('takes one key a line, trimmed, without blank lines', () => {
    expect(parseApiKeys('fixture-a\n  fixture-b  \r\n\n\t\nfixture-c')).toEqual(['fixture-a', 'fixture-b', 'fixture-c'])
    expect(parseApiKeys('')).toEqual([])
    expect(parseApiKeys('  \n ')).toEqual([])
  })

  it('keeps a repeated key once, and tells keys apart by letter case', () => {
    expect(parseApiKeys('fixture-a\nfixture-b\nfixture-a\n fixture-a ')).toEqual(['fixture-a', 'fixture-b'])
    expect(parseApiKeys('fixture-A\nfixture-a')).toEqual(['fixture-A', 'fixture-a'])
  })
})

describe('parseBlockedKeywords', () => {
  it('takes one keyword a line, trimmed, without blank lines', () => {
    expect(parseBlockedKeywords(' alpha \r\n\nbeta gamma\n')).toEqual(['alpha', 'beta gamma'])
    expect(parseBlockedKeywords('')).toEqual([])
  })

  it('keeps the first spelling of a keyword that repeats in another letter case', () => {
    expect(parseBlockedKeywords('Alpha\nalpha\nBETA\nbeta\nALPHA')).toEqual(['Alpha', 'BETA'])
  })
})

describe('thresholdPayload', () => {
  it('sends every category as a share of one', () => {
    expect(thresholdPayload(engine('openai').thresholds)).toEqual(DEFAULT_SHARES)
  })

  it('sends an edited percent', () => {
    const shares = thresholdPayload({ ...engine('openai').thresholds, sexual: 72, harassment: 99 })
    expect(shares.sexual).toBe(0.72)
    expect(shares.harassment).toBe(0.99)
  })

  it('keeps a share between none and all and counts what is not a number as none', () => {
    const shares = thresholdPayload({ sexual: 120, hate: -5, violence: Number.NaN })
    expect(shares.sexual).toBe(1)
    expect(shares.hate).toBe(0)
    expect(shares.violence).toBe(0)
    // A category the draft lost is sent as none rather than left out.
    expect(Object.keys(shares)).toEqual([...RISK_THRESHOLD_CATEGORIES])
  })

  it('rounds to four decimals and does not send a category it does not list', () => {
    const shares = thresholdPayload({ ...engine('openai').thresholds, sexual: 65.126, spam: 50 })
    expect(shares.sexual).toBe(0.6513)
    expect(shares).not.toHaveProperty('spam')
  })
})

describe('modelFilterPayload', () => {
  it('sends "all models" without a list', () => {
    expect(modelFilterPayload({ model_filter_type: 'all', model_filter_models: ['gpt-5.5'] })).toEqual({
      type: 'all',
      models: [],
    })
  })

  it('sends the chosen mode with its models, each once', () => {
    expect(
      modelFilterPayload({ model_filter_type: 'include', model_filter_models: ['gpt-5.5', ' gpt-5.4 ', 'GPT-5.5', ''] }),
    ).toEqual({ type: 'include', models: ['gpt-5.5', 'gpt-5.4'] })
    expect(modelFilterPayload({ model_filter_type: 'exclude', model_filter_models: ['o3'] })).toEqual({
      type: 'exclude',
      models: ['o3'],
    })
  })
})

describe('engineProfilePayload', () => {
  it('sends an untouched engine as it is, with no keys and nothing to delete', () => {
    expect(engineProfilePayload(engine('typesafe'))).toEqual({
      base_url: 'https://api.typesafe.ai',
      model: 'jev-latest',
      proxy_id: 0,
      timeout_ms: 3000,
      retry_count: 2,
      thresholds: DEFAULT_SHARES,
      clear_api_key: false,
      api_keys: undefined,
      api_keys_mode: 'append',
      delete_api_key_hashes: [],
    })
  })

  it('sends the typed keys, the write mode and the keys to delete', () => {
    const profile = engineProfilePayload(
      engine('openai', { api_keys_text: 'fixture-a\nfixture-b\nfixture-a', api_keys_mode: 'replace', pendingDeletes: ['hash-1'], proxy_id: 7 }),
    )
    expect(profile.api_keys).toEqual(['fixture-a', 'fixture-b'])
    expect(profile.api_keys_mode).toBe('replace')
    expect(profile.delete_api_key_hashes).toEqual(['hash-1'])
    expect(profile.proxy_id).toBe(7)
  })

  it('keeps a threshold as finely as it was typed, without what the division adds', () => {
    const profile = engineProfilePayload(
      engine('openai', { thresholds: { ...engine('openai').thresholds, sexual: 65.123, hate: 65.1 } }),
    )
    expect(profile.thresholds?.sexual).toBe(0.65123)
    // 65.1 / 100 is 0.6509999999999999.
    expect(profile.thresholds?.hate).toBe(0.651)
  })

  it('does not hand out the draft’s list of deletions', () => {
    const source = engine('openai', { pendingDeletes: ['hash-1'] })
    expect(engineProfilePayload(source).delete_api_key_hashes).not.toBe(source.pendingDeletes)
  })
})

describe('saveProblem', () => {
  it('finds nothing wrong with settings as they open', () => {
    expect(saveProblem(draft())).toBeNull()
  })

  it('refuses a model filter that names no model', () => {
    expect(saveProblem(draft({ model_filter_type: 'include' }))).toEqual({ kind: 'modelFilterModels' })
    expect(saveProblem(draft({ model_filter_type: 'exclude', model_filter_models: ['  ', ''] }))).toEqual({
      kind: 'modelFilterModels',
    })
    expect(saveProblem(draft({ model_filter_type: 'include', model_filter_models: ['gpt-5.5'] }))).toBeNull()
  })

  it('refuses to replace the keys of the selected engine with nothing', () => {
    const replacing = edit(draft(), 'openai', { api_keys_mode: 'replace' })
    expect(saveProblem(replacing)).toEqual({ kind: 'replaceWithoutKeys', engine: 'openai' })
    expect(saveProblem(edit(replacing, 'openai', { api_keys_text: ' \n ' }))).toEqual({
      kind: 'replaceWithoutKeys',
      engine: 'openai',
    })
    expect(saveProblem(edit(replacing, 'openai', { api_keys_text: 'fixture-new' }))).toBeNull()
  })

  it('tells which engine it is when the engine is not the one in view', () => {
    const replacing = edit(draft(), 'typesafe', { api_keys_mode: 'replace' })
    expect(saveProblem(replacing)).toEqual({ kind: 'replaceWithoutKeys', engine: 'typesafe' })
    expect(saveProblem({ ...replacing, engine: 'typesafe' })).toEqual({ kind: 'replaceWithoutKeys', engine: 'typesafe' })
  })

  it('names the selected engine first when both have the problem', () => {
    const both = edit(edit(draft(), 'openai', { api_keys_mode: 'replace' }), 'typesafe', { api_keys_mode: 'replace' })
    expect(saveProblem(both)).toEqual({ kind: 'replaceWithoutKeys', engine: 'openai' })
    expect(saveProblem({ ...both, engine: 'typesafe' })).toEqual({ kind: 'replaceWithoutKeys', engine: 'typesafe' })
  })

  it('lets a draft that clears the keys through, whatever its write mode', () => {
    expect(saveProblem(edit(draft(), 'openai', { api_keys_mode: 'replace', clear_api_key: true }))).toBeNull()
  })

  it('tells of the model filter before the keys', () => {
    const both = edit(draft({ model_filter_type: 'include' }), 'openai', { api_keys_mode: 'replace' })
    expect(saveProblem(both)).toEqual({ kind: 'modelFilterModels' })
  })
})

describe('savePayload', () => {
  it('sends the whole config: the shared settings, the selected engine and both profiles', () => {
    expect(savePayload(draft(), BLOCK_MESSAGE)).toEqual({
      engine: 'openai',
      enabled: true,
      mode: 'pre_block',
      base_url: 'https://api.openai.com',
      model: 'omni-moderation-latest',
      proxy_id: 0,
      timeout_ms: 3000,
      retry_count: 2,
      sample_rate: 100,
      all_groups: false,
      group_ids: [1, 3],
      record_non_hits: true,
      clear_api_key: false,
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
      thresholds: DEFAULT_SHARES,
      blocked_keywords: ['alpha', 'beta'],
      keyword_blocking_mode: 'keyword_and_api',
      model_filter: { type: 'all', models: [] },
      engine_configs: {
        openai: {
          base_url: 'https://api.openai.com',
          model: 'omni-moderation-latest',
          proxy_id: 0,
          timeout_ms: 3000,
          retry_count: 2,
          thresholds: DEFAULT_SHARES,
          clear_api_key: false,
          api_keys: undefined,
          api_keys_mode: 'append',
          delete_api_key_hashes: [],
        },
        typesafe: {
          base_url: 'https://api.typesafe.ai',
          model: 'jev-latest',
          proxy_id: 0,
          timeout_ms: 3000,
          retry_count: 2,
          thresholds: DEFAULT_SHARES,
          clear_api_key: false,
          api_keys: undefined,
          api_keys_mode: 'append',
          delete_api_key_hashes: [],
        },
      },
    })
  })

  it('saves what was edited for each engine, and keeps the selected one as the running engine', () => {
    let edited = edit(draft(), 'openai', {
      base_url: 'https://openai-edited.example.test',
      thresholds: { ...engine('openai').thresholds, sexual: 73 },
    })
    edited = edit(edited, 'typesafe', {
      base_url: 'https://typesafe-edited.example.test',
      thresholds: { ...engine('typesafe').thresholds, sexual: 91 },
    })
    const payload = savePayload(edited, BLOCK_MESSAGE)
    expect(payload.engine).toBe('openai')
    expect(payload.base_url).toBe('https://openai-edited.example.test')
    expect(payload.thresholds?.sexual).toBe(0.73)
    expect(payload.engine_configs?.openai).toMatchObject({ base_url: 'https://openai-edited.example.test' })
    expect(payload.engine_configs?.openai?.thresholds?.sexual).toBe(0.73)
    expect(payload.engine_configs?.typesafe).toMatchObject({ base_url: 'https://typesafe-edited.example.test' })
    expect(payload.engine_configs?.typesafe?.thresholds?.sexual).toBe(0.91)
  })

  it('makes the other engine the running one when it is selected', () => {
    const payload = savePayload(
      edit(draft({ engine: 'typesafe' }), 'typesafe', { proxy_id: 7, timeout_ms: 5000, retry_count: 4 }),
      BLOCK_MESSAGE,
    )
    expect(payload).toMatchObject({
      engine: 'typesafe',
      base_url: 'https://api.typesafe.ai',
      model: 'jev-latest',
      proxy_id: 7,
      timeout_ms: 5000,
      retry_count: 4,
    })
    expect(payload.engine_configs?.typesafe).toMatchObject({ proxy_id: 7, timeout_ms: 5000, retry_count: 4 })
    expect(payload.engine_configs?.openai).toMatchObject({ proxy_id: 0, timeout_ms: 3000, retry_count: 2 })
  })

  it('sends the edited thresholds of the selected engine', () => {
    const payload = savePayload(
      edit(draft(), 'openai', { thresholds: { ...engine('openai').thresholds, sexual: 72, harassment: 99 } }),
      BLOCK_MESSAGE,
    )
    expect(payload.thresholds).toMatchObject({ sexual: 0.72, harassment: 0.99 })
  })

  it('sends the chosen model filter with its models', () => {
    const payload = savePayload(
      draft({ model_filter_type: 'include', model_filter_models: ['gpt-5.5', 'gpt-5.4'] }),
      BLOCK_MESSAGE,
    )
    expect(payload.model_filter).toEqual({ type: 'include', models: ['gpt-5.5', 'gpt-5.4'] })
  })

  it('leaves keys alone when none were typed and none are to go', () => {
    const payload = savePayload(draft(), BLOCK_MESSAGE)
    expect(payload).not.toHaveProperty('api_keys')
    expect(payload).not.toHaveProperty('api_keys_mode')
    expect(payload).not.toHaveProperty('delete_api_key_hashes')
    expect(payload.clear_api_key).toBe(false)
  })

  it('adds the typed keys to the saved ones', () => {
    const payload = savePayload(edit(draft(), 'openai', { api_keys_text: 'fixture-a\nfixture-b\nfixture-a' }), BLOCK_MESSAGE)
    expect(payload.api_keys).toEqual(['fixture-a', 'fixture-b'])
    expect(payload.api_keys_mode).toBe('append')
    expect(payload.clear_api_key).toBe(false)
    expect(payload.engine_configs?.openai?.api_keys).toEqual(['fixture-a', 'fixture-b'])
    expect(payload.engine_configs?.typesafe?.api_keys).toBeUndefined()
  })

  it('deletes the marked keys, also while adding new ones', () => {
    const marked = edit(draft(), 'openai', { pendingDeletes: ['hash-1', 'hash-2'] })
    expect(savePayload(marked, BLOCK_MESSAGE).delete_api_key_hashes).toEqual(['hash-1', 'hash-2'])

    const adding = savePayload(edit(marked, 'openai', { api_keys_text: 'fixture-new' }), BLOCK_MESSAGE)
    expect(adding.api_keys).toEqual(['fixture-new'])
    expect(adding.delete_api_key_hashes).toEqual(['hash-1', 'hash-2'])
    expect(adding.engine_configs?.openai?.delete_api_key_hashes).toEqual(['hash-1', 'hash-2'])
  })

  it('replaces the saved keys without naming single ones to delete', () => {
    const payload = savePayload(
      edit(draft(), 'openai', { api_keys_text: 'fixture-new', api_keys_mode: 'replace', pendingDeletes: ['hash-1'] }),
      BLOCK_MESSAGE,
    )
    expect(payload.api_keys).toEqual(['fixture-new'])
    expect(payload.api_keys_mode).toBe('replace')
    expect(payload).not.toHaveProperty('delete_api_key_hashes')
  })

  it('clears the saved keys', () => {
    const payload = savePayload(edit(draft(), 'openai', { clear_api_key: true, pendingDeletes: ['hash-1'] }), BLOCK_MESSAGE)
    expect(payload.clear_api_key).toBe(true)
    expect(payload).not.toHaveProperty('api_keys')
    expect(payload).not.toHaveProperty('delete_api_key_hashes')
    expect(payload.engine_configs?.openai?.clear_api_key).toBe(true)
    expect(payload.engine_configs?.typesafe?.clear_api_key).toBe(false)
  })

  it('does not clear when keys were typed after all', () => {
    const payload = savePayload(edit(draft(), 'openai', { clear_api_key: true, api_keys_text: 'fixture-new' }), BLOCK_MESSAGE)
    expect(payload.clear_api_key).toBe(false)
    expect(payload.api_keys).toEqual(['fixture-new'])
  })

  it('sends the keys of the engine that is not selected in its profile only', () => {
    const payload = savePayload(edit(draft(), 'typesafe', { api_keys_text: 'ts-key', pendingDeletes: ['hash-9'] }), BLOCK_MESSAGE)
    expect(payload).not.toHaveProperty('api_keys')
    expect(payload).not.toHaveProperty('delete_api_key_hashes')
    expect(payload.engine_configs?.typesafe?.api_keys).toEqual(['ts-key'])
    expect(payload.engine_configs?.typesafe?.delete_api_key_hashes).toEqual(['hash-9'])
  })

  it('sends no group list when every group is audited', () => {
    const payload = savePayload(draft({ all_groups: true, group_ids: [1, 3] }), BLOCK_MESSAGE)
    expect(payload.all_groups).toBe(true)
    expect(payload.group_ids).toEqual([])
  })

  it('does not hand out the draft’s group list', () => {
    const source = draft()
    const payload = savePayload(source, BLOCK_MESSAGE)
    expect(payload.group_ids).toEqual([1, 3])
    expect(payload.group_ids).not.toBe(source.group_ids)
  })

  it('falls back to the server defaults for numbers that are missing', () => {
    const payload = savePayload(
      edit(
        draft({
          worker_count: 0,
          queue_size: Number.NaN,
          block_status: 0,
          ban_threshold: 0,
          violation_window_hours: 0,
          hit_retention_days: 0,
          non_hit_retention_days: 0,
        }),
        'openai',
        { timeout_ms: 0 },
      ),
      BLOCK_MESSAGE,
    )
    expect(payload).toMatchObject({
      timeout_ms: 3000,
      worker_count: 4,
      queue_size: 32768,
      block_status: 403,
      ban_threshold: 10,
      violation_window_hours: 720,
      hit_retention_days: 180,
      non_hit_retention_days: 3,
    })
  })

  it('keeps zero retries and a sample rate of zero', () => {
    const payload = savePayload(edit(draft({ sample_rate: 0 }), 'openai', { retry_count: 0 }), BLOCK_MESSAGE)
    expect(payload.retry_count).toBe(0)
    expect(payload.sample_rate).toBe(0)
  })

  it('keeps the days for records without a hit between 1 and 3', () => {
    expect(savePayload(draft({ non_hit_retention_days: 9 }), BLOCK_MESSAGE).non_hit_retention_days).toBe(3)
    expect(savePayload(draft({ non_hit_retention_days: 2 }), BLOCK_MESSAGE).non_hit_retention_days).toBe(2)
    expect(savePayload(draft({ non_hit_retention_days: -1 }), BLOCK_MESSAGE).non_hit_retention_days).toBe(1)
  })

  it('sends the default refusal text when the field was emptied', () => {
    expect(savePayload(draft({ block_message: '' }), BLOCK_MESSAGE).block_message).toBe(BLOCK_MESSAGE)
    expect(savePayload(draft({ block_message: 'custom' }), BLOCK_MESSAGE).block_message).toBe('custom')
    expect(savePayload(draft({ block_message: '  custom  ' }), BLOCK_MESSAGE).block_message).toBe('custom')
    expect(savePayload(draft({ block_message: '   ' }), BLOCK_MESSAGE).block_message).toBe(BLOCK_MESSAGE)
  })

  it('sends the keywords each once and the keyword mode', () => {
    const payload = savePayload(
      draft({ blocked_keywords_text: 'Alpha\n alpha \n\nbeta', keyword_blocking_mode: 'keyword_only' }),
      BLOCK_MESSAGE,
    )
    expect(payload.blocked_keywords).toEqual(['Alpha', 'beta'])
    expect(payload.keyword_blocking_mode).toBe('keyword_only')
  })
})

describe('testPayload', () => {
  it('tries the selected engine as the draft has it, without making it the running one', () => {
    const selected = draft({ engine: 'typesafe' })
    expect(testPayload(selected, { keys: ['test-only-key'], prompt: '', images: [] })).toEqual({
      engine: 'typesafe',
      thresholds: DEFAULT_SHARES,
      api_keys: ['test-only-key'],
      base_url: 'https://api.typesafe.ai',
      model: 'jev-latest',
      timeout_ms: 3000,
      proxy_id: 0,
      prompt: '',
      images: [],
    })
  })

  it('sends no keys to try the saved ones, with the content of the trial run', () => {
    const payload = testPayload(draft(), { keys: [], prompt: 'is this fine?', images: ['data:image/png;base64,AAAA'] })
    expect(payload.api_keys).toEqual([])
    expect(payload.prompt).toBe('is this fine?')
    expect(payload.images).toEqual(['data:image/png;base64,AAAA'])
  })

  it('uses the edited address, model, proxy, timeout and thresholds', () => {
    const payload = testPayload(
      edit(draft(), 'openai', {
        base_url: 'https://audit.example.test',
        model: 'custom',
        proxy_id: 7,
        timeout_ms: 8000,
        thresholds: { ...engine('openai').thresholds, sexual: 40 },
      }),
      { keys: ['fixture-a'], prompt: '', images: [] },
    )
    expect(payload).toMatchObject({ base_url: 'https://audit.example.test', model: 'custom', proxy_id: 7, timeout_ms: 8000 })
    expect(payload.thresholds?.sexual).toBe(0.4)
  })

  it('falls back to the default timeout', () => {
    expect(testPayload(edit(draft(), 'openai', { timeout_ms: 0 }), { keys: [], prompt: '', images: [] }).timeout_ms).toBe(3000)
  })
})
