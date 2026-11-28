import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import type { Account } from '@/types'
import { setLocale, t } from '~/i18n'
import { ModelWhitelistField } from './ModelWhitelistField'
import { AccountFormDialog } from './AccountFormDialog'
import { initialForm, type AccountForm } from './accountForm'
import { useUpstreamModelSync } from './useUpstreamModelSync'

const api = vi.hoisted(() => ({ syncUpstreamModels: vi.fn(), syncUpstreamModelsPreview: vi.fn(), create: vi.fn() }))
const toast = vi.hoisted(() => ({ warning: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('~/lib/toast', () => ({ toast }))
vi.mock('~/lib/api/admin', () => ({ adminAPI: { accounts: api, settings: { getSettings: async () => ({}) }, proxies: { getAll: async () => [] } } }))
beforeAll(() => setLocale('en'))
const account = { id: 7, type: 'apikey', platform: 'openai' } as Account
const draft = { ...initialForm(null), platform: 'openai', key: ' example-key ' }
function setup(f = draft, editing: Account | null = null) {
  const change = vi.fn()
  return { change, ...renderHook(({ form }: { form: AccountForm }) => useUpstreamModelSync(form, editing, change), { initialProps: { form: f } }) }
}

describe('single-account upstream discovery', () => {
  it('previews the current adaptive endpoint and mapping, preserving edits made during discovery', async () => {
    let finish!: (value: unknown) => void
    api.syncUpstreamModelsPreview.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const f = { ...draft, platform: 'opencode_go', endpoints: { chat_completions: ' https://gateway.example/v1 ' }, whitelist: ['old'] }
    const { result, rerender, change } = setup(f)
    act(() => { void result.current.sync(); void result.current.sync() })
    expect(api.syncUpstreamModelsPreview).toHaveBeenCalledTimes(1)
    expect(api.syncUpstreamModelsPreview).toHaveBeenCalledWith({ platform: f.platform, type: 'apikey', base_url: 'https://gateway.example/v1', api_key: 'example-key', model_mapping: { old: 'old' } })
    rerender({ form: { ...f, whitelist: ['manual'], aliases: [{ key: 1, from: 'alias', to: 'target' }] } })
    await act(async () => finish({ models: [' manual ', 'new', ' new ', 'alias', '', 'fake-*'] }))
    expect(change).toHaveBeenCalledWith(['manual', 'new'])
    expect(result.current.previewed.current).toBe(true)
  })
  it('syncs a saved account by ID even without a key and reports metadata warnings', async () => {
    api.syncUpstreamModels.mockResolvedValue({ models: ['x'], warnings: [{ code: 'upstream_model_metadata_partial' }] })
    const { result, change } = setup({ ...draft, key: '' }, account)
    await act(() => result.current.sync())
    expect(api.syncUpstreamModels).toHaveBeenCalledWith(7)
    expect(api.syncUpstreamModelsPreview).not.toHaveBeenCalled()
    expect(change).toHaveBeenCalledWith(['x'])
    expect(toast.warning).toHaveBeenCalledWith(t('admin.accounts.syncUpstreamModelsMetadataPartial'))
  })
  it('does not replace the whitelist on empty, fallback or failed discovery', async () => {
    api.syncUpstreamModelsPreview.mockResolvedValueOnce({ models: [' '] }).mockResolvedValueOnce({ models: ['fallback'], discovery_source: 'configured_fallback' }).mockRejectedValueOnce(new Error('unavailable'))
    const { result, change } = setup()
    for (let i = 0; i < 3; i++) await act(() => result.current.sync())
    expect(change).not.toHaveBeenCalled()
    expect(result.current.previewed.current).toBe(false)
    expect(toast.info).toHaveBeenCalled(); expect(toast.warning).toHaveBeenCalled(); expect(toast.error).toHaveBeenCalled()
  })
  it('ignores late responses after the connection changes', async () => {
    let finish!: (value: unknown) => void
    api.syncUpstreamModelsPreview.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { result, change, rerender } = setup()
    act(() => { void result.current.sync() })
    rerender({ form: { ...draft, baseUrl: 'https://other.example' } })
    await act(async () => finish({ models: ['stale'] }))
    expect(result.current.busy).toBe(false)
    expect(change).not.toHaveBeenCalled()
  })
  it('keeps bulk whitelist editing local', () => {
    render(<Theme theme={neutralTheme} mode="light"><LayerProvider><ModelWhitelistField value={[]} modelMappings={[]}
      platforms={['openai']} onChange={vi.fn()} /></LayerProvider></Theme>)
    expect(screen.getByRole('button', { name: t('astryx.accountFillPresetModels') })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('admin.accounts.syncUpstreamModels') })).not.toBeInTheDocument()
  })
  it('does not probe incomplete, proxy-only or unsupported drafts', async () => {
    const { result, rerender } = setup()
    for (const fields of [{ key: '' }, { proxy: 12 }, { headerEnabled: true }, { platform: 'unknown' }, { type: 'bedrock' as const }, { type: 'oauth' as const }]) {
      rerender({ form: { ...draft, ...fields } })
      expect(result.current.canSync).toBe(false)
      await act(() => result.current.sync())
    }
    expect(api.syncUpstreamModelsPreview).not.toHaveBeenCalled()
  })
  it('saves previewed models and reports a post-create sync failure without creating twice', async () => {
    const saved = vi.fn()
    api.syncUpstreamModelsPreview.mockResolvedValue({ models: ['upstream-only'] })
    api.create.mockResolvedValue({ id: 12 })
    api.syncUpstreamModels.mockRejectedValueOnce(new Error('service offline'))
    render(<Theme theme={neutralTheme} mode="light"><LayerProvider><AccountFormDialog isOpen editing={null} groups={[]} onClose={vi.fn()} onSaved={saved} /></LayerProvider></Theme>)
    const button = screen.getByRole('button', { name: t('admin.accounts.syncUpstreamModels') })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(screen.getByLabelText(t('admin.accounts.accountName'), { exact: false }), { target: { value: 'example' } })
    fireEvent.change(screen.getByLabelText(t('admin.accounts.apiKey'), { exact: true }), { target: { value: 'example-key' } })
    fireEvent.click(button)
    await screen.findAllByText('upstream-only')
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.create.mock.calls[0][0].credentials.model_mapping).toEqual({ 'upstream-only': 'upstream-only' })
    expect(api.syncUpstreamModels).toHaveBeenCalledWith(12)
    expect(toast.warning).toHaveBeenCalledWith(t('admin.accounts.syncUpstreamModelsFailed'))
  })
})
