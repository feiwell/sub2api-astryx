import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '~/stores/auth'
import { pageUrl } from './pageAssets'

export type MarkdownPage =
  | { status: 'loading' }
  | { status: 'ready'; source: string }
  | { status: 'missing' }
  | { status: 'failed' }

const LOADING: MarkdownPage = { status: 'loading' }

/**
 * Reads one markdown page. The endpoint answers with the raw file instead of the usual JSON
 * envelope, so this goes around the API client and sends the login token itself.
 */
export function useMarkdownPage(slug: string): { page: MarkdownPage; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<{ key: string; page: MarkdownPage } | null>(null)
  const key = `${attempt}:${slug}`

  useEffect(() => {
    const controller = new AbortController()
    const token = useAuthStore.getState().token
    fetch(pageUrl(slug), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then(async (response): Promise<MarkdownPage> => {
        if (response.status === 404) return { status: 'missing' }
        if (!response.ok) return { status: 'failed' }
        return { status: 'ready', source: await response.text() }
      })
      .catch((): MarkdownPage => ({ status: 'failed' }))
      .then((page) => {
        // An answer for a page the reader has already left must not replace the current one.
        if (!controller.signal.aborted) setAnswer({ key, page })
      })
    return () => controller.abort()
  }, [slug, key])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  return { page: answer?.key === key ? answer.page : LOADING, reload }
}
