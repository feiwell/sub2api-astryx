import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { opsAPI, type OpsMetricThresholds } from '~/lib/api/admin/ops'
import { OpsAlertEventsCard } from './ops/OpsAlertEventsCard'
import { OpsAlertRulesDialog } from './ops/OpsAlertRulesDialog'
import { OpsAnalysis } from './ops/OpsAnalysis'
import { OpsDetails } from './ops/OpsDetails'
import { OpsOverview } from './ops/OpsOverview'
import { OpsSettingsDialog } from './ops/OpsSettingsDialog'
import { OpsStatusLine, type OpsAutoRefresh } from './ops/OpsStatusLine'
import { OpsSystemLogsCard } from './ops/OpsSystemLogsCard'
import { OpsToolbar } from './ops/OpsToolbar'
import { readOpsFilters, withOpsFilters, type OpsCustomRange, type OpsFilterChange } from './ops/filters'
import { useOpsDashboardData } from './ops/useOpsDashboardData'
import { useOpsDetails } from './ops/useOpsDetails'
import { useOpsSettings } from './ops/useOpsSettings'

/** Deep link: `open_error_details=1` opens an error list on arrival, `error_type=upstream` picks the upstream one. */
const OPEN_ERRORS_KEY = 'open_error_details'
const ERROR_TYPE_KEY = 'error_type'
/** Deep link: `open_alert_rules=1`, or the id of a rule in `alert_rule_id`, opens the alert rules on arrival. */
const OPEN_RULES_KEY = 'open_alert_rules'
const RULE_ID_KEY = 'alert_rule_id'
/** `fullscreen=1` shows the page over the whole window, for a wall screen. It stays in the URL so a reload keeps it. */
const FULLSCREEN_KEY = 'fullscreen'

const AUTO_REFRESH_OFF: OpsAutoRefresh = { enabled: false, intervalSeconds: 30 }

const isYes = (value: string | null) => value === '1' || value === 'true'

