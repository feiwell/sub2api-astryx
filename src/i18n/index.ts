import { useCallback, useSyncExternalStore } from 'react'
import { getLocale, getVersion, setLocale, subscribe, t, te, tm, type LocaleCode } from './core'

export * from './core'

/**
 * React binding for the i18n runtime. Components re-render when the locale
 * (or a lazily loaded catalog) changes.
 */
export function useI18n() {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  const locale = getLocale()
  const change = useCallback((next: LocaleCode) => setLocale(next), [])
  return { t, te, tm, locale, setLocale: change }
}
