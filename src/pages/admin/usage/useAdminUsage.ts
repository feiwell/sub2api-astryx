import { useEffect, useMemo, useRef, useState } from 'react'
import type { DashboardSnapshotV2Params, ModelStatsParams } from '@/api/admin/dashboard'
import type { AdminUsageQueryParams, AdminUsageStatsResponse } from '@/api/admin/usage'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import type { AdminUsageLog, GroupStat, ModelStat, TrendDataPoint } from '@/types'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import {
  NEWEST_FIRST,
  granularityForRange,
  mergeModelOptions,
  nextSort,
  type Granularity,
  type UsageSort,
} from '~/pages/user/usage/usageQuery'
import {
  buildAdminListParams,
  buildAdminUsageParams,
  buildModelStatsParams,
  buildSnapshotParams,
  emptyAdminUsageFilters,
  type AdminUsageFilters,
  type ModelSource,
  type PickedOption,
} from './adminUsageQuery'

const NO_MODEL_STATS: Record<ModelSource, ModelStat[]> = { requested: [], upstream: [], mapping: [] }

/**
 * Everyone's usage as the admin page shows it: one set of filters, and under it the list, the figures above the
 * list and the charts, each loaded on its own so a slow or failed one does not hold back the others.
 *
 * Every load is keyed by the parameters it sends, written out as text: a change that sends nothing new, like
 * the name of a picked user arriving later, loads nothing again.
 */
