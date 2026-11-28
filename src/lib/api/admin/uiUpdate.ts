/**
 * The console's own update channel.
 *
 * The backend binary has `/admin/system/*` for shells and version checks, but
 * the frontend is a static tree, so this deployment runs a small service beside
 * nginx (`/api/ui-update/*`, loopback only) that pulls and rebuilds it. These
 * calls carry the console's access token, which the service checks against
 * `/auth/me` before doing anything.
 */

export interface UiUpdateJob {
  state: 'idle' | 'running' | 'done' | 'failed'
  step: string
  log: string
  started_at: number | null
  finished_at: number | null
  sha: string | null
}

export interface UiUpdateStatus {
  current_sha: string | null
  latest_sha: string | null
  has_update: boolean
  built_at: string | null
  dist_index_sha: string | null
  job: UiUpdateJob
  unreachable: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth_token')
  const response = await fetch(`/api/ui-update${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message || `HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export const uiUpdateAPI = {
  status: (force = false) => request<UiUpdateStatus>(force ? '/status?force=1' : '/status'),
  apply: () => request<{ message: string; job: UiUpdateJob }>('/apply', { method: 'POST' }),
}
