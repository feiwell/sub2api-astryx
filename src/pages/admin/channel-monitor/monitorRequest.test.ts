import { describe, expect, it } from 'vitest'
import { keysFor, usableKeys } from './monitorKeys'
import {
  bodyPlaceholder,
  emptyRequestDraft,
  headersOf,
  invalidHeaderName,
  prettyBody,
  readBody,
  requestDraftOf,
  requestProblems,
  requestSnapshotOf,
  withBlankHeaderRow,
  withBodyMode,
  withHeaderRow,
  withoutHeaderRow,
} from './monitorRequest'

describe('a stored custom request laid out for editing', () => {
  it('has one blank row to type into when nothing is stored', () => {
    expect(requestDraftOf({})).toEqual({ headers: [{ name: '', value: '' }], bodyMode: 'off', bodyText: '' })
    expect(requestDraftOf({ extra_headers: null, body_override_mode: '', body_override: null })).toEqual(
      emptyRequestDraft(),
    )
  })

  it('gives each stored header a row, and the body as text over lines', () => {
    const draft = requestDraftOf({
      extra_headers: { 'User-Agent': 'claude-cli/2.0', 'X-App': 'cli' },
      body_override_mode: 'merge',
      body_override: { max_tokens: 20 },
    })
    expect(draft.headers).toEqual([
      { name: 'User-Agent', value: 'claude-cli/2.0' },
      { name: 'X-App', value: 'cli' },
    ])
    expect(draft.bodyMode).toBe('merge')
    expect(draft.bodyText).toBe('{\n  "max_tokens": 20\n}')
  })

  it('shows a stored body without fields as no body', () => {
    expect(requestDraftOf({ body_override_mode: 'replace', body_override: {} }).bodyText).toBe('')
  })
})

describe('editing the header rows', () => {
  const draft = requestDraftOf({ extra_headers: { A: '1', B: '2' } })

  it('changes the row named and leaves the others', () => {
    expect(withHeaderRow(draft, 1, { value: '9' }).headers).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '9' },
    ])
  })

  it('adds a blank row at the end', () => {
    expect(withBlankHeaderRow(draft).headers).toHaveLength(3)
    expect(withBlankHeaderRow(draft).headers[2]).toEqual({ name: '', value: '' })
  })

  it('removes a row, and leaves a blank one when the last row goes', () => {
    expect(withoutHeaderRow(draft, 0).headers).toEqual([{ name: 'B', value: '2' }])
    expect(withoutHeaderRow(withoutHeaderRow(draft, 0), 0).headers).toEqual([{ name: '', value: '' }])
  })
})

describe('the headers the rows spell out', () => {
  it('leaves out rows without a name and takes the blanks off names, not off values', () => {
    expect(
      headersOf([
        { name: '  X-App  ', value: ' cli ' },
        { name: '', value: 'orphan' },
        { name: '   ', value: '' },
      ]),
    ).toEqual({ 'X-App': ' cli ' })
  })

  it('takes the later of two rows with one name', () => {
    expect(
      headersOf([
        { name: 'A', value: '1' },
        { name: 'A', value: '2' },
      ]),
    ).toEqual({ A: '2' })
  })

  it('finds the first name with a colon or a space in it', () => {
    expect(invalidHeaderName([{ name: 'X-App', value: '' }])).toBeNull()
    expect(invalidHeaderName([{ name: '', value: 'a: b' }])).toBeNull()
    expect(
      invalidHeaderName([
        { name: 'Fine', value: '' },
        { name: 'User-Agent:', value: '' },
        { name: 'Has Space', value: '' },
      ]),
    ).toBe('User-Agent:')
    expect(invalidHeaderName([{ name: ' Has\tTab ', value: '' }])).toBe('Has\tTab')
  })
})