export function useAdminUsage(initialFilters: () => AdminUsageFilters) {
  const [filters, setFilters] = useState<AdminUsageFilters>(initialFilters)
  const [granularity, setGranularity] = useState<Granularity>(() => granularityForRange(filters.range))
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the one in use is remembered across pages.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const [sort, setSort] = useState<UsageSort>(NEWEST_FIRST)
  // Not sent; counting it up makes every load below run again with unchanged filters.
  const [reloadTick, setReloadTick] = useState(0)
  // Set by "refresh": the figures are then counted again by the server instead of answered from its cache.
  const wantsFreshStats = useRef(false)

  const [rows, setRows] = useState<AdminUsageLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  const [hasFailed, setFailed] = useState(false)

  const [stats, setStats] = useState<AdminUsageStatsResponse | null>(null)
  const [isStatsLoading, setStatsLoading] = useState(true)
  const [modelSource, setModelSource] = useState<ModelSource>('requested')
  const [modelStats, setModelStats] = useState(NO_MODEL_STATS)
  const [isModelStatsLoading, setModelStatsLoading] = useState(true)
  const [modelNames, setModelNames] = useState<string[]>([])
  const [groupStats, setGroupStats] = useState<GroupStat[]>([])
  const [trend, setTrend] = useState<TrendDataPoint[]>([])
  const [isChartLoading, setChartLoading] = useState(true)
  const [groups, setGroups] = useState<PickedOption[]>([])

  const listKey = JSON.stringify(buildAdminListParams(filters, page, pageSize, sort, false))
  useEffect(() => {
    // A list that is no longer wanted is also cancelled: over a long range it is the heaviest query of the page.
    const controller = new AbortController()
    const params = JSON.parse(listKey) as AdminUsageQueryParams
    setLoading(true)
    setFailed(false)
    adminAPI.usage
      .list(params, { signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return
        const nextTotal = answer.total || 0
        setRows(answer.items || [])
        setTotal(nextTotal)
        // Rows can be gone between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / (params.page_size || 1)))
        if ((params.page || 1) > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('[admin-usage] failed to load the list', error)
        // The rows of the last good load stay, under the error.
        setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [listKey, reloadTick])

  const statsKey = JSON.stringify(buildAdminUsageParams(filters))
  useEffect(() => {
    let isStale = false
    const params = JSON.parse(statsKey) as AdminUsageQueryParams
    const isFresh = wantsFreshStats.current
    wantsFreshStats.current = false
    setStatsLoading(true)
    adminAPI.usage
      .getStats(isFresh ? { ...params, nocache: 1 } : params)
      .then((answer) => {
        if (!isStale) setStats(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[admin-usage] failed to load the figures', error)
        // Figures of other filters would mislead; none are shown.
        setStats(null)
      })
      .finally(() => {
        if (!isStale) setStatsLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [statsKey, reloadTick])

  // What a source of the model distribution was last loaded for. Going back to a source loads it again only when
  // the filters have changed, or "refresh" was pressed, since.
  const loadedFor = useRef(new Map<ModelSource, string>())
  const modelKey = JSON.stringify(buildModelStatsParams(filters, modelSource))
  const modelVersion = `${modelKey}#${reloadTick}`
  const filteredModel = filters.model
  useEffect(() => {
    if (loadedFor.current.get(modelSource) === modelVersion) {
      // A load of another source may have been dropped half way; nothing is loading now.
      setModelStatsLoading(false)
      return
    }
    let isStale = false
    setModelStatsLoading(true)
    adminAPI.dashboard
      .getModelStats(JSON.parse(modelKey) as ModelStatsParams)
      .then((answer) => {
        if (isStale) return
        const models = answer.models || []
        loadedFor.current.set(modelSource, modelVersion)
        setModelStats((current) => ({ ...current, [modelSource]: models }))
        // The filter offers the names requests asked for, whatever the chart is showing.
        if (modelSource === 'requested') setModelNames((known) => mergeModelOptions(known, models, filteredModel))
      })
      .catch((error) => {
        if (isStale) return
        console.error('[admin-usage] failed to load the model distribution', error)
        setModelStats((current) => ({ ...current, [modelSource]: [] }))
      })
      .finally(() => {
        if (!isStale) setModelStatsLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [modelKey, modelVersion, modelSource, filteredModel])

  const snapshotKey = JSON.stringify(buildSnapshotParams(filters, granularity))
  useEffect(() => {
    let isStale = false
    setChartLoading(true)
    adminAPI.dashboard
      .getSnapshotV2(JSON.parse(snapshotKey) as DashboardSnapshotV2Params)
      .then((answer) => {
        if (isStale) return
        setTrend(answer.trend || [])
        setGroupStats(answer.groups || [])
      })
      .catch((error) => {
        if (isStale) return
        console.error('[admin-usage] failed to load the charts', error)
        setTrend([])
        setGroupStats([])
      })
      .finally(() => {
        if (!isStale) setChartLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [snapshotKey, reloadTick])

  useEffect(() => {
    let isStale = false
    adminAPI.groups
      .list(1, 1000)
      .then((answer) => {
        if (!isStale) setGroups((answer.items || []).map((group) => ({ id: group.id, label: group.name })))
      })
      // Without them the group filter offers nothing; the rest of the page works.
      .catch((error) => console.error('[admin-usage] failed to load the groups', error))
    return () => {
      isStale = true
    }
  }, [])

  // A user that came with the link that opened the page is only an id; who it is, is looked up once.
  const [linkedUserId] = useState(() => filters.user?.id ?? null)
  useEffect(() => {
    if (linkedUserId == null) return
    let isStale = false
    adminAPI.users
      .getById(linkedUserId, true)
      .then((user) => {
        if (isStale) return
        setFilters((current) =>
          current.user?.id === linkedUserId ? { ...current, user: { id: linkedUserId, label: user.email } } : current,
        )
      })
      // The id stays in place of the name.
      .catch((error) => console.error('[admin-usage] failed to look up the user of the link', error))
    return () => {
      isStale = true
    }
  }, [linkedUserId])

  const applyFilters = (next: AdminUsageFilters) => {
    if (next.range !== filters.range) setGranularity(granularityForRange(next.range))
    setFilters(next)
    setPage(1)
  }

  return {
    filters,
    /** Change filters; they apply at once, from the first page. A new date range also picks its granularity. */
    changeFilters: (patch: Partial<AdminUsageFilters>) => applyFilters({ ...filters, ...patch }),
    reset: () => applyFilters(emptyAdminUsageFilters()),
    refresh: () => {
      wantsFreshStats.current = true
      setReloadTick((tick) => tick + 1)
    },
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
    modelSource,
    setModelSource,
    /** The model distribution of the source being shown. */
    modelStats: modelStats[modelSource],
    isModelStatsLoading,
    modelNames,
    groupStats,
    trend,
    isChartLoading,
    groups,
  }
}

export type AdminUsage = ReturnType<typeof useAdminUsage>
