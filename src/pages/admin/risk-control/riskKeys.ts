import type {
  ContentModerationAPIKeyStatus,
  ContentModerationRuntimeStatus,
  ContentModerationTestAuditResult,
  ModerationEngine,
} from '~/lib/api/admin/riskControl'
import { ENGINES, withEngine, type EngineDraft, type KeysWriteMode, type RiskDraft } from './riskForm'
import { savedKeyStatuses } from './riskStatus'

type KeyRow = ContentModerationAPIKeyStatus

/** How many key rows show before the rest is folded away. */
export const MAX_VISIBLE_KEY_ROWS = 3

/**
 * The saved keys of an engine as the settings list them. The service's report wins for the engine
 * that is running; the other engine only has what its draft holds.
 */
export const savedKeyRows = (
  status: ContentModerationRuntimeStatus | null,
  engine: ModerationEngine,
  draft: Pick<EngineDraft, 'api_key_statuses'>,
): KeyRow[] => savedKeyStatuses(status, { engine, api_key_statuses: draft.api_key_statuses })

/** Only a saved key the server gave a hash for can be told apart, so only that one can be deleted. */
export const isDeletableKey = (row: Pick<KeyRow, 'configured' | 'key_hash'>): boolean =>
  row.configured && row.key_hash !== ''

/** A save is to delete this key. */
export const isPendingDelete = (
  row: Pick<KeyRow, 'configured' | 'key_hash'>,
  pendingDeletes: readonly string[],
): boolean => isDeletableKey(row) && pendingDeletes.includes(row.key_hash)

/** Mark a saved key for deletion, or take the mark back. */
export function togglePendingDelete(engine: EngineDraft, row: Pick<KeyRow, 'configured' | 'key_hash'>): EngineDraft {
  if (!isDeletableKey(row)) return engine
  const pendingDeletes = engine.pendingDeletes.includes(row.key_hash)
    ? engine.pendingDeletes.filter((hash) => hash !== row.key_hash)
    : [...engine.pendingDeletes, row.key_hash]
  return { ...engine, pendingDeletes }
}

/** Replacing the keys drops every saved one, so single deletions no longer mean anything. */
export const withKeysMode = (engine: EngineDraft, mode: KeysWriteMode): EngineDraft =>
  mode === 'replace' ? { ...engine, api_keys_mode: mode, pendingDeletes: [] } : { ...engine, api_keys_mode: mode }

/** Clearing the keys leaves nothing to add to or to delete from; taking it back only lifts the mark. */
export const withClearKeys = (engine: EngineDraft, isCleared: boolean): EngineDraft =>
  isCleared
    ? { ...engine, clear_api_key: true, api_keys_text: '', api_keys_mode: 'append', pendingDeletes: [] }
    : { ...engine, clear_api_key: false }

/** How many saved keys a save would leave. */
export const keptKeyCount = (engine: Pick<EngineDraft, 'api_key_count' | 'pendingDeletes'>): number =>
  Math.max(0, engine.api_key_count - engine.pendingDeletes.length)

/**
 * The saved keys can be tried only as they are saved: not while some are marked for deletion, and
 * not while the draft is about to clear or replace them.
 */
export const canTestSavedKeys = (engine: EngineDraft): boolean =>
  keptKeyCount(engine) > 0 &&
  engine.pendingDeletes.length === 0 &&
  !engine.clear_api_key &&
  engine.api_keys_mode !== 'replace'

/**
 * The draft after the service reported its keys. The report speaks for the running engine only:
 * that engine's rows are replaced, and deletions of keys that no longer exist are dropped.
 */
export function withReportedKeys(draft: RiskDraft, status: ContentModerationRuntimeStatus | null): RiskDraft {
  if (!status || !Array.isArray(status.api_key_statuses)) return draft
  const engine = status.engine ?? 'openai'
  if (!ENGINES.includes(engine)) return draft
  const rows = status.api_key_statuses
  const hashes = new Set(rows.map((row) => row.key_hash).filter(Boolean))
  return withEngine(draft, engine, (current) => ({
    ...current,
    api_key_statuses: [...rows],
    pendingDeletes: current.pendingDeletes.filter((hash) => hashes.has(hash)),
  }))
}

/**
 * The engine's rows after its saved keys were tried. A plain key test tries every key. A trial run
 * with content stops at the first key that answers, so it only brings the rows it touched.
 */
export function withTestedSavedKeys(engine: EngineDraft, tested: KeyRow[], hasContent: boolean): EngineDraft {
  if (!hasContent || engine.api_key_statuses.length === 0) return { ...engine, api_key_statuses: tested }
  const updates = new Map(tested.map((row) => [row.key_hash, row]))
  return { ...engine, api_key_statuses: engine.api_key_statuses.map((row) => updates.get(row.key_hash) ?? row) }
}

/** Typed keys that were tried are listed beside the saved ones, marked as not saved yet. */
export const asUnsavedKeyRows = (tested: KeyRow[]): KeyRow[] => tested.map((row) => ({ ...row, configured: false }))

/** A test went wrong when it tried no key, or a key failed or was frozen. */
export const hasKeyTestFailed = (tested: ReadonlyArray<Pick<KeyRow, 'status'>>): boolean =>
  tested.length === 0 || tested.some((row) => row.status === 'error' || row.status === 'frozen')

export interface AuditScoreRow {
  category: string
  score: number
  threshold: number
  /** The score reached its threshold. */
  isHit: boolean
}

/** The scores of a trial run, the highest first. A category without a threshold is measured against a full score. */
export function auditScoreRows(result: ContentModerationTestAuditResult | null): AuditScoreRow[] {
  if (!result) return []
  return Object.entries(result.category_scores ?? {})
    .map(([category, score]) => {
      const threshold = result.thresholds?.[category] ?? 1
      return { category, score, threshold, isHit: score >= threshold }
    })
    .sort((a, b) => b.score - a.score)
}
