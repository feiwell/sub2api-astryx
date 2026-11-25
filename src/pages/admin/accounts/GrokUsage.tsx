import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { AccountUsageInfo } from '@/types'
import { formatCompactNumber } from '@/utils/format'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { UsageProgressBar } from './UsageProgressBar'
import { useQuotaAction } from './useQuotaAction'

function isFreePlan(usage: AccountUsageInfo) {
  const billing = usage.grok_billing
  const free = (label: string) => /free|basic/.test(label)
  const paid = (label: string) => !!label && !free(label) && !label.includes('unknown')
  const tier = usage.subscription_tier?.trim().toLowerCase() ?? ''
  if (free(tier)) return true
  if (paid(tier)) return false
  if (billing?.usage_percent != null || billing?.used_percent != null || (billing?.monthly_limit_cents ?? 0) > 0) return false
  const plan = billing?.plan?.trim().toLowerCase() ?? ''
  if (paid(plan)) return false
  return free(plan) || free(usage.grok_entitlement_status?.toLowerCase() ?? '') || !!billing
}

function dollars(value: number) {
  return value >= 1000 ? formatCompactNumber(value) : value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)
}

function GrokWindows({ usage }: { usage: AccountUsageInfo }) {
  const { t } = useI18n()
  if (usage.needs_reauth) return <Text type="supporting">{t('admin.accounts.needsReauth')}</Text>
  if (usage.is_forbidden) return <Text type="supporting">{usage.grok_entitlement_status || t('admin.accounts.forbidden')}</Text>
  const base = 'admin.accounts.usageWindow'
  const unknown = <Text type="supporting">{t(`${base}.${usage.grok_quota_snapshot_state === 'no_headers' ? 'grokNoHeaders' : 'grokUnknown'}`)}</Text>
  const retry = usage.grok_retry_after_seconds ?? 0
  const retryLabel = retry < 60 ? `${retry}s` : `${Math.ceil(retry / 60)}m`
  const billing = usage.grok_billing
  const free = isFreePlan(usage)
  const local = usage.grok_local_usage_24h
  const limit = usage.grok_free_token_limit ?? 0
  const weekly = billing?.period_type?.toLowerCase() === 'weekly'
  const showWeek = weekly && billing?.usage_percent != null
  const cents = billing?.monthly_limit_cents
  const usedCents = billing?.used_cents
  const monthlyPct = billing?.used_percent ?? (cents != null && cents > 0 && usedCents != null ? usedCents / cents * 100 : null)
  const showMonth = monthlyPct != null && (!weekly || cents != null)
  const prepaid = billing?.prepaid_balance ?? 0
  const monthlyLimit = billing?.monthly_limit ?? (cents ?? 0) / 100
  const monthlyUsed = billing?.monthly_used ?? (usedCents ?? 0) / 100
  const clamp = (value: number) => Math.max(0, Math.min(value, 100))
  return <>
    {free ? (local && limit > 0 ? <UsageProgressBar label="24h" utilization={clamp(local.tokens / limit * 100)}
      windowStats={local} showNowWhenIdle hint={t(`${base}.grokFreeQuota24hHint`, { limit: formatCompactNumber(limit) })} /> : unknown) : <>
      {showWeek && <UsageProgressBar label="7d" utilization={clamp(billing.usage_percent!)} resetsAt={billing.period_end}
        showNowWhenIdle windowStats={usage.grok_local_usage_7d ?? usage.seven_day?.window_stats} />}
      {showMonth && <UsageProgressBar label="30d" utilization={clamp(monthlyPct)} resetsAt={billing?.billing_period_end || billing?.period_end}
        showNowWhenIdle windowStats={usage.grok_local_usage_monthly ?? usage.thirty_day?.window_stats} />}
      {prepaid > 0 && <Text type="supporting">{t(`${base}.grokPrepaid`)} ${dollars(prepaid)}</Text>}
      {monthlyLimit > 0 && <Tooltip content={t(`${base}.grokMonthlyLimit`)}><Text type="supporting">{t(`${base}.grokUsed`)} {dollars(monthlyUsed)}/{dollars(monthlyLimit)}</Text></Tooltip>}
      {!showWeek && !showMonth && prepaid <= 0 && monthlyLimit <= 0 && usage.grok_quota_snapshot_state !== 'observed' && unknown}
    </>}
    {retry > 0 && <Text type="supporting">{t(`${base}.grokRetryAfter`, { time: retryLabel })}</Text>}
  </>
}

export function GrokUsage({ id, usage, refresh }: { id: number; usage?: AccountUsageInfo; refresh: () => Promise<void> }) {
  const { t } = useI18n()
  const action = useQuotaAction()
  return <>
    {usage && <GrokWindows usage={usage} />}
    <Button variant="ghost" size="sm" label={t('admin.accounts.usageWindow.grokProbe')} tooltip={t('admin.accounts.usageWindow.grokProbeTooltip')}
      isDisabled={action.busy} onClick={() => void action.run(() => adminAPI.grok.queryQuota(id), async result => {
        await refresh()
        if (result.probe_error) throw new Error(result.probe_error)
      })} />
    {action.error && <Text type="supporting" role="alert">{action.error}</Text>}
  </>
}
