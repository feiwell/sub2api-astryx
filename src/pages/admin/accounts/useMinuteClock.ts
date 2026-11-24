import { useSyncExternalStore } from 'react'

/**
 * Shared minute clock for usage reset countdowns (Vue: UsageProgressBar
 * shared now ref). One timer for every subscriber, aligned to the minute,
 * and an immediate tick when the page becomes visible again.
 */

const MINUTE_MS = 60_000

let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

function tick() {
  now = Date.now()
  listeners.forEach((listener) => listener())
}

function schedule() {
  timer = setTimeout(() => {
    tick()
    schedule()
  }, MINUTE_MS - (Date.now() % MINUTE_MS))
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') tick()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    schedule()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer)
      timer = null
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }
}

function getSnapshot(): number {
  return now
}

/** Current time in ms, re-rendering once a minute and when the tab is shown again. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
