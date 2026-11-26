import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateNotice } from './useUpdateNotice'
import { checkUpdates } from '~/lib/api/admin/system'

vi.mock('~/lib/api/admin/system', () => ({ checkUpdates: vi.fn() }))
vi.mock('~/lib/visiblePolling', () => ({
  pollWhileVisible: (check: () => void) => {
    window.addEventListener('test-update-poll', check)
    return () => window.removeEventListener('test-update-poll', check)
  },
}))
const version = (current_version: string, has_update = false) => ({
  current_version, has_update, latest_version: current_version, cached: false, build_type: 'release',
})
beforeEach(() => {
  document.head.insertAdjacentHTML('beforeend', '<meta name="frontend-build-id" content="old">')
  vi.mocked(checkUpdates).mockResolvedValue(version('1'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<meta name="frontend-build-id" content="old">' }))
})
afterEach(() => {
  document.querySelector('meta[name="frontend-build-id"]')?.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
describe('useUpdateNotice', () => {
  it('detects a new frontend build and an available backend update', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: async () => '<meta name="frontend-build-id" content="new">' } as Response)
    vi.mocked(checkUpdates).mockResolvedValue(version('1', true))
    const { result } = renderHook(() => useUpdateNotice(true))
    await waitFor(() => expect(result.current).toEqual({ frontendUpdate: true, backendUpdate: true }))
  })
  it('detects a backend version change during the session', async () => {
    const { result } = renderHook(() => useUpdateNotice(true))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    vi.mocked(checkUpdates).mockResolvedValue(version('2'))
    act(() => window.dispatchEvent(new Event('test-update-poll')))
    await waitFor(() => expect(result.current.backendUpdate).toBe(true))
  })
  it('only polls admins and clears notices when admin access is removed', async () => {
    vi.mocked(checkUpdates).mockResolvedValue(version('1', true))
    const { result, rerender } = renderHook(({ admin }) => useUpdateNotice(admin), { initialProps: { admin: false } })
    expect(checkUpdates).not.toHaveBeenCalled()
    rerender({ admin: true })
    await waitFor(() => expect(result.current.backendUpdate).toBe(true))
    rerender({ admin: false })
    expect(result.current).toEqual({ frontendUpdate: false, backendUpdate: false })
  })
  it('recovers after requests fail', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    vi.mocked(checkUpdates).mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useUpdateNotice(true))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    vi.mocked(checkUpdates).mockResolvedValue(version('1', true))
    act(() => window.dispatchEvent(new Event('test-update-poll')))
    await waitFor(() => expect(result.current.backendUpdate).toBe(true))
  })
})
