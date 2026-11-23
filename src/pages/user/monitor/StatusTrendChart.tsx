import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
  type LegendItem,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import type { MonitorCoverage } from '@/api/channelMonitorV2'
import { formatMonitorMs, formatMonitorPercent } from '@/features/channel-monitor-v2/monitorFormat'
import { sliceByZoom } from '@/features/channel-monitor-v2/monitorZoom'
import { readChartInk, SERIES_COLORS, type ChartInk } from '~/components/charts/chartTheme'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { timeFormats, zoomScope } from './pulseAxis'
import { TrendCardHeader } from './TrendCardHeader'
import { plotRatio, trendSeries, type TrendPoint } from './trendSeries'
import { useAxisZoom } from './useAxisZoom'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const PERCENT_AXIS = 'percent'
const LATENCY_AXIS = 'latency'

/**
 * A sample of each line for the legend, drawn as the line is: in its colour, and dashed if the line is. Left
 * to itself the chart takes the samples after the points of a line, which are ringed in the colour of the card.
 */
function lineSamples(chart: ChartJS): LegendItem[] {
  return ChartJS.defaults.plugins.legend.labels.generateLabels(chart).map((item) => {
    const dataset = chart.data.datasets[item.datasetIndex ?? 0] as { borderColor?: unknown; borderDash?: number[] }
    return {
      ...item,
      strokeStyle: typeof dataset.borderColor === 'string' ? dataset.borderColor : item.strokeStyle,
      lineWidth: 2,
      lineDash: dataset.borderDash ?? [],
    }
  })
}

/**
 * The trend of the filtered traffic over the chosen range, as three lines in one chart: the share of failed
 * requests and the share of cached tokens against the left axis in percent, the median time to the first token
 * against the right axis. The latency line is dashed, to set it apart as the one read on the right.
 *
 * Turning the wheel over the chart zooms into the range around the pointer.
 */
export function StatusTrendChart({
  trend,
  coverage,
  isLoading,
}: {
  trend: TrendPoint[]
  coverage: MonitorCoverage | null
  isLoading: boolean
}) {
  const { t, locale } = useI18n()
  const colorMode = useAppStore((s) => s.colorMode)
  const cardRef = useRef<HTMLElement>(null)
  const chartRef = useRef<ChartJS<'line', Array<number | null>, string>>(null)
  const [ink, setInk] = useState<ChartInk | null>(null)

  useLayoutEffect(() => {
    setInk(readChartInk(cardRef.current))
  }, [colorMode])

  const plotRatioAt = useCallback((event: WheelEvent) => {
    const chart = chartRef.current
    if (!chart) return null
    const left = chart.canvas.getBoundingClientRect().left
    return plotRatio(event.clientX, left + chart.chartArea.left, left + chart.chartArea.right)
  }, [])
  const { zoom, isZoomed, resetZoom, hostRef } = useAxisZoom(zoomScope(coverage), plotRatioAt)

  // The lines are evened out over the whole range, so a value does not change as the zoom moves past it.
  const series = useMemo(() => trendSeries(trend), [trend])
  const formats = useMemo(() => timeFormats(locale), [locale])
  const labels = sliceByZoom(trend, zoom).map((point) => formats.axis.format(new Date(point.bucket_start)))

  const colors = SERIES_COLORS[colorMode]
  const line = (label: string, values: Array<number | null>, color: string, yAxisID: string) => ({
    label,
    data: sliceByZoom(values, zoom),
    yAxisID,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHitRadius: 10,
    pointBorderColor: ink?.surface,
    pointBorderWidth: 2,
    tension: 0.3,
    spanGaps: true,
  })
  const data = {
    labels,
    datasets: [
      line(t('channelMonitorV2.chart.errorLegend'), series.errorRate, colors[1], PERCENT_AXIS),
      line(t('channelMonitorV2.chart.cacheLegend'), series.cacheRate, colors[0], PERCENT_AXIS),
      { ...line(t('channelMonitorV2.chart.ttftLegend'), series.ttft, colors[2], LATENCY_AXIS), borderDash: [6, 4] },
    ],
  }
  // In the tooltip the lines go by their own names; which axis each is read on matters in the legend only.
  const tooltipNames = [
    t('channelMonitorV2.chart.errorDataset'),
    t('channelMonitorV2.chart.cacheDataset'),
    t('channelMonitorV2.chart.ttftDataset'),
  ]

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    // Every turn of the wheel redraws the chart. Easing each redraw would make the zoom trail behind the wheel.
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          color: ink?.muted,
          usePointStyle: true,
          pointStyle: 'line',
          boxWidth: 16,
          font: { size: 12 },
          generateLabels: lineSamples,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed.y
            const isLatency = ctx.dataset.yAxisID === LATENCY_AXIS
            const text = value == null ? '-' : isLatency ? formatMonitorMs(value) : formatMonitorPercent(value / 100)
            return `${tooltipNames[ctx.datasetIndex]}: ${text}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: ink?.grid },
        ticks: { color: ink?.muted, maxRotation: 0, autoSkipPadding: 16, maxTicksLimit: 8 },
      },
      [PERCENT_AXIS]: {
        position: 'left',
        min: 0,
        suggestedMax: 100,
        grid: { color: ink?.grid },
        border: { display: false },
        ticks: { color: ink?.muted, callback: (value) => `${value}%` },
        title: { display: true, text: t('channelMonitorV2.chart.percentAxis'), color: ink?.muted },
      },
      [LATENCY_AXIS]: {
        position: 'right',
        min: 0,
        // One set of grid lines is enough; a second set at other heights would only blur the first.
        grid: { drawOnChartArea: false },
        border: { display: false },
        ticks: { color: ink?.muted, callback: (value) => formatMonitorMs(Number(value)) },
        title: { display: true, text: t('channelMonitorV2.metrics.ttftP50'), color: ink?.muted },
      },
    },
  }

  return (
    <Card padding={6}>
      <VStack gap={4} hAlign="stretch" ref={cardRef}>
        <TrendCardHeader
          title={t('channelMonitorV2.chart.title')}
          description={t('channelMonitorV2.chart.description')}
          bucketSeconds={coverage?.bucket_seconds}
          resetLabel={t('channelMonitorV2.chart.resetZoom')}
          isZoomed={isZoomed}
          onResetZoom={resetZoom}
        />
        {isLoading ? (
          <Center padding={10}>
            <Spinner />
          </Center>
        ) : trend.length === 0 ? (
          <EmptyState title={t('channelMonitorV2.chart.emptyTitle')} description={t('channelMonitorV2.empty.description')} />
        ) : (
          <VStack height={260} ref={hostRef}>
            {ink && <Line ref={chartRef} data={data} options={options} aria-label={t('channelMonitorV2.chart.title')} />}
          </VStack>
        )}
      </VStack>
    </Card>
  )
}
