import { useMemo } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { selectIsSimpleMode, useAuthStore } from '~/stores/auth'
import { DashboardCharts } from './dashboard/DashboardCharts'
import { PlatformBreakdown } from './dashboard/PlatformBreakdown'
import { QuickActionsCard } from './dashboard/QuickActionsCard'
import { RecentUsageCard } from './dashboard/RecentUsageCard'
import { StatCards } from './dashboard/StatCards'
import { buildPlatformCards } from './dashboard/dashboardModel'
import { useUserDashboard } from './dashboard/useUserDashboard'
import { UsageRangeBar } from './usage/UsageCharts'

/**
 * The user's dashboard: the balance and what was used today and in all, the same per platform with the limits
 * set for each, the model distribution and token trend of a date range, the newest requests, and the pages a
 * user most often goes to from here.
 * Port of views/user/DashboardView.vue and the components under components/user/dashboard/.
 */
export function DashboardPage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const isSimple = useAuthStore(selectIsSimpleMode)
  const dashboard = useUserDashboard()
  const { stats, quotas } = dashboard
  // Simple mode has no billing: neither the spend per platform nor its limits mean anything there.
  const platformCards = useMemo(
    () => (stats && !isSimple ? buildPlatformCards(stats, quotas) : []),
    [stats, quotas, isSimple],
  )
  const loadFailed = t('common.loadFailed')
  const failureText = dashboard.hasFailed ? extractApiErrorMessage(dashboard.failure, loadFailed) : null

  return (
    <Page
      title={t('dashboard.title')}
      description={t('dashboard.welcomeMessage')}
      actions={
        <IconButton
          label={t('common.refresh')}
          tooltip={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={dashboard.isLoading}
          onClick={dashboard.refresh}
        />
      }
    >
      <VStack gap={4}>
        {failureText != null && (
          <Banner
            status="error"
            title={loadFailed}
            description={failureText !== loadFailed ? failureText : undefined}
            endContent={
              <Button size="sm" variant="secondary" label={t('common.refresh')} onClick={dashboard.refresh} />
            }
          />
        )}

        {stats == null && dashboard.isStatsLoading ? (
          // Nothing is shown before the figures were answered once, so the page does not jump when they arrive.
          <Center padding={8}>
            <Spinner label={t('common.loading')} />
          </Center>
        ) : (
          <>
            {stats && <StatCards stats={stats} balance={user?.balance ?? 0} isSimple={isSimple} />}
            <PlatformBreakdown cards={platformCards} />
            <UsageRangeBar usage={dashboard} />
            <DashboardCharts dashboard={dashboard} />
            <Grid columns={{ minWidth: 360, max: 2, repeat: 'fit' }} gap={4}>
              <RecentUsageCard
                rows={dashboard.recent}
                isLoading={dashboard.isRecentLoading}
                hasFailed={dashboard.hasRecentFailed}
              />
              <QuickActionsCard />
            </Grid>
          </>
        )}
      </VStack>
    </Page>
  )
}
