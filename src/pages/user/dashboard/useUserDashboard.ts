import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { DateRange } from '@astryxdesign/core/Calendar'
import { usageAPI, type UserDashboardStats } from '@/api/usage'
import { getMyPlatformQuotas } from '@/api/user'
import type { ModelStat, PlatformQuotaItem, TrendDataPoint, UsageLog } from '@/types'
import { useAuthStore } from '~/stores/auth'
import type { Granularity } from '../usage/usageQuery'
import { RECENT_DAYS, RECENT_LIMIT, lastDaysRange } from './dashboardModel'

/** The parts of the page that are loaded on their own and can fail on their own. */
type Part = 'stats' | 'models' | 'trend' | 'recent'
// The order failures are told in: the page words only the first.
const PARTS: Part[] = ['stats', 'models', 'trend', 'recent']

type Loading = Record<Part, boolean>
// Wrapped, so that a load rejected with nothing at all still counts as failed.
type Failures = Partial<Record<Part, { error: unknown }>>

/** What a chart shows and the query it answers, so a failed load can tell whether it still fits. */
interface Charted<T> {
  query: string
  items: T[]
}
const NOTHING_CHARTED = { query: '', items: [] }

interface Marks {
  setLoading: Dispatch<SetStateAction<Loading>>
  setFailures: Dispatch<SetStateAction<Failures>>
}

/**
 * Runs the load of one part: marks it as loading, forgets its last failure and hands on the answer, unless
 * the load is dropped first. Returns the function that drops it; an answer that comes after is ignored.
 */
function load<T>(
  part: Part,
  marks: Marks,
  request: () => Promise<T>,
  onAnswer: (answer: T) => void,
  onFailure?: () => void,
): () => void {
  let isStale = false
  marks.setLoading((current) => ({ ...current, [part]: true }))
  marks.setFailures((current) => ({ ...current, [part]: undefined }))
  request()
    .then((answer) => {
      if (!isStale) onAnswer(answer)
    })
    .catch((error: unknown) => {
      if (isStale) return
      console.error(`[dashboard] failed to load the ${part}`, error)
      marks.setFailures((current) => ({ ...current, [part]: { error } }))
      onFailure?.()
    })
    .finally(() => {
      if (!isStale) marks.setLoading((current) => ({ ...current, [part]: false }))
    })
  return () => {
    isStale = true
  }
}

/**
 * The user's dashboard as the page shows it: the figures, the limits of the platforms and the newest requests,
 * and under a date range of their own the model distribution and the token trend. Each is loaded on its own,
 * so a slow or failed one does not hold back the others.
 */
export function useUserDashboard() {
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const [range, setRange] = useState<DateRange>(() => lastDaysRange(RECENT_DAYS))
  const [granularity, setGranularity] = useState<Granularity>('day')
  // Not sent; counting it up makes every load below run again.
  const [reloadTick, setReloadTick] = useState(0)

  const [stats, setStats] = useState<UserDashboardStats | null>(null)
  const [quotas, setQuotas] = useState<PlatformQuotaItem[]>([])
  const [recent, setRecent] = useState<UsageLog[]>([])
  const [models, setModels] = useState<Charted<ModelStat>>(NOTHING_CHARTED)
  const [trend, setTrend] = useState<Charted<TrendDataPoint>>(NOTHING_CHARTED)
  const [loading, setLoading] = useState<Loading>({ stats: true, models: true, trend: true, recent: true })
  const [failures, setFailures] = useState<Failures>({})

  // What does not depend on the range of the charts. After a failed load the last good answer stays.
  useEffect(() => {
    const marks = { setLoading, setFailures }
    // The balance is the signed-in user's, so the user is asked for again. The figures do not wait for it.
    refreshUser().catch((error: unknown) => console.error('[dashboard] failed to refresh the user', error))
    const dropStats = load('stats', marks, () => usageAPI.getDashboardStats(), setStats)
    const dropRecent = load(
      'recent',
      marks,
      () => {
        // Worked out at every load, so "today" is still today on a page left open overnight.
        const days = lastDaysRange(RECENT_DAYS)
        // The list comes newest first; its first few rows are all that is shown.
        return usageAPI.query({ start_date: days.start, end_date: days.end, page: 1, page_size: RECENT_LIMIT })
      },
      (answer) => setRecent((answer.items || []).slice(0, RECENT_LIMIT)),
    )
    let isStale = false
    getMyPlatformQuotas()
      .then((answer) => {
        if (!isStale) setQuotas(answer.platform_quotas || [])
      })
      // Without them the platform cards show no limits; the page is not told as failed for that.
      .catch((error: unknown) => console.warn('[dashboard] failed to load the platform quotas', error))
    return () => {
      isStale = true
      dropStats()
      dropRecent()
    }
  }, [reloadTick, refreshUser])

  useEffect(() => {
    const query = `${range.start}|${range.end}`
    return load(
      'models',
      { setLoading, setFailures },
      () => usageAPI.getDashboardModels({ start_date: range.start, end_date: range.end }),
      (answer) => setModels({ query, items: answer.models || [] }),
      // A distribution of another range would mislead; one of this range stays under the error.
      () => setModels((current) => (current.query === query ? current : { query, items: [] })),
    )
  }, [range, reloadTick])

  // The granularity changes the trend alone.
  useEffect(() => {
    const query = `${range.start}|${range.end}|${granularity}`
    return load(
      'trend',
      { setLoading, setFailures },
      () => usageAPI.getDashboardTrend({ start_date: range.start, end_date: range.end, granularity }),
      (answer) => setTrend({ query, items: answer.trend || [] }),
      () => setTrend((current) => (current.query === query ? current : { query, items: [] })),
    )
  }, [range, granularity, reloadTick])

  const firstFailure = PARTS.map((part) => failures[part]).find((failure) => failure != null)

  return {
    /** The range of the charts, in the shape the range bar of the usage page takes. */
    filters: { range },
    changeFilters: (patch: { range: DateRange }) => setRange(patch.range),
    granularity,
    setGranularity,
    /** Load everything again. */
    refresh: () => setReloadTick((tick) => tick + 1),
    /** Null until the figures were loaded once. */
    stats,
    quotas,
    recent,
    models: models.items,
    trend: trend.items,
    isStatsLoading: loading.stats,
    isModelsLoading: loading.models,
    isTrendLoading: loading.trend,
    isRecentLoading: loading.recent,
    isLoading: PARTS.some((part) => loading[part]),
    hasFailed: firstFailure != null,
    /** What the first failed load was rejected with, for the wording of the error. */
    failure: firstFailure?.error,
    hasTrendFailed: failures.trend != null,
    hasRecentFailed: failures.recent != null,
  }
}

export type UserDashboard = ReturnType<typeof useUserDashboard>
