import { useEffect, useRef, useState } from 'react'

/**
 * Something that is only loaded while it is looked at, such as a list under a tab. `version` says what would be
 * asked for, written out as text; `load` asks for it.
 *
 * Coming back loads nothing when what is on show is still that version. What went out of date while it was not
 * looked at is dropped at once and loaded on the way back; so is an answer `isKept` turns down, such as a list
 * without rows. A failed load leaves the last good answer on show.
 */
export function useLoadWhileShown<Answer>({
  isActive,
  version,
  load,
  isKept,
  onLoaded,
}: {
  isActive: boolean
  version: string
  load: () => Promise<Answer>
  isKept: (answer: Answer) => boolean
  /** Told the answer of a load that is still wanted, before it shows. */
  onLoaded?: (answer: Answer) => void
}) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  // True from the start: the first look shows it loading, not empty.
  const [isLoading, setLoading] = useState(true)
  const [hasFailed, setFailed] = useState(false)
  // The callbacks are new on every render; only a change of version, or of being looked at, asks again.
  const latest = useRef({ load, isKept, onLoaded })
  latest.current = { load, isKept, onLoaded }
  // The version of the answer on show; null when there is none worth keeping.
  const shownVersion = useRef<string | null>(null)

  useEffect(() => {
    if (shownVersion.current === version) {
      // A load of another version may have been dropped half way, or have failed; what shows is what is asked for.
      setLoading(false)
      setFailed(false)
      return
    }
    if (!isActive) {
      shownVersion.current = null
      setAnswer(null)
      setFailed(false)
      // Loading already, so the way back does not open on an empty list.
      setLoading(true)
      return
    }
    let isStale = false
    setLoading(true)
    setFailed(false)
    latest.current
      .load()
      .then((next) => {
        if (isStale) return
        shownVersion.current = latest.current.isKept(next) ? version : null
        latest.current.onLoaded?.(next)
        setAnswer(next)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[usage] failed to load a list', error)
        setFailed(true)
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [isActive, version])

  return { answer, isLoading, hasFailed }
}
