import { describe, expect, it } from 'vitest'
import type { ChannelMonitor } from '~/lib/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import {
  createMonitorRequest,
  defaultIntervalSeconds,
  maxJitterSeconds,
  monitorFormOf,
  monitorFormProblems,
  newMonitorForm,
  templatesFor,
  updateMonitorRequest,
  withApiMode,
  withCheckMode,
  withExtraModels,
  withInterval,
  withProvider,
  withTemplate,
  type MonitorForm,
} from './monitorForm'
import { emptyRequestDraft } from './monitorRequest'

function monitor(change: Partial<ChannelMonitor> = {}): ChannelMonitor {
  return {
    id: 7,
    name: 'OpenAI main',
    provider: 'openai',
    api_mode: 'responses',
    endpoint: 'https://api.example.test',
    api_key_masked: 'fixture-****1234',
    primary_model: 'gpt-5',
    extra_models: ['gpt-5-mini'],
    group_name: 'main',
    enabled: true,
    interval_seconds: 120,
    jitter_seconds: 10,
    last_checked_at: null,
    created_by: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    primary_status: 'operational',
    primary_latency_ms: 400,
    availability_7d: 99,
    extra_models_status: [],
    template_id: 3,
    extra_headers: { 'X-App': 'cli' },
    body_override_mode: 'merge',
    body_override: { max_tokens: 20 },
    check_mode: 'probe',
    account_id: null,
    ...change,
  }
}

function template(change: Partial<ChannelMonitorTemplate> = {}): ChannelMonitorTemplate {
  return {
    id: 5,
    name: 'Claude Code',
    provider: 'anthropic',
    api_mode: 'chat_completions',
    description: '',
    extra_headers: { 'User-Agent': 'claude-cli/2.0' },
    body_override_mode: 'merge',
    body_override: { system: 'You are Claude Code' },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    associated_monitors: 0,
    ...change,
  }
}

/** A form that can be saved as it is: a probing monitor with everything asked of it filled in. */
function filled(change: Partial<MonitorForm> = {}): MonitorForm {
  return {
    ...newMonitorForm(60),
    name: ' Claude ',
    endpoint: ' https://api.anthropic.com ',
    apiKey: ' fixture-ant-1 ',
    primaryModel: ' claude-sonnet-4-5 ',
    ...change,
  }
}

describe('the interval of a monitor', () => {
  it('starts from what the site sets, or from a minute when the site sets nothing', () => {
    expect(defaultIntervalSeconds(300)).toBe(300)
    expect(defaultIntervalSeconds(0)).toBe(60)
    expect(defaultIntervalSeconds(undefined)).toBe(60)
    expect(defaultIntervalSeconds(null)).toBe(60)
    expect(defaultIntervalSeconds(-5)).toBe(60)
  })

  it('can sway by what keeps a check from coming sooner than the shortest interval', () => {
    expect(maxJitterSeconds(60)).toBe(45)
    expect(maxJitterSeconds(15)).toBe(0)
    expect(maxJitterSeconds(10)).toBe(0)
  })

  it('holds the sway to what a shorter interval leaves room for', () => {
    const form = { ...newMonitorForm(120), jitterSeconds: 60 }
    expect(withInterval(form, 300).jitterSeconds).toBe(60)
    expect(withInterval(form, 30)).toMatchObject({ intervalSeconds: 30, jitterSeconds: 15 })
    expect(withInterval(form, 15).jitterSeconds).toBe(0)
  })
})

describe('a new monitor', () => {
  it('probes Anthropic, switched on, at the interval given', () => {
    expect(newMonitorForm(90)).toEqual({
      name: '',
      provider: 'anthropic',
      apiMode: 'chat_completions',
      checkMode: 'probe',
      accountId: null,
      endpoint: '',
      apiKey: '',
      primaryModel: '',
      extraModels: [],
      groupName: '',
      intervalSeconds: 90,
      jitterSeconds: 0,
      enabled: true,
      templateId: null,
      request: emptyRequestDraft(),
    })
  })
})

