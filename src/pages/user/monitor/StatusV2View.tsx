import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { MonitorFilter, MonitorModelRow } from '@/api/channelMonitorV2'
import { isChannelMonitorThroughputHidden, isChannelMonitorUserRankingHidden } from '@/utils/featureFlags'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { selectIsAdmin, useAuthStore } from '~/stores/auth'
import { visibleMatrixRows } from './statusFormat'
import { StatusKpis } from './StatusKpis'
import { groupOptions, modelOptions, platformOptions, pruneFilter } from './statusOptions'
import { StatusPulseMatrix } from './StatusPulseMatrix'
import { allowedTab, parseStatusQuery, statusQueryParams, type StatusView } from './statusQuery'
import { StatusSummary } from './StatusSummary'
import { StatusTabs } from './StatusTabs'
import { StatusToolbar } from './StatusToolbar'
import { StatusTrendChart } from './StatusTrendChart'
import type { TrendPoint } from './trendSeries'
import { useChannelStatus } from './useChannelStatus'

const EMPTY_TREND: TrendPoint[] = []

/**
 * Channel status as measured from real traffic: headline figures for a time range, their trend, and a breakdown
 * by model, kind of error and user. The range, the filters and the open tab live in the address, so a view can
 * be reloaded or shared. Administrators see all traffic; other users see what the administrator allows.
 */
export function StatusV2View() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = useAuthStore(selectIsAdmin)
  // The two visibility switches are read from the public settings, so follow them when they change.
  useAppStore((s) => s.publicSettings)
  const showThroughput = isAdmin || !isChannelMonitorThroughputHidden()
  const canSeeUsers = isAdmin || !isChannelMonitorUserRankingHidden()

  const [view, setView] = useState<StatusView>(() => parseStatusQuery(searchParams, canSeeUsers))
  const tab = allowedTab(view.tab, canSeeUsers)
  const { filter } = view
  const status = useChannelStatus({ filter, groupBy: view.groupBy, tab, isAdmin, canSeeUsers })
  const { snapshot, matrix } = status
  // The rows on screen are grouped the way they were asked for, which trails the selector for a moment.
  const matrixRows = useMemo(
    () => visibleMatrixRows(matrix?.items, matrix?.group_by || view.groupBy),
    [matrix, view.groupBy],
  )

  const query = useMemo(() => statusQueryParams({ ...view, tab }), [view, tab])
  useEffect(() => {
    if (searchParams.toString() !== new URLSearchParams(query).toString()) setSearchParams(query, { replace: true })
  }, [query, searchParams, setSearchParams])

  const platforms = useMemo(() => platformOptions(status.dimensions), [status.dimensions])
  const groups = useMemo(() => groupOptions(status.dimensions, filter.platforms), [status.dimensions, filter.platforms])
  const models = useMemo(() => modelOptions(status.dimensions, filter.platforms), [status.dimensions, filter.platforms])
  // A group or model chosen under a platform that is no longer chosen would filter everything away.
  useEffect(() => {
    setView((prev) => {
      const pruned = pruneFilter(prev.filter, groups, models)
      return pruned === prev.filter ? prev : { ...prev, filter: pruned }
    })
  }, [groups, models])

  const changeFilter = useCallback(
    (patch: Partial<MonitorFilter>) => setView((prev) => ({ ...prev, filter: { ...prev.filter, ...patch } })),
    [],
  )
  const changeView = useCallback(
    (patch: Partial<Omit<StatusView, 'filter'>>) => setView((prev) => ({ ...prev, ...patch })),
    [],
  )
  const drillModel = useCallback(
    (row: MonitorModelRow) => changeFilter({ platforms: [row.platform], models: [row.model] }),
    [changeFilter],
  )

  return (
    <Page
      title={t('channelMonitorV2.title')}
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon={<Icon icon={ArrowPathIcon} />}
          label={t('common.refresh')}
          isLoading={status.isRefreshing}
          onClick={status.reload}
        />
      }
    >
      <VStack gap={4} hAlign="stretch">
        <StatusSummary
          snapshot={snapshot}
          isLoading={status.isLoading}
          isRefreshing={status.isRefreshing}
          loadError={status.loadError}
          onRetry={status.reload}
        />
        <StatusToolbar
          view={{ ...view, tab }}
          platforms={platforms}
          groups={groups}
          models={models}
          onFilterChange={changeFilter}
          onViewChange={changeView}
        />
        <StatusKpis snapshot={snapshot} isLoading={status.isLoading} showThroughput={showThroughput} />

        {view.trendView === 'line' ? (
          <StatusTrendChart
            trend={snapshot?.trend || EMPTY_TREND}
            coverage={snapshot?.coverage || null}
            isLoading={status.isLoading && !snapshot}
          />
        ) : matrix ? (
          <StatusPulseMatrix
            rows={matrixRows}
            coverage={matrix.coverage}
            healthMode={view.healthMode}
            showThroughput={showThroughput}
          />
        ) : (
          status.isLoading && (
            <Center padding={10}>
              <Spinner />
            </Center>
          )
        )}

        <StatusTabs
          tab={tab}
          onTabChange={(next) => changeView({ tab: next })}
          modelRows={status.modelRows}
          errorRows={status.errorRows}
          userRows={status.userRows}
          isLoading={status.isTabLoading}
          loadError={status.tabError}
          isBootstrapping={status.isBootstrapping}
          isAdmin={isAdmin}
          canSeeUsers={canSeeUsers}
          showThroughput={showThroughput}
          onDrill={drillModel}
          onRetry={status.reload}
        />
      </VStack>
    </Page>
  )
}
