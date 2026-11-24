import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { AccountListItem } from '@/types'
import { supportsAccountQuota } from '@/utils/accountQuota'
import { formatCompactNumber, formatCurrency, formatNumber } from '@/utils/format'
import { useI18n } from '~/i18n'
import { useAccountUsageRow, type UsageCellProps } from './useAccountUsageRow'

export function AccountTodayStats(props: UsageCellProps) {
  const { t } = useI18n()
  const { ref, data: { today, todayLoading, todayError } } = useAccountUsageRow(props, false, true)
  return <VStack ref={ref} gap={0.5}>
    {todayLoading && !today && <ProgressBar label={t('common.loading')} isLabelHidden isIndeterminate />}
    {todayError && <Text type="supporting" role="alert">{todayError}</Text>}
    {today && <>
      <Text type="supporting">{t('admin.accounts.stats.requests')} {formatNumber(today.requests)}</Text>
      <Text type="supporting">{t('admin.accounts.stats.tokens')} {formatCompactNumber(today.tokens)}</Text>
      <Text type="supporting">{t('usage.accountBilled')} {formatCurrency(today.cost)}</Text>
      {today.user_cost != null && <Text type="supporting">{t('usage.userBilled')} {formatCurrency(today.user_cost)}</Text>}
    </>}
  </VStack>
}

export function AccountCapacity({ account }: { account: AccountListItem }) {
  const { t } = useI18n()
  const lines: { text: string; variant: BadgeVariant; hint: string }[] = []
  const slots = account.current_concurrency ?? 0
  lines.push({ text: `${slots}/${account.concurrency}`, variant: slots >= account.concurrency ? 'error' : slots ? 'warning' : 'neutral', hint: t('admin.accounts.concurrency') })
  if (account.platform === 'anthropic' && (account.type === 'oauth' || account.type === 'setup-token')) {
    const cost = account.current_window_cost ?? 0
    const limit = account.window_cost_limit ?? 0
    if (limit > 0) {
      const blocked = cost >= limit + (account.window_cost_sticky_reserve || 10)
      const state = blocked ? 'blocked' : cost >= limit ? 'stickyOnly' : 'normal'
      lines.push({ text: `5h $${cost.toFixed(2)}/$${limit.toFixed(2)}`, variant: blocked ? 'error' : cost >= limit * 0.8 ? 'warning' : 'success',
        hint: t(`admin.accounts.capacity.windowCost.${state}`) })
    }
    const sessions = account.active_sessions ?? 0
    const max = account.max_sessions ?? 0
    if (max > 0) lines.push({ text: `${t('admin.accounts.quotaControl.sessionLimit.maxSessions')} ${sessions}/${max}`,
      variant: sessions >= max ? 'error' : sessions >= max * 0.8 ? 'warning' : 'success',
      hint: t(`admin.accounts.capacity.sessions.${sessions >= max ? 'full' : 'normal'}`, { idle: account.session_idle_timeout_minutes || 5 }) })
    const base = account.base_rpm ?? 0
    if (base > 0) {
      const rpm = account.current_rpm ?? 0
      const buffer = account.rpm_sticky_buffer ?? Math.max(1, Math.floor(base / 5))
      const tiered = account.rpm_strategy !== 'sticky_exempt'
      const blocked = tiered && rpm >= base + buffer
      const state = tiered ? (blocked ? 'tieredBlocked' : rpm >= base ? 'tieredStickyOnly' : rpm >= 0.8 * base ? 'tieredWarning' : 'tieredNormal')
        : (rpm >= base ? 'stickyExemptOver' : rpm >= 0.8 * base ? 'stickyExemptWarning' : 'stickyExemptNormal')
      lines.push({ text: `RPM ${rpm}/${base} [${tiered ? 'T' : 'S'}]`, variant: blocked ? 'error' : rpm >= base * 0.8 ? 'warning' : 'success',
        hint: t(`admin.accounts.capacity.rpm.${state}`, { buffer }) })
    }
  }
  if (supportsAccountQuota(account.type)) {
    const quotas = [ ['1d', account.quota_daily_used, account.quota_daily_limit], ['7d', account.quota_weekly_used, account.quota_weekly_limit],
      [t('common.total'), account.quota_used, account.quota_limit] ] as const
    for (const [label, raw, limit] of quotas) {
      if (!limit || limit <= 0) continue
      const used = raw ?? 0
      lines.push({ text: `${label} $${used.toFixed(2)}/$${limit.toFixed(2)}`, variant: used >= limit ? 'error' : used >= limit * 0.8 ? 'warning' : 'success',
        hint: t(`admin.accounts.capacity.quota.${used >= limit ? 'exceeded' : 'normal'}`) })
    }
  }
  return <VStack gap={0.5} hAlign="start">{lines.map(line => <Tooltip key={line.text} content={line.hint}>
    <Badge label={line.text} variant={line.variant} />
  </Tooltip>)}</VStack>
}
