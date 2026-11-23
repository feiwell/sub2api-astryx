import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ArrowPathIcon, MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline'
import { extractApiErrorMessage } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { useI18n } from '~/i18n'
import { opsAPI, type OpsSystemLog, type OpsSystemLogCleanupRequest, type OpsSystemLogSinkHealth } from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import { OpsLogConfigPanel } from './OpsLogConfigPanel'
import { errorMessage } from './errors'
import { bare } from './health'
import {
  SYSTEM_LOG_TIME_RANGES,
  buildSystemLogCleanup,
  buildSystemLogQuery,
  describeSystemLogCleanup,
  formatSystemLogDetail,
  hasCleanupCondition,
  initialSystemLogFilters,
  logLevelVariant,
  type SystemLogFilters,
  type SystemLogTimeRange,
} from './systemLogs'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<OpsSystemLog, keyof OpsSystemLog>
type TextField = Exclude<keyof SystemLogFilters, 'timeRange' | 'startTime' | 'endTime' | 'level'>

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'
const LEVELS = ['debug', 'info', 'warn', 'error']
const DEFAULT_PAGE_SIZE = 20
const NO_VALUE = '-'

const asDateTime = (value: string) => (value || undefined) as ISODateTimeString | undefined
// The writer's counters are shown to the last digit: a rounded "480K" hides whether they still move.
const exact = (value: number) => (value || 0).toLocaleString()

/**
 * What the gateway itself logged, newest first, with the state of the writer that stores it
 * and the log settings that can change without a restart.
 */
