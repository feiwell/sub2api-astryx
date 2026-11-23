import type {
  CurrencyAmounts,
  DashboardStats,
  DailyPaymentStats,
  PaymentMethodStats,
  TopUserPaymentStats,
} from '@/types/payment'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function sortedAmounts(amounts: CurrencyAmounts): [string, number][] {
  return Object.entries(amounts).sort(([left], [right]) => left.localeCompare(right))
}

function normalizeAmounts(value: unknown): CurrencyAmounts {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  )
}

function normalizeDailySeries(value: unknown): DailyPaymentStats[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): DailyPaymentStats[] => {
    if (!isRecord(entry) || typeof entry.date !== 'string') return []
    return [{ date: entry.date, amount: normalizeAmounts(entry.amount), count: finiteNumber(entry.count) }]
  })
}

function normalizePaymentMethods(value: unknown): PaymentMethodStats[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): PaymentMethodStats[] => {
    if (!isRecord(entry) || typeof entry.type !== 'string') return []
    return [{ type: entry.type, amount: normalizeAmounts(entry.amount), count: finiteNumber(entry.count) }]
  })
}

function normalizeTopUsers(value: unknown): Record<string, TopUserPaymentStats[]> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([currency, entries]) => [
      currency,
      Array.isArray(entries)
        ? entries.flatMap((entry): TopUserPaymentStats[] => {
            if (!isRecord(entry)) return []
            const userId = finiteNumber(entry.user_id)
            return [{
              user_id: userId,
              email: typeof entry.email === 'string' ? entry.email : '',
              amount: finiteNumber(entry.amount),
            }]
          })
        : [],
    ]),
  )
}

/** Converts nullable or partially populated API data into the shape consumed by the dashboard. */
export function normalizeDashboardStats(value: unknown): DashboardStats {
  const source = isRecord(value) ? value : {}
  return {
    today_amount: normalizeAmounts(source.today_amount),
    total_amount: normalizeAmounts(source.total_amount),
    today_count: finiteNumber(source.today_count),
    total_count: finiteNumber(source.total_count),
    avg_amount: normalizeAmounts(source.avg_amount),
    daily_series: normalizeDailySeries(source.daily_series),
    payment_methods: normalizePaymentMethods(source.payment_methods),
    top_users: normalizeTopUsers(source.top_users),
  }
}

export interface DailyRevenueChartModel {
  dates: string[]
  currencies: string[]
  amountsByCurrency: Record<string, number[]>
  orderCounts: number[]
}

export function buildDailyRevenueChartModel(series: DailyPaymentStats[]): DailyRevenueChartModel {
  const currencies = [...new Set(series.flatMap((day) => Object.keys(day.amount)))].sort((a, b) => a.localeCompare(b))
  return {
    dates: series.map((day) => day.date),
    currencies,
    amountsByCurrency: Object.fromEntries(
      currencies.map((currency) => [currency, series.map((day) => day.amount[currency] ?? 0)]),
    ),
    orderCounts: series.map((day) => day.count),
  }
}
