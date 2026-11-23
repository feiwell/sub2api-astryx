import { useEffect, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { MonitorQuotaSnapshot } from '@/api/admin/channelMonitor'
import { useI18n } from '~/i18n'
import { quotaBalances, quotaResetText, quotaTierLabel, quotaUsedLevel, quotaUsedText } from './monitorText'

const MINUTE_MS = 60_000

/** The time now, read again every minute while `isTicking`: what a countdown is counted from. */
function useMinuteClock(isTicking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isTicking) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => window.clearInterval(timer)
  }, [isTicking])
  return now
}

/**
 * The quota of the account behind a monitor as it was last read: the plan, how much of each window is used
 * and when the window starts over, and the balance left. Port of components/common/MonitorQuotaView.vue.
 */
export function MonitorQuota({ snapshot }: { snapshot: MonitorQuotaSnapshot }) {
  const { t, te } = useI18n()
  const tiers = snapshot.success ? snapshot.tiers || [] : []
  const balances = snapshot.success ? quotaBalances(snapshot) : []
  const now = useMinuteClock(tiers.some((tier) => Boolean(tier.reset_at)))

  return (
    <VStack gap={1} hAlign="stretch">
      {snapshot.plan_level && (
        <HStack>
          <Token size="sm" color="gray" label={snapshot.plan_level} />
        </HStack>
      )}

      {tiers.map((tier, index) => {
        const used = quotaUsedText(tier.used_percent)
        const reset = quotaResetText(tier, now, t)
        return (
          <ProgressBar
            key={`${tier.window}-${tier.label || ''}-${index}`}
            label={quotaTierLabel(tier, t, te)}
            // Usage can run past the quota; the bar is full from there on, the figure beside it is not capped.
            value={Math.min(100, Math.max(0, tier.used_percent))}
            hasValueLabel
            formatValueLabel={() => (reset ? `${used} · ${reset}` : used)}
            variant={quotaUsedLevel(tier.used_percent)}
          />
        )
      })}

      {balances.length > 0 && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          {balances.map((entry) => {
            const amount = `${entry.balance.toFixed(2)} ${entry.currency}`
            return entry.balance <= 0 ? (
              <Badge key={entry.currency} variant="error" label={amount} />
            ) : (
              <Text key={entry.currency} type="supporting" color="primary" hasTabularNumbers>
                {amount}
              </Text>
            )
          })}
        </HStack>
      )}

      {!snapshot.success && (
        <VStack gap={0.5}>
          <HStack>
            <Badge variant="error" label={t('monitorCommon.quota.unavailable')} />
          </HStack>
          {/* What the provider answered can be long; the whole of it is in the tooltip. */}
          {snapshot.error && (
            <Text type="supporting" maxLines={2} hasTruncateTooltip wordBreak="break-all">
              {snapshot.error}
            </Text>
          )}
        </VStack>
      )}
    </VStack>
  )
}
