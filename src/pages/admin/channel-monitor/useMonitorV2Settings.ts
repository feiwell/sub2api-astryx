import { useEffect, useState } from 'react'
import { getConfig, updateConfig, type MonitorConfig } from '@/api/channelMonitorV2'
import type { AdminGroup } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { t } from '~/i18n'
import { getAllIncludingInactive } from '~/lib/api/admin/groups'
import { toast } from '~/lib/toast'
import { isSameConfig, normalConfig } from './monitorV2Settings'

// What the server answers a save with when the settings were saved by someone else in the meantime.
const CONFLICT_STATUS = 409

const statusOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined

/**
 * The settings of the monitor that reads channel health off real traffic, as the server holds them, and the
 * copy being edited. Kept by the page rather than by its tab, so unsaved edits survive a visit to the other
 * tab. Nothing is read before the tab is first opened, and nothing is sent until save().
 */
export function useMonitorV2Settings(isWanted: boolean) {
  // Both went through normalConfig, so they compare like for like; `saved` changes only when the server answers.
  const [saved, setSaved] = useState<MonitorConfig | null>(null)
  const [draft, setDraft] = useState<MonitorConfig | null>(null)
  // Every group, the switched-off ones too: the settings may still name one of those.
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [hasStarted, setStarted] = useState(isWanted)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [loadTick, setLoadTick] = useState(0)
  const [isSaving, setSaving] = useState(false)
  // What the server said when it refused a save because someone else saved first; only a reload gets past that.
  const [conflict, setConflict] = useState<string | null>(null)
  // Counts the times the draft was replaced as a whole (loaded, saved, reset), for what a field keeps of its
  // own, such as text it refused: that belonged to the draft that is gone.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (isWanted) setStarted(true)
  }, [isWanted])

  const adopt = (config: MonitorConfig) => {
    const normal = normalConfig(config)
    setSaved(normal)
    setDraft(normal)
    setRevision((value) => value + 1)
    setConflict(null)
  }

  // loadTick is not sent; it is here so a reload asks for the settings again.
  useEffect(() => {
    if (!hasStarted) return
    let isStale = false
    setLoading(true)
    setFailure(null)
    Promise.all([getConfig(), getAllIncludingInactive()])
      .then(([config, groupRows]) => {
        if (isStale) return
        // A reload replaces the draft: it is how an admin gets past a save someone else was first with.
        adopt(config)
        setGroups(groupRows || [])
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.error('[channel-monitor] failed to load the v2 settings', error)
        setFailure(extractApiErrorMessage(error, t('channelMonitorV2.settings.loadFailed')))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [hasStarted, loadTick])

  const save = () => {
    if (!draft || isSaving) return
    setSaving(true)
    updateConfig(normalConfig(draft))
      .then((answer) => {
        // The draft becomes what the server saved, which can differ: the server adjusts thresholds that
        // contradict each other.
        adopt(answer)
        toast.success(t('channelMonitorV2.settings.saveSuccess'))
      })
      .catch((error: unknown) => {
        console.error('[channel-monitor] failed to save the v2 settings', error)
        const message = extractApiErrorMessage(error, t('channelMonitorV2.settings.saveFailed'))
        // Told by a notice that stays on the page, with the way out; the edits are kept either way.
        if (statusOf(error) === CONFLICT_STATUS) setConflict(message)
        else toast.error(message)
      })
      .finally(() => setSaving(false))
  }

  return {
    draft,
    groups,
    isLoading,
    failure,
    isSaving,
    conflict,
    revision,
    isDirty: !isSameConfig(draft, saved),
    change: (edit: (config: MonitorConfig) => MonitorConfig) => setDraft((current) => current && edit(current)),
    reset: () => {
      if (!saved) return
      setDraft(saved)
      setRevision((value) => value + 1)
    },
    reload: () => setLoadTick((tick) => tick + 1),
    save,
  }
}

export type MonitorV2SettingsState = ReturnType<typeof useMonitorV2Settings>
