import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { Table } from '@astryxdesign/core/Table'
import { LayerProvider } from '@astryxdesign/core/Layer'
import type { AccountListItem, AccountUsageInfo, UsageProgress } from '@/types'
import { setLocale, t } from '~/i18n'
import { ReauthAccountDialog } from './ReauthAccountDialog'
import { AdminAccountsPage } from '../AdminAccountsPage'
import { accountShowsInlineTodayStats, accountSupportsBatchUsage, computeLocalQuotaBars, formatUtilization, resetCountdown, usageVariant } from './usageRules'
import { AccountUsageStore } from './useAccountUsageRow'
import { AccountUsageCell } from './AccountUsageCell'
import { AccountTodayStats, AccountCapacity } from './AccountUsageColumns'
import { AntigravityUsage, GeminiUsage, UsageWarning } from './PlatformUsageWindows'
import { UsageProgressBar } from './UsageProgressBar'
import { ClaudeCredits, OpenAICredits } from './QuotaCreditActions'
import { copyToClipboard } from '~/lib/clipboard'
vi.mock('~/lib/clipboard', () => ({ copyToClipboard: vi.fn() }))

const api = vi.hoisted(() => ({ list: vi.fn(), getById: vi.fn(), exchangeCode: vi.fn(), generateAuthUrl: vi.fn(), applyOAuthCredentials: vi.fn(), update: vi.fn(), batchClearError: vi.fn(), getBatchUsage: vi.fn(), getBatchTodayStats: vi.fn(), getUsage: vi.fn(),
  refreshOpenAIQuota: vi.fn(), resetOpenAIQuota: vi.fn(), queryGrok: vi.fn(), queryQuota: vi.fn(), queryBalance: vi.fn(), refreshOllamaCloudUsage: vi.fn(), refreshOpenCodeGoUsage: vi.fn() }))
vi.mock('~/lib/api/admin', () => ({ adminAPI: { accounts: api, settings: { getSettings: async () => ({}) }, groups: { getAll: async () => [] }, proxies: { getAll: async () => [] }, grok: { queryQuota: api.queryGrok }, cnProviders: { queryQuota: api.queryQuota, queryBalance: api.queryBalance } } }))
const credits = vi.hoisted(() => ({ getClaudeResetCredits: vi.fn(), redeemClaudeResetCredit: vi.fn() }))
vi.mock('~/lib/api/admin/claudeResetCredits', () => credits)

function account(id: number, platform: string, type: AccountListItem['type'], fields?: Partial<AccountListItem>): AccountListItem {
  return { id, platform, type, name: `Account-${id}`, concurrency: 2, priority: 1, status: 'active', schedulable: true,
    created_at: '', updated_at: '', proxy_id: null, error_message: null, last_used_at: null, expires_at: null, auto_pause_on_expired: false,
    rate_limited_at: null, rate_limit_reset_at: null, overload_until: null, temp_unschedulable_until: null, temp_unschedulable_reason: null,
    session_window_start: null, session_window_end: null, session_window_status: null, ...fields }
}
const stats = { requests: 27, tokens: 300, cost: 1.25, user_cost: 2.75 }
const windowAt = (utilization: number): UsageProgress => ({ utilization, resets_at: null, remaining_seconds: 0, window_stats: stats })
const usage = (fields: Partial<AccountUsageInfo>): AccountUsageInfo => ({ five_hour: null, seven_day: null, seven_day_sonnet: null, updated_at: null, ...fields })
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const wrap = (node: ReactNode) => <Theme theme={neutralTheme} mode="light"><LayerProvider>{node}</LayerProvider></Theme>
function renderPage(items?: AccountListItem[]) {
  if (items) api.list.mockResolvedValue({ items, total: items.length })
  return render(wrap(<AdminAccountsPage />))
}
const row = async (id: number) => within((await screen.findByText(`#${id}`)).closest('tr')!)
const bar = (scope: ReturnType<typeof within>, label: string, value: number) =>
  expect(scope.getByRole('progressbar', { name: label, hidden: true })).toHaveAttribute('aria-valuenow', String(value))

function setViewport(desktop: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: desktop && query.includes('min-width'), media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } as unknown as MediaQueryList))
}
beforeAll(() => setLocale('en'))
beforeEach(() => {
  setViewport(true)
  api.getBatchUsage.mockResolvedValue({ usage: {}, errors: {} })
  api.getBatchTodayStats.mockResolvedValue({ stats: {} })
  api.getUsage.mockResolvedValue(usage({ five_hour: windowAt(52) }))
})

