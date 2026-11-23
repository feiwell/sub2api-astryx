import { describe, expect, it } from 'vitest'
import type { ContentModerationLog } from '~/lib/api/admin/riskControl'
import {
  LOG_ENDPOINTS,
  auditSourceText,
  buildLogQuery,
  callerText,
  canUnban,
  emptyLogFilters,
  highestText,
  inputText,
  latencyText,
  logOutcome,
  noticeText,
  outcomeLabel,
  outcomeVariant,
  routeText,
  violationText,
  withUserStatus,
  type LogOutcome,
  type RiskLogFilters,
} from './riskLogs'

const t = (key: string, params?: Record<string, unknown>) => (params ? `<${key} ${JSON.stringify(params)}>` : `<${key}>`)
const filters = (patch: Partial<RiskLogFilters>): RiskLogFilters => ({ ...emptyLogFilters(), ...patch })
/** What actually goes on the wire: a parameter that is undefined is not sent. */
const sent = (query: object) => JSON.parse(JSON.stringify(query))

/** A request that was audited and let through; each test changes what it is about. */
const log = (patch: Partial<ContentModerationLog> = {}): ContentModerationLog => ({
  id: 1,
  request_id: 'req_1',
  user_id: 101,
  user_email: 'alice@example.test',
  api_key_id: 11,
  api_key_name: 'ci-runner',
  group_id: 1,
  group_name: 'default',
  endpoint: '/v1/messages',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  mode: 'pre_block',
  action: 'allow',
  flagged: false,
  highest_category: 'violence',
  highest_score: 0.0123,
  matched_keyword: '',
  category_scores: {},
  threshold_snapshot: {},
  input_excerpt: 'hello',
  upstream_latency_ms: 388,
  error: '',
  violation_count: 0,
  auto_banned: false,
  email_sent: false,
  user_status: 'active',
  queue_delay_ms: null,
  created_at: '2026-11-20T09:30:00Z',
  ...patch,
})

describe('buildLogQuery', () => {
  it('sends only the page when no filter is set', () => {
    expect(sent(buildLogQuery(emptyLogFilters(), 1, 20))).toEqual({ page: 1, page_size: 20 })
  })

  it('passes the picked result and endpoint as they are', () => {
    const query = buildLogQuery(filters({ result: 'blocked', endpoint: '/v1/responses' }), 3, 50)
    expect(sent(query)).toEqual({ page: 3, page_size: 50, result: 'blocked', endpoint: '/v1/responses' })
  })

  it('sends the group as a number', () => {
    expect(buildLogQuery(filters({ group_id: '3' }), 1, 20).group_id).toBe(3)
  })

  it('leaves out a group that is no id', () => {
    for (const group_id of ['', '0', '-2', '1.5', 'vip', '__all__']) {
      expect(sent(buildLogQuery(filters({ group_id }), 1, 20))).toEqual({ page: 1, page_size: 20 })
    }
  })

  it('trims the search text and leaves out one that is blank', () => {
    expect(buildLogQuery(filters({ search: '  alice ' }), 1, 20).search).toBe('alice')
    expect(sent(buildLogQuery(filters({ search: '   ' }), 1, 20))).toEqual({ page: 1, page_size: 20 })
  })

  it('sends both ends of the time window as instants', () => {
    const query = buildLogQuery(filters({ from: '2026-11-20T09:30', to: '2026-11-20T10:45' }), 1, 20)
    expect(query.from).toBe(new Date(2026, 10, 20, 9, 30).toISOString())
    expect(query.to).toBe(new Date(2026, 10, 20, 10, 45).toISOString())
  })

  it('takes a window with one end only', () => {
    const query = buildLogQuery(filters({ to: '2026-11-20T10:45' }), 1, 20)
    expect(sent(query)).toEqual({ page: 1, page_size: 20, to: new Date(2026, 10, 20, 10, 45).toISOString() })
  })

  it('leaves out an end that is no date', () => {
    expect(sent(buildLogQuery(filters({ from: 'nonsense', to: '2026-13-45T99:99' }), 1, 20))).toEqual({ page: 1, page_size: 20 })
  })
})

describe('emptyLogFilters', () => {
  it('answers a fresh copy each time', () => {
    const first = emptyLogFilters()
    first.search = 'changed'
    expect(emptyLogFilters().search).toBe('')
  })
})

describe('LOG_ENDPOINTS', () => {
  it('lists each endpoint once', () => {
    expect(new Set(LOG_ENDPOINTS).size).toBe(LOG_ENDPOINTS.length)
    expect(LOG_ENDPOINTS).toContain('/v1/messages')
  })
})

