import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminGroup, Proxy } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { ContentModerationConfig, ContentModerationRuntimeStatus } from '~/lib/api/admin/riskControl'
import { toast } from '~/lib/toast'
import { pollWhileVisible } from '~/lib/visiblePolling'
import { STATUS_REFRESH_MS } from './riskModel'

/**
 * What the risk control page knows from the server: the saved audit config, the running state,
 * and the groups and proxies the settings choose from.
 *
 * `config` stays null until a load succeeded. The page must not offer the settings before that:
 * saving a form filled with defaults would overwrite the real config.
 */
export function useRiskControl() {
  const { t } = useI18n()
  const [config, setConfig] = useState<ContentModerationConfig | null>(null)
  const [status, setStatus] = useState<ContentModerationRuntimeStatus | null>(null)
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [isRefreshing, setRefreshing] = useState(false)
  const [loadTick, setLoadTick] = useState(0)

  // The state is asked for by the load, the timer, the button and after changes. Each request
  // takes a number, and only the answer to the newest one is kept.
  const statusRequest = useRef(0)
  const isMounted = useRef(true)
  // Error texts are read when a request fails, in the language of that moment.
  const translate = useRef(t)
  translate.current = t

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    let isStale = false
    const request = ++statusRequest.current
    setLoading(true)
    setFailure(null)
    Promise.all([
      adminAPI.riskControl.getConfig(),
      adminAPI.groups.getAll(),
      adminAPI.riskControl.getStatus(),
      // Without the proxy list the settings only lose their proxy choices.
      adminAPI.proxies.getAll().catch(() => [] as Proxy[]),
    ])
      .then(([nextConfig, nextGroups, nextStatus, nextProxies]) => {
        if (isStale) return
        setConfig(nextConfig)
        setGroups(nextGroups)
        setProxies(nextProxies)
        if (request === statusRequest.current) setStatus(nextStatus)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[risk-control] failed to load', error)
        setFailure(extractApiErrorMessage(error, translate.current('admin.riskControl.loadFailed')))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [loadTick])

  const fetchStatus = useCallback(async () => {
    const request = ++statusRequest.current
    const next = await adminAPI.riskControl.getStatus()
    if (isMounted.current && request === statusRequest.current) setStatus(next)
  }, [])

  /** Ask for the state again without telling: a failure keeps the last state. Never rejects. */
  const syncStatus = useCallback(() => fetchStatus().catch(() => {}), [fetchStatus])

  const hasConfig = config != null
  useEffect(() => {
    if (!hasConfig) return
    return pollWhileVisible(() => void syncStatus(), STATUS_REFRESH_MS)
  }, [hasConfig, syncStatus])

  /** The refresh the viewer asked for: it shows as busy and tells when it fails. */
  const refreshStatus = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchStatus()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, translate.current('admin.riskControl.statusFailed')))
    } finally {
      if (isMounted.current) setRefreshing(false)
    }
  }, [fetchStatus])

  return {
    config,
    status,
    groups,
    proxies,
    isLoading,
    failure,
    isRefreshing,
    /** Load everything again, after a load that failed. */
    reload: useCallback(() => setLoadTick((tick) => tick + 1), []),
    refreshStatus,
    syncStatus,
    /** Take the config the server answered a save with. */
    setConfig,
  }
}

export type RiskControl = ReturnType<typeof useRiskControl>
