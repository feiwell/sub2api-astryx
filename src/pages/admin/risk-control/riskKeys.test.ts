import { describe, expect, it } from 'vitest'
import type {
  ContentModerationAPIKeyStatus,
  ContentModerationRuntimeStatus,
  ContentModerationTestAuditResult,
  ModerationEngine,
} from '~/lib/api/admin/riskControl'
import { engineDraftFromConfig, type EngineDraft, type RiskDraft } from './riskForm'
import {
  MAX_VISIBLE_KEY_ROWS,
  asUnsavedKeyRows,
  auditScoreRows,
  canTestSavedKeys,
  hasKeyTestFailed,
  isDeletableKey,
  isPendingDelete,
  keptKeyCount,
  savedKeyRows,
  togglePendingDelete,
  withClearKeys,
  withKeysMode,
  withReportedKeys,
  withTestedSavedKeys,
} from './riskKeys'

const key = (
  index: number,
  status: ContentModerationAPIKeyStatus['status'],
  over: Partial<ContentModerationAPIKeyStatus> = {},
): ContentModerationAPIKeyStatus => ({
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
  ...over,
})

const engine = (name: ModerationEngine, over: Partial<EngineDraft> = {}): EngineDraft => ({
  ...engineDraftFromConfig(undefined, name),
  ...over,
})

/** Only what the key rules read: which engine is selected and what each engine holds. */
const draft = (selected: ModerationEngine, engines: Partial<Record<ModerationEngine, Partial<EngineDraft>>> = {}) =>
  ({
    engine: selected,
    engines: { openai: engine('openai', engines.openai), typesafe: engine('typesafe', engines.typesafe) },
  }) as RiskDraft

/** What the service reports: the keys of the engine it runs. */
const report = (
  running: ModerationEngine | undefined,
  rows: ContentModerationAPIKeyStatus[],
): ContentModerationRuntimeStatus => ({ engine: running, api_key_statuses: rows }) as ContentModerationRuntimeStatus

const masks = (rows: ContentModerationAPIKeyStatus[]) => rows.map((row) => row.masked)

describe('savedKeyRows', () => {
  const openaiRows = [key(1, 'frozen', { masked: 'fixture-***openai' })]
  const typesafeRows = [key(2, 'ok', { masked: 'ts-***typesafe' })]

  it.each(['openai', 'typesafe'] as const)('lists each engine’s own keys while %s is running', (running) => {
    const other = running === 'openai' ? 'typesafe' : 'openai'
    const rowsOf = { openai: openaiRows, typesafe: typesafeRows }
    const settings = draft(running, {
      openai: { api_key_statuses: openaiRows },
      typesafe: { api_key_statuses: typesafeRows },
    })
    const status = report(running, rowsOf[running])

    expect(savedKeyRows(status, running, settings.engines[running])).toEqual(rowsOf[running])
    expect(savedKeyRows(status, other, settings.engines[other])).toEqual(rowsOf[other])

    // A refresh speaks for the running engine: the other engine keeps the rows of its draft.
    const fresher = report(running, [key(7, 'error', { masked: 'fresh' })])
    const refreshed = withReportedKeys({ ...settings, engine: other }, fresher)
    expect(masks(savedKeyRows(fresher, other, refreshed.engines[other]))).toEqual(masks(rowsOf[other]))
    expect(masks(savedKeyRows(fresher, running, refreshed.engines[running]))).toEqual(['fresh'])
  })

  it('lists nothing for an engine that was never set up, whatever the running engine has', () => {
    const settings = draft('openai', { openai: { api_key_statuses: openaiRows } })
    const status = report('openai', openaiRows)
    expect(savedKeyRows(status, 'typesafe', settings.engines.typesafe)).toEqual([])
  })

  it('falls back to the draft when the service reports no key, or has not reported', () => {
    const settings = draft('openai', { openai: { api_key_statuses: openaiRows } })
    expect(savedKeyRows(report('openai', []), 'openai', settings.engines.openai)).toEqual(openaiRows)
    expect(savedKeyRows(null, 'openai', settings.engines.openai)).toEqual(openaiRows)
  })

  it('reads a report that names no engine as OpenAI’s', () => {
    const fresh = [key(5, 'ok', { masked: 'fresh' })]
    const settings = draft('openai', { openai: { api_key_statuses: openaiRows }, typesafe: { api_key_statuses: typesafeRows } })
    expect(masks(savedKeyRows(report(undefined, fresh), 'openai', settings.engines.openai))).toEqual(['fresh'])
    expect(savedKeyRows(report(undefined, fresh), 'typesafe', settings.engines.typesafe)).toEqual(typesafeRows)
  })
})

