import { useEffect, useMemo, useState } from 'react'
import { paymentAPI } from '@/api/payment'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { useI18n } from '~/i18n'
import { lastPageOf, myOrderAction, myOrdersQuery, readEligibleProviders, readOrderPage } from './myOrderModel'

const DEFAULT_PAGE_SIZE = 20
const NO_PROVIDERS: ReadonlySet<string> = new Set()

/**
 * The user's own orders as the page lists them: the status filter, the page, how the last load went,
 * and what each order can still be done to.
 */
export function useMyOrders() {
  const { t } = useI18n()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [items, setItems] = useState<PaymentOrder[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // The providers that take refund requests: none until the server has listed them.
  const [eligibleProviders, setEligibleProviders] = useState<ReadonlySet<string>>(NO_PROVIDERS)
  const [haveProvidersFailed, setProvidersFailed] = useState(false)
  const [providersTick, setProvidersTick] = useState(0)

  // reloadTick is not sent; it is here so a refresh, or an order that was changed, reloads the same page.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    paymentAPI
      .getMyOrders(myOrdersQuery(status, page, pageSize))
      .then((answer) => {
        if (isStale) return
        const loaded = readOrderPage(answer.data)
        setItems(loaded.items)
        setTotal(loaded.total)
        // Orders can leave a filtered list between two loads; never stay on a page past the last one.
        const lastPage = lastPageOf(loaded.total, pageSize)
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.error('[my-orders] failed to load the list', error)
        // The rows of the last good load stay, under the error.
        setFailure(extractI18nErrorMessage(error, t, 'payment.errors', t('common.loadFailed')))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [status, page, pageSize, reloadTick, t])

  useEffect(() => {
    let isStale = false
    setProvidersFailed(false)
    paymentAPI
      .getRefundEligibleProviders()
      .then((answer) => {
        if (!isStale) setEligibleProviders(readEligibleProviders(answer.data))
      })
      .catch((error: unknown) => {
        if (isStale) return
        // Without the list no refund request is offered; the orders themselves are not affected.
        console.error('[my-orders] failed to load the providers that take refund requests', error)
        setProvidersFailed(true)
      })
    return () => {
      isStale = true
    }
  }, [providersTick])

  return {
    status,
    /** Narrow the list to one status, or to none with an empty one; the list starts over at the first page. */
    pickStatus: (next: string) => {
      setStatus(next)
      setPage(1)
    },
    /** Load the same page again. */
    reload: () => {
      setReloadTick((tick) => tick + 1)
      // A list of providers that could not be loaded is asked for again along with the orders.
      if (haveProvidersFailed) setProvidersTick((tick) => tick + 1)
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
    /** What the user can do to an order, if anything. */
    actionOf: (order: PaymentOrder) => myOrderAction(order, eligibleProviders),
  }
}

export type MyOrders = ReturnType<typeof useMyOrders>
