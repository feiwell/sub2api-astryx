import { Line } from 'react-chartjs-2'
import { useI18n } from '~/i18n'
import type { OpsThroughputTrendResponse } from '~/lib/api/admin/ops'
import { OpsChartCard } from './OpsChartCard'
import { bucketLabel, lineOptions, lineSeries, sumOf } from './opsChart'
import type { OpsPanel } from './useOpsDashboardData'

const formatRatio = (value: number) => value.toFixed(3)

/** Account switches per request over the last five hours: how often a request had to move to another account. */
export function OpsSwitchRateChart({ panel }: { panel: OpsPanel<OpsThroughputTrendResponse> }) {
  const { t } = useI18n()
  const points = panel.data?.points ?? []
  const hasRequests = sumOf(points.map((point) => point.request_count)) > 0
  const title = t('admin.ops.switchRateTrend')
  const seriesLabel = t('admin.ops.switchRate')

  return (
    <OpsChartCard
      title={title}
      help={t('admin.ops.tooltips.switchRateTrend')}
      panel={panel}
      hasData={hasRequests}
      emptyText={t('admin.ops.charts.emptyRequest')}
    >
      {({ ink, colors }) => (
        <Line
          role="img"
          aria-label={title}
          data={{
            // The window is always five hours, so the time of day is enough.
            labels: points.map((point) => bucketLabel(point.bucket_start, false)),
            datasets: [
              lineSeries(
                seriesLabel,
                points.map((point) =>
                  point.request_count > 0 ? (point.switch_count ?? 0) / point.request_count : 0,
                ),
                colors.teal,
              ),
            ],
          }}
          options={lineOptions(ink, { hasLegend: false, formatValue: formatRatio, formatTick: formatRatio })}
        />
      )}
    </OpsChartCard>
  )
}