describe('logOutcome', () => {
  it('names the three ways a request is refused', () => {
    expect(logOutcome(log({ action: 'block', flagged: true }))).toBe('block')
    expect(logOutcome(log({ action: 'keyword_block', flagged: true }))).toBe('keywordBlock')
    expect(logOutcome(log({ action: 'cyber_policy', flagged: true }))).toBe('cyberPolicy')
  })

  it('reads a failed audit as an error, by its action or by its error text', () => {
    expect(logOutcome(log({ action: 'error' }))).toBe('error')
    expect(logOutcome(log({ action: 'allow', error: 'timeout' }))).toBe('error')
  })

  it('puts a refusal before an error and an error before a hit', () => {
    expect(logOutcome(log({ action: 'block', flagged: true, error: 'timeout' }))).toBe('block')
    expect(logOutcome(log({ action: 'allow', flagged: true, error: 'timeout' }))).toBe('error')
  })

  it('reads a flagged request that went through as a hit', () => {
    expect(logOutcome(log({ mode: 'observe', flagged: true }))).toBe('hit')
  })

  it('reads a request refused for a known input as a hit', () => {
    expect(logOutcome(log({ action: 'hash_block', flagged: true }))).toBe('hit')
  })

  it('reads the rest as passed', () => {
    expect(logOutcome(log())).toBe('pass')
    expect(logOutcome(log({ action: 'something_new' }))).toBe('pass')
  })
})

describe('outcome label and colour', () => {
  const outcomes: LogOutcome[] = ['cyberPolicy', 'keywordBlock', 'block', 'error', 'hit', 'pass']

  it('has a label for each outcome', () => {
    expect(outcomes.map((outcome) => outcomeLabel(outcome, t))).toEqual([
      '<admin.riskControl.action.cyberPolicy>',
      '<admin.riskControl.action.keywordBlock>',
      '<admin.riskControl.action.block>',
      '<admin.riskControl.action.error>',
      '<admin.riskControl.result.hit>',
      '<admin.riskControl.result.pass>',
    ])
  })

  it('colours refusals red, errors amber, hits pink and passes green', () => {
    expect(outcomes.map(outcomeVariant)).toEqual(['error', 'error', 'error', 'warning', 'pink', 'success'])
  })
})

describe('callerText', () => {
  it('tells the user id and the key name', () => {
    expect(callerText(log())).toBe('UID 101 · ci-runner')
  })

  it('tells only what the record has', () => {
    expect(callerText(log({ user_id: null }))).toBe('ci-runner')
    expect(callerText(log({ api_key_name: '' }))).toBe('UID 101')
    expect(callerText(log({ user_id: null, api_key_name: '' }))).toBe('')
  })
})

describe('routeText', () => {
  it('tells the provider and the model', () => {
    expect(routeText(log())).toBe('anthropic / claude-sonnet-4-5')
  })

  it('marks the half that is missing', () => {
    expect(routeText(log({ provider: '' }))).toBe('- / claude-sonnet-4-5')
    expect(routeText(log({ provider: '', model: '' }))).toBe('- / -')
  })
})

describe('highestText', () => {
  it('tells the category and its score as a share of a hundred', () => {
    expect(highestText(log({ highest_category: 'sexual', highest_score: 0.9312 }))).toBe('sexual · 93.1%')
  })

  it('marks a missing category', () => {
    expect(highestText(log({ highest_category: '', highest_score: 0 }))).toBe('- · 0.0%')
  })
})

describe('violationText', () => {
  it('has nothing to tell for a request that was not flagged', () => {
    expect(violationText(log({ flagged: false, violation_count: 4 }), t)).toBe('-')
  })

  it('says so when a hit does not count toward a ban', () => {
    expect(violationText(log({ flagged: true, violation_count: 0 }), t)).toBe('<admin.riskControl.violationNotCounted>')
  })

  it('tells how many violations the hit made', () => {
    expect(violationText(log({ flagged: true, violation_count: 3 }), t)).toBe('<admin.riskControl.violationCount {"count":3}>')
  })

  it('counts a hit without a count as the first', () => {
    const uncounted = log({ flagged: true, violation_count: undefined as unknown as number })
    expect(violationText(uncounted, t)).toBe('<admin.riskControl.violationCount {"count":1}>')
  })
})

