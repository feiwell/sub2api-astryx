import { useEffect } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Text } from '@astryxdesign/core/Text'
import type { AccountListItem } from '@/types'
import { cnBalanceCellVisible, cnQuotaCellVisible } from '@/components/account/credentialsBuilder'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { CNProviderBalanceEntry, CNProviderBalanceResult } from '~/lib/api/admin/cnProviders'
import { UsageProgressBar } from './UsageProgressBar'
import { useQuotaAction } from './useQuotaAction'
import { USAGE_CACHE_TTL_MS } from './usageRules'

export type UpdateAccount = (id: number, patch: Partial<AccountListItem>) => void
interface ProviderProps { account: AccountListItem; update: UpdateAccount }

function balanceExtra(platform: string, result: CNProviderBalanceResult) {
  return { [`${platform}_balance`]: result.balance, [`${platform}_balance_currency`]: result.currency ?? '',
    [`${platform}_balances`]: result.balances ?? [], [`${platform}_balance_low`]: !result.available }
}

function balanceEntries(account: AccountListItem): CNProviderBalanceEntry[] {
  const read = (key: string) => account.extra?.[`${account.platform}_${key}`]
  const list = read('balances')
  if (Array.isArray(list)) {
    const entries = list.filter((entry): entry is CNProviderBalanceEntry => entry && typeof entry.currency === 'string' && typeof entry.balance === 'number')
    if (entries.length) return entries
  }
  const balance = read('balance')
  const currency = read('balance_currency')
  return typeof balance === 'number' ? [{ balance, currency: typeof currency === 'string' ? currency : '' }] : []
}

export function ManagedProviderUsage({ account, update }: ProviderProps) {
  const { t } = useI18n()
  const action = useQuotaAction()
  const ollama = account.ollama_cloud_usage
  const go = account.opencode_go_usage
  if (ollama?.eligible) {
    const data = ollama.snapshot?.data
    return <>
      {data?.five_hour && <UsageProgressBar label="5h" utilization={data.five_hour.used_percent} resetsAt={data.five_hour.reset_at} />}
      {data?.seven_day && <UsageProgressBar label="7d" utilization={data.seven_day.used_percent} resetsAt={data.seven_day.reset_at} />}
      {ollama.snapshot?.last_error && <Text type="supporting">{ollama.snapshot.last_error}</Text>}
      {ollama.configured && <Button size="sm" variant="ghost" label={t('admin.accounts.usageWindow.activeQuery')} isDisabled={action.busy}
        onClick={() => void action.run(() => adminAPI.accounts.refreshOllamaCloudUsage(account.id), state => update(account.id, { ollama_cloud_usage: state }))} />}
      {!data && !ollama.configured && <Text type="supporting">—</Text>}
      {action.error && <Text type="supporting" role="alert">{action.error}</Text>}
    </>
  }
  if (!go?.eligible) return null
  return <>
    {(['rolling', 'weekly', 'monthly'] as const).map(key => {
      const window = go.snapshot?.data?.[key]
      return window && <UsageProgressBar key={key} label={t(`admin.accounts.opencodeGo.${key}Short`)} utilization={window.percent} resetsAt={window.resets_at} />
    })}
    {go.snapshot && go.snapshot.status !== 'ok' && <Tooltip content={go.snapshot.last_error || t(`admin.accounts.opencodeGo.${go.snapshot.status}`)}><Text type="supporting">{t(`admin.accounts.opencodeGo.${go.snapshot.status}`)}</Text></Tooltip>}
    <Button size="sm" variant="ghost" label={t('admin.accounts.usageWindow.activeQuery')} isDisabled={action.busy}
      onClick={() => void action.run(() => adminAPI.accounts.refreshOpenCodeGoUsage(account.id), state => update(account.id, { opencode_go_usage: state }))} />
    {action.error && <Text type="supporting" role="alert">{action.error}</Text>}
  </>
}

export function CNProviderUsage({ account, update, visible, lastProbe }: ProviderProps & { visible: boolean; lastProbe: Map<number, number> }) {
  const { t } = useI18n()
  const action = useQuotaAction()
  const { id, platform, extra } = account
  const base = 'admin.accounts.cnProviders'
  const quota = cnQuotaCellVisible(account)
  const balance = cnBalanceCellVisible(account)
  const stamp = extra?.[`${platform}_usage_updated_at`]
  const entries = balanceEntries(account)
  function probe() {
    lastProbe.set(id, Date.now())
    void action.run(() => adminAPI.cnProviders.queryQuota(id), result => {
      if (!result.success) throw new Error(result.error || t('common.error'))
      const values: Record<string, unknown> = { [`${platform}_usage_updated_at`]: new Date().toISOString() }
      for (const window of ['5h', 'weekly', 'monthly'] as const) {
        const tier = result.tiers?.find(item => item.window === window)
        values[`${platform}_${window}_used_percent`] = tier?.used_percent
        values[`${platform}_${window}_reset_at`] = tier?.reset_at
      }
      if (result.balance?.success) Object.assign(values, balanceExtra(platform, result.balance))
      update(id, { extra: values })
    })
  }
  useEffect(() => {
    const updatedAt = typeof stamp === 'string' ? Date.parse(stamp) : NaN
    if (!quota || !visible || Date.now() - updatedAt <= 15 * 60_000 || Date.now() - (lastProbe.get(id) ?? 0) < USAGE_CACHE_TTL_MS) return
    probe()
  }, [quota, visible, id, platform, stamp, lastProbe])
  return <>
    {quota && <>
      {(['5h', 'weekly', 'monthly'] as const).map(window => {
        const used = extra?.[`${platform}_${window}_used_percent`]
        const resetAt = extra?.[`${platform}_${window}_reset_at`]
        const key = { '5h': 'window5h', weekly: 'windowWeekly', monthly: 'windowMonthly' }[window]
        return typeof used === 'number' && <UsageProgressBar key={window} label={t(`${base}.${key}`)} utilization={used} resetsAt={typeof resetAt === 'string' ? resetAt : null} />
      })}
      <Button size="sm" variant="ghost" label={t(`${base}.probe`)} tooltip={t(`${base}.probeTooltip`)} isDisabled={action.busy} onClick={probe} />
    </>}
    {balance && <>
      <Text type="supporting">{entries.length ? entries.map(e => `${e.currency || '¥'} ${e.balance.toFixed(e.balance >= 100 ? 0 : 2)}`).join(' · ') : t(`${base}.balance`)}</Text>
      <Button size="sm" variant="ghost" label={t(`${base}.probe`)} tooltip={t(`${base}.balanceProbeTooltip`)} isDisabled={action.busy} onClick={() => void action.run(() => adminAPI.cnProviders.queryBalance(id), result => {
          if (!result.success) throw new Error(result.error || t('common.error'))
          update(id, { extra: balanceExtra(platform, result) })
        })} />
      {extra?.[`${platform}_balance_low`] === true && <Text type="supporting">{t(`${base}.balanceLow`)}</Text>}
    </>}
    {!balance && !quota && <Tooltip content={t(`${base}.noBalanceEndpoint`)}><Text type="supporting">—</Text></Tooltip>}
    {action.error && <Text type="supporting" role="alert">{action.error}</Text>}
  </>
}
