import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { TrendDataPoint } from '@/types'
import { formatTokensK } from '@/utils/format'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { SERIES_COLORS, readChartInk, type ChartInk } from './chartTheme'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const LABEL_GAP = 14
const MIN_LABEL_WIDTH = 440

/**
 * Draws each series' name just right of its last point (direct labels).
 * Labels are sorted by height and spread apart so converging lines never
 * stack their names on top of each other, then kept inside the plot height.
 */
const endLabels: Plugin<'line'> = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart
    // Too narrow to fit names beside the plot: the legend and tooltip carry identity.
    if (chart.width < MIN_LABEL_WIDTH) return
    const ink = (chart.options.plugins as { endLabels?: { color?: string } } | undefined)?.endLabels?.color
    const labels = chart.data.datasets
      .map((ds, i) => {
        const meta = chart.getDatasetMeta(i)
        if (meta.hidden || !meta.data.length) return null
        const last = meta.data[meta.data.length - 1]
        return { text: String(ds.label ?? ''), x: last.x, y: last.y, color: String(ds.borderColor ?? '') }
      })
      .filter((l): l is { text: string; x: number; y: number; color: string } => l !== null)
      .sort((a, b) => a.y - b.y)

    // Push down to resolve overlaps, then shift the block up if it ran past the bottom.
    for (let i = 1; i < labels.length; i++) {
      labels[i].y = Math.max(labels[i].y, labels[i - 1].y + LABEL_GAP)
    }
    const overflow = labels.length ? labels[labels.length - 1].y - chartArea.bottom : 0
    if (overflow > 0) for (const l of labels) l.y -= overflow
    for (let i = labels.length - 2; i >= 0; i--) {
      labels[i].y = Math.min(labels[i].y, labels[i + 1].y - LABEL_GAP)
    }

    ctx.save()
    ctx.font = '500 11px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    for (const l of labels) {
      const x = chartArea.right + 10
      // A short tick in the series colour ties the label to its line.
      ctx.fillStyle = l.color
      ctx.fillRect(x, l.y - 1, 6, 2)
      ctx.fillStyle = ink || '#666'
      ctx.fillText(l.text, x + 10, l.y)
    }
    ctx.restore()
  },
}

export function TokenTrendChart({ trend }: { trend: TrendDataPoint[] }) {
  const { t } = useI18n()
  const colorMode = useAppStore((s) => s.colorMode)
  const hostRef = useRef<HTMLDivElement>(null)
  const [ink, setInk] = useState<ChartInk | null>(null)
  const [wide, setWide] = useState(true)

  useLayoutEffect(() => {
    setInk(readChartInk(hostRef.current))
    setWide((hostRef.current?.clientWidth ?? 0) >= MIN_LABEL_WIDTH)
  }, [colorMode])

  const colors = SERIES_COLORS[colorMode]
  const series = useMemo(
    () => [
      { label: t('dashboard.input'), pick: (d: TrendDataPoint) => d.input_tokens },
      { label: t('dashboard.output'), pick: (d: TrendDataPoint) => d.output_tokens },
      { label: t('usage.cacheCreationTokensLabel'), pick: (d: TrendDataPoint) => d.cache_creation_tokens },
      { label: t('usage.cacheReadTokensLabel'), pick: (d: TrendDataPoint) => d.cache_read_tokens },
    ],
    [t],
  )

  // Cache hit rate is a ratio, not a token count: shown as its own figure rather
  // than on a second y-axis.
  const totals = trend.reduce(
    (acc, d) => ({
      input: acc.input + d.input_tokens,
      creation: acc.creation + d.cache_creation_tokens,
      read: acc.read + d.cache_read_tokens,
    }),
    { input: 0, creation: 0, read: 0 },
  )
  const promptTokens = totals.input + totals.creation + totals.read
  const hitRate = promptTokens > 0 ? (totals.read / promptTokens) * 100 : 0

  const data = {
    labels: trend.map((d) => d.date),
    datasets: series.map((s, i) => ({
      label: s.label,
      data: trend.map(s.pick),
      borderColor: colors[i],
      backgroundColor: colors[i],
      borderWidth: 2,
      pointRadius: trend.length > 20 ? 0 : 3,
      pointHoverRadius: 5,
      pointBorderColor: ink?.surface,
      pointBorderWidth: 2,
      tension: 0.25,
    })),
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: wide ? 88 : 8 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: { color: ink?.muted, usePointStyle: true, pointStyle: 'line', boxWidth: 16, font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatTokensK(Number(ctx.parsed.y))}`,
        },
      },
      ...({ endLabels: { color: ink?.muted } } as object),
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: ink?.grid },
        ticks: { color: ink?.muted, maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        beginAtZero: true,
        grid: { color: ink?.grid },
        border: { display: false },
        ticks: { color: ink?.muted, callback: (v) => formatTokensK(Number(v)) },
      },
    },
  }

  return (
    <VStack gap={3} hAlign="stretch">
      <HStack gap={2} vAlign="center">
        <Text type="supporting" color="secondary">
          {t('usage.cacheHitRate')}
        </Text>
        <Text type="body" weight="semibold" hasTabularNumbers>
          {hitRate.toFixed(1)}%
        </Text>
      </HStack>
      <div ref={hostRef} style={{ position: 'relative', height: 260 }}>
        {ink && (
          <Line
            data={data}
            options={{ ...options, onResize: (chart) => setWide(chart.width >= MIN_LABEL_WIDTH) }}
            plugins={[endLabels]}
          />
        )}
      </div>
    </VStack>
  )
}