describe('a stored monitor laid out for editing', () => {
  it('carries everything but the key, which the browser is never sent', () => {
    expect(monitorFormOf(monitor(), 60)).toEqual({
      name: 'OpenAI main',
      provider: 'openai',
      apiMode: 'responses',
      checkMode: 'probe',
      accountId: null,
      endpoint: 'https://api.example.test',
      apiKey: '',
      primaryModel: 'gpt-5',
      extraModels: ['gpt-5-mini'],
      groupName: 'main',
      intervalSeconds: 120,
      jitterSeconds: 10,
      enabled: true,
      templateId: 3,
      request: {
        headers: [{ name: 'X-App', value: 'cli' }],
        bodyMode: 'merge',
        bodyText: '{\n  "max_tokens": 20\n}',
      },
    })
  })

  it('fills in what an old monitor was saved without', () => {
    const old = monitor({
      check_mode: '' as ChannelMonitor['check_mode'],
      api_mode: undefined as unknown as ChannelMonitor['api_mode'],
      interval_seconds: 0,
      extra_models: null as unknown as string[],
      group_name: null as unknown as string,
      template_id: null,
      extra_headers: null as unknown as Record<string, string>,
      body_override_mode: '' as ChannelMonitor['body_override_mode'],
      body_override: null,
    })
    expect(monitorFormOf(old, 90)).toMatchObject({
      checkMode: 'probe',
      apiMode: 'chat_completions',
      intervalSeconds: 90,
      extraModels: [],
      groupName: '',
      templateId: null,
      request: emptyRequestDraft(),
    })
  })

  it('does not take the stand-in of a monitor that probes nothing for a model', () => {
    const quotaOnly = monitor({ check_mode: 'quota', primary_model: 'quota', account_id: 12 })
    expect(monitorFormOf(quotaOnly, 60)).toMatchObject({ checkMode: 'quota', primaryModel: '', accountId: 12 })
    // A probing monitor may really check a model of that name.
    expect(monitorFormOf(monitor({ primary_model: 'quota' }), 60).primaryModel).toBe('quota')
  })

  it('does not share its list of models with the monitor', () => {
    const stored = monitor()
    monitorFormOf(stored, 60).extraModels.push('another')
    expect(stored.extra_models).toEqual(['gpt-5-mini'])
  })
})