describe('reading the body typed', () => {
  it('reads empty text as no body', () => {
    expect(readBody('')).toEqual({ body: null })
    expect(readBody('  \n ')).toEqual({ body: null })
  })

  it('reads an object', () => {
    expect(readBody(' {"max_tokens": 20} ')).toEqual({ body: { max_tokens: 20 } })
  })

  it('refuses JSON that is not an object', () => {
    expect(readBody('[1, 2]')).toEqual({ problem: { kind: 'notObject' } })
    expect(readBody('42')).toEqual({ problem: { kind: 'notObject' } })
    expect(readBody('null')).toEqual({ problem: { kind: 'notObject' } })
  })

  it('says what is wrong with text that is not JSON', () => {
    const read = readBody('{"a": }')
    expect('problem' in read && read.problem.kind).toBe('syntax')
    expect('problem' in read && read.problem.kind === 'syntax' && read.problem.detail.length > 0).toBe(true)
  })

  it('lays JSON out over lines, and gives nothing for text that is not JSON', () => {
    expect(prettyBody('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
    expect(prettyBody('{"a": }')).toBeNull()
  })
})

describe('the body mode', () => {
  it('keeps the text between the two modes that use it', () => {
    const draft = { ...emptyRequestDraft(), bodyMode: 'merge' as const, bodyText: '{"a":1}' }
    expect(withBodyMode(draft, 'replace')).toEqual({ ...draft, bodyMode: 'replace' })
  })

  it('drops the text when the default request is picked again', () => {
    const draft = { ...emptyRequestDraft(), bodyMode: 'merge' as const, bodyText: '{"a":1}' }
    expect(withBodyMode(draft, 'off')).toEqual({ ...draft, bodyMode: 'off', bodyText: '' })
  })
})

describe('what stands in the way of sending a custom request', () => {
  it('is nothing for an empty draft', () => {
    expect(requestProblems(emptyRequestDraft())).toEqual({})
  })

  it('is a header name that cannot be one', () => {
    const draft = { ...emptyRequestDraft(), headers: [{ name: 'a b', value: '1' }] }
    expect(requestProblems(draft)).toEqual({ headerName: 'a b' })
  })

  it('is a body that cannot be read, while a body is used', () => {
    const draft = { ...emptyRequestDraft(), bodyMode: 'replace' as const, bodyText: '[1]' }
    expect(requestProblems(draft)).toEqual({ body: { kind: 'notObject' } })
    expect(requestProblems({ ...draft, bodyMode: 'off' })).toEqual({})
  })

  it('is not an empty body: that asks for the default one', () => {
    expect(requestProblems({ ...emptyRequestDraft(), bodyMode: 'merge' })).toEqual({})
  })
})

describe('a draft as the server takes it', () => {
  it('sends the headers as a map and the body as an object', () => {
    expect(
      requestSnapshotOf({
        headers: [
          { name: 'X-App', value: 'cli' },
          { name: '', value: '' },
        ],
        bodyMode: 'merge',
        bodyText: '{"max_tokens": 20}',
      }),
    ).toEqual({ extra_headers: { 'X-App': 'cli' }, body_override_mode: 'merge', body_override: { max_tokens: 20 } })
  })

  it('sends no body for empty text', () => {
    expect(requestSnapshotOf(emptyRequestDraft())).toEqual({
      extra_headers: {},
      body_override_mode: 'off',
      body_override: null,
    })
  })

  it('comes back the same after being laid out for editing', () => {
    const stored = {
      extra_headers: { 'User-Agent': 'claude-cli/2.0' },
      body_override_mode: 'replace' as const,
      body_override: { model: 'claude-x', messages: [{ role: 'user', content: 'hi' }] },
    }
    expect(requestSnapshotOf(requestDraftOf(stored))).toEqual(stored)
  })
})

describe('the example shown in an empty body field', () => {
  it('is a Responses request for OpenAI in that mode', () => {
    expect(bodyPlaceholder('openai', 'responses', 'replace')).toContain('"instructions"')
    expect(bodyPlaceholder('openai', 'responses', 'merge')).toBe('{\n  "max_output_tokens": 20\n}')
  })

  it('is a chat request for OpenAI otherwise and for Grok, each with a model of its own', () => {
    expect(bodyPlaceholder('openai', 'chat_completions', 'replace')).toContain('"model": "gpt-4o-mini"')
    expect(bodyPlaceholder('grok', 'chat_completions', 'replace')).toContain('"model": "grok-')
    expect(bodyPlaceholder('grok', 'chat_completions', 'merge')).toBe('{\n  "max_tokens": 20\n}')
  })

  it('is a Claude request for every other provider', () => {
    expect(bodyPlaceholder('anthropic', 'chat_completions', 'replace')).toContain('"model": "claude-x"')
    expect(bodyPlaceholder('gemini', 'chat_completions', 'merge')).toContain('"system"')
  })
})

describe('the keys offered for a monitor', () => {
  const now = Date.parse('2026-11-21T12:00:00Z')

  it('are those switched on and not past their end', () => {
    const keys = [
      { id: 1, status: 'active' as const, expires_at: null },
      { id: 2, status: 'active' as const, expires_at: '2026-11-21T12:00:01Z' },
      { id: 3, status: 'active' as const, expires_at: '2026-11-21T11:59:59Z' },
      { id: 4, status: 'inactive' as const, expires_at: null },
      { id: 5, status: 'quota_exhausted' as const, expires_at: null },
    ]
    expect(usableKeys(keys, now).map((key) => key.id)).toEqual([1, 2])
  })

  const keys = [
    { name: 'Laptop', key: 'fixture-aaa111', group: { name: 'Claude Max', platform: 'anthropic' } },
    { name: 'Server', key: 'fixture-bbb222', group: { name: 'Claude Pro', platform: 'anthropic' } },
    { name: 'Codex', key: 'fixture-ccc333', group: { name: 'OpenAI', platform: 'openai' } },
    { name: 'No group', key: 'fixture-ddd444' },
  ]

  it('are those whose group reaches the provider', () => {
    expect(keysFor(keys, 'anthropic', '').map((key) => key.name)).toEqual(['Laptop', 'Server'])
    expect(keysFor(keys, 'gemini', '')).toEqual([])
  })

  it('are narrowed by part of the name, of the key or of the group, whatever the case', () => {
    expect(keysFor(keys, 'anthropic', ' lap ').map((key) => key.name)).toEqual(['Laptop'])
    expect(keysFor(keys, 'anthropic', 'BBB2').map((key) => key.name)).toEqual(['Server'])
    expect(keysFor(keys, 'anthropic', 'max').map((key) => key.name)).toEqual(['Laptop'])
    expect(keysFor(keys, 'anthropic', 'codex')).toEqual([])
  })
})
