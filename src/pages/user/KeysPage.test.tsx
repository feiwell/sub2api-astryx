import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiKey, Group } from '@/types'
import { KeysPage } from './KeysPage'

const api = vi.hoisted(() => ({
  list: vi.fn(), delete: vi.fn(), getAvailable: vi.fn(), getUserGroupRates: vi.fn(),
  getDashboardApiKeysUsage: vi.fn(), getPublicSettings: vi.fn(), copyToClipboard: vi.fn(),
}))
vi.mock('@/api', () => ({
  keysAPI: { list: api.list, delete: api.delete },
  userGroupsAPI: { getAvailable: api.getAvailable, getUserGroupRates: api.getUserGroupRates },
  usageAPI: { getDashboardApiKeysUsage: api.getDashboardApiKeysUsage },
  authAPI: { getPublicSettings: api.getPublicSettings },
}))
vi.mock('~/i18n', async () => ({ useI18n: (await import('~/test/mocks')).mockUseI18n }))
vi.mock('~/lib/toast', async () => ({ toast: (await import('~/test/mocks')).mockToast }))
vi.mock('~/lib/clipboard', () => ({ copyToClipboard: api.copyToClipboard }))
vi.mock('~/components/keys/UseKeyModal', () => ({ UseKeyModal: () => null }))
vi.mock('~/components/keys/BulkEditKeysModal', () => ({ BulkEditKeysModal: () => null }))

const mockApiKeys: ApiKey[] = [
  {
    id: 1,
    user_id: 1,
    key: 'fixture-test1234567890',
    name: 'Test Key 1',
    status: 'active',
    group_id: 1,
    ip_whitelist: [],
    ip_blacklist: [],
    last_used_at: null,
    last_used_ip: null,
    quota: 0,
    quota_used: 0,
    expires_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    current_concurrency: 0,
    rate_limit_5h: 1000,
    rate_limit_1d: 5000,
    rate_limit_7d: 10000,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    window_5h_start: null,
    window_1d_start: null,
    window_7d_start: null,
    reset_5h_at: null,
    reset_1d_at: null,
    reset_7d_at: null,
  },
  {
    id: 2,
    user_id: 1,
    key: 'fixture-test0987654321',
    name: 'Test Key 2',
    status: 'inactive',
    group_id: null,
    ip_whitelist: [],
    ip_blacklist: [],
    last_used_at: null,
    last_used_ip: null,
    quota: 0,
    quota_used: 0,
    expires_at: null,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    current_concurrency: 0,
    rate_limit_5h: 500,
    rate_limit_1d: 2000,
    rate_limit_7d: 5000,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    window_5h_start: null,
    window_1d_start: null,
    window_7d_start: null,
    reset_5h_at: null,
    reset_1d_at: null,
    reset_7d_at: null,
  },
]