describe('picking another provider', () => {
  const custom: Partial<MonitorForm> = {
    accountId: 9,
    templateId: 3,
    request: { headers: [{ name: 'X-App', value: 'cli' }], bodyMode: 'merge', bodyText: '{"a":1}' },
  }

  it('changes nothing when it is the provider already picked', () => {
    const form = filled()
    expect(withProvider(form, 'anthropic')).toBe(form)
  })

  it('drops the account, the key typed, the template and the custom request', () => {
    const next = withProvider(filled({ ...custom, checkMode: 'quota_probe' }), 'gemini')
    expect(next).toMatchObject({
      provider: 'gemini',
      accountId: null,
      apiKey: '',
      templateId: null,
      request: emptyRequestDraft(),
      checkMode: 'quota_probe',
    })
    // What was typed for the monitor itself stays.
    expect(next.name).toBe(' Claude ')
    expect(next.endpoint).toBe(' https://api.anthropic.com ')
    expect(next.primaryModel).toBe(' claude-sonnet-4-5 ')
  })

  it('keeps the kind of request only for OpenAI', () => {
    const openai = filled({ provider: 'openai', apiMode: 'responses' })
    expect(withProvider(openai, 'anthropic').apiMode).toBe('chat_completions')
    expect(withProvider(filled(), 'openai').apiMode).toBe('chat_completions')
  })

  it('only reads the quota of a provider that cannot be probed, and probes again once it is left', () => {
    const toQuotaOnly = withProvider(filled(), 'antigravity')
    expect(toQuotaOnly.checkMode).toBe('quota')
    expect(withProvider(toQuotaOnly, 'anthropic').checkMode).toBe('probe')
    // A way of checking that was chosen, not forced, is kept.
    expect(withProvider(filled({ checkMode: 'quota' }), 'openai').checkMode).toBe('quota')
    expect(withProvider(filled({ checkMode: 'quota_probe' }), 'antigravity').checkMode).toBe('quota')
  })

  it('fills in the address and the model of a provider that has usual ones, when the fields are empty', () => {
    const blank = newMonitorForm(60)
    expect(withProvider(blank, 'grok')).toMatchObject({ endpoint: 'https://api.x.ai', primaryModel: 'grok-4.5' })
    expect(withProvider(blank, 'kimi')).toMatchObject({ endpoint: 'https://api.moonshot.cn', primaryModel: '' })
    expect(withProvider(blank, 'zhipu').endpoint).toBe('https://open.bigmodel.cn')
    expect(withProvider(blank, 'deepseek').endpoint).toBe('https://api.deepseek.com')
    expect(withProvider(blank, 'minimax').endpoint).toBe('https://api.minimaxi.com')
    expect(withProvider(blank, 'opencode_go').endpoint).toBe('https://opencode.ai/zen/go/v1')
    expect(withProvider(blank, 'openai')).toMatchObject({ endpoint: '', primaryModel: '' })
  })

  it('leaves an address and a model that were typed', () => {
    const typed = filled({ endpoint: 'https://gateway.example.test', primaryModel: 'my-model' })
    expect(withProvider(typed, 'grok')).toMatchObject({ endpoint: 'https://gateway.example.test', primaryModel: 'my-model' })
    expect(withProvider(withProvider(typed, 'grok'), 'kimi')).toMatchObject({
      endpoint: 'https://gateway.example.test',
      primaryModel: 'my-model',
    })
  })

  it('takes back what it filled in when the provider is left', () => {
    const grok = withProvider(newMonitorForm(60), 'grok')
    expect(withProvider(grok, 'anthropic')).toMatchObject({ endpoint: '', primaryModel: '' })
    expect(withProvider(grok, 'kimi')).toMatchObject({ endpoint: 'https://api.moonshot.cn', primaryModel: '' })
    const kimi = withProvider(newMonitorForm(60), 'kimi')
    expect(withProvider(kimi, 'grok')).toMatchObject({ endpoint: 'https://api.x.ai', primaryModel: 'grok-4.5' })
    expect(withProvider(kimi, 'zhipu').endpoint).toBe('https://open.bigmodel.cn')
  })
})

describe('picking another way of checking', () => {
  it('lets go of the account when only probing is left', () => {
    const form = filled({ checkMode: 'quota_probe', accountId: 9 })
    expect(withCheckMode(form, 'probe')).toMatchObject({ checkMode: 'probe', accountId: null })
    expect(withCheckMode(form, 'quota')).toMatchObject({ checkMode: 'quota', accountId: 9 })
  })

  it('refuses a way the provider cannot be checked', () => {
    const form = withProvider(filled(), 'antigravity')
    expect(withCheckMode(form, 'probe')).toBe(form)
    expect(withCheckMode(form, 'quota_probe')).toBe(form)
    expect(withCheckMode(form, 'quota').checkMode).toBe('quota')
  })
})

describe('picking the other kind of OpenAI request', () => {
  const custom = filled({
    provider: 'openai',
    templateId: 3,
    request: { headers: [{ name: 'X-App', value: 'cli' }], bodyMode: 'merge', bodyText: '{"a":1}' },
  })

  it('drops the template and the custom request, which were written for the kind left', () => {
    expect(withApiMode(custom, 'responses')).toMatchObject({
      apiMode: 'responses',
      templateId: null,
      request: emptyRequestDraft(),
    })
  })

  it('changes nothing when it is the kind already picked', () => {
    expect(withApiMode(custom, 'chat_completions')).toBe(custom)
  })
})

