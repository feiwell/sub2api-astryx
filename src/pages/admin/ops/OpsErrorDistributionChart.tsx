import { Doughnut } from 'react-chartjs-2'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { VStack } from '@astryxdesign/core/Stack'
import { useI18n } from '~/i18n'
import type { OpsErrorDistributionItem, OpsErrorDistributionResponse } from '~/lib/api/admin/ops'
import { OpsChartCard } from './OpsChartCard'
import { OpsFacts } from './OpsStatCard'
import { bare } from './health'
import { OPS_CHART_HEIGHT } from './opsChart'
import type { OpsPanel } from './useOpsDashboardData'

// The ring leaves room under it for the line naming the largest share.
const RING_HEIGHT = OPS_CHART_HEIGHT - 32

type ErrorOrigin = 'upstream' | 'client' | 'system' | 'other'

const ORIGINS: readonly ErrorOrigin[] = ['upstream', 'client', 'system', 'other']

/** Errors that count against the SLA, by who answered with them: 502/503/504 upstream, 4xx client, 500 system. */
function countByOrigin(items: OpsErrorDistributionItem[]): Record<ErrorOrigin, number> {
  const counts = { upstream: 0, client: 0, system: 0, other: 0 }
  for (const item of items) {
    const code = Number(item.status_code || 0)
    const count = Number(item.sla || 0)
    if (!Number.isFinite(code) || !Number.isFinite(count)) continue
    if (code === 502 || code === 503 || code === 504) counts.upstream += count
    else if (code >= 400 && code < 500) counts.client += count
    else if (code === 500) counts.system += count
    else counts.other += count
  }
  return counts
}

/** Where the errors of the window came from, as shares of a ring. */
export function OpsErrorDistributionChart({
  panel,
  onOpenDetails,
}: {
  panel: OpsPanel<OpsErrorDistributionResponse>
  /** Opens the list of the request errors the ring counts. Without it the button is not offered. */
  onOpenDetails?: () => void
}) {
  const { t } = useI18n()
  const counts = countByOrigin(panel.data?.items ?? [])
  const labels: Record<ErrorOrigin, string> = {
    upstream: t('admin.ops.upstream'),
    client: t('admin.ops.client'),
    system: t('admin.ops.system'),
    other: t('admin.ops.other'),
  }
  const slices = ORIGINS.filter((origin) => counts[origin] > 0).map((origin) => ({
    origin,
    label: labels[origin],
    count: counts[origin],
  }))
  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
  const largest = slices.reduce<(typeof slices)[number] | null>(
    (top, slice) => (top && top.count >= slice.count ? top : slice),
    null,
  )
  const title = t('admin.ops.errorDistribution')

  return (
    <OpsChartCard
      title={title}
      help={t('admin.ops.tooltips.errorDistribution')}
      action={
        onOpenDetails && (
          <Button
            label={t('admin.ops.requestDetails.details')}
            tooltip={t('admin.ops.errorDetails.requestErrors')}
            variant="secondary"
            size="sm"
            isDisabled={total === 0}
            onClick={onOpenDetails}
          />
        )
      }
      panel={panel}
      hasData={total > 0}
      emptyText={t('admin.ops.charts.emptyError')}
    >
      {({ ink, colors }) => {
        const palette: Record<ErrorOrigin, string> = {
          upstream: colors.orange,
          client: colors.blue,
          system: colors.red,
          other: ink.muted,
        }
        return (
          <VStack gap={2}>
            <VStack height={RING_HEIGHT}>
              <Doughnut
                role="img"
                aria-label={title}
                data={{
                  // The legend doubles as the list of counts.
                  labels: slices.map((slice) => `${slice.label} ${slice.count.toLocaleString()}`),
                  datasets: [
                    {
                      data: slices.map((slice) => slice.count),
                      backgroundColor: slices.map((slice) => palette[slice.origin]),
                      borderColor: ink.surface,
                      borderWidth: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '65%',
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        color: ink.muted,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        boxHeight: 8,
                        font: { size: 12 },
                      },
                    },
                    tooltip: {
                      callbacks: {
                        label: (item) => {
                          const slice = slices[item.dataIndex]
                          if (!slice) return ''
                          const share = ((slice.count / total) * 100).toFixed(1)
                          return `${slice.label}: ${slice.count.toLocaleString()} (${share}%)`
                        },
                      },
                    },
                  },
                }}
              />
            </VStack>
            {largest && (
              <Center>
                <OpsFacts facts={[{ label: bare(t('admin.ops.top')), value: largest.label }]} />
              </Center>
            )}
          </VStack>
        )
      }}
    </OpsChartCard>
  )
}