/** Ops monitoring: health, traffic and errors of the gateway (port of OpsDashboard.vue). */
export function AdminOpsDashboardPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const settings = useOpsSettings()
  const { setRealtimeEnabled } = settings
  const isActive = settings.isReady && settings.enabled

  // The URL holds the filters, so a link reopens the page on the same view.
  const filters = readOpsFilters(searchParams, settings.queryModeDefault)
  const [customRange, setCustomRange] = useState<OpsCustomRange | null>(null)
  const activeCustomRange = filters.timeRange === 'custom' ? customRange : null
  // Full screen only watches: it has no toolbar, no lists to open, no settings and no rules.
  const isFullscreen = isYes(searchParams.get(FULLSCREEN_KEY))

  const [thresholds, setThresholds] = useState<OpsMetricThresholds | null>(null)
  const [autoRefresh, setAutoRefresh] = useState<OpsAutoRefresh>(AUTO_REFRESH_OFF)
  const [hasTokenStats, setHasTokenStats] = useState(false)
  // Off until the settings answer, so a card that is switched off never flashes by.
  const [hasAlertEvents, setHasAlertEvents] = useState(false)
  // refreshTick asks for a reload (button or timer); the data counts the answers in finishedLoads.
  const [refreshTick, setRefreshTick] = useState(0)
  const [dialog, setDialog] = useState<'settings' | 'rules' | null>(null)
  // Counts the saves of the settings dialog: what the page took from the settings is read again.
  const [settingsVersion, setSettingsVersion] = useState(0)
  // Counts the deleted rules. The confirmation says a rule's alerts go with it, so the alerts are read again.
  const [alertsReloadKey, setAlertsReloadKey] = useState(0)
  const data = useOpsDashboardData(isActive, filters, activeCustomRange, refreshTick)
  const { overview, isLoading } = data
  const details = useOpsDetails()
  const { openErrors } = details

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), [])
  const markRealtimeDisabled = useCallback(() => setRealtimeEnabled(false), [setRealtimeEnabled])

  const changeFilters = (change: OpsFilterChange) => {
    setSearchParams((prev) => withOpsFilters(prev, change), { replace: true })
  }

  const applyCustomRange = (range: OpsCustomRange) => {
    setCustomRange(range)
    changeFilters({ timeRange: 'custom' })
  }

  const setFullscreen = (isOn: boolean) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (isOn) next.set(FULLSCREEN_KEY, '1')
        else next.delete(FULLSCREEN_KEY)
        return next
      },
      { replace: true },
    )
  }
  const reportFullscreenOpen = (open: boolean) => {
    if (!open) setFullscreen(false)
  }

  // "View related logs" of an alert lands where a link from outside would: on the alert's platform
  // and group alone, every other filter back to its default, with the request errors open.
  const openAlertLogs = (platform: string, groupId: number | null) => {
    setSearchParams(withOpsFilters(new URLSearchParams(), { platform, groupId }))
    openErrors('request')
  }

  const applySavedSettings = () => {
    setSettingsVersion((version) => version + 1)
    refresh()
  }

  useEffect(() => {
    if (settings.isReady && !settings.enabled) navigate('/admin/settings', { replace: true })
  }, [settings.isReady, settings.enabled, navigate])

  // What a link asks to open is opened once, then leaves the URL so a reload does not repeat it.
  const openErrorsRequest = searchParams.get(OPEN_ERRORS_KEY)
  const requestedErrorType = searchParams.get(ERROR_TYPE_KEY)
  const openRulesRequest = searchParams.get(OPEN_RULES_KEY)
  const requestedRuleId = searchParams.get(RULE_ID_KEY)
  const hasOpenRequest = openErrorsRequest != null || openRulesRequest != null || requestedRuleId != null
  useEffect(() => {
    if (!isActive || !hasOpenRequest) return
    // Full screen has nothing to open: there the request leaves the URL unanswered.
    if (!isFullscreen) {
      if (isYes(openErrorsRequest)) openErrors(requestedErrorType === 'upstream' ? 'upstream' : 'request')
      if (isYes(openRulesRequest) || Number.parseInt(requestedRuleId ?? '', 10) > 0) setDialog('rules')
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const key of [OPEN_ERRORS_KEY, ERROR_TYPE_KEY, OPEN_RULES_KEY, RULE_ID_KEY]) next.delete(key)
        return next
      },
      { replace: true },
    )
  }, [
    isActive,
    hasOpenRequest,
    isFullscreen,
    openErrorsRequest,
    requestedErrorType,
    openRulesRequest,
    requestedRuleId,
    openErrors,
    setSearchParams,
  ])

  useEffect(() => {
    if (!isActive) return
    let cancelled = false
    opsAPI
      .getMetricThresholds()
      .then((value) => {
        if (!cancelled) setThresholds(value || null)
      })
      .catch((error) => {
        console.warn('[ops] failed to load metric thresholds', error)
        if (!cancelled) setThresholds(null)
      })
    opsAPI
      .getAdvancedSettings()
      .then((value) => {
        if (cancelled) return
        const seconds = Math.floor(value.auto_refresh_interval_seconds)
        setAutoRefresh({
          enabled: !!value.auto_refresh_enabled,
          intervalSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : AUTO_REFRESH_OFF.intervalSeconds,
        })
        setHasTokenStats(!!value.display_openai_token_stats)
        setHasAlertEvents(!!value.display_alert_events)
      })
      .catch((error) => {
        console.error('[ops] failed to load advanced settings', error)
        if (cancelled) return
        setAutoRefresh(AUTO_REFRESH_OFF)
        setHasTokenStats(false)
        // Alerts stay in sight when the settings cannot be read.
        setHasAlertEvents(true)
      })
    return () => {
      cancelled = true
    }
  }, [isActive, settingsVersion])

  // The same cards either way. Full screen passes no openers, so they offer nothing that would open a list.
  const openRequests = isFullscreen ? undefined : details.openRequests
  const openErrorList = isFullscreen ? undefined : details.openErrors
  const body = !data.hasLoadedOnce ? (
    <Center padding={10}>
      <Spinner />
    </Center>
  ) : (
    <VStack gap={4}>
      <OpsStatusLine
        isLoading={isLoading}
        hasFailed={!overview}
        lastUpdated={data.lastUpdated}
        autoRefresh={autoRefresh}
        restartKey={data.finishedLoads}
        onAutoRefresh={refresh}
      />
      {overview ? (
        <OpsOverview
          overview={overview}
          thresholds={thresholds}
          filters={filters}
          refreshKey={refreshTick}
          isRealtimeEnabled={settings.realtimeEnabled}
          onRealtimeDisabled={markRealtimeDisabled}
          onOpenRequests={openRequests}
          onOpenErrors={openErrorList}
        />
      ) : (
        <Card>
          <EmptyState
            headingLevel={2}
            title={t('admin.ops.failedToLoadOverview')}
            actions={<Button label={t('common.refresh')} variant="secondary" isLoading={isLoading} onClick={refresh} />}
          />
        </Card>
      )}
      <OpsAnalysis
        data={data}
        filters={filters}
        customRange={activeCustomRange}
        refreshKey={refreshTick}
        isRealtimeEnabled={settings.realtimeEnabled}
        onRealtimeDisabled={markRealtimeDisabled}
        hasTokenStats={hasTokenStats}
        onFiltersChange={changeFilters}
        onOpenRequests={openRequests}
        onOpenErrors={openErrorList}
      />
      {hasAlertEvents && (
        <OpsAlertEventsCard
          reloadKey={alertsReloadKey}
          onViewLogs={isFullscreen ? undefined : openAlertLogs}
          onViewRule={isFullscreen ? undefined : () => setDialog('rules')}
        />
      )}
      <OpsSystemLogsCard platform={filters.platform} refreshKey={refreshTick} />
    </VStack>
  )

  return (
    <Page
      title={t('admin.ops.title')}
      description={t('admin.ops.description')}
      actions={
        <OpsToolbar
          filters={filters}
          customRange={customRange}
          isLoading={isActive && isLoading}
          onFiltersChange={changeFilters}
          onCustomRange={applyCustomRange}
          onRefresh={refresh}
          onOpenAlertRules={() => setDialog('rules')}
          onOpenSettings={() => setDialog('settings')}
          onEnterFullscreen={() => setFullscreen(true)}
        />
      }
    >
      {isFullscreen ? (
        // The app's sidebar and header wrap every page, so full screen is laid over them:
        // a dialog the size of the window. Escape, or its close button, leaves it.
        <Dialog isOpen variant="fullscreen" purpose="form" onOpenChange={reportFullscreenOpen}>
          <Layout
            header={
              <DialogHeader
                title={t('admin.ops.title')}
                subtitle={t('admin.ops.description')}
                onOpenChange={reportFullscreenOpen}
              />
            }
            content={<LayoutContent>{body}</LayoutContent>}
          />
        </Dialog>
      ) : (
        <>
          {body}
          <OpsDetails details={details} filters={filters} customRange={activeCustomRange} />
          {dialog === 'settings' && <OpsSettingsDialog onSaved={applySavedSettings} onClose={() => setDialog(null)} />}
          {dialog === 'rules' && (
            <OpsAlertRulesDialog
              onDeleted={() => setAlertsReloadKey((key) => key + 1)}
              onClose={() => setDialog(null)}
            />
          )}
        </>
      )}
    </Page>
  )
}
