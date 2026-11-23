import { useState } from 'react'
import type { DateRange } from '@astryxdesign/core/Calendar'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TokenTrendChart } from '~/components/charts/TokenTrendChart'
import { UsageDistributionCard, type DistributionMetric } from '~/components/charts/UsageDistributionCard'
import { useI18n } from '~/i18n'
import { USAGE_RANGE_PRESETS, latestPickableDate, type Granularity } from './usageQuery'
import type { UsageLogs } from './useUsageLogs'

/** What the range bar reads and changes: the usage of any page that is narrowed to a date range. */
interface RangedUsage {
  filters: { range: DateRange }
  changeFilters: (patch: { range: DateRange }) => void
  granularity: Granularity
  setGranularity: (granularity: Granularity) => void
}

/** The date range everything on the page is narrowed to, and how fine the trend chart is drawn. */
export function UsageRangeBar({ usage }: { usage: RangedUsage }) {
  const { t } = useI18n()
  return (
    <Card padding={4}>
      <HStack gap={3} vAlign="end" hAlign="between" wrap="wrap">
        <DateRangeInput
          label={t('admin.dashboard.timeRange')}
          width={280}
          value={usage.filters.range}
          // The page always has a range; there is nothing to clear it to.
          hasClear={false}
          max={latestPickableDate()}
          presets={USAGE_RANGE_PRESETS.map((preset) => ({ label: t(preset.labelKey), getRange: () => preset.range() }))}
          onChange={(range) => {
            if (range) usage.changeFilters({ range })
          }}
        />
        <Selector
          label={t('admin.dashboard.granularity')}
          width={140}
          value={usage.granularity}
          onChange={(value) => usage.setGranularity(value === 'hour' ? 'hour' : 'day')}
          options={[
            { value: 'day', label: t('admin.dashboard.day') },
            { value: 'hour', label: t('admin.dashboard.hour') },
          ]}
        />
      </HStack>
    </Card>
  )
}

/** Where the usage went, by model, by group and by endpoint, and the token trend over the range. */
export function UsageCharts({ usage }: { usage: UsageLogs }) {
  const { t } = useI18n()
  const [modelMetric, setModelMetric] = useState<DistributionMetric>('tokens')
  const [groupMetric, setGroupMetric] = useState<DistributionMetric>('tokens')
  const [endpointMetric, setEndpointMetric] = useState<DistributionMetric>('tokens')

  return (
    // `max` also lets a column be narrower than its minimum on a screen that is narrower still.
    <Grid columns={{ minWidth: 420, max: 2, repeat: 'fit' }} gap={4}>
      <UsageDistributionCard
        title={t('admin.dashboard.modelDistribution')}
        dimensionLabel={t('admin.dashboard.model')}
        items={usage.modelStats.map((item) => ({
          key: item.model,
          label: item.model,
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
        }))}
        loading={usage.isModelStatsLoading}
        metric={modelMetric}
        onMetricChange={setModelMetric}
      />
      <UsageDistributionCard
        title={t('admin.dashboard.groupDistribution')}
        dimensionLabel={t('admin.dashboard.group')}
        items={usage.groupStats.map((item) => ({
          key: String(item.group_id),
          label: item.group_name || t('admin.dashboard.noGroup'),
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
        }))}
        loading={usage.isChartLoading}
        metric={groupMetric}
        onMetricChange={setGroupMetric}
      />
      <UsageDistributionCard
        title={t('usage.endpointDistribution')}
        dimensionLabel={t('usage.endpoint')}
        items={(usage.stats?.endpoints || []).map((item) => ({
          key: item.endpoint,
          label: item.endpoint || '-',
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
        }))}
        loading={usage.isStatsLoading}
        metric={endpointMetric}
        onMetricChange={setEndpointMetric}
      />
      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={4}>{t('admin.dashboard.tokenUsageTrend')}</Heading>
          {usage.trend.length > 0 ? (
            <TokenTrendChart trend={usage.trend} />
          ) : usage.isChartLoading ? (
            <Center padding={6}>
              <Spinner label={t('common.loading')} />
            </Center>
          ) : (
            <EmptyState isCompact title={t('admin.dashboard.noDataAvailable')} />
          )}
        </VStack>
      </Card>
    </Grid>
  )
}
