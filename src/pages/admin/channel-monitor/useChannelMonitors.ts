import { useEffect, useMemo, useState } from 'react'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import { extractApiErrorMessage } from '@/utils/apiError'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { t as translate } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { ChannelMonitor } from '~/lib/api/admin/channelMonitor'
import { buildMonitorListParams, emptyMonitorFilters, type MonitorFilters } from './monitorQuery'

const SEARCH_DELAY_MS = 300

/** The monitors as the page lists them: the filters, the page, and how the last load went. */
export function useChannelMonitors() {
  // What the search field holds. The list follows it once the typing has stopped for a moment.
  const [searchText, setSearchText] = useState('')
  const [filters, setFilters] = useState<MonitorFilters>(emptyMonitorFilters)
  const [page, setPage] = useState(1)
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const [items, setItems] = useState<ChannelMonitor[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  // Not sent; counting it up asks for the page on show again.
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    const search = searchText.trim()
    if (search === filters.search) return
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search }))
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchText, filters.search])

  useEffect(() => {
    // Only the answer of the request made last is shown: a slow one must not undo a newer one.
    const controller = new AbortController()
    setLoading(true)
    adminAPI.channelMonitor
      .list(buildMonitorListParams(filters, page, pageSize), { signal: controller.signal })
      .then((answer) => {
        if (controller.signal.aborted) return
        const nextTotal = answer.total || 0
        setItems(answer.items || [])
        setTotal(nextTotal)
        setFailure(null)
        // A monitor can be deleted between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('[channel-monitor] failed to load the list', error)
        // The rows of the last good load stay, under the error.
        setFailure(extractApiErrorMessage(error, translate('admin.channelMonitor.loadError')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [filters, page, pageSize, reloadTick])

  return {
    searchText,
    setSearchText,
    filters,
    /** Narrow the list by a value picked from a list: it applies at once, from the first page. */
    pick: (patch: Partial<Pick<MonitorFilters, 'provider' | 'enabled'>>) => {
      setFilters((current) => ({ ...current, ...patch }))
      setPage(1)
    },
    page,
    setPage,
    pageSize,
    pageSizeOptions,
    changePageSize: (size: number) => {
      setPageSize(size)
      setPersistedPageSize(size)
      setPage(1)
    },
    items,
    total,
    isLoading,
    failure,
    /** Ask for the page on show again. */
    reload: () => setReloadTick((tick) => tick + 1),
    /** Show a change the server has taken on the row it was made to, without asking for the page again. */
    patch: (id: number, change: Partial<ChannelMonitor>) =>
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item))),
  }
}

export type ChannelMonitors = ReturnType<typeof useChannelMonitors>
