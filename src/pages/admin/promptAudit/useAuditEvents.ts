import { useEffect, useMemo, useState } from 'react'
import type { PromptAuditEvent, PromptEventFilters } from '@/features/prompt-audit/types'
import { emptyEventFilters } from '@/features/prompt-audit/viewModel'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { listEvents } from './api'
import { auditErrorMessage } from './eventText'

const DEFAULT_PAGE_SIZE = 20

/**
 * The audit events list: its filters, its page and what is ticked on it. Kept by the page rather
 * than by the events tab, so the list is still there after a visit to the other tab.
 */
export function useAuditEvents() {
  // What the fields hold, and what the list was last asked for: typing loads nothing until "search".
  const [draft, setDraft] = useState<PromptEventFilters>(emptyEventFilters)
  const [applied, setApplied] = useState<PromptEventFilters>(emptyEventFilters)
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [items, setItems] = useState<PromptAuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set())
  const [reloadTick, setReloadTick] = useState(0)

  // reloadTick is not sent; it is here so a search or a deletion reloads the list.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    listEvents(applied, page, pageSize)
      .then((answer) => {
        if (isStale) return
        const nextTotal = answer.total || 0
        setItems(answer.items || [])
        setTotal(nextTotal)
        // What was ticked may be gone or on another page now.
        setSelectedIds(new Set())
        // Events can be deleted between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[prompt-audit] failed to load events', error)
        // The rows of the last good load stay, under the error.
        setFailure(auditErrorMessage(error, 'admin.promptAudit.errors.loadEvents'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [applied, page, pageSize, reloadTick])

  const reload = () => setReloadTick((tick) => tick + 1)

  const apply = (filters: PromptEventFilters) => {
    setApplied(filters)
    setPage(1)
    reload()
  }

  return {
    draft,
    edit: (patch: Partial<PromptEventFilters>) => setDraft((current) => ({ ...current, ...patch })),
    search: () => apply(draft),
    reset: () => {
      const empty = emptyEventFilters()
      setDraft(empty)
      apply(empty)
    },
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
    selectedIds,
    select: (id: number, isSelected: boolean) =>
      setSelectedIds((current) => {
        const next = new Set(current)
        if (isSelected) next.add(id)
        else next.delete(id)
        return next
      }),
    selectAll: (isSelected: boolean) => setSelectedIds(new Set(isSelected ? items.map((event) => event.id) : [])),
    reload,
  }
}

export type AuditEvents = ReturnType<typeof useAuditEvents>
