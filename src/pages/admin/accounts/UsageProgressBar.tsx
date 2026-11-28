import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { WindowStats } from '@/types'
import { formatCompactNumber } from '@/utils/format'
import { useI18n } from '~/i18n'
import { formatRemaining, formatUtilization, resetCountdown, usageVariant } from './usageRules'
import { useMinuteClock } from './useMinuteClock'

export function UsageStats({ stats, estimatedTotalCost }: { stats: WindowStats; estimatedTotalCost?: number }) {
  const { t } = useI18n()
  return (
    <HStack gap={1.5} wrap="wrap">
      <Text type="supporting">{formatCompactNumber(stats.requests, { allowBillions: false })} {t('admin.accounts.stats.requests')}</Text>
      <Tooltip content={t('admin.accounts.stats.tokens')}><Text type="supporting">{formatCompactNumber(stats.tokens)}</Text></Tooltip>
      <Tooltip content={t('usage.accountBilled')}><Text type="supporting">A ${stats.cost.toFixed(2)}</Text></Tooltip>
      {stats.user_cost != null && <Tooltip content={t('usage.userBilled')}><Text type="supporting">U ${stats.user_cost.toFixed(2)}</Text></Tooltip>}
      {estimatedTotalCost != null && (
        <Tooltip content={t('admin.accounts.usageWindow.estimatedTotalCostTooltip')}>
          <Text type="supporting">{t('admin.accounts.usageWindow.estimatedTotalCost', { cost: estimatedTotalCost.toFixed(2) })}</Text>
        </Tooltip>
      )}
    </HStack>
  )
}

interface UsageProgressBarProps {
  label: string
  utilization: number
  precisePercent?: boolean
  resetsAt?: string | null
  windowStats?: WindowStats | null
  estimatedTotalCost?: number
  showNowWhenIdle?: boolean
  hint?: string
}

export function UsageProgressBar({ label, utilization, precisePercent, resetsAt, windowStats, estimatedTotalCost, hint, showNowWhenIdle }: UsageProgressBarProps) {
  const { t } = useI18n()
  const now = useMinuteClock()
  const countdown = resetCountdown(resetsAt, now, utilization, showNowWhenIdle)
  let resetText = ''
  if (countdown.kind === 'now') resetText = t('usage.resetNow')
  if (countdown.kind === 'pending') resetText = t('usage.resetPending')
  if (countdown.kind === 'remaining') resetText = formatRemaining(countdown)
  const bar = (
    <ProgressBar label={label} value={Number.isFinite(utilization) ? Math.max(0, Math.min(100, utilization)) : 0}
      hasValueLabel formatValueLabel={() => formatUtilization(utilization, precisePercent)} variant={usageVariant(utilization)} />
  )
  return (
    <VStack gap={0.5} hAlign="stretch">
      {windowStats && (windowStats.requests > 0 || windowStats.tokens > 0) && <UsageStats stats={windowStats} estimatedTotalCost={estimatedTotalCost} />}
      {hint ? <Tooltip content={hint}>{bar}</Tooltip> : bar}
      {resetText && <Text type="supporting" color="secondary">{resetText}</Text>}
    </VStack>
  )
}
