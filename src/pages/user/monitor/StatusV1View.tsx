import { useCallback, useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { VStack } from '@astryxdesign/core/Stack'
import type { UserMonitorView } from '@/api/channelMonitor'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { ProbeCardGrid } from './ProbeCardGrid'
import { overallStatus, type ProbeWindow } from './probeCards'
import { ProbeControls } from './ProbeControls'
import { ProbeDetailDialog } from './ProbeDetailDialog'
import { RefreshCountdown } from './refreshCountdown'
import { useAutoRefresh } from './useAutoRefresh'
import { useProbeMonitors } from './useProbeMonitors'

/** That something could not be fetched, why, and a way to try again. */
function LoadFailure({
  title,
  error,
  isRetrying,
  onRetry,
}: {
  title: string
  error: unknown
  isRetrying: boolean
  onRetry: () => void
}) {
  const { t } = useI18n()
  const reason = extractApiErrorMessage(error, title)

  return (
    <Banner
      status="error"
      title={title}
      description={reason !== title ? reason : undefined}
      endContent={<Button size="sm" variant="secondary" label={t('common.refresh')} isLoading={isRetrying} onClick={onRetry} />}
    />
  )
}

/**
 * Channel status as measured by scheduled probes: one card for each monitor the viewer may see, with how its
 * latest check went, how often its checks passed over seven, fifteen or thirty days, and its latest checks one
 * by one. A card opens the figures of every model its monitor checks. The page refreshes by itself unless the
 * viewer switches that off.
 */
export function StatusV1View() {
  const { t } = useI18n()
  const [timeWindow, setTimeWindow] = useState<ProbeWindow>('7d')
  // The list of monitors carries the seven days; the longer windows are in the detail of each monitor.
  const monitors = useProbeMonitors(timeWindow !== '7d')
  const { items, isBusy, isRefreshing, loadCount, reload } = monitors

  const refresh = useAutoRefresh({
    // The countdown stands still on a page nobody is looking at, and while a refresh is under way.
    isPaused: () => document.hidden || isBusy.current,
    onDue: reload,
  })
  const { restart } = refresh
  // Whoever asked for a refresh, the next one comes a whole interval after it ended.
  useEffect(() => {
    restart()
  }, [loadCount, restart])

  // Each opening of the detail is counted, so each gets a dialog of its own with figures of that moment.
  const [detailOf, setDetailOf] = useState<{ item: UserMonitorView; opening: number } | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const openDetail = useCallback((item: UserMonitorView) => {
    setDetailOf((previous) => ({ item, opening: (previous?.opening ?? 0) + 1 }))
    setIsDetailOpen(true)
  }, [])

  return (
    <Page
      title={t('channelStatus.title')}
      description={t('channelStatus.description')}
      actions={
        <ProbeControls
          timeWindow={timeWindow}
          onWindowChange={setTimeWindow}
          // With no monitors there is nothing to call operational.
          overall={items.length > 0 ? overallStatus(items) : null}
          isRefreshing={isRefreshing}
          onRefresh={reload}
          refresh={refresh}
        />
      }
    >
      <RefreshCountdown.Provider value={refresh.remaining}>
        <VStack gap={4} hAlign="stretch">
          {monitors.loadError != null && (
            <LoadFailure
              title={t('channelStatus.loadError')}
              error={monitors.loadError}
              isRetrying={isRefreshing}
              onRetry={reload}
            />
          )}
          {monitors.detailError != null && (
            <LoadFailure
              title={t('channelStatus.detailLoadError')}
              error={monitors.detailError}
              isRetrying={isRefreshing}
              onRetry={reload}
            />
          )}
          <ProbeCardGrid
            items={items}
            details={monitors.details}
            pendingDetails={monitors.pendingDetails}
            timeWindow={timeWindow}
            isLoading={monitors.isLoading}
            hasLoaded={monitors.hasLoaded}
            onOpen={openDetail}
          />
        </VStack>
      </RefreshCountdown.Provider>
      {detailOf && (
        <ProbeDetailDialog
          key={detailOf.opening}
          monitor={detailOf.item}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </Page>
  )
}
