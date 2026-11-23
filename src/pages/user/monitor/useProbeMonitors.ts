import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { list, status, type UserMonitorDetail, type UserMonitorView } from '@/api/channelMonitor'
import { isCanceled } from './useChannelStatus'

/** The detail of a monitor, and which fetch of the monitors it goes with. */
interface KeptDetail {
  detail: UserMonitorDetail
  version: number
}

/**
 * The monitors whose detail could not be fetched after one fetch of the monitors, and why. It counts for that
 * fetch only: after the next one the details are asked for again.
 */
interface DetailFailure {
  version: number
  ids: readonly number[]
  reason: unknown
}

const NO_IDS: ReadonlySet<number> = new Set()

export interface ProbeMonitors {
  items: UserMonitorView[]
  /** The details that were fetched, by the id of their monitor. They may be from before the last refresh. */
  details: Readonly<Record<number, UserMonitorDetail>>
  /** The monitors whose detail is on its way. */
  pendingDetails: ReadonlySet<number>
  /** Nothing has been answered yet: neither monitors nor a failure. */
  isLoading: boolean
  /** The monitors are being fetched; the ones on screen may be the previous ones. */
  isRefreshing: boolean
  /** The monitors have arrived at least once. */
  hasLoaded: boolean
  /** Why the monitors could not be fetched. Cleared by a fetch that works. */
  loadError: unknown
  /** Why the detail of some monitor could not be fetched; null while the details are not wanted. */
  detailError: unknown
  /** Goes up each time a fetch of the monitors ends, however it ends. */
  loadCount: number
  /** Whether a fetch of the monitors is under way, for a timer to read. */
  isBusy: RefObject<boolean>
  reload: () => void
}

/**
 * The monitors the viewer may see, kept current, with the detail of each while `wantsDetails`: the list
 * carries availability over seven days only, and the longer windows are in the details. The details are
 * fetched anew after each fetch of the list, so a card does not show the two from different moments. What is
 * on screen stays while newer data is on its way, and stays when fetching fails.
 *
 * A detail that could not be fetched is not asked for again until the list is: `reload` tries both.
 */
export function useProbeMonitors(wantsDetails: boolean): ProbeMonitors {
  const [items, setItems] = useState<UserMonitorView[]>([])
  const [listVersion, setListVersion] = useState(0)
  const [kept, setKept] = useState<Record<number, KeptDetail>>({})
  const [failure, setFailure] = useState<DetailFailure | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [loadCount, setLoadCount] = useState(0)
  const [refreshCount, setRefreshCount] = useState(0)
  const isBusy = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true
    isBusy.current = true
    setIsRefreshing(true)
    list({ signal: controller.signal })
      .then((answer) => {
        if (!isCurrent) return
        setItems(answer.items || [])
        setListVersion((version) => version + 1)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (isCurrent && !isCanceled(error)) setLoadError(error)
      })
      .finally(() => {
        if (!isCurrent) return
        isBusy.current = false
        setIsRefreshing(false)
        setIsLoading(false)
        setLoadCount((count) => count + 1)
      })
    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [refreshCount])

  // Worked out while drawing, not when the fetch below starts: a card then shows that its figure is on its
  // way from the moment the viewer asks for a longer window.
  const pendingDetails = useMemo<ReadonlySet<number>>(() => {
    if (!wantsDetails || listVersion === 0) return NO_IDS
    const failedIds = failure?.version === listVersion ? failure.ids : []
    const pending = items
      .filter((item) => kept[item.id]?.version !== listVersion && !failedIds.includes(item.id))
      .map((item) => item.id)
    return pending.length > 0 ? new Set(pending) : NO_IDS
  }, [wantsDetails, listVersion, items, kept, failure])
  const pendingRef = useRef(pendingDetails)
  useEffect(() => {
    pendingRef.current = pendingDetails
  }, [pendingDetails])

  useEffect(() => {
    if (!wantsDetails || listVersion === 0) return
    const wanted = [...pendingRef.current]
    if (wanted.length === 0) return
    let isCurrent = true
    // Each detail shows as soon as it is here: a slow monitor does not hold back the cards of the others.
    for (const id of wanted) {
      status(id).then(
        (detail) => {
          if (isCurrent) setKept((previous) => ({ ...previous, [id]: { detail, version: listVersion } }))
        },
        (reason: unknown) => {
          if (!isCurrent) return
          setFailure((previous) =>
            previous?.version === listVersion
              ? // One reason stands for all: the details fail together far more often than one by one.
                { ...previous, ids: [...previous.ids, id] }
              : { version: listVersion, ids: [id], reason },
          )
        },
      )
    }
    return () => {
      isCurrent = false
    }
  }, [wantsDetails, listVersion])

  const details = useMemo(() => {
    const byId: Record<number, UserMonitorDetail> = {}
    for (const [id, entry] of Object.entries(kept)) byId[Number(id)] = entry.detail
    return byId
  }, [kept])

  const reload = useCallback(() => setRefreshCount((count) => count + 1), [])

  return {
    items,
    details,
    pendingDetails,
    isLoading,
    isRefreshing,
    hasLoaded: listVersion > 0,
    loadError,
    detailError: wantsDetails && failure?.version === listVersion ? (failure.reason ?? new Error('detail')) : null,
    loadCount,
    isBusy,
    reload,
  }
}