describe('noticeText', () => {
  it('tells whether the user was mailed', () => {
    expect(noticeText(log({ email_sent: true }), t)).toBe('<admin.riskControl.emailSent>')
    expect(noticeText(log({ email_sent: false }), t)).toBe('<admin.riskControl.emailNotSent>')
  })

  it('adds the ban when the hit caused one', () => {
    expect(noticeText(log({ email_sent: true, auto_banned: true }), t)).toBe(
      '<admin.riskControl.emailSent> / <admin.riskControl.autoBanned>',
    )
  })
})

describe('canUnban', () => {
  const banned = { auto_banned: true, user_id: 101, user_status: 'disabled' }

  it('offers the unban on the record that banned a user who is still disabled', () => {
    expect(canUnban(banned)).toBe(true)
  })

  it('does not offer it once the user is active again', () => {
    expect(canUnban({ ...banned, user_status: 'active' })).toBe(false)
  })

  it('does not offer it on a record that banned nobody', () => {
    expect(canUnban({ ...banned, auto_banned: false })).toBe(false)
  })

  it('does not offer it without a user', () => {
    expect(canUnban({ ...banned, user_id: null })).toBe(false)
  })
})

describe('withUserStatus', () => {
  it('changes every record of that user and no other', () => {
    const logs = [
      log({ id: 1, user_id: 101, user_status: 'disabled' }),
      log({ id: 2, user_id: 102, user_status: 'disabled' }),
      log({ id: 3, user_id: 101, user_status: 'disabled' }),
      log({ id: 4, user_id: null, user_status: '' }),
    ]
    expect(withUserStatus(logs, 101, 'active').map((item) => item.user_status)).toEqual(['active', 'disabled', 'active', ''])
  })

  it('leaves the given records as they were', () => {
    const logs = [log({ user_id: 101, user_status: 'disabled' })]
    const next = withUserStatus(logs, 101, 'active')
    expect(logs[0].user_status).toBe('disabled')
    expect(next[0]).not.toBe(logs[0])
  })

  it('keeps the records of other users as the same objects', () => {
    const logs = [log({ user_id: 102 })]
    expect(withUserStatus(logs, 101, 'active')[0]).toBe(logs[0])
  })
})

describe('latencyText', () => {
  it('tells the time in milliseconds', () => {
    expect(latencyText(388, 'en')).toBe('388 ms')
    expect(latencyText(0, 'en')).toBe('0 ms')
    expect(latencyText(12345, 'en')).toBe('12,345 ms')
  })

  it('has nothing to tell when the engine was not asked', () => {
    expect(latencyText(null, 'en')).toBe('-')
    expect(latencyText(undefined, 'en')).toBe('-')
  })
})

describe('inputText', () => {
  it('shows the stored input', () => {
    expect(inputText(log({ input_excerpt: 'hello', error: 'timeout' }))).toBe('hello')
  })

  it('shows why the audit failed when no input was stored', () => {
    expect(inputText(log({ input_excerpt: '', error: 'timeout' }))).toBe('timeout')
  })

  it('marks a record with neither', () => {
    expect(inputText(log({ input_excerpt: '', error: '' }))).toBe('-')
  })
})

describe('auditSourceText', () => {
  const meta = { engine: 'typesafe' as const, model: 'jev-latest', rules_version: 'jev-3.2', skipped_images: 0 }

  it('tells the engine, the model and the rule set', () => {
    expect(auditSourceText(log({ engine_meta: meta }), t)).toBe('TypeSafe AI · jev-latest · jev-3.2')
  })

  it('adds the images the engine left out', () => {
    expect(auditSourceText(log({ engine_meta: { ...meta, skipped_images: 2 } }), t)).toBe(
      'TypeSafe AI · jev-latest · jev-3.2 · <admin.riskControl.skippedImages {"count":2}>',
    )
  })

  it('marks a model or a rule set that was not stored', () => {
    const partial = { engine: 'openai' as const, model: '', rules_version: '', skipped_images: 0 }
    expect(auditSourceText(log({ engine_meta: partial }), t)).toBe('OpenAI · - · -')
  })

  it('reads an audited record without a source as an old OpenAI one', () => {
    expect(auditSourceText(log({ action: 'block', engine_meta: null }), t)).toBe('<admin.riskControl.legacyAuditSource>')
    expect(auditSourceText(log({ action: 'allow' }), t)).toBe('<admin.riskControl.legacyAuditSource>')
  })

  it('names no source for a record that ended without the engine', () => {
    for (const action of ['cyber_policy', 'keyword_block', 'hash_block']) {
      expect(auditSourceText(log({ action, engine_meta: null }), t)).toBe('-')
    }
  })
})