describe('typing in the other models to check', () => {
  it('adds every model an entry names, such as a pasted list', () => {
    const form = filled({ extraModels: ['a'] })
    expect(withExtraModels(form, 'b').extraModels).toEqual(['a', 'b'])
    expect(withExtraModels(form, ' b, c;d\ne  f ').extraModels).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('lists no model twice', () => {
    const form = filled({ extraModels: ['a'] })
    expect(withExtraModels(form, 'b, a, b').extraModels).toEqual(['a', 'b'])
    // Model names tell upper case from lower.
    expect(withExtraModels(form, 'A').extraModels).toEqual(['a', 'A'])
  })

  it('changes nothing for an entry that names nothing new', () => {
    const form = filled({ extraModels: ['a'] })
    expect(withExtraModels(form, 'a')).toBe(form)
    expect(withExtraModels(form, ' , ; ')).toBe(form)
  })
})

describe('templates', () => {
  const templates = [
    template({ id: 1, provider: 'anthropic' }),
    template({ id: 2, provider: 'openai', api_mode: 'chat_completions' }),
    template({ id: 3, provider: 'openai', api_mode: 'responses' }),
    template({ id: 4, provider: 'gemini', api_mode: 'responses' }),
  ]

  it('are offered for their provider, and for OpenAI for their kind of request', () => {
    const ids = (form: Pick<MonitorForm, 'provider' | 'apiMode'>) => templatesFor(templates, form).map(({ id }) => id)
    expect(ids({ provider: 'anthropic', apiMode: 'chat_completions' })).toEqual([1])
    expect(ids({ provider: 'openai', apiMode: 'chat_completions' })).toEqual([2])
    expect(ids({ provider: 'openai', apiMode: 'responses' })).toEqual([3])
    expect(ids({ provider: 'gemini', apiMode: 'chat_completions' })).toEqual([4])
    expect(ids({ provider: 'grok', apiMode: 'chat_completions' })).toEqual([])
  })

  it('have their request copied into the form when picked', () => {
    expect(withTemplate(filled(), template())).toMatchObject({
      templateId: 5,
      apiMode: 'chat_completions',
      request: {
        headers: [{ name: 'User-Agent', value: 'claude-cli/2.0' }],
        bodyMode: 'merge',
        bodyText: '{\n  "system": "You are Claude Code"\n}',
      },
    })
  })

  it('bring their kind of request along for OpenAI', () => {
    const openai = filled({ provider: 'openai' })
    expect(withTemplate(openai, template({ provider: 'openai', api_mode: 'responses' })).apiMode).toBe('responses')
    expect(withTemplate(filled(), template({ api_mode: 'responses' })).apiMode).toBe('chat_completions')
  })
})

describe('what stands in the way of saving', () => {
  it('is nothing for a form filled in', () => {
    expect(monitorFormProblems(filled(), false)).toEqual({})
  })

  it('is everything a new probing monitor needs and lacks', () => {
    expect(monitorFormProblems(newMonitorForm(60), false)).toEqual({
      name: true,
      endpoint: true,
      apiKey: true,
      primaryModel: true,
    })
    expect(monitorFormProblems(filled({ name: '   ', endpoint: ' ', apiKey: ' ', primaryModel: ' ' }), false)).toEqual({
      name: true,
      endpoint: true,
      apiKey: true,
      primaryModel: true,
    })
  })

  it('is not the key of a monitor being edited: it keeps the one it has', () => {
    expect(monitorFormProblems(filled({ apiKey: '' }), true)).toEqual({})
  })

  it('is the account of a monitor that reads a quota', () => {
    expect(monitorFormProblems(filled({ checkMode: 'quota_probe' }), false)).toEqual({ account: true })
    expect(monitorFormProblems(filled({ checkMode: 'quota_probe', accountId: 9 }), false)).toEqual({})
  })

  it('is only the account for a monitor that probes nothing', () => {
    const quotaOnly = { ...newMonitorForm(60), name: 'Quota', checkMode: 'quota' as const }
    expect(monitorFormProblems(quotaOnly, false)).toEqual({ account: true })
    const unused = { headers: [{ name: 'a b', value: '' }], bodyMode: 'merge' as const, bodyText: '[' }
    expect(monitorFormProblems({ ...quotaOnly, accountId: 9, request: unused }, false)).toEqual({})
  })

  it('is a custom request that cannot be sent', () => {
    const request = { headers: [{ name: 'a:b', value: '' }], bodyMode: 'replace' as const, bodyText: '[1]' }
    expect(monitorFormProblems(filled({ request }), false)).toEqual({
      headerName: 'a:b',
      body: { kind: 'notObject' },
    })
  })
})

describe('what is sent to create a monitor', () => {
  it('is the form with the blanks around what was typed taken off', () => {
    const form = filled({
      extraModels: ['claude-haiku-4-5'],
      groupName: ' main ',
      intervalSeconds: 120,
      jitterSeconds: 10,
      templateId: 5,
      request: { headers: [{ name: 'X-App', value: 'cli' }], bodyMode: 'merge', bodyText: '{"max_tokens": 20}' },
    })
    expect(createMonitorRequest(form)).toEqual({
      name: 'Claude',
      provider: 'anthropic',
      api_mode: 'chat_completions',
      check_mode: 'probe',
      account_id: null,
      endpoint: 'https://api.anthropic.com',
      api_key: 'fixture-ant-1',
      primary_model: 'claude-sonnet-4-5',
      extra_models: ['claude-haiku-4-5'],
      group_name: 'main',
      enabled: true,
      interval_seconds: 120,
      jitter_seconds: 10,
      template_id: 5,
      extra_headers: { 'X-App': 'cli' },
      body_override_mode: 'merge',
      body_override: { max_tokens: 20 },
    })
  })

  it('names the kind of request for OpenAI alone', () => {
    expect(createMonitorRequest(filled({ provider: 'openai', apiMode: 'responses' })).api_mode).toBe('responses')
    expect(createMonitorRequest(filled({ provider: 'gemini', apiMode: 'responses' })).api_mode).toBe('chat_completions')
  })

  it('leaves empty what only a probing monitor has, for one that reads a quota alone', () => {
    const form = filled({ checkMode: 'quota', accountId: 9, extraModels: ['x'], templateId: 5 })
    expect(createMonitorRequest(form)).toMatchObject({
      check_mode: 'quota',
      account_id: 9,
      endpoint: '',
      api_key: '',
      primary_model: 'quota',
      extra_models: [],
      template_id: null,
    })
  })

  it('sends both the account and the probing part for a monitor that does both', () => {
    expect(createMonitorRequest(filled({ checkMode: 'quota_probe', accountId: 9 }))).toMatchObject({
      check_mode: 'quota_probe',
      account_id: 9,
      endpoint: 'https://api.anthropic.com',
      primary_model: 'claude-sonnet-4-5',
    })
  })
})

describe('what is sent to save an edited monitor', () => {
  it('leaves the key out unless a new one was typed', () => {
    expect('api_key' in updateMonitorRequest(filled({ apiKey: '  ' }))).toBe(false)
    expect(updateMonitorRequest(filled({ apiKey: ' fixture-new ' })).api_key).toBe('fixture-new')
  })

  it('says by a flag that a probing monitor has no template', () => {
    const none = updateMonitorRequest(filled({ templateId: null }))
    expect(none.clear_template).toBe(true)
    expect('template_id' in none).toBe(false)

    const some = updateMonitorRequest(filled({ templateId: 5 }))
    expect(some.template_id).toBe(5)
    expect('clear_template' in some).toBe(false)
  })

  it('says by a zero that a probing monitor has no account', () => {
    expect(updateMonitorRequest(filled()).account_id).toBe(0)
    expect(updateMonitorRequest(filled({ checkMode: 'quota_probe', accountId: 9 })).account_id).toBe(9)
  })

  it('sends the monitor that reads a quota alone without the probing part', () => {
    const request = updateMonitorRequest(filled({ checkMode: 'quota', accountId: 9, templateId: 5 }))
    expect(request).toMatchObject({ account_id: 9, endpoint: '', primary_model: 'quota', template_id: null })
    expect('clear_template' in request).toBe(false)
    expect('api_key' in request).toBe(false)
  })
})
