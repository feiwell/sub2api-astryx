import { useEffect, useMemo, useRef, useState } from 'react'
import { extractApiErrorMessage } from '@/utils/apiError'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { t } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { ContentModerationLog } from '~/lib/api/admin/riskControl'
import { toast } from '~/lib/toast'
import { buildLogQuery, emptyLogFilters, withUserStatus, type RiskLogFilters } from './riskLogs'

const DEFAULT_PAGE_SIZE = 20

/**
 * The audit records as the page lists them: their filters, their page, how the last load went,
 * and the unban of a user a record got banned.
 */
export function useRiskLogs() {
  // What the fields hold, and what the list was last asked for: typing loads nothing until "search".
  const [draft, setDraft] = useState<RiskLogFilters>(emptyLogFilters)
  const [applied, setApplied] = useState<RiskLogFilters>(emptyLogFilters)
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [items, setItems] = useState<ContentModerationLog[]>([])
  // Null until a load has answered: "none match" and "not known yet" are told apart.
  const [total, setTotal] = useState<number | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [unbanningUserId, setUnbanningUserId] = useState<number | null>(null)
  // The state above is a render behind; two clicks in one render must not start two unbans.
  const isUnbanning = useRef(false)

  // reloadTick is not sent; it is here so a refresh, or a search with unchanged filters, reloads.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    adminAPI.riskControl
      .listLogs(buildLogQuery(applied, page, pageSize))
      .then((answer) => {
        // Filters can change faster than the server answers: only the answer to the last question counts.
        if (isStale) return
        const nextTotal = answer.total || 0
        setItems(answer.items || [])
        setTotal(nextTotal)
        // Records are cleaned up between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[risk-control] failed to load the records', error)
        // The rows of the last good load stay, under the error.
        setFailure(extractApiErrorMessage(error, t('admin.riskControl.logsFailed')))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [applied, page, pageSize, reloadTick])

  const reload = () => setReloadTick((tick) => tick + 1)

  const apply = (filters: RiskLogFilters) => {
    setDraft(filters)
    setApplied(filters)
    setPage(1)
    reload()
  }

  /** Lift the ban of the record's user. One at a time; it tells how it went. */
  const unban = async (log: Pick<ContentModerationLog, 'user_id'>) => {
    const userId = log.user_id
    if (!userId || isUnbanning.current) return
    isUnbanning.current = true
    setUnbanningUserId(userId)
    try {
      const answer = await adminAPI.riskControl.unbanUser(userId)
      // Applied to the rows shown by now, which a filter may have changed meanwhile.
      setItems((current) => withUserStatus(current, userId, answer.status))
      toast.success(t('admin.riskControl.unbanSuccess'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.riskControl.unbanFailed')))
    } finally {
      isUnbanning.current = false
      setUnbanningUserId(null)
    }
  }

  return {
    draft,
    /** Change what the search field holds; nothing loads until `search`. */
    edit: (patch: Partial<RiskLogFilters>) => setDraft((current) => ({ ...current, ...patch })),
    /** Change a filter picked from a list or a calendar: it applies at once, with whatever the search field holds. */
    pick: (patch: Partial<RiskLogFilters>) => apply({ ...draft, ...patch }),
    /** The first page for what the fields hold now. */
    search: () => apply(draft),
    reset: () => apply(emptyLogFilters()),
    page,
    setPage,
    pageSize,
    pageSizeOptions,
    changePageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
    items,
    total,
    isLoading,
    failure,
    /** Ask again for the page shown, with the filters it was asked for. */
    reload,
    /** The user whose unban is under way, null when none is. */
    unbanningUserId,
    unban,
  }
}

export type RiskLogs = ReturnType<typeof useRiskLogs>
