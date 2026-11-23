import { useEffect, useRef, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { formatDateTime } from '@/views/admin/ops/utils/opsFormatters'
import { useI18n } from '~/i18n'
import { opsAPI, type AlertEvent, type AlertEventsQuery } from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import { OpsAlertEventDialog } from './OpsAlertEventDialog'
import {
  alertDimension,
  alertDimensionPairs,
  alertDurationLabel,
  alertFiredAt,
  alertGroupId,
  alertSeverityVariant,
  alertStatusLabel,
  alertStatusVariant,
} from './alertEvents'
import { errorMessage } from './errors'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<AlertEvent, keyof AlertEvent>
type AlertTimeRange = '5m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'
const EMAIL_SENT = 'true'
const EMAIL_IGNORED = 'false'
const PAGE_SIZE = 10
const TIME_RANGES: AlertTimeRange[] = ['5m', '30m', '1h', '6h', '24h', '7d', '30d']
const SEVERITIES = ['P0', 'P1', 'P2', 'P3']
/** Beyond this many rows the table scrolls inside the card instead of stretching the page. */
const ROWS_BEFORE_SCROLL = PAGE_SIZE
const SCROLL_HEIGHT = 560
const FILTER_WIDTH = 132
const NO_VALUE = '-'

function buildQuery(timeRange: AlertTimeRange, severity: string, status: string, emailSent: string): AlertEventsQuery {
  return {
    limit: PAGE_SIZE,
    time_range: timeRange,
    severity: severity === ALL ? undefined : severity,
    status: status === ALL ? undefined : status,
    email_sent: emailSent === ALL ? undefined : emailSent === EMAIL_SENT,
  }
}

/**
 * The alerts the rules raised, newest first. The card keeps its own time range and is not
 * reloaded by the page refresh: alerts are read over days, the page over its last hour.
 */
export function OpsAlertEventsCard({
  reloadKey,
  onViewLogs,
  onViewRule,
}: {
  /** Changes when alerts may have gone from the server (a rule was deleted): the list is read again. */
  reloadKey: number
  /** Asks the page for the request errors of a platform and group. Without it an alert offers no such link. */
  onViewLogs?: (platform: string, groupId: number | null) => void
  /** Asks the page for the list of alert rules. Without it an alert offers no such link. */
  onViewRule?: () => void
}) {
  const { t } = useI18n()
  // Eight columns need a card of some 1040 pixels, which the sidebar leaves from a 1366 window on;
  // a narrower card lists each alert on a few lines instead.
  const isWide = useMediaQuery('(min-width: 1366px)', true)
  const [timeRange, setTimeRange] = useState<AlertTimeRange>('24h')
  const [severity, setSeverity] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [emailSent, setEmailSent] = useState(ALL)
  const [rows, setRows] = useState<Row[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [isLoadingMore, setLoadingMore] = useState(false)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [selected, setSelected] = useState<AlertEvent | null>(null)
  // Counts the loads of the first page. An answer to "load more" belongs to the list it was asked for:
  // once a newer first page is on its way, that answer is dropped.
  const listVersion = useRef(0)

  useEffect(() => {
    const version = ++listVersion.current
    setLoading(true)
    setLoadingMore(false)
    setFailure(null)
    opsAPI
      .listAlertEvents(buildQuery(timeRange, severity, status, emailSent))
      .then((answer) => {
        if (version !== listVersion.current) return
        const items = answer || []
        setRows(items)
        // A full page may be the last one; only asking for the next tells.
        setHasMore(items.length === PAGE_SIZE)
      })
      .catch((error) => {
        if (version !== listVersion.current) return
        console.error('[ops] failed to load alert events', error)
        setRows([])
        setHasMore(false)
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (version === listVersion.current) setLoading(false)
      })
    return () => {
      listVersion.current += 1
    }
  }, [timeRange, severity, status, emailSent, reloadTick, reloadKey])

  const reload = () => setReloadTick((tick) => tick + 1)

  const loadMore = () => {
    const last = rows[rows.length - 1]
    if (!last || !hasMore || isLoading || isLoadingMore) return
    const version = listVersion.current
    setLoadingMore(true)
    opsAPI
      // The page after the last row: older than it, or as old with a smaller id.
      .listAlertEvents({
        ...buildQuery(timeRange, severity, status, emailSent),
        before_fired_at: alertFiredAt(last),
        before_id: last.id,
      })
      .then((answer) => {
        if (version !== listVersion.current) return
        const items = answer || []
        setRows((current) => [...current, ...items])
        setHasMore(items.length === PAGE_SIZE)
      })
      .catch((error) => {
        if (version !== listVersion.current) return
        console.error('[ops] failed to load more alert events', error)
        toast.error(errorMessage(error) || t('admin.ops.alertEvents.loadFailed'))
      })
      .finally(() => {
        if (version === listVersion.current) setLoadingMore(false)
      })
  }

  // Either link leaves the alert: what it opens takes the alert's place.
  const viewLogs =
    onViewLogs &&
    ((event: AlertEvent) => {
      setSelected(null)
      onViewLogs(alertDimension(event, 'platform'), alertGroupId(event))
    })
  const viewRule =
    onViewRule &&
    (() => {
      setSelected(null)
      onViewRule()
    })

  const all = { value: ALL, label: t('common.all') }
  const timeRangeLabels: Record<AlertTimeRange, string> = {
    '5m': t('admin.ops.timeRange.5m'),
    '30m': t('admin.ops.timeRange.30m'),
    '1h': t('admin.ops.timeRange.1h'),
    '6h': t('admin.ops.timeRange.6h'),
    '24h': t('admin.ops.timeRange.24h'),
    '7d': t('admin.ops.timeRange.7d'),
    '30d': t('admin.ops.timeRange.30d'),
  }
  const labels = {
    title: t('admin.ops.alertEvents.title'),
    emailSent: t('admin.ops.alertEvents.table.emailSent'),
    emailIgnored: t('admin.ops.alertEvents.table.emailIgnored'),
    refresh: t('common.refresh'),
  }

  const severityBadge = (row: Row) => (
    <Badge variant={alertSeverityVariant(row.severity)} label={row.severity || NO_VALUE} />
  )
  const statusBadge = (row: Row) => (
    <Badge variant={alertStatusVariant(row.status)} label={alertStatusLabel(row.status, t)} />
  )
  const emailBadge = (row: Row) => (
    <Badge variant={row.email_sent ? 'success' : 'neutral'} label={row.email_sent ? labels.emailSent : labels.emailIgnored} />
  )
  // Neither view has a row click, so the time opens the alert.
  const opener = (row: Row) => (
    <Link type="supporting" tooltip={row.title || undefined} onClick={() => setSelected(row)}>
      {formatDateTime(alertFiredAt(row)) || NO_VALUE}
    </Link>
  )
  const dimensions = (row: Row) => alertDimensionPairs(row).join(' ') || NO_VALUE

  const columns: TableColumn<Row>[] = [
    {
      key: 'fired_at',
      header: t('admin.ops.alertEvents.table.time'),
      width: pixel(132),
      renderCell: opener,
    },
    {
      key: 'severity',
      header: t('admin.ops.alertEvents.table.severity'),
      width: pixel(150),
      renderCell: (row) => (
        <HStack gap={1} vAlign="center" wrap="wrap">
          {severityBadge(row)}
          {statusBadge(row)}
        </HStack>
      ),
    },
    {
      key: 'platform',
      header: t('admin.ops.alertEvents.table.platform'),
      width: pixel(96),
      renderCell: (row) => <Text type="supporting">{alertDimension(row, 'platform') || NO_VALUE}</Text>,
    },
    {
      key: 'rule_id',
      header: t('admin.ops.alertEvents.table.ruleId'),
      width: pixel(80),
      renderCell: (row) => <Text type="code">#{row.rule_id}</Text>,
    },
    {
      key: 'title',
      header: t('admin.ops.alertEvents.table.title'),
      width: proportional(2.2, { minWidth: 220 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" weight="medium" maxLines={1}>
            {row.title || NO_VALUE}
          </Text>
          {row.description && (
            <Text type="supporting" color="secondary" maxLines={2}>
              {row.description}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'duration',
      header: t('admin.ops.alertEvents.table.duration'),
      width: pixel(130),
      renderCell: (row) => <Text type="supporting">{alertDurationLabel(row, t)}</Text>,
    },
    {
      key: 'dimensions',
      header: t('admin.ops.alertEvents.table.dimensions'),
      width: proportional(1.2, { minWidth: 120 }),
      renderCell: (row) => (
        <Text type="supporting" color="secondary" wordBreak="break-all">
          {dimensions(row)}
        </Text>
      ),
    },
    {
      key: 'email_sent',
      header: t('admin.ops.alertEvents.table.email'),
      width: pixel(100),
      renderCell: emailBadge,
    },
  ]

  const table = (
    <Table<Row>
      data={rows}
      columns={columns}
      idKey={(row) => row.id}
      density="compact"
      dividers="rows"
      hasHover
      verticalAlign="top"
    />
  )

  return (
    <>
      <Card>
        <VStack gap={3}>
          <HStack gap={3} hAlign="between" vAlign="start">
            <VStack gap={0.5}>
              <HStack gap={2} vAlign="center">
                <Heading level={4}>{labels.title}</Heading>
                {isLoading && rows.length > 0 && <Spinner size="sm" />}
              </HStack>
              <Text type="supporting" color="secondary">
                {t('admin.ops.alertEvents.description')}
              </Text>
            </VStack>
            <IconButton
              label={labels.refresh}
              tooltip={labels.refresh}
              variant="ghost"
              size="sm"
              icon={<Icon icon={ArrowPathIcon} />}
              isDisabled={isLoading}
              onClick={reload}
            />
          </HStack>

          <HStack gap={3} vAlign="end" wrap="wrap">
            <Selector
              label={t('admin.dashboard.timeRange')}
              width={FILTER_WIDTH}
              value={timeRange}
              onChange={(value) => setTimeRange(value as AlertTimeRange)}
              options={TIME_RANGES.map((range) => ({ value: range, label: timeRangeLabels[range] }))}
            />
            <Selector
              label={t('admin.ops.alertEvents.table.severity')}
              width={FILTER_WIDTH}
              value={severity}
              onChange={setSeverity}
              options={[all, ...SEVERITIES.map((level) => ({ value: level, label: level }))]}
            />
            <Selector
              label={t('admin.ops.alertEvents.table.status')}
              width={FILTER_WIDTH}
              value={status}
              onChange={setStatus}
              options={[
                all,
                { value: 'firing', label: t('admin.ops.alertEvents.status.firing') },
                { value: 'resolved', label: t('admin.ops.alertEvents.status.resolved') },
                { value: 'manual_resolved', label: t('admin.ops.alertEvents.status.manualResolved') },
              ]}
            />
            <Selector
              label={t('admin.ops.alertEvents.table.email')}
              width={FILTER_WIDTH}
              value={emailSent}
              onChange={setEmailSent}
              options={[
                all,
                { value: EMAIL_SENT, label: labels.emailSent },
                { value: EMAIL_IGNORED, label: labels.emailIgnored },
              ]}
            />
          </HStack>

          {failure != null && (
            <Banner status="error" title={t('admin.ops.alertEvents.loadFailed')} description={failure || undefined} />
          )}

          {rows.length === 0 ? (
            // A failed load leaves only its banner.
            (isLoading || failure == null) && (
              <Center padding={8}>
                {isLoading ? (
                  <Spinner label={t('admin.ops.alertEvents.loading')} />
                ) : (
                  <EmptyState isCompact headingLevel={5} title={t('admin.ops.alertEvents.empty')} />
                )}
              </Center>
            )
          ) : !isWide ? (
            <VStack gap={3}>
              {rows.map((row, index) => (
                <VStack key={row.id} gap={1.5}>
                  {index > 0 && <Divider />}
                  <HStack gap={1.5} vAlign="center" wrap="wrap">
                    {severityBadge(row)}
                    {statusBadge(row)}
                    {opener(row)}
                  </HStack>
                  <Text weight="medium" wordBreak="break-word">
                    {row.title || NO_VALUE}
                  </Text>
                  {row.description && (
                    <Text type="supporting" color="secondary" maxLines={2}>
                      {row.description}
                    </Text>
                  )}
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text type="code">#{row.rule_id}</Text>
                    <Text type="supporting">{alertDurationLabel(row, t)}</Text>
                    {emailBadge(row)}
                  </HStack>
                  <Text type="supporting" color="secondary" wordBreak="break-all">
                    {dimensions(row)}
                  </Text>
                </VStack>
              ))}
            </VStack>
          ) : rows.length > ROWS_BEFORE_SCROLL ? (
            <ScrollableArea label={labels.title} height={SCROLL_HEIGHT}>
              {table}
            </ScrollableArea>
          ) : (
            table
          )}

          {rows.length > 0 && hasMore && (
            <Center>
              <Button
                label={t('admin.dataManagement.actions.loadMore')}
                variant="secondary"
                size="sm"
                isLoading={isLoadingMore}
                isDisabled={isLoading}
                onClick={loadMore}
              />
            </Center>
          )}
        </VStack>
      </Card>

      {selected && (
        <OpsAlertEventDialog
          key={selected.id}
          event={selected}
          onChanged={reload}
          onViewLogs={viewLogs}
          onViewRule={viewRule}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
