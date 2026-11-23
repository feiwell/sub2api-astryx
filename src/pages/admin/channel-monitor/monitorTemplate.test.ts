import { describe, expect, it } from 'vitest'
import type { AssociatedMonitorBrief, ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import { FORM_PROVIDERS } from './monitorForm'
import { emptyRequestDraft } from './monitorRequest'
import {
  createTemplateRequest,
  newTemplateForm,
  pickedMonitorIds,
  providerForNewTemplate,
  templateBodyMode,
  templateFormOf,
  templateFormProblems,
  templateHeaderCount,
  templateProviders,
  templatesOf,
  updateTemplateRequest,
  withTemplateProvider,
  type TemplateForm,
} from './monitorTemplate'

function template(change: Partial<ChannelMonitorTemplate> = {}): ChannelMonitorTemplate {
  return {
    id: 5,
    name: 'Claude Code',
    provider: 'anthropic',
    api_mode: 'chat_completions',
    description: 'Captured from the CLI',
    extra_headers: { 'X-App': 'cli', 'User-Agent': 'claude-cli/2.0' },
    body_override_mode: 'merge',
    body_override: { max_tokens: 20 },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    associated_monitors: 2,
    ...change,
  }
}

function form(change: Partial<TemplateForm> = {}): TemplateForm {
  return { ...newTemplateForm('openai'), name: 'Codex CLI', ...change }
}

function monitorBrief(id: number): AssociatedMonitorBrief {
  return { id, name: `monitor ${id}`, provider: 'anthropic', api_mode: 'chat_completions', enabled: true }
}

describe('newTemplateForm', () => {
  it('starts empty, for the provider it is given', () => {
    expect(newTemplateForm('gemini')).toEqual({
      name: '',
      provider: 'gemini',
      apiMode: 'chat_completions',
      description: '',
      request: emptyRequestDraft(),
    })
  })
})

describe('templateFormOf', () => {
  it('lays a stored template out for editing', () => {
    expect(templateFormOf(template())).toEqual({
      name: 'Claude Code',
      provider: 'anthropic',
      apiMode: 'chat_completions',
      description: 'Captured from the CLI',
      request: {
        headers: [
          { name: 'X-App', value: 'cli' },
          { name: 'User-Agent', value: 'claude-cli/2.0' },
        ],
        bodyMode: 'merge',
        bodyText: '{\n  "max_tokens": 20\n}',
      },
    })
  })

  it('keeps the kind of request of an OpenAI template', () => {
    expect(templateFormOf(template({ provider: 'openai', api_mode: 'responses' })).apiMode).toBe('responses')
  })

  it('reads chat completions for any other provider, whatever was stored', () => {
    expect(templateFormOf(template({ provider: 'gemini', api_mode: 'responses' })).apiMode).toBe('chat_completions')
  })

  it('reads a template the server stored next to nothing of', () => {
    const bare = {
      ...template(),
      api_mode: undefined,
      description: undefined,
      extra_headers: null,
      body_override_mode: '',
      body_override: null,
    } as unknown as ChannelMonitorTemplate
    expect(templateFormOf(bare)).toEqual({ ...newTemplateForm('anthropic'), name: 'Claude Code' })
  })
})

describe('withTemplateProvider', () => {
  it('keeps what was typed', () => {
    const typed = form({
      description: 'note',
      request: { headers: [{ name: 'x-a', value: '1' }], bodyMode: 'replace', bodyText: '{"a":1}' },
    })
    expect(withTemplateProvider(typed, 'anthropic')).toEqual({ ...typed, provider: 'anthropic' })
  })

  it('goes back to chat completions when the provider left is OpenAI', () => {
    expect(withTemplateProvider(form({ apiMode: 'responses' }), 'grok').apiMode).toBe('chat_completions')
  })

  it('returns the same form for the same provider', () => {
    const same = form({ apiMode: 'responses' })
    expect(withTemplateProvider(same, 'openai')).toBe(same)
  })
})

describe('templateFormProblems', () => {
  it('finds nothing wrong with a named template', () => {
    expect(templateFormProblems(form())).toEqual({})
  })

  it('asks for a name; spaces are none', () => {
    expect(templateFormProblems(form({ name: '   ' }))).toEqual({ name: true })
  })

  it('names a header name that cannot be one', () => {
    const request = { ...emptyRequestDraft(), headers: [{ name: 'x bad', value: '1' }] }
    expect(templateFormProblems(form({ request }))).toEqual({ headerName: 'x bad' })
  })

  it('points out a body that is not JSON, or not an object', () => {
    const broken = { ...emptyRequestDraft(), bodyMode: 'merge' as const, bodyText: '{' }
    expect(templateFormProblems(form({ request: broken })).body?.kind).toBe('syntax')
    const list = { ...emptyRequestDraft(), bodyMode: 'replace' as const, bodyText: '[1]' }
    expect(templateFormProblems(form({ request: list })).body).toEqual({ kind: 'notObject' })
  })

  it('reports all of them together', () => {
    const request = { headers: [{ name: 'a:b', value: '' }], bodyMode: 'merge' as const, bodyText: 'x' }
    expect(Object.keys(templateFormProblems(form({ name: '', request }))).sort()).toEqual([
      'body',
      'headerName',
      'name',
    ])
  })
})

describe('createTemplateRequest', () => {
  it('sends the form, trimmed', () => {
    const filled = form({
      name: '  Codex CLI  ',
      apiMode: 'responses',
      description: '  captured  ',
      request: {
        headers: [
          { name: ' x-app ', value: 'codex' },
          { name: '', value: 'left out' },
        ],
        bodyMode: 'merge',
        bodyText: '{ "max_output_tokens": 20 }',
      },
    })
    expect(createTemplateRequest(filled)).toEqual({
      name: 'Codex CLI',
      provider: 'openai',
      api_mode: 'responses',
      description: 'captured',
      extra_headers: { 'x-app': 'codex' },
      body_override_mode: 'merge',
      body_override: { max_output_tokens: 20 },
    })
  })

  it('sends chat completions for a provider that has one kind of request', () => {
    const request = createTemplateRequest(form({ provider: 'anthropic', apiMode: 'responses' }))
    expect(request.api_mode).toBe('chat_completions')
  })

  it('sends no headers and no body for a template without any', () => {
    expect(createTemplateRequest(form())).toEqual({
      name: 'Codex CLI',
      provider: 'openai',
      api_mode: 'chat_completions',
      description: '',
      extra_headers: {},
      body_override_mode: 'off',
      body_override: null,
    })
  })
})

describe('updateTemplateRequest', () => {
  it('sends what creating sends, without the provider', () => {
    const edited = form({ apiMode: 'responses', description: 'note' })
    const { provider, ...rest } = createTemplateRequest(edited)
    expect(provider).toBe('openai')
    expect(updateTemplateRequest(edited)).toEqual(rest)
    expect(updateTemplateRequest(edited)).not.toHaveProperty('provider')
  })

  it('sends an emptied description and emptied headers, so that they are emptied', () => {
    const emptied = { ...templateFormOf(template()), description: '', request: emptyRequestDraft() }
    expect(updateTemplateRequest(emptied)).toEqual({
      name: 'Claude Code',
      api_mode: 'chat_completions',
      description: '',
      extra_headers: {},
      body_override_mode: 'off',
      body_override: null,
    })
  })
})

describe('what a template shows', () => {
  it('counts its headers', () => {
    expect(templateHeaderCount(template())).toBe(2)
    expect(templateHeaderCount(template({ extra_headers: {} }))).toBe(0)
    expect(templateHeaderCount({ extra_headers: null } as unknown as ChannelMonitorTemplate)).toBe(0)
  })

  it('leaves the body alone when nothing else was stored', () => {
    expect(templateBodyMode(template())).toBe('merge')
    expect(templateBodyMode({ body_override_mode: '' } as unknown as ChannelMonitorTemplate)).toBe('off')
  })
})

describe('templates by provider', () => {
  const templates = [
    template({ id: 1 }),
    template({ id: 2, provider: 'openai' }),
    template({ id: 3, provider: 'anthropic' }),
  ]

  it('lists the templates of a provider in the order they came', () => {
    expect(templatesOf(templates, 'anthropic').map((item) => item.id)).toEqual([1, 3])
    expect(templatesOf(templates, 'gemini')).toEqual([])
  })

  it('lists every provider a template can be created for, with or without templates', () => {
    expect(templateProviders([])).toEqual([...FORM_PROVIDERS])
    expect(templateProviders(templates)).toEqual([...FORM_PROVIDERS])
  })

  it('adds a provider only a stored template has, once', () => {
    const stray = [
      template({ id: 8, provider: 'kiro' as ChannelMonitorTemplate['provider'] }),
      template({ id: 9, provider: 'kiro' as ChannelMonitorTemplate['provider'] }),
    ]
    expect(templateProviders(stray)).toEqual([...FORM_PROVIDERS, 'kiro'])
  })

  it('starts a new template with the provider looked at, or the first one for a provider it cannot have', () => {
    expect(providerForNewTemplate('deepseek')).toBe('deepseek')
    expect(providerForNewTemplate('kiro')).toBe('anthropic')
  })
})

describe('pickedMonitorIds', () => {
  const monitors = [monitorBrief(4), monitorBrief(9), monitorBrief(12)]

  it('gives the ids of the monitors picked, in the order of the list', () => {
    expect(pickedMonitorIds(monitors, ['12', '4'])).toEqual([4, 12])
  })

  it('leaves out what is not a monitor of the template', () => {
    expect(pickedMonitorIds(monitors, ['9', '77', 'x'])).toEqual([9])
    expect(pickedMonitorIds(monitors, [])).toEqual([])
  })
})
