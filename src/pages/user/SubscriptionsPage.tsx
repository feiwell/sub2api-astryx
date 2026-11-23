import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import type { UserSubscription } from '@/types'
import { formatDateTime } from '@/utils/format'
import subscriptionsAPI from '@/api/subscriptions'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useAppStore } from '~/stores/app'

const platformLabel = (p: string): string => {
  const labels: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    antigravity: 'Antigravity',
    gemini: 'Gemini',
    grok: 'Grok',
    composite: 'Composite',
  }
  return labels[p] || p
}

interface RemainingDurationParts {
  days: number
  hours: number
  minutes: number
}

function getRemainingDurationParts(expiresAt: string): RemainingDurationParts | null {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()

  if (diff <= 0) return null

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  return {
    days,
    hours: hours % 24,
    minutes: minutes % 60,
  }
}

function formatDurationParts(parts: RemainingDurationParts): string {
  if (parts.days > 0) {
    return `${parts.days}d ${parts.hours}h`
  }

  if (parts.hours > 0) {
    return `${parts.hours}h ${parts.minutes}m`
  }

  return `${parts.minutes}m`
}

function isOneTimeDailyQuota(subscription: UserSubscription): boolean {
  return !subscription.group?.weekly_limit_usd && !subscription.group?.monthly_limit_usd
}

