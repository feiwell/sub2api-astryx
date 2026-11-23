import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '@/api/channelMonitorV2'
import type {
  MonitorDimensions,
  MonitorErrorRow,
  MonitorFilter,
  MonitorMatrixGroupBy,
  MonitorMatrixResponse,
  MonitorModelRow,
  MonitorRange,
  MonitorSnapshot,
  MonitorUserRow,
} from '@/api/channelMonitorV2'
import { pollWhileVisible } from '~/lib/visiblePolling'
import { refreshSeconds } from './statusFormat'
import type { StatusTab } from './statusQuery'

const NO_DIMENSIONS: MonitorDimensions = { platforms: [], groups: [], models: [] }

/** A request this page gave up on itself, because a newer one replaced it. */
export function isCanceled(error: unknown): boolean {
  const e = error as { name?: string; code?: string } | null
  return e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED'
}

export interface ChannelStatus {
  dimensions: MonitorDimensions
  snapshot: MonitorSnapshot | null
  matrix: MonitorMatrixResponse | null
  modelRows: MonitorModelRow[]
  errorRows: MonitorErrorRow[]
  userRows: MonitorUserRow[]
  /** Nothing has been answered yet: neither figures nor a failure. */
  isLoading: boolean
  /** Figures are being fetched; the ones on screen may be the previous ones. */
  isRefreshing: boolean
  isTabLoading: boolean
  /** Why the figures, or the lists the filters choose from, could not be fetched. Cleared by a fetch that works. */
  loadError: unknown
  /** Why the rows of the open tab could not be fetched. */
  tabError: unknown
  /** The server is still filling in the history after monitoring was first switched on. */
  isBootstrapping: boolean
  reload: () => void
}

/**
 * Everything the channel status page shows, kept current: the figures and the matrix for the filter, the rows
 * of the open tab, and the lists the filters choose from. What is on screen stays while newer data is on its
 * way, and stays when fetching fails.
 */
export function useChannelStatus({
  filter,
  groupBy,
  tab,
  isAdmin,
  canSeeUsers,
}: {
  filter: MonitorFilter
  groupBy: MonitorMatrixGroupBy
  tab: StatusTab
  isAdmin: boolean
  canSeeUsers: boolean
}): ChannelStatus {
  const [dimensions, setDimensions] = useState(NO_DIMENSIONS)
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [matrix, setMatrix] = useState<MonitorMatrixResponse | null>(null)
  const [modelRows, setModelRows] = useState<MonitorModelRow[]>([])
  const [errorRows, setErrorRows] = useState<MonitorErrorRow[]>([])
  const [userRows, setUserRows] = useState<MonitorUserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTabLoading, setIsTabLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<unknown>(null)
  const [dimensionsError, setDimensionsError] = useState<unknown>(null)
  const [tabError, setTabError] = useState<unknown>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const isBusy = useRef(false)

  // The lists the filters choose from depend on the range alone, so choosing never shortens them.
  const range: MonitorRange = filter.range
  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true
    api
      .getDimensions({ range, platforms: [], groupIds: [], models: [] }, isAdmin, controller.signal)
      .then((next) => {
        if (!isCurrent) return
        setDimensions(next)
        setDimensionsError(null)
      })
      .catch((error: unknown) => {
        if (isCurrent && !isCanceled(error)) setDimensionsError(error)
      })
    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [range, isAdmin, refreshCount])

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true
    isBusy.current = true
    setIsRefreshing(true)
    Promise.all([
      api.getSnapshot(filter, isAdmin, controller.signal),
      api.getMatrix(filter, groupBy, isAdmin, controller.signal),
    ])
      .then(([nextSnapshot, nextMatrix]) => {
        if (!isCurrent) return
        setSnapshot(nextSnapshot)
        setMatrix(nextMatrix)
        setMetricsError(null)
      })
      .catch((error: unknown) => {
        if (isCurrent && !isCanceled(error)) setMetricsError(error)
      })
      .finally(() => {
        if (!isCurrent) return
        isBusy.current = false
        setIsRefreshing(false)
        setIsLoading(false)
      })
    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [filter, groupBy, isAdmin, refreshCount])

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true
    setIsTabLoading(true)
    const load = async () => {
      if (tab === 'models') {
        const answer = await api.getModels(filter, isAdmin, controller.signal)
        if (isCurrent) setModelRows(answer.items || [])
      } else if (tab === 'errors') {
        const answer = await api.getErrors(filter, isAdmin, controller.signal)
        if (isCurrent) setErrorRows(answer.items || [])
      } else if (canSeeUsers) {
        const answer = await api.getUsers(filter, isAdmin, controller.signal)
        if (isCurrent) setUserRows(answer.items || [])
      } else if (isCurrent) {
        setUserRows([])
      }
    }
    load()
      .then(() => {
        if (isCurrent) setTabError(null)
      })
      .catch((error: unknown) => {
        if (isCurrent && !isCanceled(error)) setTabError(error)
      })
      .finally(() => {
        if (isCurrent) setIsTabLoading(false)
      })
    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [filter, tab, canSeeUsers, isAdmin, refreshCount])

  const isBootstrapping = Boolean(snapshot?.coverage?.bootstrap?.active)
  const seconds = refreshSeconds(isBootstrapping, snapshot?.config?.refresh_interval_seconds)
  // Counted from the last figures that arrived; a refresh already under way is not doubled.
  useEffect(() => {
    return pollWhileVisible(() => {
      if (!isBusy.current) setRefreshCount((count) => count + 1)
    }, seconds * 1000)
  }, [seconds, snapshot])

  const reload = useCallback(() => setRefreshCount((count) => count + 1), [])

  return {
    dimensions,
    snapshot,
    matrix,
    modelRows,
    errorRows,
    userRows,
    isLoading,
    isRefreshing,
    isTabLoading,
    loadError: metricsError ?? dimensionsError,
    tabError,
    isBootstrapping,
    reload,
  }
}
