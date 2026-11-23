import type {
  ContentModerationAPIKeyLoad,
  ContentModerationAPIKeyStatus,
  ContentModerationConfig,
  ContentModerationRuntimeStatus,
  ModerationMode,
} from '~/lib/api/admin/riskControl'
import { clampPercent } from './riskFormat'
import { API_KEY_STATUS_ORDER, type APIKeyStatusValue } from './riskModel'

type Status = ContentModerationRuntimeStatus | null

/** The mode the service runs in: the one it reports, or the saved one until it has reported. */
export const runtimeModeOf = (status: Status, config: Pick<ContentModerationConfig, 'mode'>): ModerationMode =>
  status?.mode ?? config.mode

/** The engine is asked to audit and has no key it may call with. */
export const isEngineUnavailable = (status: Status): boolean =>
  Boolean(status?.enabled && status.risk_control_enabled && status.mode !== 'off') &&
  status?.pre_block_api_key_available_count === 0

/**
 * The saved keys of the engine in use, with their health. The service's report is fresher than the
 * one saved with the config, but it only speaks for the engine that is running.
 */
export function savedKeyStatuses(
  status: Status,
  config: Pick<ContentModerationConfig, 'engine' | 'api_key_statuses'>,
): ContentModerationAPIKeyStatus[] {
  const reported = status?.api_key_statuses
  const isSameEngine = (status?.engine ?? 'openai') === (config.engine ?? 'openai')
  const rows = isSameEngine && Array.isArray(reported) && reported.length > 0 ? reported : config.api_key_statuses
  return Array.isArray(rows) ? rows : []
}

export interface KeyHealthCount {
  status: APIKeyStatusValue
  count: number
}

const isKnownKeyStatus = (status: string): status is APIKeyStatusValue =>
  (API_KEY_STATUS_ORDER as readonly string[]).includes(status)

/**
 * How many keys are in each state, states without keys left out. Keys that are saved but have no
 * health row yet (`keyCount` of them) count as not tested.
 */
export function keyHealthCounts(rows: ReadonlyArray<{ status: string }>, keyCount: number): KeyHealthCount[] {
  const counts: Record<APIKeyStatusValue, number> = { ok: 0, frozen: 0, error: 0, unknown: 0 }
  for (const row of rows) counts[isKnownKeyStatus(row.status) ? row.status : 'unknown'] += 1
  if (rows.length === 0 && keyCount > 0) counts.unknown = keyCount
  return API_KEY_STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => ({ status, count: counts[status] }))
}

/** The load of each audit key, in the order the keys were saved. */
export const sortedKeyLoads = (status: Status): ContentModerationAPIKeyLoad[] =>
  [...(status?.pre_block_api_key_loads ?? [])].sort((a, b) => a.index - b.index)

/** The calls of the busiest key: what every load bar is measured against. Never zero. */
export const busiestKeyTotal = (loads: ReadonlyArray<{ total: number }>): number =>
  Math.max(1, ...loads.map((load) => load.total || 0))

export type WorkerSlotState = 'active' | 'idle' | 'disabled'

export interface WorkerSlot {
  /** Counted from 1. */
  id: number
  state: WorkerSlotState
}

// The server allows 32 workers; anything far above that is a broken answer, not a pool to draw.
const MAX_DRAWN_WORKERS = 128

/**
 * One slot per worker. The service tells how many are busy, not which, so the first ones are
 * drawn busy. Nothing runs while the system switch, the audit switch or the mode is off.
 */
export function workerSlots(status: Status, config: Pick<ContentModerationConfig, 'worker_count'>): WorkerSlot[] {
  const wanted = Number(status?.worker_count ?? config.worker_count)
  const total = Number.isFinite(wanted) ? Math.min(MAX_DRAWN_WORKERS, Math.max(0, Math.floor(wanted))) : 0
  const active = Math.max(0, status?.active_workers ?? 0)
  const isRunning = Boolean(status?.risk_control_enabled && status.enabled && status.mode !== 'off')
  return Array.from({ length: total }, (_, index) => ({
    id: index + 1,
    state: !isRunning ? 'disabled' : index < active ? 'active' : 'idle',
  }))
}

/** How full the async queue is, as a share of a hundred. */
export const queueUsagePercent = (status: Status): number => clampPercent(status?.queue_usage_percent ?? 0)
