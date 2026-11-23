import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { formatNumber } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { OpsDashboardOverview, OpsMetricThresholds, OpsPercentiles } from '~/lib/api/admin/ops'
import { OpsHealthCard } from './OpsHealthCard'
import { OpsRealtimeCard } from './OpsRealtimeCard'
import { OpsStatCard, type OpsFact } from './OpsStatCard'
import { OpsSystemHealth } from './OpsSystemHealth'
import type { OpsErrorKind } from './errorLog'
import type { OpsFilters } from './filters'
import {
  bare,
  finite,
  formatRate,
  requestErrorTone,
  slaTone,
  toPercent,
  ttftTone,
  upstreamErrorTone,
  type OpsTone,
} from './health'
import type { OpsRequestsPreset } from './useOpsDetails'

const TONE_LABEL_KEY: Record<OpsTone, string> = {
  success: 'admin.ops.ok',
  warning: 'common.warning',
  error: 'common.critical',
  neutral: 'admin.ops.noData',
}

const NO_VALUE = '-'

const formatMs = (value: unknown): string => {
  const ms = finite(value)
  return ms == null ? NO_VALUE : Math.round(ms).toLocaleString()
}

const formatTokensPerSecond = (value: unknown): string => finite(value)?.toFixed(1) ?? NO_VALUE

/** A missing figure stays a bare dash instead of a dash with a unit. */
const withUnit = (figure: string, unit: string): string => (figure === NO_VALUE ? figure : `${figure} ${unit}`)

const percentileFacts = (figures: OpsPercentiles | null | undefined): OpsFact[] => [
  { label: 'P95', value: withUnit(formatMs(figures?.p95_ms), 'ms') },
  { label: 'P90', value: withUnit(formatMs(figures?.p90_ms), 'ms') },
  { label: 'P50', value: withUnit(formatMs(figures?.p50_ms), 'ms') },
  { label: 'Avg', value: withUnit(formatMs(figures?.avg_ms), 'ms') },
  { label: 'Max', value: withUnit(formatMs(figures?.max_ms), 'ms') },
]