describe('account quotas', () => {
  it('separates the upstream query from inline statistics and fixed / rolling local limits', () => {
    for (const a of [account(1, 'anthropic', 'bedrock'), account(2, 'openai', 'apikey'), account(3, 'gemini', 'service_account'),
      account(4, 'gemini', 'apikey', { credentials: { base_url: 'https://other.example' } })]) {
      expect(accountShowsInlineTodayStats(a)).toBe(true)
      expect(accountSupportsBatchUsage(a)).toBe(false)
    }
    expect(accountSupportsBatchUsage(account(2, 'gemini', 'apikey'))).toBe(true)
    const limits = { quota_daily_limit: 20, quota_daily_used: 10, quota_weekly_limit: 4, quota_weekly_used: 5, quota_limit: 100, quota_used: 2,
      quota_daily_reset_mode: 'fixed' as const, quota_daily_reset_at: '2026-07-02T00:00:00Z', extra: { quota_weekly_start: '2026-06-24T04:00:00Z' } }
    expect(computeLocalQuotaBars(account(1, 'gemini', 'service_account', limits))).toEqual({ daily: { utilization: 50, resetsAt: limits.quota_daily_reset_at },
      weekly: { utilization: 125, resetsAt: '2026-07-01T04:00:00.000Z' }, total: { utilization: 2, resetsAt: null } })
    expect(computeLocalQuotaBars(account(2, 'openai', 'oauth', limits)).total).toBeNull()
    expect([74, 75, 89, 90].map(usageVariant)).toEqual(['success', 'warning', 'warning', 'error'])
    expect(formatUtilization(1005)).toBe('>999%')
    const epoch = Date.parse(limits.quota_daily_reset_at)
    expect(resetCountdown(limits.quota_daily_reset_at, epoch, 1).kind).toBe('pending')
    expect(resetCountdown(limits.quota_daily_reset_at, epoch, 0).kind).toBe('now')
    expect(resetCountdown(null, epoch, 0, true).kind).toBe('now')
    expect(resetCountdown('invalid', epoch, 0).kind).toBe('none')
    expect(resetCountdown(limits.quota_daily_reset_at, epoch - 3_600_000, 1)).toMatchObject({ hours: 1, minutes: 0 })
  })

  it('renders mixed account windows and local stats in the actual table, and forces refresh', async () => {
    api.getBatchTodayStats.mockResolvedValue({ stats: { 1: stats, 2: stats } })
    api.getBatchUsage.mockResolvedValue({ usage: {
      3: usage({ gemini_pro_daily: windowAt(27), gemini_flash_daily: windowAt(44) }),
      4: usage({ grok_local_usage_24h: stats, grok_free_token_limit: 1000, subscription_tier: 'basic' }),
      5: usage({ antigravity_quota_groups: [{ key: 'gemini-argon-wtu', name: 'Argon', windows: [{ window: 'weekly', utilization: 77, resets_at: null }] }], ai_credits: [{ amount: 13 }] }),
      6: usage({ seven_day: windowAt(45), grok_billing: { period_type: 'monthly', used_percent: 30, prepaid_balance: 12.5, monthly_limit: 90, monthly_used: 27 }, grok_retry_after_seconds: 90 }),
    }, errors: { 7: 'Individual quota error' } })
    renderPage([account(1, 'openai', 'apikey', { quota_limit: 25, quota_used: 5 }), account(2, 'gemini', 'service_account', { quota_weekly_limit: 10, quota_weekly_used: 8 }),
      account(3, 'gemini', 'apikey'), account(4, 'grok', 'oauth'), account(5, 'antigravity', 'oauth'), account(6, 'grok', 'oauth'), account(7, 'anthropic', 'setup-token')])
    await screen.findByText('Individual quota error')
    expect(api.getBatchUsage.mock.calls).toEqual([[[3, 4, 5, 6, 7], false]])
    expect(api.getBatchTodayStats).toHaveBeenCalledWith([1, 2])
    const a = await row(1); bar(a, t('common.total'), 20); expect(a.getByText('U $2.75')).toBeVisible()
    bar(await row(2), '7d', 80)
    const gemini = await row(3); bar(gemini, 'pro', 27); bar(gemini, 'flash', 44)
    expect(gemini.getByText(t('admin.accounts.gemini.quotaPolicy.simulatedNote'))).toBeVisible()
    bar(await row(4), '24h', 30)
    bar(await row(5), t('admin.accounts.usageWindow.antigravityArgonWeekly'), 77)
    const paid = await row(6); bar(paid, '30d', 30); expect(paid.queryByRole('progressbar', { name: '7d' })).toBeNull()
    expect(paid.getByText(t('admin.accounts.usageWindow.grokRetryAfter', { time: '2m' }))).toBeVisible()
    expect((await row(7)).queryByText(t('admin.accounts.claudeResetCredits.count'))).toBeNull()
    expect(screen.queryByText(t('admin.accounts.columns.todayStats'), { selector: 'th, th *' })).toBeNull()
    fireEvent.click(screen.getByText(t('common.refresh')))
    await waitFor(() => expect(api.getBatchUsage).toHaveBeenCalledWith([3, 4, 5, 6, 7], true))
    await act(() => setLocale('zh'))
    expect(screen.getByText(t('admin.accounts.columns.usageWindows'), { selector: 'th, th *' }).closest('th')).toHaveTextContent('用量窗口')
    await act(() => setLocale('en'))
  }, 15_000)

  it('preserves good data on a failed refresh and ignores a late batch after an active query', async () => {
    const store = new AccountUsageStore()
    const item = store.row(account(9, 'openai', 'oauth'))
    api.getBatchUsage.mockResolvedValue({ usage: { 9: usage({ five_hour: windowAt(24) }) } })
    store.request(item, { version: 1, force: false }, true, false)
    await waitFor(() => expect(item.getSnapshot().usage?.five_hour?.utilization).toBe(24))
    store.request(item, { version: 2, force: false }, true, false)
    expect(api.getBatchUsage).toHaveBeenCalledTimes(1)
    const slow = deferred<{ usage: Record<number, AccountUsageInfo> }>()
    api.getBatchUsage.mockReturnValueOnce(slow.promise)
    store.request(item, { version: 3, force: true }, true, false)
    await Promise.resolve()
    await store.active(item)
    expect(api.getUsage).toHaveBeenCalledWith(9, 'active', true)
    slow.resolve({ usage: { 9: usage({ five_hour: windowAt(5) }) } }); await slow.promise
    expect(item.getSnapshot().usage?.five_hour?.utilization).toBe(52)
    api.getBatchUsage.mockRejectedValueOnce(new Error('Relay unavailable'))
    store.request(item, { version: 4, force: true }, true, false)
    await waitFor(() => expect(item.getSnapshot().usageError).toBe('Relay unavailable'))
    expect(item.getSnapshot()).toMatchObject({ usageLoading: false, usage: { five_hour: { utilization: 52 } } })
    store.request(item, { version: 5, force: false }, true, false)
    await waitFor(() => expect(item.getSnapshot().usage?.five_hour?.utilization).toBe(24))
  })

  it('settles a fast row while a slow account holds the batch open, without duplicating a forced probe', async () => {
    vi.useFakeTimers()
    const store = new AccountUsageStore()
    const fast = store.row(account(71, 'openai', 'oauth'))
    const slow = store.row(account(72, 'openai', 'oauth'))
    const stopFast = fast.subscribe(() => {})
    const stopSlow = slow.subscribe(() => {})
    const pending = deferred<{ usage: Record<number, AccountUsageInfo> }>()
    try {
      api.getBatchUsage.mockImplementation((ids: number[]) => ids.length > 1 || ids[0] === 72 ? pending.promise :
        Promise.resolve({ usage: { 71: usage({ five_hour: windowAt(13) }) } }))
      for (const item of [fast, slow]) store.request(item, { version: 1, force: true }, true, false)
      await Promise.resolve()
      expect(api.getBatchUsage.mock.calls).toEqual([[[71, 72], true]])
      await vi.advanceTimersByTimeAsync(4000)
      expect(fast.getSnapshot()).toMatchObject({ usageLoading: false, usage: { five_hour: { utilization: 13 } } })
      expect(slow.getSnapshot().usageLoading).toBe(true)
      expect(api.getBatchUsage.mock.calls.slice(1)).toEqual([[[71], false], [[72], false]])
      pending.resolve({ usage: { 71: usage({ five_hour: windowAt(15) }), 72: usage({ five_hour: windowAt(86) }) } })
      await pending.promise
      expect(fast.getSnapshot().usage?.five_hour?.utilization).toBe(15)
      expect(slow.getSnapshot().usageLoading).toBe(false)
    } finally {
      stopFast()
      stopSlow()
      vi.useRealTimers()
    }
  })

  it('reuses fresh usage and statistics until five minutes and refetches them at expiry', async () => {
    const store = new AccountUsageStore()
    const item = store.row(account(9, 'openai', 'oauth'))
    let now = Date.parse('2026-02-01T12:00:00Z')
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      api.getBatchUsage.mockResolvedValue({ usage: { 9: usage({ five_hour: windowAt(24) }) } })
      api.getBatchTodayStats.mockResolvedValue({ stats: { 9: stats } })
      store.request(item, { version: 1, force: false }, true, true)
      await waitFor(() => expect(item.getSnapshot().today).toEqual(stats))
      now += 299_999
      store.request(item, { version: 2, force: false }, true, true)
      await Promise.resolve()
      expect(api.getBatchUsage).toHaveBeenCalledTimes(1)
      expect(api.getBatchTodayStats).toHaveBeenCalledTimes(1)
      now += 1
      store.request(item, { version: 2, force: false }, true, true)
      await waitFor(() => expect(api.getBatchUsage).toHaveBeenCalledTimes(2))
      expect(api.getBatchTodayStats).toHaveBeenCalledTimes(2)
    } finally {
      clock.mockRestore()
    }
  })

  it('discards an older list response after the search changes', async () => {
    const stale = deferred<{ items: AccountListItem[]; total: number }>()
    api.list.mockReturnValueOnce(stale.promise).mockResolvedValue({ items: [account(8, 'openai', 'apikey')], total: 1 })
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(t('admin.accounts.searchAccounts')), { target: { value: 'x' } })
    await row(8)
    expect(api.list.mock.calls[0][3].signal.aborted).toBe(true)
    await act(async () => { stale.resolve({ items: [account(7, 'openai', 'apikey')], total: 1 }); await stale.promise })
    expect(screen.queryByText('#7')).toBeNull()
  })
})

