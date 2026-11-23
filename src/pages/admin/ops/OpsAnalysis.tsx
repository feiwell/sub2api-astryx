import { Grid, GridSpan } from '@astryxdesign/core/Grid'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { VStack } from '@astryxdesign/core/Stack'
import { useI18n } from '~/i18n'
import { OpsConcurrencyCard } from './OpsConcurrencyCard'
import { OpsErrorDistributionChart } from './OpsErrorDistributionChart'
import { OpsErrorTrendChart } from './OpsErrorTrendChart'
import { OpsLatencyChart } from './OpsLatencyChart'
import { OpsSwitchRateChart } from './OpsSwitchRateChart'
import { OpsThroughputChart } from './OpsThroughputChart'
import { OpsTokenStatsCard } from './OpsTokenStatsCard'
import type { OpsErrorKind } from './errorLog'
import { reachesADay, type OpsCustomRange, type OpsFilterChange, type OpsFilters } from './filters'
import type { OpsDashboardData } from './useOpsDashboardData'
import type { OpsRequestsPreset } from './useOpsDetails'

/**
 * The charts under the overview: who uses the capacity, how traffic and account switches move,
 * how long requests take, and which errors come back.
 */
export function OpsAnalysis({
  data,
  filters,
  customRange,
  refreshKey,
  isRealtimeEnabled,
  onRealtimeDisabled,
  hasTokenStats,
  onFiltersChange,
  onOpenRequests,
  onOpenErrors,
}: {
  data: Pick<OpsDashboardData, 'throughput' | 'errorTrend' | 'switchTrend' | 'latency' | 'errorDistribution'>
  filters: OpsFilters
  /** The window picked by hand; only read while the time range is "custom". */
  customRange: OpsCustomRange | null
  /** Changes on every page refresh; the cards that load their own data reload with it. */
  refreshKey: number
  isRealtimeEnabled: boolean
  onRealtimeDisabled: () => void
  /** The OpenAI token table is an opt-in of the advanced settings. */
  hasTokenStats: boolean
  onFiltersChange: (change: OpsFilterChange) => void
  /** Without the two openers the charts offer no lists: full screen has none to open. */
  onOpenRequests?: (preset: OpsRequestsPreset) => void
  onOpenErrors?: (errorKind: OpsErrorKind) => void
}) {
  const { t } = useI18n()
  // A full row of cards is too narrow to read on a laptop. There, each row falls back to two columns,
  // and its last chart (a trend over time, which gains from the width) takes a row of its own.
  const isWide = useMediaQuery('(min-width: 1400px)', true)
  const hasDates = reachesADay(filters.timeRange, customRange)

  return (
    <VStack gap={4}>
      <Grid columns={isWide ? 4 : { minWidth: 280, max: 2 }} gap={4}>
        <OpsConcurrencyCard
          platform={filters.platform}
          groupId={filters.groupId}
          refreshKey={refreshKey}
          isEnabled={isRealtimeEnabled}
          onDisabled={onRealtimeDisabled}
        />
        <OpsSwitchRateChart panel={data.switchTrend} />
        <GridSpan columns={isWide ? 2 : 'full'}>
          <OpsThroughputChart
            panel={data.throughput}
            hasDates={hasDates}
            onSelectPlatform={(platform) => onFiltersChange({ platform, groupId: null })}
            onSelectGroup={(groupId) =>
              onFiltersChange({ groupId: Number.isFinite(groupId) && groupId > 0 ? groupId : null })
            }
            onOpenDetails={onOpenRequests && (() => onOpenRequests({ title: t('admin.ops.requestDetails.title') }))}
          />
        </GridSpan>
      </Grid>
      <Grid columns={isWide ? 3 : { minWidth: 280, max: 2 }} gap={4}>
        <OpsLatencyChart panel={data.latency} />
        <OpsErrorDistributionChart
          panel={data.errorDistribution}
          onOpenDetails={onOpenErrors && (() => onOpenErrors('request'))}
        />
        <GridSpan columns={isWide ? 1 : 'full'}>
          <OpsErrorTrendChart panel={data.errorTrend} hasDates={hasDates} onOpenErrors={onOpenErrors} />
        </GridSpan>
      </Grid>
      {hasTokenStats && (
        <OpsTokenStatsCard platform={filters.platform} groupId={filters.groupId} refreshKey={refreshKey} />
      )}
    </VStack>
  )
}
