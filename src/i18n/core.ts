/**
 * Framework-agnostic i18n runtime that reads the Vue frontend's locale
 * catalogs (shared/i18n/locales) and understands the subset of
 * vue-i18n message syntax they use:
 *   - named interpolation   {name}
 *   - list interpolation    {0}
 *   - literal escapes       {'@'}  {'{'}
 *   - pluralization         "one | many" (only when a plural count is passed)
 */

import { extraMessages } from './extra'

export type LocaleCode = 'en' | 'zh'
type Messages = Record<string, unknown>
type Params = Record<string, unknown> | unknown[]

const LOCALE_KEY = 'sub2api_locale'
const DEFAULT_LOCALE: LocaleCode = 'en'

const loaders: Record<LocaleCode, () => Promise<{ default: Messages }>> = {
  en: () => import('@/i18n/locales/en'),
  zh: () => import('@/i18n/locales/zh'),
}

export const availableLocales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
] as const

export function isLocaleCode(value: unknown): value is LocaleCode {
  return value === 'en' || value === 'zh'
}

function detectLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (isLocaleCode(saved)) return saved
  } catch {
    // ignore storage failures
  }
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  return DEFAULT_LOCALE
}

let currentLocale: LocaleCode = detectLocale()
const catalogs: Partial<Record<LocaleCode, Messages>> = {}
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Changes whenever the locale or a loaded catalog changes. */
export function getVersion(): number {
  return version
}

export function getLocale(): LocaleCode {
  return currentLocale
}

function isPlainObject(value: unknown): value is Messages {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Recursively merge `override` into `base` without mutating either. Nested
 * plain objects are merged; any other override value (string, array) wins.
 */
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key]
    out[key] = isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value
  }
  return out
}

export async function loadLocaleMessages(locale: LocaleCode): Promise<void> {
  if (catalogs[locale]) return
  const mod = await loaders[locale]()
  catalogs[locale] = deepMerge(mod.default, extraMessages[locale] as Messages)
  emit()
}

export async function initI18n(): Promise<void> {
  await loadLocaleMessages(currentLocale)
  if (currentLocale !== DEFAULT_LOCALE) {
    // Fallback catalog loads in the background.
    void loadLocaleMessages(DEFAULT_LOCALE)
  }
  document.documentElement.setAttribute('lang', currentLocale)
}

export async function setLocale(locale: string): Promise<void> {
  if (!isLocaleCode(locale)) return
  await loadLocaleMessages(locale)
  currentLocale = locale
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // ignore storage failures
  }
  document.documentElement.setAttribute('lang', locale)
  emit()
}

function lookup(messages: Messages | undefined, key: string): unknown {
  if (!messages) return undefined
  if (key in messages) return messages[key]
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Messages)) {
      node = (node as Messages)[part]
    } else {
      return undefined
    }
  }
  return node
}

function resolveRaw(key: string): unknown {
  const primary = lookup(catalogs[currentLocale], key)
  if (primary !== undefined) return primary
  return lookup(catalogs[DEFAULT_LOCALE], key)
}

function pluralIndex(count: number, choices: number): number {
  const n = Math.abs(count)
  if (choices === 2) return n ? (n > 1 ? 1 : 0) : 1
  return n ? Math.min(n, 2) : 0
}

function interpolate(message: string, params?: Params): string {
  return message.replace(/\{\s*('(?:[^'\\]|\\.)*'|[\w.]+)\s*\}/g, (match, token: string) => {
    if (token.startsWith("'")) {
      return token.slice(1, -1).replace(/\\(.)/g, '$1')
    }
    if (params == null) return match
    const value = Array.isArray(params) ? params[Number(token)] : (params as Record<string, unknown>)[token]
    return value === undefined || value === null ? '' : String(value)
  })
}

/**
 * Translate a key. Mirrors vue-i18n's `t` overloads used in this codebase:
 *   t(key) · t(key, named) · t(key, list) · t(key, count) · t(key, named, count)
 */
export function t(key: string, a?: Params | number, b?: number): string {
  const raw = resolveRaw(key)
  if (typeof raw !== 'string') return key
  let params: Params | undefined
  let count: number | undefined
  if (typeof a === 'number') {
    count = a
    params = { n: a, count: a }
  } else {
    params = a
    count = b
    if (typeof b === 'number' && params && !Array.isArray(params)) {
      params = { n: b, count: b, ...params }
    }
  }
  let message = raw
  if (count !== undefined && raw.includes('|')) {
    const choices = raw.split(/\s*\|\s*/)
    message = choices[Math.min(pluralIndex(count, choices.length), choices.length - 1)] ?? raw
  }
  return interpolate(message, params)
}

/** True if the key exists in the current (or fallback) catalog. */
export function te(key: string): boolean {
  return resolveRaw(key) !== undefined
}

/** Raw message value (string, array or nested object). */
export function tm<T = unknown>(key: string): T {
  return resolveRaw(key) as T
}
