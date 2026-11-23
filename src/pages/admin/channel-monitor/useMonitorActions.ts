import { useState } from 'react'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { ChannelMonitor, CheckResult } from '~/lib/api/admin/channelMonitor'
import { toast } from '~/lib/toast'
import type { ChannelMonitors } from './useChannelMonitors'

const withId = (ids: ReadonlySet<number>, id: number): ReadonlySet<number> => new Set(ids).add(id)

function withoutId(ids: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(ids)
  next.delete(id)
  return next
}

/** What can be done to a monitor from its row, and which rows are busy with it. */
export function useMonitorActions(list: ChannelMonitors) {
  const { t } = useI18n()
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<number>>(() => new Set<number>())
  const [duplicatingIds, setDuplicatingIds] = useState<ReadonlySet<number>>(() => new Set<number>())
  // One check at a time: a check takes as long as the provider takes to answer.
  const [runningId, setRunningId] = useState<number | null>(null)
  const [runResults, setRunResults] = useState<CheckResult[] | null>(null)
  const [toDelete, setToDelete] = useState<ChannelMonitor | null>(null)
  const [isDeleting, setDeleting] = useState(false)

  const setEnabled = (monitor: ChannelMonitor, enabled: boolean) => {
    if (togglingIds.has(monitor.id)) return
    setTogglingIds((ids) => withId(ids, monitor.id))
    adminAPI.channelMonitor
      .update(monitor.id, { enabled })
      // The switch moves once the server has taken the change, not before.
      .then(() => list.patch(monitor.id, { enabled }))
      .catch((error) => {
        console.error('[channel-monitor] failed to switch a monitor', error)
        toast.error(extractApiErrorMessage(error, t('common.error')))
      })
      .finally(() => setTogglingIds((ids) => withoutId(ids, monitor.id)))
  }

  const runNow = (monitor: ChannelMonitor) => {
    if (runningId !== null) return
    setRunningId(monitor.id)
    adminAPI.channelMonitor
      .runNow(monitor.id)
      .then((answer) => {
        setRunResults(answer.results || [])
        toast.success(t('admin.channelMonitor.runSuccess'))
        // The check has changed the status, the latency and the availability of the row.
        list.reload()
      })
      .catch((error) => {
        console.error('[channel-monitor] failed to run a check', error)
        toast.error(extractApiErrorMessage(error, t('admin.channelMonitor.runFailed')))
      })
      .finally(() => setRunningId(null))
  }

  const duplicate = (monitor: ChannelMonitor) => {
    if (duplicatingIds.has(monitor.id)) return
    setDuplicatingIds((ids) => withId(ids, monitor.id))
    adminAPI.channelMonitor
      .duplicate(monitor.id)
      .then((copy) => {
        toast.success(t('admin.channelMonitor.duplicateSuccess', { name: copy.name }))
        list.reload()
      })
      .catch((error) => {
        console.error('[channel-monitor] failed to duplicate a monitor', error)
        toast.error(extractApiErrorMessage(error, t('admin.channelMonitor.duplicateFailed')))
      })
      .finally(() => setDuplicatingIds((ids) => withoutId(ids, monitor.id)))
  }

  const confirmDelete = () => {
    if (!toDelete) return
    setDeleting(true)
    adminAPI.channelMonitor
      .del(toDelete.id)
      .then(() => {
        toast.success(t('admin.channelMonitor.deleteSuccess'))
        list.reload()
      })
      .catch((error) => {
        console.error('[channel-monitor] failed to delete a monitor', error)
        toast.error(extractApiErrorMessage(error, t('common.error')))
      })
      .finally(() => {
        setDeleting(false)
        setToDelete(null)
      })
  }

  return {
    togglingIds,
    setEnabled,
    runningId,
    runNow,
    /** The results of the check run last, until they are dismissed. */
    runResults,
    dismissRunResults: () => setRunResults(null),
    duplicatingIds,
    duplicate,
    /** The monitor waiting for its deletion to be confirmed. */
    toDelete,
    askToDelete: setToDelete,
    isDeleting,
    confirmDelete,
    cancelDelete: () => {
      if (!isDeleting) setToDelete(null)
    },
  }
}

export type MonitorActions = ReturnType<typeof useMonitorActions>
