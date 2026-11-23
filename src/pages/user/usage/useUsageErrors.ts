import { useMemo, useState } from 'react'
import type { DateRange } from '@astryxdesign/core/Calendar'
import { usageAPI } from '@/api'
import { setPersistedPageSize } from '@/composables/usePersistedPageSize'
import type { UserErrorRequest } from '@/types'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { useLoadWhileShown } from '~/components/usage/useLoadWhileShown'
import {
  NEWEST_FIRST,
  buildUsageErrorParams,
  emptyUsageErrorFilters,
  nextSort,
  type UsageErrorFilters,
  type UsageSort,
} from './usageQuery'

const DEFAULT_PAGE_SIZE = 20
const NO_ROWS: UserErrorRequest[] = []

/**
 * The user's own failed requests over the date range of the usage page. Nothing is loaded until the list is
 * looked at (`isActive`), and coming back to it loads nothing while it still shows what would be asked for;
 * `reloadTick` is the page's refresh counter.
 */
export function useUsageErrors({
  range,
  isActive,
  reloadTick,
}: {
  range: DateRange
  isActive: boolean
  reloadTick: number
}) {
  const [filters, setFilters] = useState<UsageErrorFilters>(emptyUsageErrorFilters)
  const [page, setPage] = useState(1)
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [sort, setSort] = useState<UsageSort>(NEWEST_FIRST)

  // The range belongs to the page; when it changes, this list starts over from its first page.
  const [listedRange, setListedRange] = useState(range)
  if (listedRange !== range) {
    setListedRange(range)
    setPage(1)
  }

  const params = buildUsageErrorParams(range, filters, page, pageSize, sort)
  const { answer, isLoading, hasFailed } = useLoadWhileShown({
    isActive,
    version: `${JSON.stringify(params)}#${reloadTick}`,
    load: async () => {
      const found = await usageAPI.listMyErrorRequests(params)
      return { rows: found.items || [], total: found.total || 0 }
    },
    // An empty list is asked for again on the way back: it may have filled meanwhile.
    isKept: (loaded) => loaded.rows.length > 0,
    onLoaded: (loaded) => {
      // Errors can be gone between two loads; never stay on a page past the last one.
      const lastPage = Math.max(1, Math.ceil(loaded.total / pageSize))
      if (page > lastPage) setPage(lastPage)
    },
  })

  const applyFilters = (next: UsageErrorFilters) => {
    setFilters(next)
    setPage(1)
  }

  return {
    filters,
    /** Change filters; they apply at once, from the first page. */
    changeFilters: (patch: Partial<UsageErrorFilters>) => applyFilters({ ...filters, ...patch }),
    reset: () => applyFilters(emptyUsageErrorFilters()),
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
    rows: answer?.rows ?? NO_ROWS,
    total: answer?.total ?? 0,
    isLoading,
    hasFailed,
  }
}

export type UsageErrors = ReturnType<typeof useUsageErrors>
