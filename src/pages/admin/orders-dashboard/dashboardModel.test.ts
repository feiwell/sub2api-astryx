import { describe, expect, it } from 'vitest'
import { buildDailyRevenueChartModel, normalizeDashboardStats, sortedAmounts } from './dashboardModel'

const emptyDashboard = {
  today_amount: {},
  total_amount: {},
  today_count: 0,
  total_count: 0,
  avg_amount: {},
  daily_series: [],
  payment_methods: [],
  top_users: {},
}

describe('normalizeDashboardStats', () => {
  it('treats null and missing collection fields as empty', () => {
    expect(normalizeDashboardStats(null)).toEqual(emptyDashboard)
    expect(normalizeDashboardStats({ daily_series: null, payment_methods: null, top_users: null })).toEqual(emptyDashboard)
  })

  it('drops malformed records and non-finite amounts without failing', () => {
    const result = normalizeDashboardStats({
      today_amount: { USD: 12, BAD: Number.NaN },
      today_count: null,
      daily_series: [{ date: '2025-01-01', amount: { USD: 12 }, count: 2 }, null],
      payment_methods: [{ type: 'custompay', amount: null, count: 1 }, {}],
      top_users: { USD: [{ user_id: 5, amount: 4 }, null] },
    })
    expect(result.today_amount).toEqual({ USD: 12 })
    expect(result.today_count).toBe(0)
    expect(result.daily_series).toEqual([{ date: '2025-01-01', amount: { USD: 12 }, count: 2 }])
    expect(result.payment_methods).toEqual([{ type: 'custompay', amount: {}, count: 1 }])
    expect(result.top_users).toEqual({ USD: [{ user_id: 5, email: '', amount: 4 }] })
  })
})

describe('dashboard display models', () => {
  it('sorts amount rows by currency code', () => {
    expect(sortedAmounts({ USD: 1, CNY: 2 })).toEqual([['CNY', 2], ['USD', 1]])
  })

  it('fills absent daily currency amounts with zero and keeps order counts', () => {
    expect(buildDailyRevenueChartModel([
      { date: '2025-01-01', amount: { CNY: 3 }, count: 2 },
      { date: '2025-01-02', amount: { USD: 4 }, count: 1 },
    ])).toEqual({
      dates: ['2025-01-01', '2025-01-02'],
      currencies: ['CNY', 'USD'],
      amountsByCurrency: { CNY: [3, 0], USD: [0, 4] },
      orderCounts: [2, 1],
    })
  })
})
