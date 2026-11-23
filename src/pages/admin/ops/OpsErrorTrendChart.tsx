import { Line } from 'react-chartjs-2'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/Stack'
import { useI18n } from '~/i18n'
import type { OpsErrorTrendResponse } from '~/lib/api/admin/ops'
import { OpsChartCard } from './OpsChartCard'
import type { OpsErrorKind } from './errorLog'
import { bare } from './health'
import { bucketLabel, lineOptions, lineSeries, sumOf } from './opsChart'
import type { OpsPanel } from './useOpsDashboardData'

/** Errors over the selected window: those counted against the SLA, upstream errors, and business limits. */
export function OpsErrorTrendChart({
  panel,
  hasDates,
  onOpenErrors,
}: {
  panel: OpsPanel<OpsErrorTrendResponse>
  /** The window reaches a day, so the axis labels carry the date. */
  hasDates: boolean
  /** Opens one of the two error lists. Without it the two buttons are not offered. */
  onOpenErrors?: (errorKind: OpsErrorKind) => void
}) {
  const { t } = useI18n()
  const points = panel.data?.points ?? []
  // A list is offered only when the window holds errors of its kind. For the upstream list that
  // includes the rate limits (429, 529), which the chart leaves out.
  const requestErrors = sumOf(points.map((point) => point.error_count_sla ?? 0))
  const upstreamErrors = sumOf(
    points.map(
      (point) =>
        (point.upstream_error_count_excl_429_529 ?? 0) +
        (point.upstream_429_count ?? 0) +
        (point.upstream_529_count ?? 0),
    ),
  )
  const shownErrors = sumOf(
    points.map(
      (point) =>
        (point.error_count_sla ?? 0) +
        (point.upstream_error_count_excl_429_529 ?? 0) +
        (point.business_limited_count ?? 0),
    ),
  )
  const title = t('admin.ops.errorTrend')
  const labels = {
    sla: t('admin.ops.errorsSla'),
    upstream: t('admin.ops.upstreamExcl429529'),
    businessLimited: bare(t('admin.ops.businessLimited')),
  }

  return (
    <OpsChartCard
      title={title}
      help={t('admin.ops.tooltips.errorTrend')}
      action={
        onOpenErrors && (
          <HStack gap={2}>
            <Button
              label={t('admin.ops.errorDetails.requestErrors')}
              variant="secondary"
              size="sm"
              isDisabled={requestErrors === 0}
              onClick={() => onOpenErrors('request')}
            />
            <Button
              label={t('admin.ops.errorDetails.upstreamErrors')}
              variant="secondary"
              size="sm"
              isDisabled={upstreamErrors === 0}
              onClick={() => onOpenErrors('upstream')}
            />
          </HStack>
        )
      }
      panel={panel}
      hasData={shownErrors > 0}
      emptyText={t('admin.ops.charts.emptyError')}
    >
      {({ ink, colors }) => (
        <Line
          role="img"
          aria-label={title}
          data={{
            labels: points.map((point) => bucketLabel(point.bucket_start, hasDates)),
            datasets: [
              lineSeries(
                labels.sla,
                points.map((point) => point.error_count_sla ?? 0),
                colors.red,
              ),
              lineSeries(
                labels.upstream,
                points.map((point) => point.upstream_error_count_excl_429_529 ?? 0),
                colors.purple,
              ),
              // Business limits are not failures of the service, so their line stays in the background.
              {
                ...lineSeries(
                  labels.businessLimited,
                  points.map((point) => point.business_limited_count ?? 0),
                  ink.muted,
                ),
                borderDash: [6, 6],
              },
            ],
          }}
          options={lineOptions(ink, { hasIntegerTicks: true })}
        />
      )}
    </OpsChartCard>
  )
}
