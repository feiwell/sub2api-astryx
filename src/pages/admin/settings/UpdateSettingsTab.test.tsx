import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateSettingsTab } from './UpdateSettingsTab'

const language = vi.hoisted(() => ({ locale: 'en' }))
const api = vi.hoisted(() => ({ status: vi.fn(), apply: vi.fn(), checkUpdates: vi.fn() }))
vi.mock('~/lib/api/admin/uiUpdate', () => ({ uiUpdateAPI: api }))
vi.mock('~/lib/api/admin/system', () => ({ systemAPI: api }))
vi.mock('~/i18n', () => {
  const t = (key: string) => key
  return { useI18n: () => ({ t, locale: language.locale }) }
})
vi.mock('~/lib/toast', async () => ({ toast: (await import('~/test/mocks')).mockToast }))

const idle = { state: 'idle', step: '', log: '', started_at: null, finished_at: null, sha: null }
const status = { current_sha: 'old', latest_sha: 'new', has_update: true, built_at: null,
  dist_index_sha: null, unreachable: false, job: idle }

beforeEach(() => {
  language.locale = 'en'
  api.status.mockReset().mockResolvedValue(status)
  api.apply.mockReset()
  api.checkUpdates.mockReset().mockResolvedValue({ current_version: '1', latest_version: '1' })
})
afterEach(() => vi.useRealTimers())

describe('frontend update panel', () => {
  it.each(['en', 'zh'])('shows release notes in %s and toggles them separately', async (locale) => {
    language.locale = locale
    api.status.mockResolvedValue({ ...status, release_notes: {
      sha: 'a'.repeat(40), state: 'available', releases: [{ date: '2026-11-28',
        title: { en: 'Frontend improvements', zh: '前端改进' },
        changes: { en: ['Online frontend updates', '<script>alert(1)</script>'], zh: ['前端在线更新'] },
      }],
    } })
    render(<UpdateSettingsTab />)
    const title = locale === 'en' ? 'Frontend improvements' : '前端改进'
    expect(await screen.findByText(title)).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(locale === 'en' ? 2 : 1)
    if (locale === 'en') {
      expect(screen.getByText('• <script>alert(1)</script>')).toBeVisible()
      expect(document.querySelector('script')).toBeNull()
    }
    const toggle = screen.getByRole('button', { name: 'admin.settings.update.hideNotes' })
    fireEvent.click(toggle)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByText(title)).toBeVisible()
  })

  it.each(['missing', 'unavailable', undefined])('handles %s notes while allowing updates', async (state) => {
    api.status.mockResolvedValue({ ...status, release_notes: state ? { sha: 'new', state, releases: [] } : undefined })
    render(<UpdateSettingsTab />)
    expect(await screen.findByText(state === 'unavailable'
      ? 'admin.settings.update.uiNotesUnavailable' : 'admin.settings.update.noNotes')).toBeVisible()
    expect(screen.getByRole('button', { name: 'admin.settings.update.uiApply' }))
      .not.toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps installed release notes visible when the frontend is up to date', async () => {
    api.status.mockResolvedValue({ ...status, current_sha: 'new', has_update: false, release_notes: {
      sha: 'new', state: 'available', releases: [{ date: '2026-11-28',
        title: { en: 'Installed release', zh: '已安装版本' },
        changes: { en: ['Registration fixed'], zh: ['修复注册'] },
      }],
    } })
    render(<UpdateSettingsTab />)
    expect(await screen.findByText('Installed release')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'admin.settings.update.uiApply' })).not.toBeInTheDocument()
  })

  it('shows an unavailable service and allows a fresh check', async () => {
    api.status.mockRejectedValueOnce(new Error('Service unavailable'))
    render(<UpdateSettingsTab />)
    expect(await screen.findByText('Service unavailable')).toHaveAttribute('role', 'alert')
    const buttons = screen.getAllByRole('button', { name: 'admin.settings.update.checkNow' })
    fireEvent.click(buttons[1]!)
    expect(await screen.findByText('old')).toBeVisible()
    expect(api.status).toHaveBeenLastCalledWith(true)
    expect(screen.queryByText('Service unavailable')).not.toBeInTheDocument()
  })

  it('resumes an existing task and shows its persisted failure', async () => {
    api.status.mockResolvedValueOnce({ ...status, job: { ...idle, state: 'running', step: 'build' } })
    vi.useFakeTimers()
    await act(async () => { render(<UpdateSettingsTab />) })
    expect(screen.getByRole('button', { name: 'admin.settings.update.uiApply' })).toHaveAttribute('aria-disabled', 'true')
    api.status.mockResolvedValue({ ...status, job: { ...idle, state: 'failed', log: 'Build failed' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByText('Build failed')).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'admin.settings.update.uiApply' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('disables duplicate submission and polls the accepted job', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<UpdateSettingsTab />) })
    const button = screen.getByRole('button', { name: 'admin.settings.update.uiApply' })
    api.apply.mockResolvedValue({ job: { ...idle, state: 'running', step: 'install' } })
    await act(async () => { fireEvent.click(button) })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(api.apply).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/admin.settings.update.uiBuilding/)).toHaveTextContent('install')
    api.status.mockResolvedValue({ ...status, job: { ...idle, state: 'running', step: 'verify' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(api.status).toHaveBeenLastCalledWith()
    expect(screen.getByText(/admin.settings.update.uiBuilding/)).toHaveTextContent('verify')
  })
})
