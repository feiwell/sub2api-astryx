import { useEffect, useMemo, useRef, useState } from 'react'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import {
  emptyOrderFilters,
  orderQuery,
  refundOutcome,
  type AdminOrder,
  type OrderAction,
  type OrderFilters,
} from './orderModel'

const DEFAULT_PAGE_SIZE = 20
// Typing in the search field loads once the typing pauses, not on every key.
const KEYWORD_DELAY_MS = 300

/**
 * The orders as the page lists them: the filters, the page, how the last load went, and the things
 * that are done to an order straight from its row.
 */
export function useAdminOrders() {
  const { t } = useI18n()
  // What the fields hold, and what the list was last asked for.
  const [filters, setFilters] = useState<OrderFilters>(emptyOrderFilters)
  const [applied, setApplied] = useState<OrderFilters>(emptyOrderFilters)
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [items, setItems] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // The action under way on each order, by order id.
  const [busy, setBusy] = useState<Record<number, OrderAction>>({})
  const inFlight = useRef(new Set<number>())
  const keywordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { keyword, status, payment_type: paymentType, order_type: orderType } = orderQuery(applied, page, pageSize)

  // reloadTick is not sent; it is here so a refresh, or an order that was changed, reloads the same page.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    adminAPI.payment
      .getOrders({ page, page_size: pageSize, keyword, status, payment_type: paymentType, order_type: orderType })
      .then((answer) => {
        if (isStale) return
        const nextTotal = answer.data?.total || 0
        setItems(answer.data?.items || [])
        setTotal(nextTotal)
        // Orders can leave a filtered list between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.error('[admin-orders] failed to load the list', error)
        // The rows of the last good load stay, under the error.
        setFailure(extractI18nErrorMessage(error, t, 'payment.errors', t('common.loadFailed')))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [keyword, status, paymentType, orderType, page, pageSize, reloadTick, t])

  useEffect(
    () => () => {
      if (keywordTimer.current) clearTimeout(keywordTimer.current)
    },
    [],
  )

  const reload = () => setReloadTick((tick) => tick + 1)

  const apply = (next: OrderFilters) => {
    if (keywordTimer.current) {
      clearTimeout(keywordTimer.current)
      keywordTimer.current = null
    }
    setFilters(next)
    setApplied(next)
    setPage(1)
  }

  /** Runs one action on one order; a second click while it runs does nothing. */
  const run = async (order: AdminOrder, action: OrderAction, work: () => Promise<void>) => {
    if (inFlight.current.has(order.id)) return
    inFlight.current.add(order.id)
    setBusy((current) => ({ ...current, [order.id]: action }))
    try {
      await work()
    } catch (error) {
      toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
    } finally {
      inFlight.current.delete(order.id)
      setBusy((current) => {
        const next = { ...current }
        delete next[order.id]
        return next
      })
      // Whichever way it went, the row may no longer say what the server holds.
      reload()
    }
  }

  return {
    filters,
    /** Change the search text; the list follows once the typing pauses. */
    editKeyword: (text: string) => {
      const next = { ...filters, keyword: text }
      setFilters(next)
      if (keywordTimer.current) clearTimeout(keywordTimer.current)
      keywordTimer.current = setTimeout(() => {
        keywordTimer.current = null
        setApplied(next)
        setPage(1)
      }, KEYWORD_DELAY_MS)
    },
    /** Change a filter picked from a list: it applies at once, with whatever the search field holds. */
    pick: (patch: Partial<OrderFilters>) => apply({ ...filters, ...patch }),
    /** The first page for what the fields hold now, without waiting for the typing to pause. */
    search: () => apply(filters),
    reload,
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
    busy,
    cancel: (order: AdminOrder) =>
      run(order, 'cancel', async () => {
        await adminAPI.payment.cancelOrder(order.id)
        toast.success(t('payment.admin.orderCancelled'))
      }),
    retry: (order: AdminOrder) =>
      run(order, 'retry', async () => {
        await adminAPI.payment.retryRecharge(order.id)
        toast.success(t('payment.admin.retrySuccess'))
      }),
    /** Asks the payment provider how a refund under way stands, and takes over what it answers. */
    queryRefund: (order: AdminOrder) =>
      run(order, 'queryRefund', async () => {
        const answer = await adminAPI.payment.queryRefund(order.id)
        const outcome = refundOutcome(answer.data)
        if (outcome === 'done') toast.success(t('payment.admin.refundSuccess'))
        else if (outcome === 'pending') toast.success(t('payment.admin.refundPending'))
        else toast.error(answer.data?.warning || t('common.error'))
      }),
  }
}

export type AdminOrders = ReturnType<typeof useAdminOrders>
