import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AUTO_REFRESH_KEY,
  parseAutoRefresh,
  serializeAutoRefresh,
  tickCountdown,
  type AutoRefreshSetting,
} from './autoRefresh'

function readSaved(): AutoRefreshSetting {
  try {
    return parseAutoRefresh(window.localStorage.getItem(AUTO_REFRESH_KEY))
  } catch {
    return parseAutoRefresh(null)
  }
}

function save(setting: AutoRefreshSetting): void {
  try {
    window.localStorage.setItem(AUTO_REFRESH_KEY, serializeAutoRefresh(setting))
  } catch {
    // A browser that refuses to store still refreshes; the choice then lasts for this visit only.
  }
}

export interface AutoRefresh extends AutoRefreshSetting {
  /** The seconds until the page refreshes by itself; null while it does not. */
  remaining: number | null
  setEnabled: (enabled: boolean) => void
  setSeconds: (seconds: number) => void
  /** Starts the countdown over. For when a refresh has finished, whoever asked for it. */
  restart: () => void
}

/**
 * Refreshing the page by itself: a countdown that calls `onDue` each time it runs out, and the viewer's choice
 * of whether and how often, which the browser remembers. The countdown stands still while `isPaused` says so.
 */
export function useAutoRefresh({
  isPaused,
  onDue,
}: {
  isPaused: () => boolean
  onDue: () => void
}): AutoRefresh {
  const [setting, setSetting] = useState(readSaved)
  const [remaining, setRemaining] = useState(setting.seconds)
  const remainingRef = useRef(setting.seconds)
  const secondsRef = useRef(setting.seconds)
  const handlers = useRef({ isPaused, onDue })
  useEffect(() => {
    handlers.current = { isPaused, onDue }
  })

  const { enabled, seconds } = setting

  useEffect(() => {
    secondsRef.current = seconds
    if (!enabled) return
    remainingRef.current = seconds
    setRemaining(seconds)
    const timer = window.setInterval(() => {
      if (handlers.current.isPaused()) return
      const next = tickCountdown(remainingRef.current, seconds)
      remainingRef.current = next.remaining
      setRemaining(next.remaining)
      if (next.isDue) handlers.current.onDue()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, seconds])

  const restart = useCallback(() => {
    remainingRef.current = secondsRef.current
    setRemaining(secondsRef.current)
  }, [])

  const change = (next: AutoRefreshSetting) => {
    setSetting(next)
    save(next)
  }

  return {
    enabled,
    seconds,
    remaining: enabled ? remaining : null,
    setEnabled: (next) => change({ enabled: next, seconds }),
    setSeconds: (next) => change({ enabled, seconds: next }),
    restart,
  }
}
