import { Bar } from 'react-chartjs-2'
import { useI18n } from '~/i18n'
import type { OpsLatencyHistogramResponse } from '~/lib/api/admin/ops'
import { OpsChartCard } from './OpsChartCard'
import type { OpsPanel } from './useOpsDashboardData'

/** How long successful requests took: the number of requests in each duration band. */
export function OpsLatencyChart({ panel }: { panel: OpsPanel<OpsLatencyHistogramResponse> }) {
  const { t } = useI18n()
  const buckets = panel.data?.buckets ?? []
  const hasRequests = (panel.data?.total_requests ?? 0) > 0
  const title = t('admin.ops.latencyHistogram')
  const seriesLabel = t('admin.ops.requests')

  return (
    <OpsChartCard
      title={title}
      help={t('admin.ops.tooltips.latencyHistogram')}
      panel={panel}
      hasData={hasRequests}
      emptyText={t('admin.ops.charts.emptyRequest')}
    >
      {({ ink, colors }) => (
        <Bar
          role="img"
          aria-label={title}
          data={{
            labels: buckets.map((bucket) => bucket.range),
            datasets: [
              {
                label: seriesLabel,
                data: buckets.map((bucket) => bucket.count),
                backgroundColor: colors.blue,
                borderRadius: 4,
                barPercentage: 0.6,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (item) => `${item.dataset.label}: ${Number(item.parsed.y).toLocaleString()}`,
                },
              },
            },
            scales: {
              x: { grid: { display: false }, border: { color: ink.grid }, ticks: { color: ink.muted } },
              y: {
                beginAtZero: true,
                grid: { color: ink.grid },
                border: { display: false },
                ticks: { color: ink.muted, precision: 0 },
              },
            },
          }}
        />
      )}
    </OpsChartCard>
  )
}
