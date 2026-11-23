const DEFAULT_API_BASE_URL = '/api/v1'
const API_BASE_URL = normalizeAPIBaseURL(import.meta.env.VITE_API_BASE_URL)

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

function normalizeAPIBaseURL(value: unknown): string {
  const raw = String(value || DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL
  const withoutTrailingSlash = raw.replace(/\/+$/, '')
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(withoutTrailingSlash) || withoutTrailingSlash.startsWith('//')) {
    return withoutTrailingSlash
  }
  return normalizePath(withoutTrailingSlash)
}

export function getAPIBaseURL(): string {
  return API_BASE_URL
}

export function buildApiUrl(path: string): string {
  const base = getAPIBaseURL().replace(/\/+$/, '')
  let suffix = normalizePath(path)
  if (suffix === DEFAULT_API_BASE_URL) {
    suffix = ''
  } else if (suffix.startsWith(`${DEFAULT_API_BASE_URL}/`)) {
    suffix = suffix.slice(DEFAULT_API_BASE_URL.length)
  }
  return `${base}${suffix}`
}

/** The gateway is mounted alongside /api/v1, including any reverse-proxy prefix. */
export function getGatewayBaseURL(): string {
  const apiBase = getAPIBaseURL()
  try {
    const api = new URL(apiBase, typeof window === 'undefined' ? undefined : window.location.origin)
    const prefix = api.pathname.endsWith(DEFAULT_API_BASE_URL)
      ? api.pathname.slice(0, -DEFAULT_API_BASE_URL.length)
      : ''
    return `${api.origin}${prefix}`
  } catch {
    return apiBase.startsWith('/') && apiBase.endsWith(DEFAULT_API_BASE_URL)
      ? apiBase.slice(0, -DEFAULT_API_BASE_URL.length)
      : ''
  }
}

export function buildGatewayUrl(path: string): string {
  return `${getGatewayBaseURL()}${normalizePath(path)}`
}
