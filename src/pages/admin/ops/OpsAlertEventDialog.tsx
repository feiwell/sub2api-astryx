import { useEffect, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { CheckCircleIcon, NoSymbolIcon } from '@heroicons/react/24/outline'
import { formatDateTime } from '@/utils/format'
import { formatDateTime as formatShortDateTime } from '@/views/admin/ops/utils/opsFormatters'
import { useI18n } from '~/i18n'
import { opsAPI, type AlertEvent } from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import {
  alertDimension,
  alertDimensionPairs,
  alertFiredAt,
  alertMetricLabel,
  alertSeverityVariant,
  alertStatusLabel,
  alertStatusVariant,
  isInAlertSeries,
  isManuallyResolved,
  silenceUntil,
  type SilenceDuration,
} from './alertEvents'
import { errorMessage } from './errors'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<AlertEvent, keyof AlertEvent>
type HistoryRange = '7d' | '30d'
type Action = 'silence' | 'resolve'

const SILENCE_DURATIONS: SilenceDuration[] = ['1h', '24h', '7d']
const HISTORY_RANGES: HistoryRange[] = ['7d', '30d']
const HISTORY_LIMIT = 20
const NO_VALUE = '-'

/** One alert in full: what fired and for which scope, its earlier firings, and the two ways to quiet it. */
export function OpsAlertEventDialog({
  event,
  onChanged,
  onViewLogs,
  onViewRule,
  onClose,
}: {
  /** The alert as the list has it. It is shown at once, then replaced by what the server answers. */
  event: AlertEvent
  /** The alert was resolved by hand: the list behind the dialog is out of date. */
  onChanged: () => void
  /** Asks for the request errors of the alert's platform and group. Without it the link is not offered. */
  onViewLogs?: (event: AlertEvent) => void
  /** Asks for the list of alert rules. Without it the link is not offered. */
  onViewRule?: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<AlertEvent | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [history, setHistory] = useState<Row[]>([])
  const [isHistoryLoading, setHistoryLoading] = useState(true)
  const [hasHistoryFailed, setHistoryFailed] = useState(false)
  const [historyRange, setHistoryRange] = useState<HistoryRange>('7d')
  const [silenceDuration, setSilenceDuration] = useState<SilenceDuration>('1h')
  const [action, setAction] = useState<Action | null>(null)

  const eventId = event.id
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    opsAPI
      .getAlertEvent(eventId)
      .then((answer) => {
        if (!isStale) setDetail(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load alert event', error)
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [eventId, reloadTick])

  const shown = detail ?? event
  const ruleId = shown.rule_id
  const platform = alertDimension(shown, 'platform')
  const rawGroupId: unknown = shown.dimensions?.group_id
  // Only a numeric group can be asked for; any other value still tells two series apart.
  const groupId = typeof rawGroupId === 'number' ? rawGroupId : undefined

  // The earlier firings wait for the alert itself: its rule and scope pick them.
  useEffect(() => {
    if (isLoading) return
    let isStale = false
    setHistoryLoading(true)
    setHistoryFailed(false)
    opsAPI
      .listAlertEvents({
        limit: HISTORY_LIMIT,
        time_range: historyRange,
        platform: platform || undefined,
        group_id: groupId,
        // Sent empty, as the Vue page does: every state is asked for.
        status: '',
      })
      .then((answer) => {
        if (isStale) return
        // The server narrows by platform and group; the rule is picked here.
        setHistory((answer || []).filter((item) => isInAlertSeries(item, { ruleId, platform, groupId: rawGroupId })))
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load alert history', error)
        setHistory([])
        setHistoryFailed(true)
      })
      .finally(() => {
        if (!isStale) setHistoryLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [isLoading, historyRange, ruleId, platform, groupId, rawGroupId])

  const silence = () => {
    if (action) return
    setAction('silence')
    opsAPI
      .createAlertSilence({
        rule_id: ruleId,
        platform,
        group_id: groupId,
        region: alertDimension(shown, 'region') || undefined,
        until: silenceUntil(silenceDuration),
        reason: `silence from UI (${silenceDuration})`,
      })
      .then(() => {
        toast.success(t('admin.ops.alertEvents.detail.silenceSuccess'))
      })
      .catch((error) => {
        console.error('[ops] failed to silence alert', error)
        toast.error(errorMessage(error) || t('admin.ops.alertEvents.detail.silenceFailed'))
      })
      .finally(() => setAction(null))
  }

  const resolve = () => {
    if (action) return
    setAction('resolve')
    opsAPI
      .updateAlertEventStatus(eventId, 'manual_resolved')
      .then(() => {
        toast.success(t('admin.ops.alertEvents.detail.manualResolvedSuccess'))
        // The new state is read back from the server, here and in the list behind.
        setReloadTick((tick) => tick + 1)
        onChanged()
      })
      .catch((error) => {
        console.error('[ops] failed to resolve alert', error)
        toast.error(errorMessage(error) || t('admin.ops.alertEvents.detail.manualResolvedFailed'))
      })
      .finally(() => setAction(null))
  }

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const durationLabels: Record<SilenceDuration | HistoryRange, string> = {
    '1h': t('admin.ops.timeRange.1h'),
    '24h': t('admin.ops.timeRange.24h'),
    '7d': t('admin.ops.timeRange.7d'),
    '30d': t('admin.ops.timeRange.30d'),
  }
  const dimensionPairs = alertDimensionPairs(shown)

  const historyColumns: TableColumn<Row>[] = [
    {
      key: 'fired_at',
      header: t('admin.ops.alertEvents.table.time'),
      width: pixel(132),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers>
          {formatShortDateTime(alertFiredAt(row)) || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('admin.ops.alertEvents.table.status'),
      width: pixel(120),
      renderCell: (row) => <Badge variant={alertStatusVariant(row.status)} label={alertStatusLabel(row.status, t)} />,
    },
    {
      key: 'metric',
      header: t('admin.ops.alertEvents.table.metric'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers>
          {alertMetricLabel(row)}
        </Text>
      ),
    },
  ]

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={880} maxHeight="90dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.ops.alertEvents.detail.title')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={5}>
              {failure != null && (
                <Banner
                  status="error"
                  title={t('admin.ops.alertEvents.detail.loadFailed')}
                  description={failure || undefined}
                />
              )}

              <HStack gap={4} hAlign="between" vAlign="start" wrap="wrap">
                <VStack gap={1.5}>
                  <HStack gap={1.5} vAlign="center">
                    <Badge variant={alertSeverityVariant(shown.severity)} label={shown.severity || NO_VALUE} />
                    <Badge variant={alertStatusVariant(shown.status)} label={alertStatusLabel(shown.status, t)} />
                    {isLoading && <Spinner size="sm" />}
                  </HStack>
                  <Heading level={3}>{shown.title || NO_VALUE}</Heading>
                  {shown.description && (
                    <Text color="secondary" wordBreak="break-word">
                      {shown.description}
                    </Text>
                  )}
                </VStack>
                <HStack gap={2} vAlign="end" wrap="wrap">
                  <Selector
                    label={t('admin.ops.alertEvents.detail.silence')}
                    width={130}
                    value={silenceDuration}
                    onChange={(value) => setSilenceDuration(value as SilenceDuration)}
                    options={SILENCE_DURATIONS.map((duration) => ({ value: duration, label: durationLabels[duration] }))}
                  />
                  <Button
                    label={t('common.apply')}
                    variant="secondary"
                    icon={<Icon icon={NoSymbolIcon} />}
                    isLoading={action === 'silence'}
                    isDisabled={action === 'resolve'}
                    onClick={silence}
                  />
                  <Button
                    label={t('admin.ops.alertEvents.detail.manualResolve')}
                    variant="secondary"
                    icon={<Icon icon={CheckCircleIcon} />}
                    isLoading={action === 'resolve'}
                    // An alert already closed by hand has nothing left to resolve.
                    isDisabled={action === 'silence' || isManuallyResolved(shown.status)}
                    onClick={resolve}
                  />
                </HStack>
              </HStack>

              <MetadataList columns="multi">
                <MetadataListItem label={t('admin.ops.alertEvents.detail.firedAt')}>
                  <Text>{formatDateTime(alertFiredAt(shown)) || NO_VALUE}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('admin.ops.alertEvents.detail.resolvedAt')}>
                  <Text>{shown.resolved_at ? formatDateTime(shown.resolved_at) : NO_VALUE}</Text>
                </MetadataListItem>
                <MetadataListItem label={t('admin.ops.alertEvents.detail.ruleId')}>
                  <HStack gap={3} vAlign="center" wrap="wrap">
                    <Text type="code">#{ruleId}</Text>
                    {onViewRule && (
                      <Link type="supporting" onClick={onViewRule}>
                        {t('admin.ops.alertEvents.detail.viewRule')}
                      </Link>
                    )}
                    {onViewLogs && (
                      <Link type="supporting" onClick={() => onViewLogs(shown)}>
                        {t('admin.ops.alertEvents.detail.viewLogs')}
                      </Link>
                    )}
                  </HStack>
                </MetadataListItem>
                <MetadataListItem label={t('admin.ops.alertEvents.detail.dimensions')}>
                  {dimensionPairs.length === 0 ? (
                    <Text>{NO_VALUE}</Text>
                  ) : (
                    <VStack gap={0.5}>
                      {dimensionPairs.map((pair) => (
                        <Text key={pair} type="code" wordBreak="break-all">
                          {pair}
                        </Text>
                      ))}
                    </VStack>
                  )}
                </MetadataListItem>
              </MetadataList>

              <Card variant="muted" padding={4}>
                <VStack gap={3}>
                  <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
                    <VStack gap={0.5}>
                      <HStack gap={2} vAlign="center">
                        <Heading level={4}>{t('admin.ops.alertEvents.detail.historyTitle')}</Heading>
                        {isHistoryLoading && history.length > 0 && <Spinner size="sm" />}
                      </HStack>
                      <Text type="supporting" color="secondary">
                        {t('admin.ops.alertEvents.detail.historyHint')}
                      </Text>
                    </VStack>
                    <Selector
                      label={t('admin.dashboard.timeRange')}
                      isLabelHidden
                      variant="secondary"
                      width={130}
                      value={historyRange}
                      onChange={(value) => setHistoryRange(value as HistoryRange)}
                      options={HISTORY_RANGES.map((range) => ({ value: range, label: durationLabels[range] }))}
                    />
                  </HStack>
                  {hasHistoryFailed ? (
                    <Banner status="error" title={t('admin.ops.failedToLoadData')} />
                  ) : history.length === 0 ? (
                    <Text type="supporting" color="secondary">
                      {isHistoryLoading
                        ? t('admin.ops.alertEvents.detail.historyLoading')
                        : t('admin.ops.alertEvents.detail.historyEmpty')}
                    </Text>
                  ) : (
                    <Table<Row>
                      data={history}
                      columns={historyColumns}
                      idKey={(row) => row.id}
                      density="compact"
                      dividers="rows"
                    />
                  )}
                </VStack>
              </Card>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