describe('pending deletions', () => {
  it('can only delete a saved key the server gave a hash for', () => {
    expect(isDeletableKey(key(1, 'ok'))).toBe(true)
    expect(isDeletableKey(key(1, 'ok', { configured: false }))).toBe(false)
    expect(isDeletableKey(key(1, 'ok', { key_hash: '' }))).toBe(false)
  })

  it('marks a key and takes the mark back', () => {
    const marked = togglePendingDelete(engine('openai'), key(1, 'ok'))
    expect(marked.pendingDeletes).toEqual(['hash-1'])
    expect(isPendingDelete(key(1, 'ok'), marked.pendingDeletes)).toBe(true)
    expect(isPendingDelete(key(2, 'ok'), marked.pendingDeletes)).toBe(false)

    const both = togglePendingDelete(marked, key(2, 'ok'))
    expect(both.pendingDeletes).toEqual(['hash-1', 'hash-2'])
    expect(togglePendingDelete(both, key(1, 'ok')).pendingDeletes).toEqual(['hash-2'])
  })

  it('leaves the draft as it is for a key that cannot be deleted', () => {
    const source = engine('openai')
    expect(togglePendingDelete(source, key(1, 'ok', { configured: false }))).toBe(source)
    expect(togglePendingDelete(source, key(1, 'ok', { key_hash: '' }))).toBe(source)
  })

  it('never counts a typed key as pending, even with the hash of a marked one', () => {
    expect(isPendingDelete(key(1, 'ok', { configured: false }), ['hash-1'])).toBe(false)
    expect(isPendingDelete(key(1, 'ok', { key_hash: '' }), [''])).toBe(false)
  })
})

describe('withKeysMode', () => {
  it('forgets single deletions when the keys are to be replaced', () => {
    const replacing = withKeysMode(engine('openai', { pendingDeletes: ['hash-1'] }), 'replace')
    expect(replacing.api_keys_mode).toBe('replace')
    expect(replacing.pendingDeletes).toEqual([])
  })

  it('keeps them when keys are added', () => {
    const adding = withKeysMode(engine('openai', { api_keys_mode: 'replace', pendingDeletes: ['hash-1'] }), 'append')
    expect(adding.api_keys_mode).toBe('append')
    expect(adding.pendingDeletes).toEqual(['hash-1'])
  })
})

describe('withClearKeys', () => {
  it('drops what was typed and marked, and goes back to adding', () => {
    const cleared = withClearKeys(
      engine('openai', { api_keys_text: 'fixture-new', api_keys_mode: 'replace', pendingDeletes: ['hash-1'] }),
      true,
    )
    expect(cleared).toMatchObject({ clear_api_key: true, api_keys_text: '', api_keys_mode: 'append', pendingDeletes: [] })
  })

  it('only lifts the mark when it is taken back', () => {
    const kept = withClearKeys(engine('openai', { clear_api_key: true, api_key_count: 2 }), false)
    expect(kept.clear_api_key).toBe(false)
    expect(kept.api_key_count).toBe(2)
  })
})

