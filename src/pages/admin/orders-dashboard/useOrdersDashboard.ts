import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '~/lib/api/admin'
import type { DashboardStats } from '@/types/payment'
import { normalizeDashboardStats } from './dashboardModel'

export function useOrdersDashboard(days: number) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [failure, setFailure] = useState<unknown>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    adminAPI.payment.getDashboard(days)
      .then((res) => {
        if (!isStale) setStats(normalizeDashboardStats(res.data))
      })
      .catch((error: unknown) => {
        if (!isStale) setFailure(error)
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [days, reloadTick])

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), [])
  return { stats, isLoading, failure, reload }
}
