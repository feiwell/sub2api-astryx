import { useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { TokenTrendChart } from '~/components/charts/TokenTrendChart'
import { UsageDistributionCard, type DistributionMetric } from '~/components/charts/UsageDistributionCard'
import { useI18n } from '~/i18n'
import type { UserDashboard } from './useUserDashboard'

/** Which models the usage of the range went to, and the token trend over the range. */
export function DashboardCharts({ dashboard }: { dashboard: UserDashboard }) {
  const { t } = useI18n()
  const [metric, setMetric] = useState<DistributionMetric>('tokens')

  return (
    // Side by side only where the distribution table fits its card whole (it needs 503px); `max` also lets a
    // column be narrower than its minimum on a screen that is narrower still.
    <Grid columns={{ minWidth: 512, max: 2, repeat: 'fit' }} gap={4}>
      <UsageDistributionCard
        title={t('dashboard.modelDistribution')}
        dimensionLabel={t('dashboard.model')}
        items={dashboard.models.map((item) => ({
          key: item.model,
          label: item.model,
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
        }))}
        loading={dashboard.isModelsLoading}
        metric={metric}
        onMetricChange={setMetric}
      />
      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={4}>{t('dashboard.tokenUsageTrend')}</Heading>
          {dashboard.trend.length > 0 ? (
            <TokenTrendChart trend={dashboard.trend} />
          ) : dashboard.isTrendLoading ? (
            <Center padding={6}>
              <Spinner label={t('common.loading')} />
            </Center>
          ) : (
            // After a failed load there is nothing to draw, which is not the same as nothing used.
            <EmptyState
              isCompact
              title={dashboard.hasTrendFailed ? t('common.loadFailed') : t('dashboard.noDataAvailable')}
            />
          )}
        </VStack>
      </Card>
    </Grid>
  )
}
