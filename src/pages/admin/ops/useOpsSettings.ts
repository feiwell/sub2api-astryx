import { useCallback, useEffect, useState } from 'react'
import { adminAPI } from '~/lib/api/admin'

// Same cache keys and event as the Vue admin-settings store. src/lib/api/client.ts writes the
// first key and fires the event when the backend answers "Ops monitoring is disabled".
const ENABLED_KEY = 'ops_monitoring_enabled_cached'
const REALTIME_KEY = 'ops_realtime_monitoring_enabled_cached'
const QUERY_MODE_KEY = 'ops_query_mode_default_cached'
const DISABLED_EVENT = 'ops-monitoring-disabled'

function readCached(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeCached(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode); the in-memory value still applies.
  }
}

const readCachedBool = (key: string, fallback: boolean): boolean => {
  const raw = readCached(key)
  return raw === null ? fallback : raw === 'true'
}

export interface OpsSettings {
  /** False until the server settings have answered or failed; cached values apply meanwhile. */
  isReady: boolean
  enabled: boolean
  realtimeEnabled: boolean
  queryModeDefault: string
  /** Records what the realtime endpoint reported, without another settings request. */
  setRealtimeEnabled: (value: boolean) => void
}

export function useOpsSettings(): OpsSettings {
  const [state, setState] = useState(() => ({
    isReady: false,
    enabled: readCachedBool(ENABLED_KEY, true),
    realtimeEnabled: readCachedBool(REALTIME_KEY, true),
    queryModeDefault: readCached(QUERY_MODE_KEY) || 'auto',
  }))

  useEffect(() => {
    let cancelled = false
    adminAPI.settings
      .getSettings()
      .then((settings) => {
        if (cancelled) return
        const next = {
          isReady: true,
          enabled: settings.ops_monitoring_enabled ?? true,
          realtimeEnabled: settings.ops_realtime_monitoring_enabled ?? true,
          queryModeDefault: settings.ops_query_mode_default || 'auto',
        }
        writeCached(ENABLED_KEY, String(next.enabled))
        writeCached(REALTIME_KEY, String(next.realtimeEnabled))
        writeCached(QUERY_MODE_KEY, next.queryModeDefault)
        setState(next)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[ops] failed to load admin settings', error)
        setState((prev) => ({ ...prev, isReady: true }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onDisabled = () => {
      writeCached(ENABLED_KEY, 'false')
      setState((prev) => ({ ...prev, enabled: false }))
    }
    window.addEventListener(DISABLED_EVENT, onDisabled)
    return () => window.removeEventListener(DISABLED_EVENT, onDisabled)
  }, [])

  const setRealtimeEnabled = useCallback((value: boolean) => {
    writeCached(REALTIME_KEY, String(value))
    setState((prev) => (prev.realtimeEnabled === value ? prev : { ...prev, realtimeEnabled: value }))
  }, [])

  return { ...state, setRealtimeEnabled }
}
