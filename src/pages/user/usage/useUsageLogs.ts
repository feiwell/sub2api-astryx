import { useEffect, useMemo, useState } from 'react'
import { keysAPI, usageAPI, userGroupsAPI } from '@/api'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import type { ApiKey, Group, GroupStat, ModelStat, TrendDataPoint, UsageLog, UsageStatsResponse } from '@/types'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import {
  NEWEST_FIRST,
  buildUsageFilterParams,
  buildUsageListParams,
  emptyUsageFilters,
  granularityForRange,
  mergeModelOptions,
  nextSort,
  type Granularity,
  type UsageFilters,
  type UsageSort,
} from './usageQuery'

const KEY_PAGE_SIZE = 100

/** Every key of the user, for the key filter: the key list comes a page at a time. */
async function loadAllKeys(): Promise<ApiKey[]> {
  const first = await keysAPI.list(1, KEY_PAGE_SIZE)
  const keys = [...first.items]
  for (let page = 2; page <= first.pages; page++) {
    const answer = await keysAPI.list(page, KEY_PAGE_SIZE)
    if (answer.items.length === 0) break
    keys.push(...answer.items)
  }
  return keys
}

/**
 * The user's usage as the page shows it: one set of filters, and under it the list, the figures above the list
 * and the charts, each loaded on its own so a slow or failed one does not hold back the others.
 */
export function useUsageLogs() {
  const [filters, setFilters] = useState<UsageFilters>(emptyUsageFilters)
  const [granularity, setGranularity] = useState<Granularity>(() => granularityForRange(filters.range))
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the one in use is remembered across pages.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const [sort, setSort] = useState<UsageSort>(NEWEST_FIRST)
  // Not sent; counting it up makes every load below run again with unchanged filters.
  const [reloadTick, setReloadTick] = useState(0)

  const [rows, setRows] = useState<UsageLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  const [hasFailed, setFailed] = useState(false)

  const [stats, setStats] = useState<UsageStatsResponse | null>(null)
  const [isStatsLoading, setStatsLoading] = useState(true)
  const [modelStats, setModelStats] = useState<ModelStat[]>([])
  const [isModelStatsLoading, setModelStatsLoading] = useState(true)
  const [modelNames, setModelNames] = useState<string[]>([])
  const [groupStats, setGroupStats] = useState<GroupStat[]>([])
  const [trend, setTrend] = useState<TrendDataPoint[]>([])
  const [isChartLoading, setChartLoading] = useState(true)

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    // A list that is no longer wanted is also cancelled: over a long range it is the heaviest query of the page.
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    usageAPI
      .query(buildUsageListParams(filters, page, pageSize, sort), { signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return
        const nextTotal = answer.total || 0
        setRows(answer.items || [])
        setTotal(nextTotal)
        // Rows can be gone between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('[usage] failed to load the list', error)
        // The rows of the last good load stay, under the error.
        setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [filters, page, pageSize, sort, reloadTick])

  useEffect(() => {
    let isStale = false
    setStatsLoading(true)
    usageAPI
      .getStats(buildUsageFilterParams(filters))
      .then((answer) => {
        if (!isStale) setStats(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[usage] failed to load the figures', error)
        // Figures of other filters would mislead; none are shown.
        setStats(null)
      })
      .finally(() => {
        if (!isStale) setStatsLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [filters, reloadTick])

  useEffect(() => {
    let isStale = false
    setModelStatsLoading(true)
    usageAPI
      .getDashboardModels({ ...buildUsageFilterParams(filters), model_source: 'requested' })
      .then((answer) => {
        if (isStale) return
        const models = answer.models || []
        setModelStats(models)
        setModelNames((known) => mergeModelOptions(known, models, filters.model))
      })
      .catch((error) => {
        if (isStale) return
        console.error('[usage] failed to load the model distribution', error)
        setModelStats([])
      })
      .finally(() => {
        if (!isStale) setModelStatsLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [filters, reloadTick])

  useEffect(() => {
    let isStale = false
    setChartLoading(true)
    usageAPI
      .getDashboardSnapshotV2({
        ...buildUsageFilterParams(filters),
        granularity,
        include_trend: true,
        include_model_stats: false,
        include_group_stats: true,
      })
      .then((answer) => {
        if (isStale) return
        setTrend(answer.trend || [])
        setGroupStats(answer.groups || [])
      })
      .catch((error) => {
        if (isStale) return
        console.error('[usage] failed to load the charts', error)
        setTrend([])
        setGroupStats([])
      })
      .finally(() => {
        if (!isStale) setChartLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [filters, granularity, reloadTick])

  useEffect(() => {
    let isStale = false
    Promise.all([loadAllKeys(), userGroupsAPI.getAvailable()])
      .then(([keys, availableGroups]) => {
        if (isStale) return
        setApiKeys(keys)
        setGroups(availableGroups)
      })
      // Without them the two filters offer nothing; the rest of the page works.
      .catch((error) => console.error('[usage] failed to load the filter options', error))
    return () => {
      isStale = true
    }
  }, [])

  const applyFilters = (next: UsageFilters) => {
    if (next.range !== filters.range) setGranularity(granularityForRange(next.range))
    setFilters(next)
    setPage(1)
  }

  return {
    filters,
    /** Change filters; they apply at once, from the first page. A new date range also picks its granularity. */
    changeFilters: (patch: Partial<UsageFilters>) => applyFilters({ ...filters, ...patch }),
    reset: () => applyFilters(emptyUsageFilters()),
    refresh: () => setReloadTick((tick) => tick + 1),
    reloadTick,
    granularity,
    setGranularity,
    page,
    setPage,
    pageSize,
    pageSizeOptions,
    changePageSize: (size: number) => {
      setPageSize(size)
      setPersistedPageSize(size)
      setPage(1)
    },
    sort,
    /** Ask for the list in another order, from its first page. Null is a header click that cleared the order. */
    changeSort: (picked: UsageSort | null) => {
      setSort((current) => nextSort(current, picked))
      setPage(1)
    },
    rows,
    total,
    isLoading,
    hasFailed,
    /** Null while the figures are not known: before the first answer and after a failed one. */
    stats,
    isStatsLoading,
    modelStats,
    isModelStatsLoading,
    modelNames,
    groupStats,
    trend,
    isChartLoading,
    apiKeys,
    groups,
  }
}

export type UsageLogs = ReturnType<typeof useUsageLogs>
