import { useEffect, useRef, useState } from 'react'
import type { UsageCleanupTask } from '@/api/admin/usage'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { pollWhileVisible } from '~/lib/visiblePolling'

export const CLEANUP_TASKS_PER_PAGE = 5
const POLL_MS = 10_000

/**
 * The cleanup tasks, newest first, a few at a time. A task takes a while to run, so the page on show is asked
 * for again every ten seconds for as long as the list is looked at.
 */
export function useCleanupTasks() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const [tasks, setTasks] = useState<UsageCleanupTask[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  const [hasFailed, setFailed] = useState(false)
  // Not sent; counting it up asks for the page on show again.
  const [reloadTick, setReloadTick] = useState(0)
  // Only the answer of the request made last is shown: a slow one must not undo a newer one.
  const lastRequest = useRef(0)
  const translate = useRef(t)
  translate.current = t

  useEffect(() => {
    const load = (isPoll: boolean) => {
      const request = ++lastRequest.current
      if (!isPoll) setLoading(true)
      adminAPI.usage
        .listCleanupTasks({ page, page_size: CLEANUP_TASKS_PER_PAGE })
        .then((answer) => {
          if (request !== lastRequest.current) return
          setTasks(answer.items || [])
          setTotal(answer.total || 0)
          setFailed(false)
        })
        .catch((error) => {
          if (request !== lastRequest.current) return
          console.error('[admin-usage] failed to load the cleanup tasks', error)
          // A poll that fails says nothing: the list on show stays, and the next poll asks again.
          if (isPoll) return
          setFailed(true)
          toast.error(translate.current('admin.usage.cleanup.loadFailed'))
        })
        .finally(() => {
          if (request === lastRequest.current) setLoading(false)
        })
    }
    load(false)
    const stopPolling = pollWhileVisible(() => load(true), POLL_MS)
    return () => {
      stopPolling()
      // Whatever is still on its way is no longer wanted.
      lastRequest.current++
    }
  }, [page, reloadTick])

  return {
    tasks,
    total,
    page,
    setPage,
    isLoading,
    /** The tasks could not be asked for; the ones of the last good answer, if any, are still listed. */
    hasFailed,
    /** Ask for the tasks again, from `toPage` when given: a task just created is on the first page. */
    reload: (toPage?: number) => {
      if (toPage != null) setPage(toPage)
      setReloadTick((tick) => tick + 1)
    },
  }
}

export type CleanupTasks = ReturnType<typeof useCleanupTasks>