describe('keptKeyCount', () => {
  it('counts the saved keys a save would leave', () => {
    expect(keptKeyCount({ api_key_count: 5, pendingDeletes: [] })).toBe(5)
    expect(keptKeyCount({ api_key_count: 5, pendingDeletes: ['a', 'b'] })).toBe(3)
    expect(keptKeyCount({ api_key_count: 1, pendingDeletes: ['a', 'b'] })).toBe(0)
  })
})

describe('canTestSavedKeys', () => {
  const saved = { api_key_configured: true, api_key_count: 2 }

  it('tries the saved keys as they are saved', () => {
    expect(canTestSavedKeys(engine('openai', saved))).toBe(true)
    // Typed keys do not stand in the way: the saved ones are still there.
    expect(canTestSavedKeys(engine('openai', { ...saved, api_keys_text: 'fixture-new' }))).toBe(true)
  })

  it('has nothing to try without saved keys', () => {
    expect(canTestSavedKeys(engine('openai'))).toBe(false)
  })

  it('does not try them while the draft changes which keys are saved', () => {
    expect(canTestSavedKeys(engine('openai', { ...saved, pendingDeletes: ['hash-1'] }))).toBe(false)
    expect(canTestSavedKeys(engine('openai', { ...saved, clear_api_key: true }))).toBe(false)
    expect(canTestSavedKeys(engine('openai', { ...saved, api_keys_mode: 'replace' }))).toBe(false)
  })
})

describe('withReportedKeys', () => {
  it('takes the report for the running engine and leaves the other engine alone', () => {
    const settings = draft('typesafe', {
      openai: { api_key_statuses: [key(1, 'unknown')] },
      typesafe: { api_key_statuses: [key(2, 'ok')] },
    })
    const next = withReportedKeys(settings, report('openai', [key(1, 'frozen'), key(3, 'ok')]))
    expect(next.engines.openai.api_key_statuses.map((row) => row.status)).toEqual(['frozen', 'ok'])
    expect(next.engines.typesafe).toBe(settings.engines.typesafe)
    expect(next.engine).toBe('typesafe')
  })

  it('drops the deletions of keys that no longer exist', () => {
    const settings = draft('openai', { openai: { pendingDeletes: ['hash-1', 'hash-9'] }, typesafe: { pendingDeletes: ['hash-9'] } })
    const next = withReportedKeys(settings, report('openai', [key(1, 'ok'), key(2, 'ok')]))
    expect(next.engines.openai.pendingDeletes).toEqual(['hash-1'])
    expect(next.engines.typesafe.pendingDeletes).toEqual(['hash-9'])
  })

  it('empties the list when the running engine has no key left', () => {
    const settings = draft('openai', { openai: { api_key_statuses: [key(1, 'ok')], pendingDeletes: ['hash-1'] } })
    const next = withReportedKeys(settings, report('openai', []))
    expect(next.engines.openai.api_key_statuses).toEqual([])
    expect(next.engines.openai.pendingDeletes).toEqual([])
  })

  it('reads a report that names no engine as OpenAI’s', () => {
    const next = withReportedKeys(draft('typesafe'), report(undefined, [key(1, 'ok')]))
    expect(next.engines.openai.api_key_statuses).toHaveLength(1)
    expect(next.engines.typesafe.api_key_statuses).toEqual([])
  })

  it('keeps the draft without a report, without key rows, or for an engine it does not know', () => {
    const settings = draft('openai', { openai: { api_key_statuses: [key(1, 'ok')] } })
    expect(withReportedKeys(settings, null)).toBe(settings)
    expect(withReportedKeys(settings, report('openai', null as unknown as ContentModerationAPIKeyStatus[]))).toBe(settings)
    expect(withReportedKeys(settings, report('other' as ModerationEngine, [key(2, 'ok')]))).toBe(settings)
  })

  it('does not share the rows with the report', () => {
    const rows = [key(1, 'ok')]
    const next = withReportedKeys(draft('openai'), report('openai', rows))
    expect(next.engines.openai.api_key_statuses).toEqual(rows)
    expect(next.engines.openai.api_key_statuses).not.toBe(rows)
  })
})

