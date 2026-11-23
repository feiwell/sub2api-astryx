import { describe, expect, it } from 'vitest'
import type {
  ContentModerationAPIKeyLoad,
  ContentModerationAPIKeyStatus,
  ContentModerationRuntimeStatus,
} from '~/lib/api/admin/riskControl'
import {
  busiestKeyTotal,
  isEngineUnavailable,
  keyHealthCounts,
  queueUsagePercent,
  runtimeModeOf,
  savedKeyStatuses,
  sortedKeyLoads,
  workerSlots,
} from './riskStatus'

/** A service that audits before forwarding, with keys to call with. */
const running = (over: Partial<ContentModerationRuntimeStatus> = {}): ContentModerationRuntimeStatus => ({
  engine: 'openai',
  enabled: true,
  risk_control_enabled: true,
  mode: 'pre_block',
  worker_count: 4,
  max_workers: 32,
  active_workers: 1,
  idle_workers: 3,
  queue_size: 32768,
  queue_length: 0,
  queue_usage_percent: 0,
  enqueued: 0,
  dropped: 0,
  processed: 0,
  errors: 0,
  pre_block_active: 0,
  pre_block_checked: 0,
  pre_block_allowed: 0,
  pre_block_blocked: 0,
  pre_block_errors: 0,
  pre_block_avg_latency_ms: 0,
  pre_block_api_key_active: 0,
  pre_block_api_key_available_count: 2,
  pre_block_api_key_total_calls: 0,
  pre_block_api_key_loads: [],
  api_key_statuses: [],
  flagged_hash_count: 0,
  last_cleanup_deleted_hit: 0,
  last_cleanup_deleted_non_hit: 0,
  ...over,
})

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

const load = (index: number, total: number): ContentModerationAPIKeyLoad => ({
  index,
  key_hash: `hash-${index}`,
  masked: `fixture-***${index}`,
  status: 'ok',
  active: 0,
  total,
  success: total,
  errors: 0,
  avg_latency_ms: 0,
  last_latency_ms: 0,
  last_http_status: 200,
})

describe('runtimeModeOf', () => {
  it('is the saved mode until the service has reported', () => {
    expect(runtimeModeOf(null, { mode: 'observe' })).toBe('observe')
  })

  it('is the mode the service reports once it has', () => {
    expect(runtimeModeOf(running({ mode: 'pre_block' }), { mode: 'observe' })).toBe('pre_block')
    expect(runtimeModeOf(running({ mode: 'off' }), { mode: 'pre_block' })).toBe('off')
  })
})

describe('isEngineUnavailable', () => {
  it('is true when the engine should audit and has no usable key', () => {
    expect(isEngineUnavailable(running({ pre_block_api_key_available_count: 0 }))).toBe(true)
    expect(isEngineUnavailable(running({ mode: 'observe', pre_block_api_key_available_count: 0 }))).toBe(true)
  })

  it('is false while a key can be used', () => {
    expect(isEngineUnavailable(running({ pre_block_api_key_available_count: 1 }))).toBe(false)
  })

  it('is false while nothing is audited anyway', () => {
    expect(isEngineUnavailable(running({ enabled: false, pre_block_api_key_available_count: 0 }))).toBe(false)
    expect(isEngineUnavailable(running({ risk_control_enabled: false, pre_block_api_key_available_count: 0 }))).toBe(false)
    expect(isEngineUnavailable(running({ mode: 'off', pre_block_api_key_available_count: 0 }))).toBe(false)
  })

  it('is false before the service has reported', () => {
    expect(isEngineUnavailable(null)).toBe(false)
  })
})

describe('savedKeyStatuses', () => {
  const saved = [key(0, 'unknown'), key(1, 'unknown')]
  const reported = [key(0, 'ok'), key(1, 'frozen')]

  it('prefers what the service reports for the engine in use', () => {
    expect(savedKeyStatuses(running({ api_key_statuses: reported }), { engine: 'openai', api_key_statuses: saved })).toBe(reported)
  })

  it('falls back to the saved rows when the service reports none', () => {
    expect(savedKeyStatuses(running({ api_key_statuses: [] }), { engine: 'openai', api_key_statuses: saved })).toBe(saved)
    expect(savedKeyStatuses(null, { engine: 'openai', api_key_statuses: saved })).toBe(saved)
  })

  it('does not take the report of another engine', () => {
    expect(savedKeyStatuses(running({ engine: 'typesafe', api_key_statuses: reported }), { engine: 'openai', api_key_statuses: saved })).toBe(saved)
  })

  it('reads a missing engine as OpenAI on either side', () => {
    expect(savedKeyStatuses(running({ engine: undefined, api_key_statuses: reported }), { engine: 'openai', api_key_statuses: saved })).toBe(reported)
    expect(savedKeyStatuses(running({ engine: 'openai', api_key_statuses: reported }), { engine: undefined, api_key_statuses: saved })).toBe(reported)
    expect(savedKeyStatuses(running({ engine: undefined, api_key_statuses: reported }), { engine: 'typesafe', api_key_statuses: saved })).toBe(saved)
  })

  it('answers an empty list when neither side has rows', () => {
    const broken = { engine: 'openai', api_key_statuses: undefined } as unknown as Parameters<typeof savedKeyStatuses>[1]
    expect(savedKeyStatuses(null, broken)).toEqual([])
    expect(savedKeyStatuses(running({ api_key_statuses: undefined as never }), broken)).toEqual([])
  })
})

