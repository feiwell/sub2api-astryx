import { beforeEach, describe, expect, it, vi } from 'vitest'

const core = vi.hoisted(() => ({
  getLocale: vi.fn(() => 'zh'),
  loadLocaleMessages: vi.fn((_locale: string) => Promise.resolve()),
}))
vi.mock('./core', () => core)

describe('warm', () => {
  beforeEach(() => {
    vi.resetModules()
    core.loadLocaleMessages.mockClear()
  })

  it('asks for the catalog of the language in use', async () => {
    await import('./warm')

    expect(core.loadLocaleMessages).toHaveBeenCalledTimes(1)
    expect(core.loadLocaleMessages).toHaveBeenCalledWith('zh')
  })

  it('stays quiet when the catalog cannot be fetched', async () => {
    const rejections: unknown[] = []
    const note = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', note)
    core.loadLocaleMessages.mockImplementationOnce(() => Promise.reject(new Error('offline')))

    await import('./warm')
    // An unhandled rejection is reported a turn of the event loop later.
    await new Promise((resolve) => setTimeout(resolve, 0))

    process.off('unhandledRejection', note)
    expect(core.loadLocaleMessages).toHaveBeenCalledTimes(1)
    expect(rejections).toEqual([])
  })
})