describe('withTestedSavedKeys', () => {
  const saved = [key(1, 'unknown'), key(2, 'unknown'), key(3, 'unknown')]

  it('takes every row of a plain key test', () => {
    const tested = [key(1, 'ok'), key(2, 'frozen')]
    expect(withTestedSavedKeys(engine('openai', { api_key_statuses: saved }), tested, false).api_key_statuses).toEqual(tested)
  })

  it('only updates the keys a trial run with content touched', () => {
    const next = withTestedSavedKeys(engine('openai', { api_key_statuses: saved }), [key(2, 'ok')], true)
    expect(next.api_key_statuses.map((row) => row.status)).toEqual(['unknown', 'ok', 'unknown'])
  })

  it('takes the rows of a trial run when the draft had none', () => {
    const tested = [key(2, 'ok')]
    expect(withTestedSavedKeys(engine('openai'), tested, true).api_key_statuses).toEqual(tested)
  })
})

describe('tested keys', () => {
  it('lists typed keys that were tried as not saved yet', () => {
    const rows = asUnsavedKeyRows([key(1, 'ok'), key(2, 'frozen')])
    expect(rows.map((row) => row.configured)).toEqual([false, false])
    expect(rows.map((row) => row.status)).toEqual(['ok', 'frozen'])
  })

  it('calls a test failed when no key was tried or one of them failed or is frozen', () => {
    expect(hasKeyTestFailed([])).toBe(true)
    expect(hasKeyTestFailed([key(1, 'ok'), key(2, 'error')])).toBe(true)
    expect(hasKeyTestFailed([key(1, 'frozen')])).toBe(true)
    expect(hasKeyTestFailed([key(1, 'ok'), key(2, 'ok')])).toBe(false)
    // Not tried is not failed.
    expect(hasKeyTestFailed([key(1, 'unknown')])).toBe(false)
  })

  it('folds the list after three rows', () => {
    expect(MAX_VISIBLE_KEY_ROWS).toBe(3)
  })
})

describe('auditScoreRows', () => {
  const result = (over: Partial<ContentModerationTestAuditResult> = {}): ContentModerationTestAuditResult => ({
    flagged: true,
    highest_category: 'violence',
    highest_score: 0.97,
    composite_score: 0.97,
    category_scores: { sexual: 0.1, violence: 0.97, hate: 0.65 },
    thresholds: { sexual: 0.65, violence: 0.95, hate: 0.65 },
    ...over,
  })

  it('has no rows without a result', () => {
    expect(auditScoreRows(null)).toEqual([])
  })

  it('lists the scores from the highest down, and tells which reached their threshold', () => {
    expect(auditScoreRows(result())).toEqual([
      { category: 'violence', score: 0.97, threshold: 0.95, isHit: true },
      { category: 'hate', score: 0.65, threshold: 0.65, isHit: true },
      { category: 'sexual', score: 0.1, threshold: 0.65, isHit: false },
    ])
  })

  it('measures a category without a threshold against a full score', () => {
    const rows = auditScoreRows(result({ category_scores: { spam: 0.99, scam: 1 }, thresholds: {} }))
    expect(rows).toEqual([
      { category: 'scam', score: 1, threshold: 1, isHit: true },
      { category: 'spam', score: 0.99, threshold: 1, isHit: false },
    ])
  })

  it('survives a result without scores or thresholds', () => {
    const bare = result({
      category_scores: undefined as unknown as Record<string, number>,
      thresholds: undefined as unknown as Record<string, number>,
    })
    expect(auditScoreRows(bare)).toEqual([])
    expect(auditScoreRows(result({ thresholds: undefined as unknown as Record<string, number> }))[0].threshold).toBe(1)
  })
})
