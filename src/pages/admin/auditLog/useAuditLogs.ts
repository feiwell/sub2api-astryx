import { useEffect, useMemo, useState } from 'react'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import type { AuditLog } from '~/lib/api/admin/audit'
import { buildAuditQuery, emptyAuditFilters, type AuditFilters } from './auditQuery'
import { auditErrorMessage } from './auditText'

const DEFAULT_PAGE_SIZE = 20

/** The operation log as the page lists it: its filters, its page, and how the last load went. */
export function useAuditLogs() {
  // What the fields hold, and what the list was last asked for: typing loads nothing until "search".
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters)
  const [applied, setApplied] = useState<AuditFilters>(emptyAuditFilters)
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // reloadTick is not sent; it is here so a search with unchanged filters, or a cleared log, reloads.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    adminAPI.audit
      .list(buildAuditQuery(applied, page, pageSize))
      .then((answer) => {
        if (isStale) return
        const nextTotal = answer.total || 0
        setItems(answer.items || [])
        setTotal(nextTotal)
        // The log can be cleared between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[audit-log] failed to load the list', error)
        // The rows of the last good load stay, under the error.
        setFailure(auditErrorMessage(error, 'admin.audit.loadFailed'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [applied, page, pageSize, reloadTick])

  const reload = () => setReloadTick((tick) => tick + 1)

  const apply = (filters: AuditFilters) => {
    setDraft(filters)
    setApplied(filters)
    setPage(1)
    reload()
  }

  return {
    draft,
    /** Change what a text field holds; nothing loads until `search`. */
    edit: (patch: Partial<AuditFilters>) => setDraft((current) => ({ ...current, ...patch })),
    /** Change a filter picked from a list: it applies at once, with whatever the text fields hold. */
    pick: (patch: Partial<AuditFilters>) => apply({ ...draft, ...patch }),
    /** The first page for what the fields hold now. Also the way to reload after the log was cleared. */
    search: () => apply(draft),
    reset: () => apply(emptyAuditFilters()),
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
  }
}

export type AuditLogs = ReturnType<typeof useAuditLogs>
