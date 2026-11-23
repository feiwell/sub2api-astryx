import { matchPath } from 'react-router'

type Load = () => Promise<unknown>

interface Fetch {
  isDone: boolean
  pending?: Promise<void>
}

const pages: Array<{ pattern: string; load: Load }> = []
/** Several routes can show the same page, so progress is kept for each way of fetching, not for each route. */
const fetches = new Map<Load, Fetch>()

/** Remember how the code of the page at the route path `pattern` is fetched. */
export function registerPageCode(pattern: string, load: Load): void {
  pages.push({ pattern, load })
  if (!fetches.has(load)) fetches.set(load, { isDone: false })
}

function pageAt(href: string): { load: Load; fetch: Fetch } | undefined {
  const pathname = href.split(/[?#]/, 1)[0]
  const page = pages.find((entry) => matchPath(entry.pattern, pathname) !== null)
  const fetch = page && fetches.get(page.load)
  return page && fetch ? { load: page.load, fetch } : undefined
}

/** Whether the page at `href` can show without fetching code: it is in memory, or the path has no page code of its own. */
export function isPageCodeReady(href: string): boolean {
  return pageAt(href)?.fetch.isDone ?? true
}

/**
 * Fetch the code of the page at `href` ahead of showing it. The promise settles once the code is in
 * memory. It never rejects: after a failed fetch, showing the page fetches again and reports the failure.
 */
export function preloadPageCode(href: string): Promise<void> {
  const page = pageAt(href)
  if (!page || page.fetch.isDone) return Promise.resolve()
  const { load, fetch } = page
  fetch.pending ??= load().then(
    () => {
      fetch.isDone = true
    },
    () => {
      fetch.pending = undefined
    },
  )
  return fetch.pending
}
