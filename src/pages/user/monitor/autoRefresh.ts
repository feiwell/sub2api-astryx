import { DEFAULT_INTERVAL_SECONDS } from '@/constants/channelMonitor'

/** Where the browser keeps the choice. The Vue app keeps it under the same name, in the same form. */
export const AUTO_REFRESH_KEY = 'channel-status-auto-refresh'

/** The intervals offered, in seconds. */
export const AUTO_REFRESH_SECONDS: readonly number[] = [30, 60, 120]

export interface AutoRefreshSetting {
  enabled: boolean
  seconds: number
}

/** What a viewer who never chose gets. */
export const DEFAULT_AUTO_REFRESH: AutoRefreshSetting = { enabled: true, seconds: DEFAULT_INTERVAL_SECONDS }

/**
 * The choice as it was saved. Nothing saved, or something that cannot be read, gives the default. An interval
 * that is no longer offered gives the default interval, and keeps the rest of the choice.
 */
export function parseAutoRefresh(saved: string | null | undefined): AutoRefreshSetting {
  if (!saved) return DEFAULT_AUTO_REFRESH
  try {
    const parsed: unknown = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_AUTO_REFRESH
    const { enabled, interval_seconds: interval } = parsed as { enabled?: unknown; interval_seconds?: unknown }
    const seconds = Number(interval)
    return {
      enabled: enabled === true,
      seconds: AUTO_REFRESH_SECONDS.includes(seconds) ? seconds : DEFAULT_AUTO_REFRESH.seconds,
    }
  } catch {
    return DEFAULT_AUTO_REFRESH
  }
}

/** The choice in the form it is saved in. */
export function serializeAutoRefresh(setting: AutoRefreshSetting): string {
  return JSON.stringify({ enabled: setting.enabled, interval_seconds: setting.seconds })
}

/**
 * The countdown one second later. With a second or less left the refresh is due, and the countdown starts
 * over from `seconds`.
 */
export function tickCountdown(remaining: number, seconds: number): { remaining: number; isDue: boolean } {
  return remaining <= 1 ? { remaining: seconds, isDue: true } : { remaining: remaining - 1, isDue: false }
}

/** A space as wide as a digit. */
const FIGURE_SPACE = '\u2007'

/**
 * The seconds left, as wide as the interval they count down from: where a digit drops away a space of its
 * width takes its place, so a button showing the countdown keeps its width and what stands next to it stays put.
 */
export function countdownDigits(remaining: number, seconds: number): string {
  return String(remaining).padStart(String(seconds).length, FIGURE_SPACE)
}
