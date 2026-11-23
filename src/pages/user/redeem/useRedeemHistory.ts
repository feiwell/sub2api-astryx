import { useCallback, useEffect, useRef, useState } from 'react'
import { redeemAPI } from '@/api'
import { extractApiErrorMessage } from '@/utils/apiError'
import {
  FIRST_PAGE,
  PAGE_SIZES,
  basePosition,
  isSamePosition,
  readHistoryPage,
  type HistoryPage,
  type Position,
} from './redeemModel'

/** A load that failed. Each failure is an object of its own, also when it reads like the one before it. */
export interface HistoryFailure {
  /** What the server said, empty when it said nothing. */
  reason: string
  /** Whether the user asked for the load: turned a page, changed the size of the pages, or asked again. */
  isAsked: boolean
}

/**
 * The codes the user has used and the changes administrators made, a page at a time. The page on screen
 * stays while another one loads, and stays as it is when the other one fails.
 */
export function useRedeemHistory() {
  const [shown, setShown] = useState<HistoryPage | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [failure, setFailure] = useState<HistoryFailure | null>(null)
  // Counts the requests: an answer that is no longer to the newest one is dropped, good or bad.
  const newest = useRef(0)
  const inFlight = useRef<Position | null>(null)
  const failed = useRef<Position | null>(null)

  const load = useCallback((position: Position, isAsked: boolean) => {
    const id = ++newest.current
    inFlight.current = position
    setLoading(true)
    redeemAPI.getHistory(position.page, position.pageSize).then(
      (answer) => {
        if (id !== newest.current) return
        inFlight.current = null
        failed.current = null
        setShown(readHistoryPage(answer, position))
        setFailure(null)
        setLoading(false)
      },
      (error: unknown) => {
        if (id !== newest.current) return
        console.error('[redeem] failed to load the history', error)
        inFlight.current = null
        failed.current = position
        setFailure({ reason: extractApiErrorMessage(error, ''), isAsked })
        setLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    load(FIRST_PAGE, false)
    return () => {
      // Nothing that is still on its way is shown once the page is left.
      newest.current += 1
    }
  }, [load])

  const base = () => basePosition(inFlight.current, shown)
  const ask = (position: Position) => {
    // The size picker reports the new size and then the first page; the second report asks nothing new.
    if (inFlight.current && isSamePosition(inFlight.current, position)) return
    load(position, true)
  }

  return {
    items: shown?.items ?? [],
    total: shown?.total ?? 0,
    page: shown?.page ?? FIRST_PAGE.page,
    pageSize: shown?.pageSize ?? FIRST_PAGE.pageSize,
    pageSizeOptions: PAGE_SIZES,
    /** Whether a page has been loaded at all: until then nothing is known about the history. */
    hasLoaded: shown !== null,
    isLoading,
    /** The last load, when it failed; null once a load has gone well. */
    failure,
    goToPage: (page: number) => ask({ page, pageSize: base().pageSize }),
    changePageSize: (pageSize: number) => ask({ page: 1, pageSize }),
    /** Ask again: for what is on its way, else for what could not be loaded, else for the page on screen. */
    reload: () => load(inFlight.current ?? failed.current ?? base(), true),
    /** Show the newest lines, after a code was redeemed. */
    showNewest: () => load({ page: 1, pageSize: base().pageSize }, false),
  }
}

export type RedeemHistory = ReturnType<typeof useRedeemHistory>
