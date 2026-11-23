import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pollWhileVisible } from './visiblePolling'

/** Puts the tab in the background or brings it back, the way the browser reports it. */
function setHidden(isHidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('pollWhileVisible', () => {
  let stop: () => void = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    stop()
    delete (document as { hidden?: boolean }).hidden
    vi.useRealTimers()
  })

  it('asks every interval while the page is on show', () => {
    const ask = vi.fn()
    stop = pollWhileVisible(ask, 1000)

    expect(ask).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(ask).toHaveBeenCalledTimes(3)
  })

  it('asks for nothing while the tab is in the background', () => {
    const ask = vi.fn()
    stop = pollWhileVisible(ask, 1000)

    setHidden(true)
    vi.advanceTimersByTime(60_000)
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks once, right away, when the tab is looked at again after missing a turn', () => {
    const ask = vi.fn()
    stop = pollWhileVisible(ask, 1000)

    setHidden(true)
    vi.advanceTimersByTime(5500)
    setHidden(false)
    expect(ask).toHaveBeenCalledTimes(1)

    // Back on show, the interval carries on as before.
    vi.advanceTimersByTime(500)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('does not ask on return when no turn was missed', () => {
    const ask = vi.fn()
    stop = pollWhileVisible(ask, 1000)

    vi.advanceTimersByTime(1000)
    setHidden(true)
    vi.advanceTimersByTime(400)
    setHidden(false)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('neither asks nor listens once stopped', () => {
    const ask = vi.fn()
    stop = pollWhileVisible(ask, 1000)

    setHidden(true)
    vi.advanceTimersByTime(2000)
    stop()
    setHidden(false)
    vi.advanceTimersByTime(5000)
    expect(ask).not.toHaveBeenCalled()
  })
})
