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
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/Stack'
import type { DailyPaymentStats } from '@/types/payment'
import { formatPaymentAmount } from '@/components/payment/currency'
import { readChartInk, type ChartInk } from '~/components/charts/chartTheme'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { buildDailyRevenueChartModel } from './dashboardModel'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const CHART_HEIGHT = 280
type ColorToken = readonly [token: string, fallback: string]
// The colours of the currencies. Green is not among them: it is the order count's.
const CURRENCY_TOKENS: ReadonlyArray<ColorToken> = [
  ['--color-data-categorical-blue', '#0171E3'],
  ['--color-data-categorical-orange', '#EB6E00'],
  ['--color-data-categorical-purple', '#6B1EFD'],
  ['--color-data-categorical-pink', '#F351C0'],
  ['--color-data-categorical-cyan', '#0171A4'],
  ['--color-data-categorical-red', '#F5394F'],
  ['--color-data-categorical-teal', '#08A3A3'],
  ['--color-data-categorical-brown', '#965E03'],
  ['--color-data-categorical-indigo', '#6F8AFF'],
]
const COUNT_TOKEN: ColorToken = ['--color-data-categorical-green', '#0B991F']

interface ChartTheme {
  ink: ChartInk
  colors: string[]
  countColor: string
}

function readTheme(host: Element): ChartTheme {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  host.appendChild(probe)
  const read = ([token, fallback]: ColorToken) => {
    probe.style.color = `var(${token}, ${fallback})`
    return getComputedStyle(probe).color || fallback
  }
  const theme = { ink: readChartInk(host), colors: CURRENCY_TOKENS.map(read), countColor: read(COUNT_TOKEN) }
  probe.remove()
  return theme
}

function RevenueLine({ data }: { data: DailyPaymentStats[] }) {
  const { t, locale } = useI18n()
  const colorMode = useAppStore((state) => state.colorMode)
  const hostRef = useRef<HTMLElement>(null)
  const [theme, setTheme] = useState<ChartTheme | null>(null)
  const model = useMemo(() => buildDailyRevenueChartModel(data), [data])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (host) setTheme(readTheme(host))
  }, [colorMode])

  const chartData = {
    labels: model.dates,
    datasets: [
      ...model.currencies.map((currency, index) => {
        const color = theme?.colors[index % (theme.colors.length || 1)]
        return {
          label: `${currency} ${t('payment.admin.revenue')}`,
          data: model.amountsByCurrency[currency],
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          pointRadius: model.dates.length > 20 ? 0 : 3,
          pointHoverRadius: 5,
          tension: 0.3,
          yAxisID: 'y',
        }
      }),
      {
        label: t('payment.admin.orderCount'),
        data: model.orderCounts,
        borderColor: theme?.countColor,
        backgroundColor: theme?.countColor,
        borderWidth: 2,
        pointRadius: model.dates.length > 20 ? 0 : 3,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: 'y1',
      },
    ],
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
        callbacks: {
          label: (context) => {
            const value = Number(context.parsed.y)
            const name = context.dataset.label ?? ''
            // The currencies come first among the lines; the one after them is the order count.
            const currency = model.currencies[context.datasetIndex]
            return currency ? `${name}: ${formatPaymentAmount(value, currency, locale)}` : `${name}: ${value}`
          },
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
        type: 'linear',
        display: true,
        position: 'left',
        beginAtZero: true,
        grid: { color: ink?.grid },
        border: { display: false },
        title: { display: true, text: t('payment.admin.revenue'), color: ink?.muted },
        ticks: { color: ink?.muted },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        border: { display: false },
        title: { display: true, text: t('payment.admin.orderCount'), color: ink?.muted },
        ticks: { color: ink?.muted, precision: 0, callback: (value) => String(Math.round(Number(value))) },
      },
    },
  }

  return (
    <VStack ref={hostRef} height={CHART_HEIGHT}>
      {theme && <Line data={chartData} options={options} aria-label={t('payment.admin.dailyRevenue')} />}
    </VStack>
  )
}

export function DailyRevenueChart({ data }: { data: DailyPaymentStats[] }) {
  const { t } = useI18n()
  return (
    <Card>
      <VStack gap={4}>
        <Heading level={3}>{t('payment.admin.dailyRevenue')}</Heading>
        {data.length ? <RevenueLine data={data} /> : <EmptyState isCompact headingLevel={4} title={t('payment.admin.noData')} />}
      </VStack>
    </Card>
  )
}
