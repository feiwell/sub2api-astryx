import { useRef } from 'react'
import type { Chart as ChartJS } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Stack'
import { Token } from '@astryxdesign/core/Token'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { formatNumber } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { OpsThroughputTrendResponse } from '~/lib/api/admin/ops'
import { OpsChartCard } from './OpsChartCard'
import { bucketLabel, lineOptions, lineSeries, sumOf } from './opsChart'
import type { OpsPanel } from './useOpsDashboardData'

const formatRate = (value: number) => value.toFixed(1)

/** Requests and tokens per second across the selected window, with shortcuts into one platform or group. */
export function OpsThroughputChart({
  panel,
  hasDates,
  onSelectPlatform,
  onSelectGroup,
  onOpenDetails,
}: {
  panel: OpsPanel<OpsThroughputTrendResponse>
  /** The window reaches a day, so the axis labels carry the date. */
  hasDates: boolean
  onSelectPlatform: (platform: string) => void
  onSelectGroup: (groupId: number) => void
  /** Opens the list of the requests the chart counts. Without it the button is not offered. */
  onOpenDetails?: () => void
}) {
  const { t } = useI18n()
  const chartRef = useRef<ChartJS<'line', number[]>>(null)
  const points = panel.data?.points ?? []
  const hasRequests = sumOf(points.map((point) => point.request_count)) > 0
  const title = t('admin.ops.throughputTrend')
  const tpsLabel = t('admin.ops.tpsK')

  // The backend breaks the traffic down by group once a platform is selected, by platform before that.
  // Picking one narrows the whole page to it.
  const topGroups = panel.data?.top_groups ?? []
  const shortcuts =
    topGroups.length > 0
      ? topGroups.map((group) => ({
          key: `group-${group.group_id}`,
          label: `${group.group_name || `#${group.group_id}`} ${formatNumber(group.request_count)}`,
          select: () => onSelectGroup(group.group_id),
        }))
      : (panel.data?.by_platform ?? []).map((item) => ({
          key: `platform-${item.platform}`,
          label: `${item.platform.toUpperCase()} ${formatNumber(item.request_count)}`,
          select: () => onSelectPlatform(item.platform),
        }))

  const download = () => {
    const chart = chartRef.current
    if (!chart) return
    const link = document.createElement('a')
    link.href = chart.toBase64Image('image/png', 1)
    link.download = `ops-throughput-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
    link.click()
  }

  return (
    <OpsChartCard
      title={title}
      help={t('admin.ops.tooltips.throughputTrend')}
      action={
        <HStack gap={2}>
          {onOpenDetails && (
            <Button
              label={t('admin.ops.requestDetails.details')}
              tooltip={t('admin.ops.requestDetails.title')}
              variant="secondary"
              size="sm"
              isDisabled={!hasRequests}
              onClick={onOpenDetails}
            />
          )}
          <Button
            label={t('admin.ops.charts.downloadChart')}
            tooltip={t('admin.ops.charts.downloadChartHint')}
            variant="secondary"
            size="sm"
            icon={<Icon icon={ArrowDownTrayIcon} />}
            isDisabled={!hasRequests}
            onClick={download}
          />
        </HStack>
      }
      lead={
        shortcuts.length > 0 && (
          <HStack gap={2} wrap="wrap">
            {shortcuts.map((shortcut) => (
              <Token key={shortcut.key} size="sm" label={shortcut.label} onClick={shortcut.select} />
            ))}
          </HStack>
        )
      }
      panel={panel}
      hasData={hasRequests}
      emptyText={t('admin.ops.charts.emptyRequest')}
    >
      {({ ink, colors }) => (
        <Line
          ref={chartRef}
          role="img"
          aria-label={title}
          data={{
            labels: points.map((point) => bucketLabel(point.bucket_start, hasDates)),
            datasets: [
              lineSeries(
                'QPS',
                points.map((point) => point.qps ?? 0),
                colors.blue,
              ),
              // Tokens per second run a thousand times higher than requests, so they get the right-hand axis.
              {
                ...lineSeries(
                  tpsLabel,
                  points.map((point) => (point.tps ?? 0) / 1000),
                  colors.green,
                ),
                yAxisID: 'y1',
              },
            ],
          }}
          options={lineOptions(ink, { formatValue: formatRate, rightAxisColor: colors.green })}
        />
      )}
    </OpsChartCard>
  )
}
