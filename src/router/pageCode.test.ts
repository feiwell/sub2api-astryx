import { beforeEach, describe, expect, it, vi } from 'vitest'

type PageCode = typeof import('./pageCode')

describe('pageCode', () => {
  let pageCode: PageCode

  // The registry lives in the module, so every test imports a fresh one.
  beforeEach(async () => {
    vi.resetModules()
    pageCode = await import('./pageCode')
  })

  it('treats a path with no page code of its own as ready', async () => {
    expect(pageCode.isPageCodeReady('/nowhere')).toBe(true)
    await expect(pageCode.preloadPageCode('/nowhere')).resolves.toBeUndefined()
  })

  it('fetches the code of a page once, and knows when it is in memory', async () => {
    const load = vi.fn(() => Promise.resolve({}))
    pageCode.registerPageCode('/keys', load)
    expect(pageCode.isPageCodeReady('/keys')).toBe(false)

    await pageCode.preloadPageCode('/keys')
    expect(pageCode.isPageCodeReady('/keys')).toBe(true)

    await pageCode.preloadPageCode('/keys')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shares one fetch between callers that ask while it is on the way', async () => {
    let arrive!: (code: unknown) => void
    const load = vi.fn(() => new Promise<unknown>((resolve) => (arrive = resolve)))
    pageCode.registerPageCode('/usage', load)

    const first = pageCode.preloadPageCode('/usage')
    const second = pageCode.preloadPageCode('/usage')
    expect(load).toHaveBeenCalledTimes(1)
    expect(pageCode.isPageCodeReady('/usage')).toBe(false)

    arrive({})
    await Promise.all([first, second])
    expect(pageCode.isPageCodeReady('/usage')).toBe(true)
  })

  it('finds the page whatever the query and the hash of the link', async () => {
    const load = vi.fn(() => Promise.resolve({}))
    pageCode.registerPageCode('/orders', load)
    expect(pageCode.isPageCodeReady('/orders?status=paid#latest')).toBe(false)

    await pageCode.preloadPageCode('/orders?status=paid#latest')
    expect(load).toHaveBeenCalledTimes(1)
    expect(pageCode.isPageCodeReady('/orders')).toBe(true)
  })

  it('matches route patterns, and only whole paths', async () => {
    const load = vi.fn(() => Promise.resolve({}))
    pageCode.registerPageCode('/custom/:id', load)
    expect(pageCode.isPageCodeReady('/custom/42')).toBe(false)
    expect(pageCode.isPageCodeReady('/custom/42/edit')).toBe(true)

    await pageCode.preloadPageCode('/custom/42')
    expect(pageCode.isPageCodeReady('/custom/7')).toBe(true)
  })

  it('counts a page as in memory for every route that shows it', async () => {
    const load = vi.fn(() => Promise.resolve({}))
    pageCode.registerPageCode('/admin/channels', load)
    pageCode.registerPageCode('/admin/channels/pricing', load)

    await pageCode.preloadPageCode('/admin/channels')
    expect(pageCode.isPageCodeReady('/admin/channels/pricing')).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('settles without rejecting when the fetch fails, and fetches again the next time', async () => {
    const load = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({})
    pageCode.registerPageCode('/monitor', load)

    await expect(pageCode.preloadPageCode('/monitor')).resolves.toBeUndefined()
    expect(pageCode.isPageCodeReady('/monitor')).toBe(false)

    await pageCode.preloadPageCode('/monitor')
    expect(load).toHaveBeenCalledTimes(2)
    expect(pageCode.isPageCodeReady('/monitor')).toBe(true)
  })
})
