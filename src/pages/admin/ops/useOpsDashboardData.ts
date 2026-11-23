import { useEffect, useState } from 'react'
import { useI18n } from '~/i18n'
import {
  opsAPI,
  type OpsDashboardOverview,
  type OpsErrorDistributionResponse,
  type OpsErrorTrendResponse,
  type OpsLatencyHistogramResponse,
  type OpsThroughputTrendResponse,
} from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import { errorCode, errorMessage } from './errors'
import { buildOpsApiParams, type OpsCustomRange, type OpsFilters } from './filters'

/** The account-switch chart always covers the last five hours, whatever time range the page shows. */
const SWITCH_TREND_MS = 5 * 60 * 60 * 1000

/** What one chart has to draw: the latest answer, whether a newer one is on its way, and why there is none. */
export interface OpsPanel<T> {
  data: T | null
  isLoading: boolean
  /** Set when the latest load failed, so the chart can say so instead of "no data". */
  error: OpsPanelError | null
}

export interface OpsPanelError {
  /** What could not be loaded, e.g. "Failed to load the error trend". */
  title: string
  /** The reason the server gave; empty when it gave none. */
  detail: string
}

export interface OpsDashboardData {
  overview: OpsDashboardOverview | null
  throughput: OpsPanel<OpsThroughputTrendResponse>
  errorTrend: OpsPanel<OpsErrorTrendResponse>
  switchTrend: OpsPanel<OpsThroughputTrendResponse>
  latency: OpsPanel<OpsLatencyHistogramResponse>
  errorDistribution: OpsPanel<OpsErrorDistributionResponse>
  /** The overview and the trends are being loaded. */
  isLoading: boolean
  hasLoadedOnce: boolean
  lastUpdated: Date | null
  /** Counts the loads that finished; the auto-refresh countdown restarts with it. */
  finishedLoads: number
}

const IDLE = { data: null, isLoading: false, error: null }

const pending = <T>(panel: OpsPanel<T>): OpsPanel<T> => (panel.isLoading ? panel : { ...panel, isLoading: true })

const settled = <T>(data: T | null | undefined): OpsPanel<T> => ({ data: data ?? null, isLoading: false, error: null })

const failed = <T>(title: string, detail: string): OpsPanel<T> => ({
  data: null,
  isLoading: false,
  error: { title, detail },
})

/**
 * Everything the ops page loads for the selected window. One load runs at a time: a newer one
 * (filters changed, refresh) aborts the one still running.
 */
export function useOpsDashboardData(
  isActive: boolean,
  filters: OpsFilters,
  customRange: OpsCustomRange | null,
  refreshTick: number,
): OpsDashboardData {
  const { t } = useI18n()
  const { timeRange, platform, groupId, queryMode } = filters
  const [overview, setOverview] = useState<OpsDashboardOverview | null>(null)
  const [throughput, setThroughput] = useState<OpsPanel<OpsThroughputTrendResponse>>(IDLE)
  const [errorTrend, setErrorTrend] = useState<OpsPanel<OpsErrorTrendResponse>>(IDLE)
  const [switchTrend, setSwitchTrend] = useState<OpsPanel<OpsThroughputTrendResponse>>(IDLE)
  const [latency, setLatency] = useState<OpsPanel<OpsLatencyHistogramResponse>>(IDLE)
  const [errorDistribution, setErrorDistribution] = useState<OpsPanel<OpsErrorDistributionResponse>>(IDLE)
  const [isLoading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [finishedLoads, setFinishedLoads] = useState(0)

  useEffect(() => {
    if (!isActive) return
    const controller = new AbortController()
    const { signal } = controller
    const options = { signal }
    const params = buildOpsApiParams({ timeRange, platform, groupId, queryMode }, customRange)
    const now = Date.now()
    const switchParams = {
      platform: params.platform,
      group_id: params.group_id,
      mode: params.mode,
      start_time: new Date(now - SWITCH_TREND_MS).toISOString(),
      end_time: new Date(now).toISOString(),
    }

    setLoading(true)
    setThroughput(pending)
    setErrorTrend(pending)
    setSwitchTrend(pending)
    setLatency(pending)
    setErrorDistribution(pending)

    /** True for a request that was replaced by a newer load, which is nothing to report. */
    const isSuperseded = (error: unknown): boolean => {
      // "Ops monitoring is disabled": the page is about to leave, so the whole load stops quietly.
      if (errorCode(error) === 'OPS_DISABLED') controller.abort()
      return signal.aborted || errorCode(error) === 'ERR_CANCELED'
    }

    /** One request, as the panel it fills. A superseded request answers null: nothing is shown for it. */
    const ask = async <T>(request: Promise<T>, failureText: string): Promise<OpsPanel<T> | null> => {
      try {
        return settled(await request)
      } catch (error) {
        if (isSuperseded(error)) return null
        console.error(`[ops] ${failureText}`, error)
        return failed(failureText, errorMessage(error))
      }
    }

    const loadCore = async (): Promise<OpsDashboardOverview | null> => {
      try {
        const snapshot = await opsAPI.getDashboardSnapshotV2(params, options)
        if (signal.aborted) return null
        setThroughput(settled(snapshot.throughput_trend))
        setErrorTrend(settled(snapshot.error_trend))
        return snapshot.overview
      } catch (error) {
        if (isSuperseded(error)) return null
      }
      // The snapshot bundles three panels. When it fails, each is asked for on its own.
      const [nextOverview, nextThroughput, nextErrorTrend] = await Promise.all([
        ask(opsAPI.getDashboardOverview(params, options), t('admin.ops.failedToLoadOverview')),
        ask(opsAPI.getThroughputTrend(params, options), t('admin.ops.failedToLoadThroughputTrend')),
        ask(opsAPI.getErrorTrend(params, options), t('admin.ops.failedToLoadErrorTrend')),
      ])
      if (signal.aborted) return null
      if (nextThroughput) setThroughput(nextThroughput)
      if (nextErrorTrend) setErrorTrend(nextErrorTrend)
      // A chart tells its own failure. The overview has no card to do so, hence the toast.
      if (nextOverview?.error) toast.error(nextOverview.error.detail || nextOverview.error.title)
      return nextOverview?.data ?? null
    }

    const load = async () => {
      const [nextOverview, nextSwitchTrend] = await Promise.all([
        loadCore(),
        ask(opsAPI.getThroughputTrend(switchParams, options), t('admin.ops.failedToLoadSwitchTrend')),
      ])
      if (signal.aborted) return
      setOverview(nextOverview)
      if (nextSwitchTrend) setSwitchTrend(nextSwitchTrend)
      if (nextOverview) setLastUpdated(new Date())
      setLoading(false)
      setHasLoadedOnce(true)
      setFinishedLoads((count) => count + 1)

      // The two distributions start after the core figures, so they never hold those up.
      void ask(opsAPI.getLatencyHistogram(params, options), t('admin.ops.failedToLoadLatencyHistogram')).then(
        (next) => {
          if (next && !signal.aborted) setLatency(next)
        },
      )
      void ask(opsAPI.getErrorDistribution(params, options), t('admin.ops.failedToLoadErrorDistribution')).then(
        (next) => {
          if (next && !signal.aborted) setErrorDistribution(next)
        },
      )
    }
    void load()

    return () => controller.abort()
  }, [isActive, timeRange, platform, groupId, queryMode, customRange, refreshTick, t])

  return {
    overview,
    throughput,
    errorTrend,
    switchTrend,
    latency,
    errorDistribution,
    isLoading,
    hasLoadedOnce,
    lastUpdated,
    finishedLoads,
  }
}