describe('keyHealthCounts', () => {
  it('counts keys per state, usable first, leaving out states without keys', () => {
    const rows = [key(0, 'error'), key(1, 'ok'), key(2, 'frozen'), key(3, 'ok')]
    expect(keyHealthCounts(rows, 4)).toEqual([
      { status: 'ok', count: 2 },
      { status: 'frozen', count: 1 },
      { status: 'error', count: 1 },
    ])
  })

  it('counts a state it does not know as not tested', () => {
    expect(keyHealthCounts([{ status: 'retired' }, { status: 'unknown' }, { status: 'constructor' }], 3)).toEqual([
      { status: 'unknown', count: 3 },
    ])
  })

  it('counts saved keys without health rows as not tested', () => {
    expect(keyHealthCounts([], 3)).toEqual([{ status: 'unknown', count: 3 }])
  })

  it('answers nothing when there are no keys', () => {
    expect(keyHealthCounts([], 0)).toEqual([])
  })

  it('goes by the rows when there are some, whatever the saved count says', () => {
    expect(keyHealthCounts([key(0, 'ok')], 5)).toEqual([{ status: 'ok', count: 1 }])
  })
})

describe('sortedKeyLoads', () => {
  it('puts the loads in the order the keys were saved', () => {
    const loads = [load(2, 5), load(0, 9), load(1, 1)]
    expect(sortedKeyLoads(running({ pre_block_api_key_loads: loads })).map((item) => item.index)).toEqual([0, 1, 2])
  })

  it('leaves the reported list as it was', () => {
    const loads = [load(1, 5), load(0, 9)]
    sortedKeyLoads(running({ pre_block_api_key_loads: loads }))
    expect(loads.map((item) => item.index)).toEqual([1, 0])
  })

  it('answers an empty list without a report or without loads', () => {
    expect(sortedKeyLoads(null)).toEqual([])
    expect(sortedKeyLoads(running({ pre_block_api_key_loads: undefined as never }))).toEqual([])
  })
})

describe('busiestKeyTotal', () => {
  it('is the most calls any key took', () => {
    expect(busiestKeyTotal([load(0, 5), load(1, 20), load(2, 3)])).toBe(20)
  })

  it('is never zero, so a bar can always be measured against it', () => {
    expect(busiestKeyTotal([])).toBe(1)
    expect(busiestKeyTotal([load(0, 0), load(1, 0)])).toBe(1)
  })

  it('reads a missing total as none', () => {
    expect(busiestKeyTotal([{ total: undefined as never }, { total: Number.NaN }, { total: 7 }])).toBe(7)
  })
})

describe('workerSlots', () => {
  const config = { worker_count: 2 }

  it('draws the busy workers first, then the idle ones', () => {
    expect(workerSlots(running({ worker_count: 4, active_workers: 1 }), config)).toEqual([
      { id: 1, state: 'active' },
      { id: 2, state: 'idle' },
      { id: 3, state: 'idle' },
      { id: 4, state: 'idle' },
    ])
  })

  it('draws every worker busy when more are reported busy than there are', () => {
    expect(workerSlots(running({ worker_count: 2, active_workers: 5 }), config).map((slot) => slot.state)).toEqual(['active', 'active'])
  })

  it('draws the saved number of workers, all stopped, before the service has reported', () => {
    expect(workerSlots(null, config)).toEqual([
      { id: 1, state: 'disabled' },
      { id: 2, state: 'disabled' },
    ])
  })

  it('draws every worker stopped while nothing is audited', () => {
    const states = (over: Partial<ContentModerationRuntimeStatus>) =>
      workerSlots(running({ worker_count: 2, active_workers: 1, ...over }), config).map((slot) => slot.state)
    expect(states({ risk_control_enabled: false })).toEqual(['disabled', 'disabled'])
    expect(states({ enabled: false })).toEqual(['disabled', 'disabled'])
    expect(states({ mode: 'off' })).toEqual(['disabled', 'disabled'])
  })

  it('draws no workers for a count that is not one', () => {
    expect(workerSlots(running({ worker_count: 0 }), config)).toEqual([])
    expect(workerSlots(running({ worker_count: -3 }), config)).toEqual([])
    expect(workerSlots(running({ worker_count: Number.NaN }), config)).toEqual([])
  })

  it('draws whole workers only', () => {
    expect(workerSlots(running({ worker_count: 2.9 }), config)).toHaveLength(2)
  })

  it('does not draw a pool far beyond what the server allows', () => {
    expect(workerSlots(running({ worker_count: 100000 }), config)).toHaveLength(128)
  })
})

describe('queueUsagePercent', () => {
  it('is the share the service reports', () => {
    expect(queueUsagePercent(running({ queue_usage_percent: 3.77 }))).toBe(3.77)
  })

  it('stays between none and all', () => {
    expect(queueUsagePercent(running({ queue_usage_percent: 250 }))).toBe(100)
    expect(queueUsagePercent(running({ queue_usage_percent: -1 }))).toBe(0)
  })

  it('is none before the service has reported', () => {
    expect(queueUsagePercent(null)).toBe(0)
  })
})
