import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'

/**
 * A thin bar at the top of the viewport while a page is being brought in.
 *
 * Pages are prefetched, so most navigations finish in a frame or two and the
 * bar is all the user sees of the transition — which is the point: without it a
 * slow first visit looks like a dead click.
 */
export function RouteProgress() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 420)
    return () => window.clearTimeout(timer)
  }, [pathname])

  return <div className="route-progress" data-active={visible || undefined} aria-hidden="true" />
}
