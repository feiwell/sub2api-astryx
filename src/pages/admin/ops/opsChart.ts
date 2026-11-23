import { useLayoutEffect, useState, type RefObject } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js'
import { readChartInk, type ChartInk } from '~/components/charts/chartTheme'
import { useAppStore } from '~/stores/app'

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LineElement, LinearScale, PointElement, Tooltip)

/** Height of every plot on the ops page, so the cards of one row line up. */
export const OPS_CHART_HEIGHT = 260

// Astryx categorical data colours by name. The fallbacks are their light-theme values.
const SERIES_TOKENS = {
  blue: ['--color-data-categorical-blue', '#0171E3'],
  green: ['--color-data-categorical-green', '#0B991F'],
  orange: ['--color-data-categorical-orange', '#EB6E00'],
  purple: ['--color-data-categorical-purple', '#6B1EFD'],
  red: ['--color-data-categorical-red', '#F5394F'],
  teal: ['--color-data-categorical-teal', '#08A3A3'],
} as const

export type OpsSeriesColor = keyof typeof SERIES_TOKENS

export interface OpsChartTheme {
  ink: ChartInk
  colors: Record<OpsSeriesColor, string>
}

/** chart.js cannot read CSS variables: the palette is resolved to concrete colours on the page. */
function readSeriesColors(host: Element): Record<OpsSeriesColor, string> {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  host.appendChild(probe)
  const read = ([token, fallback]: readonly [string, string]): string => {
    probe.style.color = `var(${token}, ${fallback})`
    return getComputedStyle(probe).color || fallback
  }
  const colors = {
    blue: read(SERIES_TOKENS.blue),
    green: read(SERIES_TOKENS.green),
    orange: read(SERIES_TOKENS.orange),
    purple: read(SERIES_TOKENS.purple),
    red: read(SERIES_TOKENS.red),
    teal: read(SERIES_TOKENS.teal),
  }
  probe.remove()
  return colors
}

/** Text, grid and series colours as they resolve inside `hostRef`; read again when the colour mode changes. */
export function useOpsChartTheme(hostRef: RefObject<Element | null>): OpsChartTheme | null {
  const colorMode = useAppStore((s) => s.colorMode)
  const [theme, setTheme] = useState<OpsChartTheme | null>(null)
  useLayoutEffect(() => {
    const host = hostRef.current
    if (host) setTheme({ ink: readChartInk(host), colors: readSeriesColors(host) })
  }, [colorMode, hostRef])
  return theme
}

export type OpsChartState = 'ready' | 'loading' | 'failed' | 'empty'

/**
 * A chart that has data keeps showing it while a reload runs; the spinner only fills an empty plot.
 * A load that failed is told apart from a window that holds nothing.
 */
export const chartStateOf = (hasData: boolean, load: { isLoading: boolean; error: unknown }): OpsChartState =>
  hasData ? 'ready' : load.isLoading ? 'loading' : load.error ? 'failed' : 'empty'

export const sumOf = (values: Array<number | null | undefined>): number =>
  values.reduce<number>((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0)

const pad = (value: number) => String(value).padStart(2, '0')

/** Axis label of a bucket: the time of day, with the date in front when the window reaches a day. */
export function bucketLabel(bucketStart: string | undefined, hasDate: boolean): string {
  if (!bucketStart) return ''
  const date = new Date(bucketStart)
  if (Number.isNaN(date.getTime())) return ''
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return hasDate ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}` : time
}

/** A plain line without point marks; the tooltip picks the nearest bucket instead. */
export function lineSeries(label: string, data: number[], color: string): ChartDataset<'line', number[]> {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    pointHitRadius: 10,
    pointHoverRadius: 4,
    tension: 0.35,
  }
}

interface LineOptionsInput {
  /** A single line is named by the card title already. */
  hasLegend?: boolean
  /** How a value reads in the tooltip. */
  formatValue?: (value: number) => string
  /** How a tick of the left axis reads; chart.js picks the format when left out. */
  formatTick?: (value: number) => string
  /** Whole-number ticks, for counts. */
  hasIntegerTicks?: boolean
  /** Adds a second value axis on the right (`yAxisID: 'y1'`), its ticks in the colour of the series it measures. */
  rightAxisColor?: string
}

/** Options the line charts share: a tooltip per bucket, the legend on top, a quiet grid. */
export function lineOptions(ink: ChartInk, input: LineOptionsInput = {}): ChartOptions<'line'> {
  const {
    hasLegend = true,
    formatValue = (value: number) => value.toLocaleString(),
    formatTick,
    hasIntegerTicks = false,
    rightAxisColor,
  } = input
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: hasLegend,
        position: 'top',
        align: 'start',
        labels: { color: ink.muted, usePointStyle: true, pointStyle: 'line', boxWidth: 16, font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: (item) => `${item.dataset.label}: ${formatValue(Number(item.parsed.y))}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: ink.grid },
        ticks: { color: ink.muted, maxRotation: 0, autoSkipPadding: 16, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        grid: { color: ink.grid },
        border: { display: false },
        ticks: {
          color: ink.muted,
          ...(hasIntegerTicks ? { precision: 0 } : {}),
          ...(formatTick ? { callback: (value: string | number) => formatTick(Number(value)) } : {}),
        },
      },
      ...(rightAxisColor
        ? {
            y1: {
              position: 'right' as const,
              beginAtZero: true,
              grid: { display: false },
              border: { display: false },
              ticks: { color: rightAxisColor },
            },
          }
        : {}),
    },
  }
}
