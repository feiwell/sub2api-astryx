/**
 * Column visibility of the API keys table, persisted the same way as
 * KeysView.vue so both frontends share one saved setting.
 */

export const KEY_COLUMN_KEYS = [
  'name',
  'id',
  'key',
  'group',
  'current_concurrency',
  'usage',
  'rate_limit',
  'expires_at',
  'status',
  'last_used_at',
  'last_used_ip',
  'created_at',
  'actions',
] as const

export type KeyColumnKey = (typeof KEY_COLUMN_KEYS)[number]

export const ALWAYS_VISIBLE_COLUMNS: ReadonlySet<string> = new Set<KeyColumnKey>(['name', 'actions'])

const DEFAULT_HIDDEN_COLUMNS: KeyColumnKey[] = ['id', 'rate_limit', 'last_used_at', 'last_used_ip']
const HIDDEN_COLUMNS_KEY = 'api-key-hidden-columns'
const COLUMN_SETTINGS_VERSION_KEY = 'api-key-column-settings-version'
const COLUMN_SETTINGS_VERSION = 3
// Columns added in a later version start hidden for people who saved their
// settings before that version existed.
const VERSION_NEW_HIDDEN_COLUMNS: Record<number, KeyColumnKey[]> = {
  2: ['last_used_ip'],
  3: ['id'],
}

const isToggleable = (key: unknown): key is KeyColumnKey =>
  typeof key === 'string' && (KEY_COLUMN_KEYS as readonly string[]).includes(key) && !ALWAYS_VISIBLE_COLUMNS.has(key)

export function saveHiddenKeyColumns(hidden: Iterable<string>): void {
  try {
    localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...hidden]))
    localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
  } catch (error) {
    console.error('Failed to save API key table columns:', error)
  }
}

export function loadHiddenKeyColumns(): Set<string> {
  const hidden = new Set<string>()
  try {
    const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (Array.isArray(parsed)) parsed.filter(isToggleable).forEach((key) => hidden.add(key))
      const storedVersion = Number(localStorage.getItem(COLUMN_SETTINGS_VERSION_KEY) ?? '1')
      if (storedVersion < COLUMN_SETTINGS_VERSION) {
        for (let version = storedVersion + 1; version <= COLUMN_SETTINGS_VERSION; version++) {
          for (const key of VERSION_NEW_HIDDEN_COLUMNS[version] ?? []) hidden.add(key)
        }
        saveHiddenKeyColumns(hidden)
      } else {
        localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
      }
    } else {
      DEFAULT_HIDDEN_COLUMNS.forEach((key) => hidden.add(key))
      localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
    }
  } catch (error) {
    console.error('Failed to load API key table columns:', error)
    DEFAULT_HIDDEN_COLUMNS.forEach((key) => hidden.add(key))
  }
  return hidden
}
