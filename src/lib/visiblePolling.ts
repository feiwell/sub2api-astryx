/**
 * Calls `ask` every `ms`, but only while the page is on show. A tab in the background asks for nothing; when it
 * is looked at again, what it missed is asked for once, right away.
 *
 * Not for something the viewer is waiting on while away from the tab, such as a payment going through.
 *
 * @returns the function that stops it.
 */
export function pollWhileVisible(ask: () => void, ms: number): () => void {
  let wasMissed = false
  const timer = window.setInterval(() => {
    if (document.hidden) wasMissed = true
    else ask()
  }, ms)
  const onVisibilityChange = () => {
    if (document.hidden || !wasMissed) return
    wasMissed = false
    ask()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
