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
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { UserUsageTrendPoint } from '@/types'
import { readChartInk, type ChartInk } from '~/components/charts/chartTheme'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { formatCost, formatTokens, userLabel, type TrendMetric } from './format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// Same height as TokenTrendChart (its 260px plot plus the cache-hit line), so the two cards line up side by side.
const CHART_HEIGHT = 292

// Astryx categorical data colours in palette order; the fallbacks are their light-theme values.
const SERIES_TOKENS: ReadonlyArray<readonly [token: string, fallback: string]> = [
  ['--color-data-categorical-blue', '#0171E3'],
  ['--color-data-categorical-orange', '#EB6E00'],
  ['--color-data-categorical-purple', '#6B1EFD'],
  ['--color-data-categorical-green', '#0B991F'],
  ['--color-data-categorical-pink', '#F351C0'],
  ['--color-data-categorical-cyan', '#0171A4'],
  ['--color-data-categorical-red', '#F5394F'],
  ['--color-data-categorical-teal', '#08A3A3'],
  ['--color-data-categorical-brown', '#965E03'],
  ['--color-data-categorical-indigo', '#6F8AFF'],
]

interface ChartTheme {
  ink: ChartInk
  colors: string[]
}

/** chart.js can't read CSS variables: resolve the palette to concrete colours. */
function readSeriesColors(el: Element): string[] {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  el.appendChild(probe)
  const colors = SERIES_TOKENS.map(([token, fallback]) => {
    probe.style.color = `var(${token}, ${fallback})`
    return getComputedStyle(probe).color || fallback
  })
  probe.remove()
  return colors
}

function UserTrendChart({ points, metric }: { points: UserUsageTrendPoint[]; metric: TrendMetric }) {
  const { t } = useI18n()
  const colorMode = useAppStore((s) => s.colorMode)
  const hostRef = useRef<HTMLElement>(null)
  const [theme, setTheme] = useState<ChartTheme | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (host) setTheme({ ink: readChartInk(host), colors: readSeriesColors(host) })
  }, [colorMode])

  // One line per user id, so two users sharing a display name stay separate.
  const { dates, series } = useMemo(() => {
    const users = new Map<number, { label: string; byDate: Map<string, number> }>()
    const allDates = new Set<string>()
    for (const point of points) {
      allDates.add(point.date)
      let user = users.get(point.user_id)
      if (!user) {
        user = { label: userLabel(point, (id) => t('admin.redeem.userPrefix', { id })), byDate: new Map() }
        users.set(point.user_id, user)
      }
      user.byDate.set(point.date, metric === 'tokens' ? point.tokens : point.actual_cost)
    }
    const sorted = [...allDates].sort()
    return {
      dates: sorted,
      series: [...users.values()].map((user) => ({
        label: user.label,
        values: sorted.map((date) => user.byDate.get(date) || 0),
      })),
    }
  }, [points, metric, t])

  const format = (value: number) => (metric === 'tokens' ? formatTokens(value) : `$${formatCost(value)}`)

  const data = {
    labels: dates,
    datasets: theme
      ? series.map((s, i) => {
          const color = theme.colors[i % theme.colors.length]
          return {
            label: s.label,
            data: s.values,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            // Past the palette's ten hues the colours repeat, told apart by a dashed stroke.
            borderDash: i >= theme.colors.length ? [6, 4] : [],
            pointRadius: dates.length > 20 ? 0 : 3,
            pointHoverRadius: 5,
            pointBorderColor: theme.ink.surface,
            pointBorderWidth: 2,
            tension: 0.3,
          }
        })
      : [],
  }

  const ink = theme?.ink
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: { color: ink?.muted, usePointStyle: true, pointStyle: 'line', boxWidth: 16, font: { size: 12 } },
      },
      tooltip: {
        itemSort: (a, b) => Number(b.parsed.y) - Number(a.parsed.y),
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${format(Number(ctx.parsed.y))}`,
        },
      },
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
        ticks: { color: ink?.muted, callback: (value) => format(Number(value)) },
      },
    },
  }

  return (
    <VStack ref={hostRef} height={CHART_HEIGHT}>
      {theme && <Line data={data} options={options} />}
    </VStack>
  )
}

/** Usage over time of the twelve busiest users, by tokens or by actual spend. */
export function UserTrendCard({
  points,
  loading,
  metric,
  onMetricChange,
}: {
  points: UserUsageTrendPoint[]
  loading: boolean
  metric: TrendMetric
  onMetricChange: (metric: TrendMetric) => void
}) {
  const { t } = useI18n()
  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={3}>{t('admin.dashboard.userUsageTrend')}</Heading>
          <SegmentedControl
            label={t('admin.dashboard.metric')}
            size="sm"
            value={metric}
            onChange={(next) => onMetricChange(next === 'actual_cost' ? 'actual_cost' : 'tokens')}
          >
            <SegmentedControlItem value="tokens" label={t('admin.dashboard.tokens')} />
            <SegmentedControlItem value="actual_cost" label={t('admin.dashboard.actualSpending')} />
          </SegmentedControl>
        </HStack>
        {points.length > 0 ? (
          <UserTrendChart points={points} metric={metric} />
        ) : loading ? (
          <Center height={CHART_HEIGHT}>
            <Spinner />
          </Center>
        ) : (
          <EmptyState isCompact headingLevel={4} title={t('admin.dashboard.noDataAvailable')} />
        )}
      </VStack>
    </Card>
  )
}