const mockGroups: Group[] = [
  {
    id: 1,
    name: 'Production',
    description: 'Production group',
    platform: 'openai',
    rate_multiplier: 1.0,
    is_exclusive: false,
    status: 'active',
    subscription_type: 'standard',
    daily_limit_usd: null,
    weekly_limit_usd: null,
    monthly_limit_usd: null,
    long_context_pricing_enabled: false,
    allow_image_generation: false,
    allow_batch_image_generation: false,
    image_count_billing: false,
    image_rate_independent: false,
    image_rate_multiplier: 1.0,
    batch_image_discount_multiplier: 1.0,
    batch_image_hold_multiplier: 1.0,
    image_price_1k: null,
    image_price_2k: null,
    image_price_4k: null,
    video_rate_independent: false,
    video_rate_multiplier: 1.0,
    video_price_480p: null,
    video_price_720p: null,
    video_price_1080p: null,
    web_search_price_per_call: null,
    search_price_per_1k: null,
    audio_realtime_price_per_min: null,
    audio_tts_price_per_million_chars: null,
    audio_stt_price_per_hour: null,
    peak_rate_enabled: false,
    peak_start: '00:00',
    peak_end: '00:00',
    peak_rate_multiplier: 1.0,
    claude_code_only: false,
    fallback_group_id: null,
    fallback_group_id_on_invalid_request: null,
    allow_live: false,
    require_oauth_only: false,
    require_privacy_set: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

async function findKeyRow(name: string) {
  const label = await screen.findByText(name)
  const row = label.closest('tr')
  if (!row) throw new Error(`Expected ${name} in a table row`)
  return row
}

async function renderKeys() {
  render(<KeysPage />)
  return findKeyRow('Test Key 1')
}

describe('KeysPage', () => {
  beforeEach(() => {
    api.list.mockResolvedValue({ items: mockApiKeys, total: mockApiKeys.length, page: 1, page_size: 20, pages: 1 })
    api.getDashboardApiKeysUsage.mockResolvedValue({ stats: {} })
    api.getAvailable.mockResolvedValue(mockGroups)
    api.getUserGroupRates.mockResolvedValue({})
    api.getPublicSettings.mockResolvedValue({ site_name: 'Sub2API' })
    api.delete.mockResolvedValue(undefined)
    api.copyToClipboard.mockResolvedValue(true)
  })

  it('loads the first page with the default sort and no filters', async () => {
    await renderKeys()
    expect(screen.getByRole('heading', { name: 'keys.title' })).toBeVisible()
    expect(api.list).toHaveBeenCalledWith(1, 20, { sort_by: 'created_at', sort_order: 'desc' }, { signal: expect.any(AbortSignal) })
  })

  it('renders both key rows and requests usage for the visible keys', async () => {
    const firstRow = await renderKeys()
    expect(within(firstRow).getByText('keys.status.active')).toBeVisible()
    const secondRow = await findKeyRow('Test Key 2')
    expect(within(secondRow).getByText('keys.status.inactive')).toBeVisible()
    expect(api.getDashboardApiKeysUsage).toHaveBeenCalledWith([1, 2], { signal: expect.any(AbortSignal) })
  })

  it('opens the create dialog from the page header', async () => {
    const user = userEvent.setup()
    await renderKeys()
    await user.click(screen.getByRole('button', { name: 'keys.createKey' }))
    const dialog = await screen.findByRole('dialog', { name: 'keys.createKey' })
    expect(within(dialog).getByRole('button', { name: 'common.create' })).toBeVisible()
  })

  it('sends the search term with the first page after the debounce', async () => {
    const user = userEvent.setup()
    await renderKeys()
    await user.type(screen.getByRole('searchbox', { name: 'keys.searchPlaceholder' }), 'Test Key 1')
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(
      1, 20, expect.objectContaining({ search: 'Test Key 1' }), { signal: expect.any(AbortSignal) },
    ))
  })

  it('reloads the list when refresh is clicked', async () => {
    const user = userEvent.setup()
    await renderKeys()
    await user.click(screen.getByLabelText('common.refresh', { selector: 'button' }))
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
  })

  it('deletes only the selected key after confirmation and reloads the list', async () => {
    const user = userEvent.setup()
    await renderKeys()
    const secondRow = await findKeyRow('Test Key 2')
    await user.click(within(secondRow).getByRole('button', { name: 'common.delete' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'keys.deleteKey' })
    expect(api.delete).not.toHaveBeenCalled()
    api.list.mockResolvedValueOnce({ items: [mockApiKeys[0]], total: 1, page: 1, page_size: 20, pages: 1 })
    await user.click(within(confirm).getByRole('button', { name: 'common.delete' }))
    expect(api.delete).toHaveBeenCalledWith(2)
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Test Key 2')).not.toBeInTheDocument())
    expect(await findKeyRow('Test Key 1')).toBeVisible()
  })

  it('copies the full key for the selected row and shows the copied state', async () => {
    const user = userEvent.setup()
    const row = await renderKeys()
    await user.click(within(row).getByRole('button', { name: 'keys.copyToClipboard' }))
    expect(api.copyToClipboard).toHaveBeenCalledWith(mockApiKeys[0].key, 'keys.copied')
    expect(await within(row).findByRole('button', { name: 'keys.copied' })).toBeVisible()
  })

  it('loads available groups and their per-user rates on mount', async () => {
    const user = userEvent.setup()
    await renderKeys()
    expect(api.getAvailable).toHaveBeenCalledTimes(1)
    expect(api.getUserGroupRates).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('combobox', { name: /^keys\.group/ }))
    expect(await screen.findByRole('option', { name: 'Production' })).toBeVisible()
  })

  it('applies the selected status to the list request', async () => {
    const user = userEvent.setup()
    await renderKeys()
    await user.click(screen.getByRole('combobox', { name: /^common\.status/ }))
    await user.click(await screen.findByRole('option', { name: 'keys.status.inactive' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(
      1, 20, expect.objectContaining({ status: 'inactive' }), { signal: expect.any(AbortSignal) },
    ))
  })
})
