import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateSettingsTab } from './UpdateSettingsTab'
import releaseNotes from '../../../../public/release-notes.json'

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
  it('includes the account and model changes in the shipped preview in both languages', async () => {
    api.status.mockResolvedValue({ ...status, release_notes: {
      sha: 'a'.repeat(40), state: 'available', releases: releaseNotes.releases,
    } })
    const { rerender } = render(<UpdateSettingsTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.settings.update.uiPreviewNotes' }))
    expect(screen.getByText(releaseNotes.releases[0]!.title.en)).toBeVisible()
    expect(screen.getByText(/Fetch upstream models when previewing/)).toBeVisible()
    language.locale = 'zh'
    rerender(<UpdateSettingsTab />)
    expect(screen.getByText(releaseNotes.releases[0]!.title.zh)).toBeVisible()
    expect(screen.getByText(/账号管理新增上游模型拉取/)).toBeVisible()
    expect(api.apply).not.toHaveBeenCalled()
  })

  it.each(['en', 'zh'])('previews release notes in %s without starting an update', async (locale) => {
    language.locale = locale
    api.status.mockResolvedValue({ ...status, release_notes: {
      sha: 'a'.repeat(40), state: 'available', releases: [{ date: '2026-11-28',
        title: { en: 'Frontend improvements', zh: '前端改进' },
        changes: { en: ['Online frontend updates', '<script>alert(1)</script>'], zh: ['前端在线更新'] },
      }],
    } })
    render(<UpdateSettingsTab />)
    const title = locale === 'en' ? 'Frontend improvements' : '前端改进'
    const preview = await screen.findByRole('button', { name: 'admin.settings.update.uiPreviewNotes' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(preview)
    const dialog = await screen.findByRole('dialog', { name: 'admin.settings.update.uiPreviewNotes' })
    expect(within(dialog).getByText(title)).toBeVisible()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(locale === 'en' ? 2 : 1)
    if (locale === 'en') {
      expect(within(dialog).getByText('<script>alert(1)</script>')).toBeVisible()
      expect(document.querySelector('script')).toBeNull()
    }
    expect(api.apply).not.toHaveBeenCalled()
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(preview)
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it.each(['missing', 'unavailable', undefined])('handles %s notes while allowing updates', async (state) => {
    api.status.mockResolvedValue({ ...status, release_notes: state ? { sha: 'new', state, releases: [] } : undefined })
    render(<UpdateSettingsTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.settings.update.uiPreviewNotes' }))
    expect(await screen.findByText(state === 'unavailable'
      ? 'admin.settings.update.uiNotesUnavailable' : 'admin.settings.update.noNotes')).toBeVisible()
    expect(screen.getByRole('button', { name: 'admin.settings.update.uiApply' }))
      .not.toHaveAttribute('aria-disabled', 'true')
  })

  it('offers installed update history when the frontend is up to date', async () => {
    api.status.mockResolvedValue({ ...status, current_sha: 'new', has_update: false, release_notes: {
      sha: 'new', state: 'available', releases: [{ date: '2026-11-28',
        title: { en: 'Installed release', zh: '已安装版本' },
        changes: { en: ['Registration fixed'], zh: ['修复注册'] },
      }],
    } })
    render(<UpdateSettingsTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.settings.update.uiViewNotes' }))
    expect(await screen.findByText('Installed release')).toBeVisible()
    expect(screen.getByText('admin.settings.update.uiInstalledNotesHint')).toBeVisible()
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