function UsageFixture({ initial, store = new AccountUsageStore(), lastProbe = new Map<number, number>() }: {
  initial: AccountListItem; store?: AccountUsageStore; lastProbe?: Map<number, number>
}) {
  const [account, setAccount] = useState(initial)
  const [pageStore] = useState(store)
  const [probes] = useState(lastProbe)
  return <AccountUsageCell account={account} store={pageStore} revision={{ version: 1, force: false }} lastProbe={probes}
    update={(id, patch) => setAccount(current => id === current.id ? { ...current, ...patch, extra: { ...current.extra, ...patch.extra } } : current)} />
}

function confirmReset(base: string) {
  const label = t(`${base}.reset`)
  fireEvent.click(screen.getByRole('button', { name: label }))
  const dialog = screen.getByText(t(`${base}.confirmTitle`)).closest('dialog')!
  return within(dialog).getByRole('button', { name: label })
}

describe('account-specific windows and actions', () => {
  it('uses model quotas as a fallback and offers verification and reauthorization in the correct states', () => {
    const item = account(20, 'antigravity', 'oauth', { extra: { load_code_assist: { paidTier: { id: 'g1-pro-tier' }, ineligibleTiers: [{}] } } })
    const quotas = { 'gemini-3-pro-low': { utilization: 25, reset_time: '' }, 'gemini-3-pro-high': { utilization: 84, reset_time: '' },
      'gemini-3-flash': { utilization: 32, reset_time: '' }, 'gemini-3-pro-image': { utilization: 6, reset_time: '' }, 'claude-opus-4-6': { utilization: 70, reset_time: '' } }
    const cell = render(wrap(<AntigravityUsage account={item} usage={usage({ antigravity_quota: quotas })} />))
    const scope = within(cell.container)
    for (const [name, value] of [['gemini3Pro', 84], ['gemini3Flash', 32], ['gemini3Image', 6], ['claude', 70]] as const) {
      bar(scope, t(`admin.accounts.usageWindow.${name}`), value)
    }
    expect(scope.getByText(t('admin.accounts.tier.pro'))).toBeVisible()
    expect(scope.getByText(t('admin.accounts.ineligibleWarning'))).toBeVisible()
    const url = 'https://verify.example.test/account'
    cell.rerender(wrap(<AntigravityUsage account={item} usage={usage({ is_forbidden: true, forbidden_type: 'validation', validation_url: url })} />))
    expect(scope.getByRole('link', { name: name => name.startsWith(t('admin.accounts.openVerification')) })).toHaveAttribute('href', url)
    fireEvent.click(scope.getByText(t('admin.accounts.copyLink')))
    expect(copyToClipboard).toHaveBeenCalledWith(url, t('admin.accounts.linkCopied'))
    cell.rerender(wrap(<AntigravityUsage account={item} usage={usage({ needs_reauth: true })} />))
    expect(scope.getByText(t('admin.accounts.needsReauth'))).toBeVisible()
    expect(scope.queryByRole('link')).toBeNull()
    cell.rerender(wrap(<UsageWarning platform="anthropic" usage={usage({ needs_reauth: true, error: 'Refresh rejected' })} />))
    expect(scope.getByRole('alert')).toHaveTextContent('Refresh rejected')
  })

  it('shows the Gemini shared pool, distinguishes missing quota from a failed request, and keeps Anthropic statistics on 5h', async () => {
    const item = account(21, 'gemini', 'oauth', { credentials: { oauth_type: 'google_one', tier_id: 'AI_PREMIUM' } })
    const view = render(wrap(<GeminiUsage account={item} settled usage={usage({ gemini_shared_daily: windowAt(36), gemini_pro_daily: windowAt(52) })} />))
    bar(within(view.container), '1d', 36)
    expect(screen.getByText('google one pro')).toBeVisible()
    expect(screen.queryByRole('progressbar', { name: 'pro' })).toBeNull()
    view.rerender(wrap(<GeminiUsage account={item} settled />))
    expect(screen.getByText(t('admin.accounts.gemini.rateLimit.unlimited'))).toBeVisible()
    view.rerender(wrap(<GeminiUsage account={item} settled={false} />))
    expect(screen.queryByText(t('admin.accounts.gemini.rateLimit.unlimited'))).toBeNull()
    api.getBatchUsage.mockResolvedValue({ usage: { 25: usage({ source: 'passive', five_hour: windowAt(11), seven_day: windowAt(58) }) } })
    view.rerender(wrap(<UsageFixture initial={account(25, 'anthropic', 'setup-token')} />))
    expect(await screen.findByText(t('admin.accounts.usageWindow.passiveSampled'))).toBeVisible()
    expect(screen.getAllByText('A $1.25')).toHaveLength(1)
  })

  it('estimates the OpenAI seven-day cost and caps the displayed percentage without altering the estimate', async () => {
    api.getBatchUsage.mockResolvedValue({ usage: { 26: usage({ five_hour: windowAt(1100), seven_day: windowAt(25) }) } })
    const view = render(wrap(<UsageFixture initial={account(26, 'openai', 'oauth')} />))
    const estimate = t('admin.accounts.usageWindow.estimatedTotalCost', { cost: '5.00' })
    expect(await screen.findByText(estimate)).toBeVisible()
    expect(screen.getByText('>999%')).toBeVisible()
    bar(within(view.container), '5h', 100)
    bar(within(view.container), '7d', 25)
  })

  it('loads mobile statistics and usage only when their rows enter view, even if the quota cell is offscreen horizontally', async () => {
    setViewport(false)
    const observed = new Map<Element, IntersectionObserverCallback[]>()
    class Observer {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(element: Element) { observed.set(element, [...(observed.get(element) ?? []), this.callback]) }
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', Observer)
    try {
      const store = new AccountUsageStore()
      const props = { store, revision: { version: 1, force: false }, update: vi.fn(), lastProbe: new Map<number, number>() }
      const remote = account(22, 'openai', 'oauth')
      const local = account(23, 'gemini', 'service_account')
      const view = render(wrap(<Table data={[{ id: remote.id, account: remote }, { id: local.id, account: local }]} idKey="id" columns={[
        { key: 'usage', header: 'Usage', renderCell: row => <AccountUsageCell {...props} account={row.account} /> },
        { key: 'today', header: 'Today', renderCell: row => <AccountTodayStats {...props} account={row.account} /> },
      ]} />))
      const rows = view.container.querySelectorAll('tbody tr')
      const enter = async (target: Element) => act(async () => {
        for (const callback of observed.get(target) ?? []) callback([{ isIntersecting: true, target } as IntersectionObserverEntry], {} as IntersectionObserver)
      })
      expect(Array.from(observed.keys())).toEqual([...rows])
      expect(api.getBatchUsage).not.toHaveBeenCalled()
      expect(api.getBatchTodayStats).not.toHaveBeenCalled()
      await enter(rows[1])
      expect(api.getBatchTodayStats).toHaveBeenCalledTimes(1)
      expect(api.getBatchTodayStats).toHaveBeenCalledWith([23])
      expect(api.getBatchUsage).not.toHaveBeenCalled()
      await enter(rows[0])
      expect(api.getBatchUsage).toHaveBeenCalledTimes(1)
      expect(api.getBatchUsage).toHaveBeenCalledWith([22], false)
      expect(api.getBatchTodayStats).toHaveBeenLastCalledWith([22])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('prioritizes Ollama over OpenCode and refreshes the selected provider snapshot', async () => {
    const ollama = { account_id: 30, eligible: true, configured: true, auto_refresh_enabled: true, encryption_key_configured: true,
      snapshot: { status: 'ok' as const, last_attempt_at: '', next_refresh_at: '', data: { five_hour: { used_percent: 10 } } } }
    const go = { account_id: 30, eligible: true, auto_refresh_enabled: true, snapshot: { status: 'ok' as const, data: { monthly: { percent: 93 } } } }
    api.refreshOllamaCloudUsage.mockResolvedValue({ ...ollama, snapshot: { ...ollama.snapshot, data: { five_hour: { used_percent: 12 } } } })
    const view = render(wrap(<UsageFixture initial={account(30, 'opencode_go', 'apikey', { ollama_cloud_usage: ollama, opencode_go_usage: go })} />))
    const scope = within(view.container)
    bar(scope, '5h', 10)
    expect(scope.queryByText(t('admin.accounts.opencodeGo.monthlyShort'))).toBeNull()
    fireEvent.click(scope.getByText(t('admin.accounts.usageWindow.activeQuery')))
    await waitFor(() => bar(scope, '5h', 12))
    expect(api.refreshOllamaCloudUsage).toHaveBeenCalledWith(30)
    view.rerender(wrap(<UsageFixture key="go" initial={account(31, 'opencode_go', 'apikey', { opencode_go_usage: go })} />))
    bar(scope, t('admin.accounts.opencodeGo.monthlyShort'), 93)
    api.refreshOpenCodeGoUsage.mockResolvedValue({ ...go, snapshot: { status: 'unauthorized', last_error: 'Expired session' } })
    fireEvent.click(scope.getByText(t('admin.accounts.usageWindow.activeQuery')))
    expect(await scope.findByText(t('admin.accounts.opencodeGo.unauthorized'))).toBeVisible()
    expect(api.refreshOpenCodeGoUsage).toHaveBeenCalledWith(31)
    expect(api.queryQuota).not.toHaveBeenCalled()
  })

  it('only probes official eligible CN hosts and preserves multicurrency balances', async () => {
    const probes = new Map<number, number>()
    const item = account(32, 'cline', 'apikey')
    const view = render(wrap(<UsageFixture initial={{ ...item, credentials: { base_url: 'https://other.example.test' } }} />))
    expect(api.queryQuota).not.toHaveBeenCalled()
    api.queryQuota.mockResolvedValue({ success: true, tiers: [{ window: '5h', used_percent: 63 }] })
    view.rerender(wrap(<UsageFixture key="official" initial={item} lastProbe={probes} />))
    const scope = within(view.container)
    await waitFor(() => bar(scope, t('admin.accounts.cnProviders.window5h'), 63))
    expect(api.queryQuota).toHaveBeenCalledTimes(1)
    expect(api.queryQuota).toHaveBeenCalledWith(32)
    view.rerender(wrap(<UsageFixture key="remount" initial={item} lastProbe={probes} />))
    expect(api.queryQuota).toHaveBeenCalledTimes(1)
    const deepseek = account(33, 'deepseek', 'apikey', { extra: { deepseek_balances: [{ currency: 'CNY', balance: 12.5 }, { currency: 'USD', balance: 2 }] } })
    api.queryBalance.mockResolvedValue({ success: true, available: false, balance: 1.25, currency: 'USD' })
    view.rerender(wrap(<UsageFixture key="balance" initial={deepseek} />))
    expect(scope.getByText('CNY 12.50 · USD 2.00')).toBeVisible()
    fireEvent.click(scope.getByText(t('admin.accounts.cnProviders.probe')))
    expect(await scope.findByText('USD 1.25')).toBeVisible()
    expect(scope.getByText(t('admin.accounts.cnProviders.balanceLow'))).toBeVisible()
    expect(api.queryBalance).toHaveBeenCalledWith(33)
  })

  it('requires confirmation and reuses the Claude redemption key after an ambiguous response and remount', async () => {
    const base = 'admin.accounts.claudeResetCredits'
    const operation = new AccountUsageStore().creditAction(40)
    const refresh = vi.fn().mockResolvedValue(undefined)
    const data = { available_count: 1, eligible: true, credits: [{ redeemable: true, resets_left: 1, clears: ['five_hour'] }] }
    credits.getClaudeResetCredits.mockResolvedValueOnce(data).mockResolvedValue({ ...data, available_count: 0, credits: [] })
    credits.redeemClaudeResetCredit.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValue({ outcome: 'reset', cleared: ['five_hour'] })
    const cell = <ClaudeCredits id={40} operation={operation} refresh={refresh} />
    const view = render(wrap(cell))
    expect(screen.getByRole('button', { name: t(`${base}.reset`) })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByText(t(`${base}.count`)))
    await screen.findByText(`${t(`${base}.count`)} 1`)
    const first = confirmReset(base)
    expect(credits.redeemClaudeResetCredit).not.toHaveBeenCalled()
    fireEvent.click(first)
    expect(await screen.findByText('Lost response')).toHaveAttribute('role', 'alert')
    view.rerender(wrap(null))
    view.rerender(wrap(cell))
    fireEvent.click(confirmReset(base))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const [[id, firstKey], [, secondKey]] = credits.redeemClaudeResetCredit.mock.calls
    expect(id).toBe(40)
    expect(firstKey).toMatch(/^claude-reset-40-/)
    expect(secondKey).toBe(firstKey)
    expect(screen.getByRole('button', { name: t(`${base}.reset`) })).toHaveAttribute('aria-disabled', 'true')
  })

  it('guards OpenAI shadow and expired credits and requires a new read after an uncertain reset', async () => {
    const base = 'admin.accounts.openaiQuotaReset'
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const cached = { available_count: 2, credits: [{ expires_at: '2020-01-01' }, { expires_at: future }] }
    const item = account(42, 'openai', 'oauth', { extra: { codex_reset_credit_snapshot: cached, codex_credits_snapshot: {
      credits: { has_credits: true, unlimited: false, balance: '12.345' }, fetched_at: 0 } } })
    const op = new AccountUsageStore().creditAction(42)
    const refresh = vi.fn().mockResolvedValue(undefined)
    const updated = vi.fn()
    const cell = (account: AccountListItem) => wrap(<OpenAICredits account={account} operation={op} refresh={refresh} updated={updated} />)
    const reset = () => screen.getByRole('button', { name: t(`${base}.reset`) })
    const view = render(cell({ ...item, parent_account_id: 8 }))
    expect(reset()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Points 12.345')).toBeVisible()
    view.rerender(cell({ ...item, extra: { codex_reset_credit_snapshot: { available_count: 1, credits: [{ expires_at: '2020-01-01' }] } } }))
    expect(screen.getByText(t(`${base}.count`))).toBeVisible()
    expect(reset()).toHaveAttribute('aria-disabled', 'true')
    view.rerender(cell(item))
    expect(screen.getByText('Resets 1')).toBeVisible()
    api.resetOpenAIQuota.mockRejectedValueOnce(new Error('Response lost'))
    const confirm = confirmReset(base)
    expect(api.resetOpenAIQuota).not.toHaveBeenCalled()
    fireEvent.click(confirm)
    expect(await screen.findByText('Response lost')).toHaveAttribute('role', 'alert')
    view.rerender(wrap(null))
    view.rerender(cell(item))
    expect(reset()).toHaveAttribute('aria-disabled', 'true')
    api.refreshOpenAIQuota.mockResolvedValue({ cache_persisted: true, rate_limit_reset_credits: { available_count: 1 }, fetched_at: 0 })
    fireEvent.click(screen.getByText(t(`${base}.count`)))
    await screen.findByText('Resets 1')
    api.resetOpenAIQuota.mockResolvedValue({ cache_refreshed: false, warning_code: 'reset_credit_cache_refresh_failed', account: item })
    fireEvent.click(confirmReset(base))
    await screen.findByText(t(`${base}.resetCacheRefreshFailed`))
    expect(updated).toHaveBeenCalledWith(item)
    expect(refresh).toHaveBeenCalledWith(item)
    expect(reset()).toHaveAttribute('aria-disabled', 'true')
  })

  it('updates the Grok row after probing and shows the true weekly window', async () => {
    api.getBatchUsage.mockResolvedValue({ usage: { 50: usage({ grok_quota_snapshot_state: 'no_headers' }) } })
    api.queryGrok.mockResolvedValue({})
    api.getUsage.mockResolvedValue(usage({ grok_billing: { period_type: 'weekly', usage_percent: 70 }, subscription_tier: 'premium' }))
    const view = render(wrap(<UsageFixture initial={account(50, 'grok', 'oauth')} />))
    await screen.findByText(t('admin.accounts.usageWindow.grokNoHeaders'))
    fireEvent.click(screen.getByText(t('admin.accounts.usageWindow.grokProbe')))
    await waitFor(() => bar(within(view.container), '7d', 70))
    expect(api.queryGrok).toHaveBeenCalledWith(50)
    expect(api.getUsage).toHaveBeenCalledWith(50, 'active', true)
    expect(screen.queryByRole('progressbar', { name: '30d' })).toBeNull()
  })

  it('shows capacity limits and updates all countdowns immediately when the tab becomes visible', () => {
    const start = Date.parse('2026-01-19T10:00:00Z')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    const reset = new Date(start + 600_000).toISOString()
    try {
      const item = account(60, 'anthropic', 'oauth', { concurrency: 8, current_concurrency: 3, window_cost_limit: 20, current_window_cost: 14,
        max_sessions: 5, active_sessions: 2, base_rpm: 15, current_rpm: 8 })
      render(wrap(<><AccountCapacity account={item} /><UsageProgressBar label="5h" utilization={20} resetsAt={reset} /><UsageProgressBar label="7d" utilization={0} resetsAt={reset} /></>))
      expect(screen.getByText('3/8')).toBeVisible()
      expect(screen.getByText('5h $14.00/$20.00')).toBeVisible()
      expect(screen.getByText(/2\/5/)).toBeVisible()
      expect(screen.getByText(/RPM 8\/15/)).toBeVisible()
      expect(screen.getAllByText('10m')).toHaveLength(2)
      clock.mockReturnValue(start + 600_010)
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      expect(screen.getByText(t('usage.resetPending'))).toBeVisible()
      expect(screen.getByText(t('usage.resetNow'))).toBeVisible()
    } finally {
      clock.mockRestore()
    }
  })
})


describe('account administration', () => {
  it('refreshes at the saved interval and cancels the timer on unmount', async () => {
    const set = vi.spyOn(window, 'setInterval'), clear = vi.spyOn(window, 'clearInterval')
    localStorage.setItem('astryx-account-refresh-seconds', '15')
    try {
      const view = renderPage([])
      await screen.findByText(t('admin.accounts.noAccountsYet'))
      const index = set.mock.calls.map(([, ms]) => ms).lastIndexOf(15000)
      expect(index).toBeGreaterThanOrEqual(0)
      const tick = set.mock.calls[index][0] as () => void
      await act(async () => tick())
      expect(api.list).toHaveBeenCalledTimes(2)
      const last = set.mock.calls.map(([, ms]) => ms).lastIndexOf(15000)
      view.unmount()
      expect(clear).toHaveBeenCalledWith(set.mock.results[last].value)
    } finally {
      localStorage.removeItem('astryx-account-refresh-seconds')
      set.mockRestore()
      clear.mockRestore()
    }
  })

  it('exchanges a setup-token code for a creation draft before any account exists', async () => {
    const onAuthorized = vi.fn()
    api.generateAuthUrl.mockResolvedValue({ auth_url: 'https://example.test/auth', session_id: 'test-session' })
    api.exchangeCode.mockResolvedValue({ access_token: 'mock-token' })
    render(wrap(<ReauthAccountDialog isOpen draft={{ type: 'setup-token', platform: 'anthropic', name: 'draft', proxy_id: 8 }}
      onAuthorized={onAuthorized} onClose={() => {}} />))
    fireEvent.click(await screen.findByText(t('admin.accounts.oauth.generateAuthUrl')))
    await waitFor(() => expect(api.generateAuthUrl).toHaveBeenCalledWith('/admin/accounts/generate-setup-token-url', { proxy_id: 8 }))
    fireEvent.change(screen.getByLabelText(t('admin.accounts.oauth.authCode')), { target: { value: 'test-code' } })
    fireEvent.click(screen.getByText(t('admin.accounts.oauth.completeAuth'), { selector: 'button *' }))
    await waitFor(() => expect(onAuthorized).toHaveBeenCalledWith({ type: 'setup-token', credentials: { access_token: 'mock-token' }, extra: undefined }))
    expect(api.applyOAuthCredentials).not.toHaveBeenCalled()
  })
  it('opens the full account and saves a note without altering an error status or credentials', async () => {
    const item = account(12, 'openai', 'apikey', { status: 'error' })
    api.getById.mockResolvedValue({ ...item, credentials: { base_url: 'https://existing.test' } })
    renderPage([item])
    await userEvent.click((await row(12)).getByRole('button', { name: t('common.edit') }))
    await waitFor(() => expect(api.getById).toHaveBeenCalledWith(12))
    const form = within(await screen.findByRole('dialog'))
    const note = await form.findByRole('textbox', { name: t('admin.accounts.notes') })
    fireEvent.change(note, { target: { value: 'review later' } })
    fireEvent.click(form.getByRole('button', { name: t('common.save') }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(12, { notes: 'review later' }))
  }, 20000)

  it('submits all matching IDs including off-page accounts and retains the failed selection', async () => {
    const first = account(21, 'openai', 'apikey')
    const other = account(29, 'anthropic', 'oauth')
    api.list.mockImplementation(async (page, size) => size === 1000
      ? { items: [page === 1 ? first : other], total: 2, pages: 2 } : { items: [first], total: 2 })
    api.batchClearError.mockResolvedValue({ total: 2, success: 1, failed: 1, failed_ids: [29] })
    renderPage()
    await row(21)
    fireEvent.click(screen.getByText(t('admin.accounts.bulkActions.selectAllResults', { count: 2 })))
    await screen.findAllByText(t('admin.accounts.bulkActions.selected', { count: 2 }))
    fireEvent.click(screen.getByText(t('admin.accounts.bulkActions.resetStatus'), { selector: 'button *' }))
    const confirm = await waitFor(() => {
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
      if (!dialog) throw new Error('Waiting for batch confirmation')
      return within(dialog).getByText(t('common.confirm'))
    })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.batchClearError).toHaveBeenCalledWith([21, 29]))
    await screen.findAllByText(t('admin.accounts.bulkActions.selected', { count: 1 }))
  }, 20000)
})
