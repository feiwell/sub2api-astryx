import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  applyWheelZoom,
  DEFAULT_ZOOM,
  isZoomed,
  resetZoom,
  type ZoomState,
} from '@/features/channel-monitor-v2/monitorZoom'
import { wheelTurn } from './pulseAxis'

/**
 * Zoom along a time axis with the wheel: turning it narrows or widens the visible range around the pointer,
 * and turning it with Shift held, or sideways, moves the range. `ratioAt` says how far across the axis the
 * pointer is, from 0 to 1, or null when it is not over the axis and the wheel should scroll the page.
 *
 * `scope` names the axis. The zoom is dropped when the scope changes, since it was made on another axis.
 * Attach `hostRef` to the element the wheel is listened on.
 */
export function useAxisZoom(scope: string, ratioAt: (event: WheelEvent) => number | null) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [stored, setStored] = useState<{ scope: string; zoom: ZoomState }>(() => ({ scope, zoom: resetZoom() }))
  const zoom = stored.scope === scope ? stored.zoom : DEFAULT_ZOOM

  const latest = useRef({ scope, zoom, ratioAt })
  useLayoutEffect(() => {
    latest.current = { scope, zoom, ratioAt }
  }, [scope, zoom, ratioAt])

  useEffect(() => {
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      const current = latest.current
      const ratio = current.ratioAt(event)
      if (ratio == null) return
      const next = applyWheelZoom(current.zoom, wheelTurn(event), ratio)
      // At either end of its travel the wheel is given back to the page.
      if (next.span === current.zoom.span && next.offset === current.zoom.offset) return
      event.preventDefault()
      // Several turns can arrive before the next render; each builds on the one before.
      latest.current = { ...current, zoom: next }
      setStored({ scope: current.scope, zoom: next })
    }
    // React listens for the wheel passively, and a passive listener cannot keep the page from scrolling.
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [host])

  const reset = useCallback(() => setStored((prev) => ({ scope: prev.scope, zoom: resetZoom() })), [])

  return { zoom, isZoomed: isZoomed(zoom), resetZoom: reset, hostRef: setHost }
}
