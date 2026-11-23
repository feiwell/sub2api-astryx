import { useEffect, useRef, useState } from 'react'
import type {
  PromptAuditConfig,
  PromptAuditDraft,
  PromptAuditEndpointDraft,
  PromptProbeResult,
} from '@/features/prompt-audit/types'
import { cloneData, configToDraft, draftFingerprint } from '@/features/prompt-audit/viewModel'
import { extractApiErrorCode } from '@/utils/apiError'
import { t } from '~/i18n'
import { toast } from '~/lib/toast'
import { getConfig, probeEndpoint, updateConfig } from './api'
import { auditErrorMessage } from './eventText'

const CONFLICT = 'prompt_audit_config_conflict'

/**
 * The guard's configuration as the server holds it, and the draft being edited from it. Kept by
 * the page rather than by the configuration tab, so unsaved edits survive a visit to the other tab.
 * Editing changes the draft only: nothing is sent until save(). Probing a node does call the
 * server, with the node as drafted, and changes nothing there.
 */
export function useAuditConfig() {
  // Both are drafts, so they compare like for like; `saved` changes only when the server answers.
  const [saved, setSaved] = useState<PromptAuditDraft | null>(null)
  const [draft, setDraft] = useState<PromptAuditDraft | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [loadTick, setLoadTick] = useState(0)
  const [isSaving, setSaving] = useState(false)
  // The last save was refused because someone else saved first; only a reload gets past that.
  const [hasConflict, setConflict] = useState(false)
  // Counts the saves that went through, for what has to follow one (the runtime figures).
  const [savedTick, setSavedTick] = useState(0)
  // Counts the times the draft was replaced as a whole (loaded, saved, reset), for what a field
  // keeps of its own, such as text it refused: that belonged to the draft that is gone.
  const [draftRevision, setDraftRevision] = useState(0)
  const [probeResults, setProbeResults] = useState<Record<string, PromptProbeResult>>({})
  const [probingIds, setProbingIds] = useState<ReadonlySet<string>>(() => new Set())
  // Per node id, bumped when the node is probed or changed: an answer to an earlier state is dropped.
  const probeRuns = useRef<Record<string, number>>({})

  const adopt = (config: PromptAuditConfig) => {
    setSaved(configToDraft(config))
    setDraft(configToDraft(config))
    setDraftRevision((revision) => revision + 1)
    setConflict(false)
  }

  const stopProbing = (id: string) =>
    setProbingIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })

  const forgetResult = (id: string) =>
    setProbeResults((current) => {
      if (!(id in current)) return current
      const { [id]: _dropped, ...rest } = current
      return rest
    })

  /** A result says how the node answered as it was then: once the node changes, it says nothing. */
  const forgetProbe = (id: string) => {
    probeRuns.current[id] = (probeRuns.current[id] ?? 0) + 1
    forgetResult(id)
    stopProbing(id)
  }

  const forgetAllProbes = () => {
    for (const id of Object.keys(probeRuns.current)) probeRuns.current[id] += 1
    setProbeResults({})
    setProbingIds(new Set())
  }

  // loadTick is not sent; it is here so a retry or a reload asks for the configuration again.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    getConfig()
      .then((answer) => {
        if (isStale) return
        // A reload replaces the draft: it is how an admin gets past a save someone else was first with.
        adopt(answer)
        forgetAllProbes()
      })
      .catch((error) => {
        if (isStale) return
        console.error('[prompt-audit] failed to load config', error)
        setFailure(auditErrorMessage(error, 'admin.promptAudit.errors.loadConfig'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [loadTick])

  const edit = (change: (current: PromptAuditDraft) => PromptAuditDraft) =>
    setDraft((current) => current && change(current))

  const editEndpoints = (change: (endpoints: PromptAuditEndpointDraft[]) => PromptAuditEndpointDraft[]) =>
    edit((current) => ({ ...current, endpoints: change(current.endpoints) }))

  const save = () => {
    if (!draft || isSaving) return
    setSaving(true)
    updateConfig(draft)
      .then((answer) => {
        // The draft becomes what the server saved, and with that the keys typed for this save are gone.
        adopt(answer)
        setSavedTick((tick) => tick + 1)
        toast.success(t('admin.promptAudit.messages.saved'))
      })
      .catch((error) => {
        console.error('[prompt-audit] failed to save config', error)
        if (extractApiErrorCode(error) === CONFLICT) {
          // Told by a notice that stays next to the save button, with the way out; a toast would only repeat it.
          setConflict(true)
          return
        }
        toast.error(auditErrorMessage(error, 'admin.promptAudit.errors.saveConfig'))
      })
      .finally(() => setSaving(false))
  }

  const probe = (endpoint: PromptAuditEndpointDraft) => {
    const { id } = endpoint
    if (probingIds.has(id)) return
    const run = (probeRuns.current[id] ?? 0) + 1
    probeRuns.current[id] = run
    const isCurrent = () => probeRuns.current[id] === run
    forgetResult(id)
    setProbingIds((current) => new Set(current).add(id))
    probeEndpoint(endpoint)
      .then((result) => {
        if (!isCurrent()) return
        setProbeResults((current) => ({ ...current, [id]: result }))
        if (result.ok) toast.success(t('admin.promptAudit.messages.probeSucceeded'))
        else toast.error(`${result.error_code || result.status}: ${result.message}`)
      })
      .catch((error) => {
        console.error('[prompt-audit] failed to probe endpoint', error)
        if (isCurrent()) toast.error(auditErrorMessage(error, 'admin.promptAudit.errors.probe'))
      })
      .finally(() => {
        if (isCurrent()) stopProbing(id)
      })
  }

  return {
    saved,
    draft,
    isLoading,
    failure,
    reload: () => setLoadTick((tick) => tick + 1),
    isDirty: draftFingerprint(draft) !== draftFingerprint(saved),
    isSaving,
    hasConflict,
    savedTick,
    draftRevision,
    change: (patch: Partial<PromptAuditDraft>) => edit((current) => ({ ...current, ...patch })),
    /** Blocking cannot outlive the audit it belongs to: switching the audit off switches it off too. */
    setEnabled: (enabled: boolean) =>
      edit((current) => ({ ...current, enabled, blocking_enabled: enabled && current.blocking_enabled })),
    // Nodes go by their place in the list: nothing but the server stops two of them from sharing an id.
    addEndpoint: (endpoint: PromptAuditEndpointDraft) => editEndpoints((list) => [...list, endpoint]),
    replaceEndpoint: (index: number, endpoint: PromptAuditEndpointDraft) => {
      if (draft?.endpoints[index]) forgetProbe(draft.endpoints[index].id)
      editEndpoints((list) => list.map((item, at) => (at === index ? endpoint : item)))
    },
    /** In or out of the pool; the node itself is the same, so what a probe said of it still holds. */
    toggleEndpoint: (index: number, enabled: boolean) =>
      editEndpoints((list) => list.map((item, at) => (at === index ? { ...item, enabled } : item))),
    removeEndpoint: (index: number) => {
      if (draft?.endpoints[index]) forgetProbe(draft.endpoints[index].id)
      editEndpoints((list) => list.filter((_, at) => at !== index))
    },
    reset: () => {
      if (!saved) return
      setDraft(cloneData(saved))
      setDraftRevision((revision) => revision + 1)
      forgetAllProbes()
    },
    save,
    probeResults,
    probingIds,
    probe,
  }
}

export type AuditConfig = ReturnType<typeof useAuditConfig>
