import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import type { AccountListItem, AccountUsageInfo, WindowStats } from '@/types'
import { buildGrokUsageRefreshKey, buildOpenAIUsageRefreshKey } from '@/utils/accountUsageRefresh'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import type { BatchAccountUsageResponse } from '~/lib/api/admin/accounts'
import { t } from '~/i18n'
import { QuotaAction, type CreditAction, type CreditState } from './useQuotaAction'
import { USAGE_CACHE_TTL_MS } from './usageRules'

export interface AccountListRevision { version: number; force: boolean }
interface RowData {
  usage?: AccountUsageInfo
  usageLoading: boolean
  activeLoading: boolean
  usageLoaded: boolean
  usageError?: string
  today?: WindowStats
  todayLoading: boolean
  todayError?: string
}

const SLOW_BATCH_MS = 4_000
const emptyToday: WindowStats = { requests: 0, tokens: 0, cost: 0, user_cost: 0 }
const errorMessage = (error: unknown) => extractApiErrorMessage(error, t('admin.accounts.usageError'))

class UsageRow {
  constructor(readonly id: number, readonly identity: string) {}
  private listeners = new Set<() => void>()
  private data: RowData = { usageLoading: false, todayLoading: false, usageLoaded: false, activeLoading: false }
  usageVersion = -1
  todayVersion = -1
  todaySequence = 0
  sequence = 0
  fetchedAt = 0
  todayFetchedAt = 0
  waitingForFirstResult(seq: number) {
    return this.sequence === seq && this.listeners.size > 0 && this.data.usageLoading && !this.data.usage
  }
  getSnapshot = () => this.data
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  update(patch: Partial<RowData>) {
    this.data = { ...this.data, ...patch }
    this.listeners.forEach(fn => fn())
  }
}

type UsageBatch = [UsageRow, { seq: number; force: boolean }][]

/** Batches mounted cells in the same turn. All caches belong to this account page. */
export class AccountUsageStore {
  private rows = new Map<number, UsageRow>()
  private usageQueue = new Map<UsageRow, { seq: number; force: boolean }>()
  private todayQueue = new Map<UsageRow, number>()
  private scheduled = false

  private creditActions = new Map<number, CreditAction>()

  creditAction(id: number) {
    let action = this.creditActions.get(id)
    if (!action) {
      action = new QuotaAction<CreditState>({})
      this.creditActions.set(id, action)
    }
    return action
  }

  row(account: AccountListItem) {
    const identity = JSON.stringify([account.platform, account.type, account.updated_at,
      buildOpenAIUsageRefreshKey(account), buildGrokUsageRefreshKey(account)])
    let row = this.rows.get(account.id)
    if (!row || row.identity !== identity) {
      row = new UsageRow(account.id, identity)
      this.rows.set(account.id, row)
    }
    return row
  }

