/** Path for browser navigations outside the SPA router (which applies its own basename). */
export function toAppPath(path: string, base = import.meta.env.BASE_URL): string {
  return base.replace(/\/$/, '') + path
}

/** Read the router-relative pathname when inspecting a browser location directly. */
export function fromAppPath(path: string, base = import.meta.env.BASE_URL): string {
  const prefix = base.replace(/\/$/, '')
  if (prefix && path === prefix) return '/'
  return prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path
}
