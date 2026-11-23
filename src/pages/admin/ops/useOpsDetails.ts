import { useCallback, useRef, useState } from 'react'
import type { OpsRequestDetailsKind, OpsRequestDetailsSort } from '~/lib/api/admin/ops'
import type { OpsErrorKind } from './errorLog'

/** What a "details" button asks the request list for. */
export interface OpsRequestsPreset {
  title: string
  kind?: OpsRequestDetailsKind
  sort?: OpsRequestDetailsSort
}

export type OpsDetailsList =
  | { type: 'requests'; preset: OpsRequestsPreset }
  | { type: 'errors'; errorKind: OpsErrorKind }

export interface OpsDetailsState {
  /**
   * The list that is open, with a number that changes on every opening. It stays here while one of
   * its errors is on show, so going back finds the list as it was left.
   */
  list: (OpsDetailsList & { opening: number }) | null
  /** The error on show; the list behind it is hidden meanwhile. */
  error: { id: number; kind: OpsErrorKind } | null
}

export interface OpsDetails {
  state: OpsDetailsState
  openRequests: (preset: OpsRequestsPreset) => void
  openErrors: (errorKind: OpsErrorKind) => void
  openError: (id: number, kind: OpsErrorKind) => void
  backToList: () => void
  close: () => void
}

const CLOSED: OpsDetailsState = { list: null, error: null }

/** Which detail dialog of the ops page is open. Only one shows at a time: a list, or one error of that list. */
export function useOpsDetails(): OpsDetails {
  const [state, setState] = useState(CLOSED)
  const openings = useRef(0)

  const openList = useCallback((list: OpsDetailsList) => {
    openings.current += 1
    setState({ list: { ...list, opening: openings.current }, error: null })
  }, [])
  const openRequests = useCallback((preset: OpsRequestsPreset) => openList({ type: 'requests', preset }), [openList])
  const openErrors = useCallback((errorKind: OpsErrorKind) => openList({ type: 'errors', errorKind }), [openList])
  const openError = useCallback(
    (id: number, kind: OpsErrorKind) => setState((current) => ({ ...current, error: { id, kind } })),
    [],
  )
  const backToList = useCallback(() => setState((current) => ({ ...current, error: null })), [])
  const close = useCallback(() => setState(CLOSED), [])

  return { state, openRequests, openErrors, openError, backToList, close }
}