export function OpsSystemLogsCard({
  platform,
  refreshKey,
}: {
  /** The platform the page is narrowed to; the log starts on it. */
  platform: string
  /** Changes on every page refresh; the log and the writer's figures reload with it. */
  refreshKey: number
}) {
  const { t } = useI18n()
  // Four columns, the last one a long text: under a thousand pixels each entry reads better on lines of its own.
  const isWide = useMediaQuery('(min-width: 1024px)', true)
  // What the fields hold, and what the list was last asked for: typing loads nothing until "search".
  const [draft, setDraft] = useState(() => initialSystemLogFilters(platform))
  const [applied, setApplied] = useState(draft)
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [health, setHealth] = useState<OpsSystemLogSinkHealth | null>(null)
  const [isHealthLoading, setHealthLoading] = useState(false)
  const [healthTick, setHealthTick] = useState(0)
  // The cleanup waiting for its confirmation, exactly as it will be sent; null while none is asked.
  const [pendingCleanup, setPendingCleanup] = useState<OpsSystemLogCleanupRequest | null>(null)
  const [isCleaning, setCleaning] = useState(false)

  // The page was narrowed to a platform: the log follows, unless a platform is already typed here.
  const [seenPlatform, setSeenPlatform] = useState(platform)
  if (platform !== seenPlatform) {
    setSeenPlatform(platform)
    if (platform && !draft.platform) {
      setDraft({ ...draft, platform })
      setApplied({ ...applied, platform })
      setPage(1)
    }
  }

  // refreshKey and reloadTick are not sent; they are here so a page refresh or a search reloads the list.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    opsAPI
      .listSystemLogs(buildSystemLogQuery(applied, page, pageSize))
      .then((answer) => {
        if (isStale) return
        const nextTotal = answer.total || 0
        setRows(answer.items || [])
        setTotal(nextTotal)
        // Logs can be cleaned up between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load system logs', error)
        setRows([])
        setTotal(0)
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [applied, page, pageSize, refreshKey, reloadTick])

  useEffect(() => {
    let isStale = false
    setHealthLoading(true)
    opsAPI
      .getSystemLogSinkHealth()
      .then((answer) => {
        if (!isStale) setHealth(answer)
      })
      .catch((error) => {
        // The writer's figures are a side note: the log reads without them.
        if (!isStale) console.warn('[ops] failed to load system log health', error)
      })
      .finally(() => {
        if (!isStale) setHealthLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [refreshKey, healthTick])

  const reloadHealth = useCallback(() => setHealthTick((tick) => tick + 1), [])
  const reloadLogs = () => {
    setPage(1)
    setReloadTick((tick) => tick + 1)
  }

  const edit = (patch: Partial<SystemLogFilters>) => setDraft((current) => ({ ...current, ...patch }))
  const editText = (field: TextField, value: string) => setDraft((current) => ({ ...current, [field]: value }))

  const search = () => {
    setApplied(draft)
    reloadLogs()
  }

  const reset = () => {
    const next = initialSystemLogFilters(platform)
    setDraft(next)
    setApplied(next)
    reloadLogs()
  }

  const cleanupConditions = pendingCleanup ? describeSystemLogCleanup(pendingCleanup) : []

  const askCleanup = () => {
    // The quick time range alone is no condition: a cleanup asks for at least one field more.
    if (!hasCleanupCondition(draft)) {
      toast.warning(t('admin.ops.systemLogs.cleanupFilterRequired'))
      return
    }
    // The cleanup takes what the fields hold. The list is searched with the same fields first,
    // and the request is fixed now, so the question shows exactly what will be sent.
    search()
    setPendingCleanup(buildSystemLogCleanup(draft))
  }

  const cleanup = () => {
    if (isCleaning || !pendingCleanup) return
    setCleaning(true)
    opsAPI
      .cleanupSystemLogs(pendingCleanup)
      .then((answer) => {
        toast.success(t('admin.ops.systemLogs.cleanupSuccess', { count: answer.deleted || 0 }))
        reloadLogs()
        reloadHealth()
      })
      .catch((error) => {
        console.error('[ops] failed to clean up system logs', error)
        toast.error(
          extractApiErrorMessage(error, t('admin.ops.systemLogs.cleanupFailed'), {
            OPS_SYSTEM_LOG_CLEANUP_FILTER_REQUIRED: t('admin.ops.systemLogs.cleanupFilterRequired'),
          }),
        )
      })
      .finally(() => {
        setCleaning(false)
        setPendingCleanup(null)
      })
  }

  const timeRangeLabels: Record<SystemLogTimeRange, string> = {
    '5m': t('admin.ops.timeRange.5m'),
    '30m': t('admin.ops.timeRange.30m'),
    '1h': t('admin.ops.timeRange.1h'),
    '6h': t('admin.ops.timeRange.6h'),
    '24h': t('admin.ops.timeRange.24h'),
    '7d': t('admin.ops.timeRange.7d'),
    '30d': t('admin.ops.timeRange.30d'),
  }
  const labels = {
    title: t('admin.ops.systemLogs.title'),
    refreshHealth: t('admin.ops.systemLogs.refreshHealth'),
    cleanup: t('admin.ops.systemLogs.cleanCurrentFilters'),
  }

  const textField = (field: TextField, label: string, placeholder?: string) => (
    <TextInput
      label={label}
      placeholder={placeholder}
      width="100%"
      value={draft[field]}
      onChange={(value) => editText(field, value)}
      onEnter={search}
    />
  )

  const time = (row: Row) => formatDateTime(row.created_at) || row.created_at || NO_VALUE
  const levelBadge = (row: Row) => <Badge variant={logLevelVariant(row.level)} label={row.level || NO_VALUE} />

  const columns: TableColumn<Row>[] = [
    {
      key: 'created_at',
      header: t('admin.ops.systemLogs.time'),
      width: pixel(168),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers>
          {time(row)}
        </Text>
      ),
    },
    {
      key: 'host',
      header: t('admin.ops.systemLogs.host'),
      width: pixel(140),
      renderCell: (row) => (
        <Text type="supporting" wordBreak="break-all">
          {row.host || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'level',
      header: t('admin.ops.systemLogs.level'),
      width: pixel(90),
      renderCell: levelBadge,
    },
    {
      key: 'message',
      header: t('admin.ops.systemLogs.logDetails'),
      width: proportional(1, { minWidth: 280 }),
      renderCell: (row) => (
        <Text type="supporting" wordBreak="break-all">
          {formatSystemLogDetail(row)}
        </Text>
      ),
    },
  ]

  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center">
              <Heading level={4}>{labels.title}</Heading>
              {isLoading && rows.length > 0 && <Spinner size="sm" />}
            </HStack>
            <Text type="supporting" color="secondary">
              {t('admin.ops.systemLogs.description')}
            </Text>
          </VStack>
          <HStack gap={1.5} vAlign="center" wrap="wrap">
            {/* No figures before the writer answered: zeros would read as "nothing written". */}
            {health && (
              <>
                <Badge
                  variant="neutral"
                  label={`${t('admin.ops.systemLogs.queue')} ${exact(health.queue_depth)}/${exact(health.queue_capacity)}`}
                />
                <Badge
                  variant="neutral"
                  label={`${t('admin.ops.systemLogs.written')} ${exact(health.written_count)}`}
                />
                <Badge
                  variant={health.dropped_count > 0 ? 'warning' : 'neutral'}
                  label={`${t('admin.ops.systemLogs.dropped')} ${exact(health.dropped_count)}`}
                />
                <Badge
                  variant={health.write_failed_count > 0 ? 'error' : 'neutral'}
                  label={`${t('admin.ops.systemLogs.failed')} ${exact(health.write_failed_count)}`}
                />
              </>
            )}
            <IconButton
              label={labels.refreshHealth}
              tooltip={labels.refreshHealth}
              variant="ghost"
              size="sm"
              icon={<Icon icon={ArrowPathIcon} />}
              isDisabled={isHealthLoading}
              onClick={reloadHealth}
            />
          </HStack>
        </HStack>

        {health?.last_error && (
          <Banner
            status="warning"
            title={bare(t('admin.ops.systemLogs.latestWriteError'))}
            description={health.last_error}
          />
        )}

        <Collapsible
          trigger={<Text weight="medium">{t('admin.ops.systemLogs.runtimeConfig')}</Text>}
          defaultIsOpen={false}
        >
          <OpsLogConfigPanel onReset={reloadHealth} />
        </Collapsible>

        <Divider />

        <Grid columns={{ minWidth: 190 }} gap={3}>
          <Selector
            label={t('admin.ops.systemLogs.timeRange')}
            width="100%"
            value={draft.timeRange}
            onChange={(value) => edit({ timeRange: value as SystemLogTimeRange })}
            options={SYSTEM_LOG_TIME_RANGES.map((range) => ({ value: range, label: timeRangeLabels[range] }))}
          />
          <DateTimeInput
            label={t('admin.ops.systemLogs.startTime')}
            hasClear
            width="100%"
            value={asDateTime(draft.startTime)}
            max={asDateTime(draft.endTime)}
            onChange={(value) => edit({ startTime: value ?? '' })}
          />
          <DateTimeInput
            label={t('admin.ops.systemLogs.endTime')}
            hasClear
            width="100%"
            value={asDateTime(draft.endTime)}
            min={asDateTime(draft.startTime)}
            onChange={(value) => edit({ endTime: value ?? '' })}
          />
          <Selector
            label={t('admin.ops.systemLogs.level')}
            width="100%"
            value={draft.level || ALL}
            onChange={(value) => edit({ level: value === ALL ? '' : value })}
            options={[
              { value: ALL, label: t('admin.ops.systemLogs.all') },
              ...LEVELS.map((level) => ({ value: level, label: level })),
            ]}
          />
          {textField('component', t('admin.ops.systemLogs.component'), t('admin.ops.systemLogs.componentPlaceholder'))}
          {textField('host', t('admin.ops.systemLogs.host'))}
          {/* The next ids are searched by the names the log itself uses for them. */}
          {textField('requestId', 'request_id')}
          {textField('clientRequestId', 'client_request_id')}
          {textField('userId', 'user_id')}
          {textField('apiKeyId', t('admin.ops.systemLogs.keyId'))}
          {textField('accountId', 'account_id')}
          {textField('platform', t('admin.ops.systemLogs.platform'))}
          {textField('model', t('admin.ops.systemLogs.model'))}
          {textField('keyword', t('admin.ops.systemLogs.keyword'), t('admin.ops.systemLogs.keywordPlaceholder'))}
        </Grid>

        <HStack gap={2} hAlign="between" wrap="wrap">
          <HStack gap={2}>
            <Button
              label={t('admin.ops.systemLogs.search')}
              variant="primary"
              icon={<Icon icon={MagnifyingGlassIcon} />}
              onClick={search}
            />
            <Button label={t('common.reset')} variant="secondary" onClick={reset} />
          </HStack>
          <Button label={labels.cleanup} variant="secondary" icon={<Icon icon={TrashIcon} />} onClick={askCleanup} />
        </HStack>

        {failure != null && (
          <Banner status="error" title={t('admin.ops.systemLogs.loadFailed')} description={failure || undefined} />
        )}

        {rows.length === 0 ? (
          // A failed load leaves only its banner.
          (isLoading || failure == null) && (
            <Center padding={8}>
              {isLoading ? (
                <Spinner />
              ) : (
                <EmptyState isCompact headingLevel={5} title={t('admin.ops.systemLogs.empty')} />
              )}
            </Center>
          )
        ) : isWide ? (
          <Table<Row>
            data={rows}
            columns={columns}
            idKey={(row) => row.id}
            density="compact"
            dividers="rows"
            verticalAlign="top"
          />
        ) : (
          <VStack gap={3}>
            {rows.map((row, index) => (
              <VStack key={row.id} gap={1.5}>
                {index > 0 && <Divider />}
                <HStack gap={2} vAlign="center" wrap="wrap">
                  {levelBadge(row)}
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {time(row)}
                  </Text>
                  {row.host && (
                    <Text type="supporting" color="secondary" wordBreak="break-all">
                      {row.host}
                    </Text>
                  )}
                </HStack>
                <Text type="supporting" wordBreak="break-all">
                  {formatSystemLogDetail(row)}
                </Text>
              </VStack>
            ))}
          </VStack>
        )}

        {total > 0 && (
          <Pagination
            page={page}
            onChange={setPage}
            totalItems={total}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            variant="input"
            size="sm"
          />
        )}
      </VStack>

      <AlertDialog
        isOpen={pendingCleanup != null}
        onOpenChange={(open) => {
          if (!open && !isCleaning) setPendingCleanup(null)
        }}
        title={labels.cleanup}
        // The conditions follow the question, the start time the quick range stands for among them.
        description={`${t('admin.ops.systemLogs.cleanupConfirm')} ${cleanupConditions.join(' ')}`}
        actionLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        isActionLoading={isCleaning}
        onAction={cleanup}
      />
    </Card>
  )
}