/** Health, realtime traffic and the request figures of the selected window, then the host's own health. */
export function OpsOverview({
  overview,
  thresholds,
  filters,
  refreshKey,
  isRealtimeEnabled,
  onRealtimeDisabled,
  onOpenRequests,
  onOpenErrors,
}: {
  overview: OpsDashboardOverview
  thresholds: OpsMetricThresholds | null
  filters: OpsFilters
  refreshKey: number
  isRealtimeEnabled: boolean
  onRealtimeDisabled: () => void
  /**
   * Opens the requests behind a figure, filtered and sorted the way that figure reads them.
   * Without it (and without `onOpenErrors`) the cards offer no "details": full screen has no lists to open.
   */
  onOpenRequests?: (preset: OpsRequestsPreset) => void
  onOpenErrors?: (errorKind: OpsErrorKind) => void
}) {
  const { t } = useI18n()

  const requestsTitle = t('admin.ops.requestDetails.title')
  const details = (open: () => void) => (
    <Button label={t('admin.ops.requestDetails.details')} variant="ghost" size="sm" onClick={open} />
  )
  const requestDetails = (preset: OpsRequestsPreset) => onOpenRequests && details(() => onOpenRequests(preset))
  const errorDetails = (errorKind: OpsErrorKind) => onOpenErrors && details(() => onOpenErrors(errorKind))

  // A dot is shown only for a figure that exists; its label says what the colour means.
  const status = (tone: OpsTone) => (tone === 'neutral' ? undefined : { tone, label: t(TONE_LABEL_KEY[tone]) })

  const sla = (overview.request_count_sla ?? 0) > 0 ? toPercent(overview.sla) : null
  const errorRate = toPercent(overview.error_rate)
  const upstreamErrorRate = toPercent(overview.upstream_error_rate)
  const ttftP99 = finite(overview.ttft?.p99_ms)
  const outputTps = overview.output_tps ?? null

  return (
    <VStack gap={6}>
      <Grid columns={{ minWidth: 300, max: 3, repeat: 'fill' }} gap={4}>
        <OpsHealthCard overview={overview} />
        <OpsRealtimeCard
          timeRange={filters.timeRange}
          platform={filters.platform}
          groupId={filters.groupId}
          refreshKey={refreshKey}
          isEnabled={isRealtimeEnabled}
          onDisabled={onRealtimeDisabled}
        />
        <OpsStatCard
          title={t('admin.ops.requestsTitle')}
          help={t('admin.ops.tooltips.totalRequests')}
          action={requestDetails({ title: requestsTitle })}
          value={formatNumber(overview.request_count_total ?? 0)}
          facts={[
            { label: t('admin.ops.tokens'), value: formatNumber(overview.token_consumed ?? 0) },
            { label: t('admin.ops.avgQps'), value: formatRate(overview.qps?.avg) },
            { label: t('admin.ops.avgTps'), value: formatRate(overview.tps?.avg) },
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.sla')}
          help={t('admin.ops.tooltips.sla')}
          // What pulls the SLA down are the failed requests.
          action={requestDetails({ title: requestsTitle, kind: 'error' })}
          value={sla == null ? NO_VALUE : `${sla.toFixed(3)}%`}
          status={status(slaTone(sla, thresholds))}
          // The bar spans 90%..100%: below 90% an SLA is far off target either way.
          bar={sla == null ? undefined : (sla - 90) * 10}
          facts={[
            {
              label: t('admin.ops.exceptions'),
              value: formatNumber((overview.request_count_sla ?? 0) - (overview.success_count ?? 0)),
            },
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.latencyDuration')}
          help={t('admin.ops.tooltips.latency')}
          action={requestDetails({ title: t('admin.ops.latencyDuration'), sort: 'duration_desc' })}
          value={formatMs(overview.duration?.p99_ms)}
          unit="ms (P99)"
          facts={percentileFacts(overview.duration)}
        />
        <OpsStatCard
          title={t('admin.ops.ttftLabel')}
          help={t('admin.ops.tooltips.ttft')}
          action={requestDetails({ title: t('admin.ops.ttftLabel'), kind: 'success', sort: 'ttft_desc' })}
          value={formatMs(ttftP99)}
          unit="ms (P99)"
          status={status(ttftTone(ttftP99, thresholds))}
          facts={percentileFacts(overview.ttft)}
        />
        <OpsStatCard
          title={t('admin.ops.requestErrors')}
          help={t('admin.ops.tooltips.errors')}
          action={errorDetails('request')}
          value={errorRate == null ? NO_VALUE : `${errorRate.toFixed(2)}%`}
          status={status(requestErrorTone(errorRate, thresholds))}
          facts={[
            { label: t('admin.ops.errorCount'), value: formatNumber(overview.error_count_sla ?? 0) },
            { label: bare(t('admin.ops.businessLimited')), value: formatNumber(overview.business_limited_count ?? 0) },
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.upstreamErrors')}
          help={t('admin.ops.tooltips.upstreamErrors')}
          action={errorDetails('upstream')}
          value={upstreamErrorRate == null ? NO_VALUE : `${upstreamErrorRate.toFixed(2)}%`}
          status={status(upstreamErrorTone(upstreamErrorRate, thresholds))}
          facts={[
            {
              label: t('admin.ops.errorCountExcl429529'),
              value: formatNumber(overview.upstream_error_count_excl_429_529 ?? 0),
            },
            {
              label: '429/529',
              value: formatNumber((overview.upstream_429_count ?? 0) + (overview.upstream_529_count ?? 0)),
            },
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.outputTps')}
          help={t('admin.ops.tooltips.outputTps')}
          value={formatTokensPerSecond(outputTps?.p50)}
          unit="tok/s (P50)"
          facts={[
            { label: 'P5', value: withUnit(formatTokensPerSecond(outputTps?.p5), 'tok/s') },
            { label: 'P10', value: withUnit(formatTokensPerSecond(outputTps?.p10), 'tok/s') },
            { label: 'Avg', value: withUnit(formatTokensPerSecond(outputTps?.avg), 'tok/s') },
          ]}
          note={
            outputTps == null
              ? undefined
              : t('admin.ops.outputTpsSamples', { count: formatNumber(outputTps.sample_count ?? 0) })
          }
        />
      </Grid>
      <OpsSystemHealth overview={overview} />
    </VStack>
  )
}
