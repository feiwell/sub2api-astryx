import { useMemo, useState } from 'react'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { useLoadWhileShown } from '~/components/usage/useLoadWhileShown'
import { opsAPI, type OpsErrorListQueryParams, type OpsErrorLog } from '~/lib/api/admin/ops'
import { NEWEST_FIRST, nextSort, type UsageSort } from '~/pages/user/usage/usageQuery'
import { buildAdminErrorParams, type AdminUsageFilters } from './adminUsageQuery'

const DEFAULT_PAGE_SIZE = 20
const NO_ROWS: OpsErrorLog[] = []

/**
 * Everyone's failed requests, under the filters of the admin usage page. Nothing is loaded until the list is
 * looked at (`isActive`); `reloadTick` is the page's refresh counter.
 */
export function useAdminUsageErrors({
  filters,
  isActive,
  reloadTick,
}: {
  filters: AdminUsageFilters
  isActive: boolean
  reloadTick: number
}) {
  const [page, setPage] = useState(1)
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [sort, setSort] = useState<UsageSort>(NEWEST_FIRST)

  // The filters belong to the page; when one that narrows this list changes, the list starts over from its
  // first page.
  const narrowedBy = JSON.stringify(buildAdminErrorParams(filters, 1, 1, NEWEST_FIRST))
  const [listedFor, setListedFor] = useState(narrowedBy)
  if (listedFor !== narrowedBy) {
    setListedFor(narrowedBy)
    setPage(1)
  }

  const key = JSON.stringify(buildAdminErrorParams(filters, page, pageSize, sort))
  const { answer, isLoading, hasFailed } = useLoadWhileShown({
    isActive,
    version: `${key}#${reloadTick}`,
    load: async () => {
      const found = await opsAPI.listErrorLogs(JSON.parse(key) as OpsErrorListQueryParams)
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

  return {
    page,
    setPage,
    pageSize,
    pageSizeOptions,
    changePageSize: (size: number) => {
      setPageSize(size)
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

export type AdminUsageErrors = ReturnType<typeof useAdminUsageErrors>