/** React port of views/user/SubscriptionsView.vue using card-grid template. */
export function SubscriptionsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const appStore = useAppStore()

  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [loading, setLoading] = useState(true)

  const hasPeakRate = (group: UserSubscription['group']): boolean => {
    return !!(
      group?.peak_rate_enabled &&
      group.peak_start &&
      group.peak_end &&
      group.peak_rate_multiplier &&
      group.peak_rate_multiplier > 1
    )
  }

  const formatPeakRateWindow = (group: UserSubscription['group'], tzLabel: string): string => {
    if (!group?.peak_start || !group?.peak_end) return ''
    return `${group.peak_start}-${group.peak_end} ${tzLabel} ×${group.peak_rate_multiplier}`
  }

  const serverTimezoneLabel = (utcOffset?: string): string => {
    return utcOffset || 'UTC'
  }

  const loadSubscriptions = useCallback(async () => {
    try {
      setLoading(true)
      const data = await subscriptionsAPI.getMySubscriptions()
      setSubscriptions(data)
    } catch (error) {
      console.error('Failed to load subscriptions:', error)
      toast.error(t('userSubscriptions.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadSubscriptions()
  }, [loadSubscriptions])

  const getProgressBarColorScheme = (
    used: number | undefined,
    limit: number | null | undefined
  ): 'success' | 'warning' | 'error' => {
    if (!limit || limit === 0) return 'success'
    const percentage = ((used || 0) / limit) * 100
    if (percentage >= 90) return 'error'
    if (percentage >= 70) return 'warning'
    return 'success'
  }

  const formatExpirationDate = (expiresAt: string): string => {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (diff <= 0) {
      return t('userSubscriptions.status.expired')
    }

    const dateStr = formatDateTime(expires)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expiresDate = new Date(expires)
    expiresDate.setHours(0, 0, 0, 0)

    if (expiresDate.getTime() === today.getTime()) {
      return `${dateStr} (${t('common.today')})`
    }
    if (expiresDate.getTime() === tomorrow.getTime()) {
      return `${dateStr} (${t('common.tomorrow')})`
    }

    return t('userSubscriptions.daysRemaining', { days }) + ` (${dateStr})`
  }

  const getExpirationColor = (expiresAt: string): string => {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (diff <= 0 || days <= 3) return 'var(--color-danger)'
    if (days <= 7) return 'var(--color-warning)'
    return 'var(--color-text-secondary)'
  }

  const formatDailyUsageWindow = (subscription: UserSubscription): string => {
    if (isOneTimeDailyQuota(subscription) && subscription.expires_at) {
      const parts = getRemainingDurationParts(subscription.expires_at)
      if (!parts) return t('userSubscriptions.windowNotActive')
      return t('userSubscriptions.quotaEndsIn', { time: formatDurationParts(parts) })
    }

    return t('userSubscriptions.resetIn', {
      time: formatResetTime(subscription.daily_window_start, 24),
    })
  }

  const formatResetTime = (windowStart: string | null, windowHours: number): string => {
    if (!windowStart) return t('userSubscriptions.windowNotActive')

    const start = new Date(windowStart)
    const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000)
    const parts = getRemainingDurationParts(end.toISOString())

    return parts ? formatDurationParts(parts) : t('userSubscriptions.windowNotActive')
  }

  const handleRenew = (groupId: number) => {
    navigate(`/purchase?tab=subscription&group=${groupId}`)
  }

  if (loading) {
    return (
      <Page title={t('userSubscriptions.title')}>
        <Center padding={8}>
          <Spinner />
        </Center>
      </Page>
    )
  }

  if (subscriptions.length === 0) {
    return (
      <Page title={t('userSubscriptions.title')}>
        <Card padding={8}>
          <EmptyState
            title={t('userSubscriptions.noActiveSubscriptions')}
            description={t('userSubscriptions.noActiveSubscriptionsDesc')}
          />
        </Card>
      </Page>
    )
  }

  return (
    <Page title={t('userSubscriptions.title')}>
      <Grid columns={"repeat(auto-fill, minmax(500px, 1fr))" as any} gap={6}>
        {subscriptions.map((subscription) => (
          <Card key={subscription.id} padding={0}>
            {/* Header */}
            <VStack gap={0} hAlign="stretch">
              <HStack gap={3} vAlign="start" padding={4}>
                <VStack gap={1} hAlign="stretch">
                  <HStack gap={2} vAlign="center">
                    <Text type="body" weight="semibold">
                      {subscription.group?.name || `Group #${subscription.group_id}`}
                    </Text>
                    <Badge
                      variant="neutral"
                      label={platformLabel(subscription.group?.platform || '')}
                    />
                  </HStack>
                  {subscription.group?.description && (
                    <Text type="supporting" color="secondary">
                      {subscription.group.description}
                    </Text>
                  )}
                  <HStack gap={3}>
                    <Text type="supporting" color="secondary">
                      {t('payment.planCard.rate')}: ×{subscription.group?.rate_multiplier ?? 1}
                    </Text>
                    {hasPeakRate(subscription.group) && (
                      <Text type="supporting" color={"warning" as any}>
                        {t('payment.planCard.peakRate')}:{' '}
                        {formatPeakRateWindow(
                          subscription.group,
                          serverTimezoneLabel(appStore.publicSettings?.server_utc_offset)
                        )}
                      </Text>
                    )}
                  </HStack>
                </VStack>
                <HStack gap={2} vAlign="center">
                  <Badge
                    variant={
                      subscription.status === 'active'
                        ? 'success'
                        : subscription.status === 'expired'
                          ? 'neutral'
                          : 'error'
                    }
                    label={t(`userSubscriptions.status.${subscription.status}`)}
                  />
                  {subscription.status === 'active' && (
                    <Button
                      label={t('payment.renewNow')}
                     
                      variant={"primary" as any}
                      onClick={() => handleRenew(subscription.group_id)}
                    />
                  )}
                </HStack>
              </HStack>

              <Divider />

              {/* Usage Progress */}
              <VStack gap={4} hAlign="stretch" padding={4}>
                {/* Expiration Info */}
                <HStack gap={0} hAlign="between">
                  <Text type="supporting" color="secondary">
                    {t('userSubscriptions.expires')}
                  </Text>
                  {subscription.expires_at ? (
                    <Text
                      type="body"

                      weight="medium"
                      color={(getExpirationColor(subscription.expires_at).includes('danger') ? 'error' :
                             getExpirationColor(subscription.expires_at).includes('warning') ? 'warning' : 'neutral') as any}
                    >
                      {formatExpirationDate(subscription.expires_at)}
                    </Text>
                  ) : (
                    <Text type="body">
                      {t('userSubscriptions.noExpiration')}
                    </Text>
                  )}
                </HStack>

                {/* Daily Usage */}
                {subscription.group?.daily_limit_usd && (
                  <VStack gap={2} hAlign="stretch">
                    <HStack gap={0} hAlign="between">
                      <Text type="body" weight="medium">
                        {t('userSubscriptions.daily')}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        ${(subscription.daily_usage_usd || 0).toFixed(2)} / $
                        {subscription.group.daily_limit_usd.toFixed(2)}
                      </Text>
                    </HStack>
                    <ProgressBar
                      value={((subscription.daily_usage_usd || 0) / subscription.group.daily_limit_usd) * 100}
                      variant={getProgressBarColorScheme(
                        subscription.daily_usage_usd,
                        subscription.group.daily_limit_usd
                      )}
                      label=""
                      isLabelHidden
                    />
                    {subscription.daily_window_start && (
                      <Text type="supporting" color="secondary">
                        {formatDailyUsageWindow(subscription)}
                      </Text>
                    )}
                  </VStack>
                )}

                {/* Weekly Usage */}
                {subscription.group?.weekly_limit_usd && (
                  <VStack gap={2} hAlign="stretch">
                    <HStack gap={0} hAlign="between">
                      <Text type="body" weight="medium">
                        {t('userSubscriptions.weekly')}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        ${(subscription.weekly_usage_usd || 0).toFixed(2)} / $
                        {subscription.group.weekly_limit_usd.toFixed(2)}
                      </Text>
                    </HStack>
                    <ProgressBar
                      value={
                        ((subscription.weekly_usage_usd || 0) / subscription.group.weekly_limit_usd) * 100
                      }
                      variant={getProgressBarColorScheme(
                        subscription.weekly_usage_usd,
                        subscription.group.weekly_limit_usd
                      )}
                      label=""
                      isLabelHidden
                    />
                    {subscription.weekly_window_start && (
                      <Text type="supporting" color="secondary">
                        {t('userSubscriptions.resetIn', {
                          time: formatResetTime(subscription.weekly_window_start, 168),
                        })}
                      </Text>
                    )}
                  </VStack>
                )}

                {/* Monthly Usage */}
                {subscription.group?.monthly_limit_usd && (
                  <VStack gap={2} hAlign="stretch">
                    <HStack gap={0} hAlign="between">
                      <Text type="body" weight="medium">
                        {t('userSubscriptions.monthly')}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        ${(subscription.monthly_usage_usd || 0).toFixed(2)} / $
                        {subscription.group.monthly_limit_usd.toFixed(2)}
                      </Text>
                    </HStack>
                    <ProgressBar
                      value={
                        ((subscription.monthly_usage_usd || 0) / subscription.group.monthly_limit_usd) *
                        100
                      }
                      variant={getProgressBarColorScheme(
                        subscription.monthly_usage_usd,
                        subscription.group.monthly_limit_usd
                      )}
                      label=""
                      isLabelHidden
                    />
                    {subscription.monthly_window_start && (
                      <Text type="supporting" color="secondary">
                        {t('userSubscriptions.resetIn', {
                          time: formatResetTime(subscription.monthly_window_start, 720),
                        })}
                      </Text>
                    )}
                  </VStack>
                )}

                {/* No limits - Unlimited badge */}
                {!subscription.group?.daily_limit_usd &&
                  !subscription.group?.weekly_limit_usd &&
                  !subscription.group?.monthly_limit_usd && (
                    <Card padding={6} variant={"success" as any}>
                      <HStack gap={3} hAlign="center" vAlign="center">
                        <Text type="display-1" color={"success" as any}>
                          ∞
                        </Text>
                        <VStack gap={0.5} hAlign="start">
                          <Text type="body" weight="medium" color={"success" as any}>
                            {t('userSubscriptions.unlimited')}
                          </Text>
                          <Text type="supporting" color={"success" as any}>
                            {t('userSubscriptions.unlimitedDesc')}
                          </Text>
                        </VStack>
                      </HStack>
                    </Card>
                  )}
              </VStack>
            </VStack>
          </Card>
        ))}
      </Grid>
    </Page>
  )
}