  request(row: UsageRow, revision: AccountListRevision, usage: boolean, today: boolean) {
    const now = Date.now()
    const data = row.getSnapshot()
    if (usage && revision.version >= row.usageVersion) {
      const next = revision.version !== row.usageVersion
      const expired = row.fetchedAt > 0 && now - row.fetchedAt >= USAGE_CACHE_TTL_MS
      row.usageVersion = revision.version
      if ((next && revision.force) || (!data.usageLoading && (expired || (next && !row.fetchedAt)))) {
        const seq = ++row.sequence
        row.update({ usageLoading: true, activeLoading: false, usageError: undefined })
        this.usageQueue.set(row, { seq, force: next && revision.force })
      }
    }
    if (today && revision.version >= row.todayVersion) {
      const next = revision.version !== row.todayVersion
      const last = row.todayFetchedAt
      const expired = last > 0 && (now - last >= USAGE_CACHE_TTL_MS || new Date(last).toDateString() !== new Date(now).toDateString())
      row.todayVersion = revision.version
      if ((next && revision.force) || (!data.todayLoading && (expired || (next && !last)))) {
        row.update({ todayLoading: true, todayError: undefined })
        this.todayQueue.set(row, ++row.todaySequence)
      }
    }
    if (this.scheduled || !(this.usageQueue.size || this.todayQueue.size)) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      const usageEntries = Array.from(this.usageQueue)
      const todayEntries = Array.from(this.todayQueue)
      this.usageQueue.clear()
      this.todayQueue.clear()
      for (const force of [false, true]) {
        const batch = usageEntries.filter(([row, next]) => next.force === force && row.sequence === next.seq)
        if (batch.length) void this.loadBatch(batch, force)
      }
      if (todayEntries.length) void this.loadToday(todayEntries)
    })
  }

  private commitUsage(row: UsageRow, seq: number, result: BatchAccountUsageResponse) {
    if (row.sequence !== seq) return
    const usage = result.usage?.[row.id]
    const error = result.errors?.[row.id]
    row.fetchedAt = usage && !error && !usage.error ? Date.now() : 0
    row.update({ usage: error && !usage ? row.getSnapshot().usage : usage,
      usageLoading: false, usageLoaded: true, usageError: error })
  }

  // The batch endpoint sends a single response after its slowest upstream finishes.
  // Give still-empty, visible rows a cache-friendly read while that response is pending.
  // Never repeat a forced probe. The original batch remains authoritative for its revision.
  private async recoverSlowBatch(batch: UsageBatch) {
    const remaining = batch.values()
    const read = async () => {
      for (const [row, { seq }] of remaining) {
        if (!row.waitingForFirstResult(seq)) continue
        try {
          const result = await adminAPI.accounts.getBatchUsage([row.id], false)
          if (row.waitingForFirstResult(seq)) this.commitUsage(row, seq, result)
        } catch {
          // The original request owns transport errors and can still succeed.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, batch.length) }, read))
  }

  private async loadBatch(batch: UsageBatch, force: boolean) {
    const timer = batch.length > 1 ? setTimeout(() => void this.recoverSlowBatch(batch), SLOW_BATCH_MS) : undefined
    try {
      const result = await adminAPI.accounts.getBatchUsage(batch.map(([row]) => row.id), force)
      for (const [row, { seq }] of batch) this.commitUsage(row, seq, result)
    } catch (error) {
      for (const [row, { seq }] of batch) {
        if (row.sequence === seq) {
          row.fetchedAt = 0
          row.update({ usageLoading: false, activeLoading: false, usageError: errorMessage(error) })
        }
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private async loadToday(batch: [UsageRow, number][]) {
    try {
      const { stats } = await adminAPI.accounts.getBatchTodayStats(batch.map(([row]) => row.id))
      for (const [row, seq] of batch) {
        if (row.todaySequence === seq) {
          row.todayFetchedAt = Date.now()
          row.update({ today: stats?.[row.id] ?? emptyToday, todayLoading: false })
        }
      }
    } catch (error) {
      for (const [row, seq] of batch) {
        if (row.todaySequence === seq) {
          row.todayFetchedAt = 0
          row.update({ todayLoading: false, todayError: errorMessage(error) })
        }
      }
    }
  }

  async active(row: UsageRow) {
    const seq = ++row.sequence
    row.update({ usageLoading: true, activeLoading: true, usageError: undefined })
    try {
      const usage = await adminAPI.accounts.getUsage(row.id, 'active', true)
      if (row.sequence !== seq) return
      row.fetchedAt = usage.error ? 0 : Date.now()
      row.update({ usage, usageLoading: false, activeLoading: false, usageLoaded: true })
    } catch (error) {
      if (row.sequence === seq) {
        row.fetchedAt = 0
        row.update({ usageLoading: false, activeLoading: false, usageError: errorMessage(error) })
      }
    }
  }
}

export interface UsageCellProps {
  account: AccountListItem
  store: AccountUsageStore
  revision: AccountListRevision
}

export function useAccountUsageRow({ account, store, revision }: UsageCellProps, usage: boolean, today: boolean) {
  const row = store.row(account)
  const data = useSyncExternalStore(row.subscribe, row.getSnapshot, row.getSnapshot)
  const ref = useRef<HTMLElement>(null)
  const desktop = useMediaQuery('(min-width: 48rem)', true)
  const [entered, setEntered] = useState(false)
  const visible = desktop || entered || typeof IntersectionObserver === 'undefined'
  useEffect(() => {
    if (visible || !ref.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setEntered(true)
        observer.disconnect()
      }
    })
    observer.observe(ref.current.closest('tr') ?? ref.current)
    return () => observer.disconnect()
  }, [visible])
  useEffect(() => {
    if (visible) store.request(row, revision, usage, today)
  }, [store, row, revision.version, revision.force, visible, usage, today])
  const active = useCallback(() => store.active(row), [store, row])
  return { data, ref, visible, active }
}
