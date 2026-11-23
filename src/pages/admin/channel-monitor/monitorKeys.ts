import type { ApiKey } from '@/types'

type Lifetime = Pick<ApiKey, 'status' | 'expires_at'>

interface Searchable {
  name: string
  key: string
  group?: { name: string; platform: string } | null
}

/** The keys that can be used at `now`: switched on, and not past their end. */
export function usableKeys<Key extends Lifetime>(keys: Key[], now: number): Key[] {
  return keys.filter(
    (key) => key.status === 'active' && (!key.expires_at || new Date(key.expires_at).getTime() > now),
  )
}

/**
 * The keys that reach a provider, which is what the group of a key decides, narrowed by part of a name, of
 * the key itself or of the name of its group.
 */
export function keysFor<Key extends Searchable>(keys: Key[], provider: string, search: string): Key[] {
  const text = search.trim().toLowerCase()
  return keys.filter((key) => {
    if (key.group?.platform !== provider) return false
    if (!text) return true
    return [key.name, key.key, key.group?.name || ''].some((part) => part.toLowerCase().includes(text))
  })
}
