import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import {
  Table,
  pixel,
  proportional,
  useTablePagination,
  useTableSortable,
  type TableColumn,
  type TableSortState,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { DocumentTextIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { mapErrorSortKey } from '@/utils/errorBadges'
import { mapErrorCategory } from '@/utils/errorCategory'
import { formatNumber } from '@/utils/format'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { formatDateTime } from '@/views/admin/ops/utils/opsFormatters'
import { useI18n } from '~/i18n'
import { opsAPI, type OpsErrorListView, type OpsErrorLog } from '~/lib/api/admin/ops'
import { OpsFacts } from './OpsStatCard'
import {
  displayModel,
  errorTypeBadge,
  hasModelMapping,
  requestTypeName,
  severityVariant,
  statusColor,
  summarizeMessage,
  type OpsErrorKind,
} from './errorLog'
import { errorMessage } from './errors'
import { buildOpsWindowParams, type OpsCustomRange, type OpsFilters } from './filters'
import { bare } from './health'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<OpsErrorLog, keyof OpsErrorLog>

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'
const OTHER_STATUS = 'other'
const STATUS_CODES = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504, 529]
const PHASES = ['request', 'auth', 'account_auth', 'routing', 'upstream', 'network', 'internal']
const OWNERS = ['provider', 'client', 'platform']
const DEFAULT_PAGE_SIZE = 10
const NEWEST_FIRST: TableSortState = [{ sortKey: 'created_at', direction: 'descending' }]
const SEARCH_DELAY_MS = 350
const NO_VALUE = '-'

/** The errors of the selected window, either those answered to clients or those the upstream accounts answered with. */
export function OpsErrorListDialog({
  isOpen,
  errorKind,
  filters,
  customRange,
  onOpenError,
  onClose,
}: {
  /** False while one of its errors is on show: the dialog hides and keeps its filters for the way back. */
  isOpen: boolean
  errorKind: OpsErrorKind
  filters: OpsFilters
  /** The window picked by hand; only set while the time range is "custom". */
  customRange: OpsCustomRange | null
  onOpenError: (errorId: number) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  // The upstream list opens on the upstream phase; other phases stay one choice away.
  const defaultPhase = errorKind === 'upstream' ? 'upstream' : ALL
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [statusCode, setStatusCode] = useState(ALL)
  const [phase, setPhase] = useState(defaultPhase)
  const [owner, setOwner] = useState(ALL)
  const [view, setView] = useState<OpsErrorListView>('errors')
  const [sort, setSort] = useState(NEWEST_FIRST)
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)

  // Typing waits for a pause before it searches.
  useEffect(() => {
    const next = query.trim()
    if (next === appliedQuery) return
    const timer = window.setTimeout(() => {
      setAppliedQuery(next)
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [query, appliedQuery])

  const { timeRange, platform, groupId } = filters
  const customStart = customRange?.start ?? ''
  const customEnd = customRange?.end ?? ''
  const sortKey = sort[0]?.sortKey ?? 'created_at'
  const sortOrder = sort[0]?.direction === 'ascending' ? 'asc' : 'desc'

  useEffect(() => {
    let isStale = false
    const list = errorKind === 'upstream' ? opsAPI.listUpstreamErrors : opsAPI.listRequestErrors
    setLoading(true)
    setFailure(null)
    list({
      page,
      page_size: pageSize,
      view,
      sort_by: mapErrorSortKey(sortKey),
      sort_order: sortOrder,
      ...buildOpsWindowParams(timeRange, customStart && customEnd ? { start: customStart, end: customEnd } : null),
      platform: platform || undefined,
      group_id: groupId ?? undefined,
      q: appliedQuery || undefined,
      status_codes: statusCode !== ALL && statusCode !== OTHER_STATUS ? statusCode : undefined,
      status_codes_other: statusCode === OTHER_STATUS ? '1' : undefined,
      phase: phase !== ALL ? phase : undefined,
      error_owner: owner !== ALL ? owner : undefined,
    })
      .then((answer) => {
        if (isStale) return
        const nextTotal = answer.total || 0
        setRows(answer.items || [])
        setTotal(nextTotal)
        // Errors can leave the window between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load error logs', error)
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
  }, [
    errorKind,
    timeRange,
    customStart,
    customEnd,
    platform,
    groupId,
    appliedQuery,
    statusCode,
    phase,
    owner,
    view,
    sortKey,
    sortOrder,
    page,
    pageSize,
  ])

  // Any change of a filter starts again from the first page.
  const choose = <T,>(set: (value: T) => void) => {
    return (value: T) => {
      set(value)
      setPage(1)
    }
  }

  const reset = () => {
    setQuery('')
    setAppliedQuery('')
    setStatusCode(ALL)
    setPhase(defaultPhase)
    setOwner(ALL)
    setView('errors')
    setPage(1)
  }

  const sortPlugin = useTableSortable<Row>({
    sort,
    // A third click on a heading clears the sort: that reads as newest first again.
    onSortChange: choose((next: TableSortState) => setSort(next.length > 0 ? next : NEWEST_FIRST)),
  })
  const pagination = useTablePagination<Row>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: choose(setPageSize),
    pageSizeOptions,
  })

  const all = { value: ALL, label: t('common.all') }
  const detailsLabel = t('admin.ops.errorLog.details')
  const dash = (
    <Text type="supporting" color="secondary">
      {NO_VALUE}
    </Text>
  )

  const columns: TableColumn<Row>[] = [
    {
      key: 'created_at',
      header: t('admin.ops.errorLog.time'),
      width: pixel(150),
      sortable: true,
      // The table has no row click, so the time opens the error.
      renderCell: (row) => (
        <Link
          type="supporting"
          tooltip={row.request_id || row.client_request_id || undefined}
          onClick={() => onOpenError(row.id)}
        >
          {formatDateTime(row.created_at)}
        </Link>
      ),
    },
    {
      key: 'message',
      header: t('admin.ops.errorLog.message'),
      width: proportional(2.5, { minWidth: 260 }),
      renderCell: (row) =>
        row.message ? (
          <Text type="supporting" maxLines={2}>
            {summarizeMessage(row.message, t) || NO_VALUE}
          </Text>
        ) : (
          dash
        ),
    },
    {
      key: 'user',
      header: t('admin.ops.errorLog.user'),
      width: proportional(1.4, { minWidth: 170 }),
      renderCell: (row) =>
        row.user_id ? (
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Text type="supporting" wordBreak="break-all">
              {row.user_email || NO_VALUE}
            </Text>
            <Text type="supporting" color="secondary">
              #{row.user_id}
            </Text>
          </HStack>
        ) : (
          dash
        ),
    },
    {
      key: 'api_key',
      header: t('admin.ops.errorLog.apiKey'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) =>
        row.api_key_id || row.api_key_name ? (
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Text type="supporting">{row.api_key_name || `#${row.api_key_id}`}</Text>
            {row.api_key_deleted && <Badge variant="error" label={t('admin.ops.errorLog.keyDeletedBadge')} />}
          </HStack>
        ) : (
          dash
        ),
    },
    {
      key: 'account',
      header: t('admin.ops.errorLog.account'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) =>
        row.account_id ? <Text type="supporting">{row.account_name || `#${row.account_id}`}</Text> : dash,
    },
    {
      key: 'platform',
      header: t('admin.ops.errorLog.platform'),
      width: pixel(100),
      renderCell: (row) => (row.platform ? <Text type="supporting">{row.platform}</Text> : dash),
    },
    {
      key: 'model',
      header: t('admin.ops.errorLog.model'),
      width: proportional(1.2, { minWidth: 150 }),
      sortable: true,
      renderCell: (row) =>
        hasModelMapping(row) ? (
          <VStack gap={0.5}>
            <Text type="supporting" weight="medium" wordBreak="break-all">
              {row.requested_model}
            </Text>
            <Text type="supporting" color="secondary" wordBreak="break-all">
              ↳ {row.upstream_model}
            </Text>
          </VStack>
        ) : displayModel(row) ? (
          <Text type="supporting" wordBreak="break-all">
            {displayModel(row)}
          </Text>
        ) : (
          dash
        ),
    },
    {
      key: 'endpoint',
      header: t('admin.ops.errorLog.endpoint'),
      width: proportional(1.5, { minWidth: 190 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" wordBreak="break-all">
            {t('usage.inbound')}: {row.inbound_endpoint?.trim() || NO_VALUE}
          </Text>
          {row.upstream_endpoint && (
            <Text type="supporting" color="secondary" wordBreak="break-all">
              {t('usage.upstream')}: {row.upstream_endpoint.trim() || NO_VALUE}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'group',
      header: t('admin.ops.errorLog.group'),
      width: proportional(1, { minWidth: 110 }),
      renderCell: (row) =>
        row.group_id ? <Text type="supporting">{row.group_name || `#${row.group_id}`}</Text> : dash,
    },
    {
      key: 'type',
      header: t('admin.ops.errorLog.type'),
      width: pixel(110),
      renderCell: (row) => {
        const badge = errorTypeBadge(row, t)
        return <Badge variant={badge.variant} label={badge.label} />
      },
    },
    {
      key: 'category',
      header: t('usage.errors.category'),
      width: pixel(120),
      renderCell: (row) => (
        <Text type="supporting">{t(`usage.errors.categories.${mapErrorCategory(row.phase, row.type)}`)}</Text>
      ),
    },
    {
      key: 'status',
      header: t('admin.ops.errorLog.status'),
      width: pixel(170),
      sortable: true,
      renderCell: (row) => {
        const requestType = requestTypeName(row.request_type)
        return (
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Token size="sm" color={statusColor(row.status_code)} label={String(row.status_code)} />
            {row.severity && <Badge variant={severityVariant(row.severity)} label={row.severity} />}
            {requestType && <Badge variant="neutral" label={t(`admin.ops.errorLog.requestType${requestType}`)} />}
          </HStack>
        )
      },
    },
    {
      key: 'user_agent',
      header: t('usage.userAgent'),
      width: proportional(1.5, { minWidth: 180 }),
      renderCell: (row) =>
        row.user_agent ? (
          <Text type="supporting" maxLines={2}>
            {row.user_agent}
          </Text>
        ) : (
          dash
        ),
    },
    {
      key: 'client_ip',
      header: t('admin.ops.errorLog.ip'),
      width: pixel(140),
      renderCell: (row) => (row.client_ip ? <Text type="code">{row.client_ip}</Text> : dash),
    },
    {
      key: 'actions',
      header: t('admin.ops.errorLog.action'),
      width: pixel(70),
      renderCell: (row) => (
        <IconButton
          label={detailsLabel}
          tooltip={detailsLabel}
          variant="ghost"
          size="sm"
          icon={<Icon icon={DocumentTextIcon} />}
          onClick={() => onOpenError(row.id)}
        />
      ),
    },
  ]

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={reportOpen} width={1280} maxHeight="90dvh" purpose="info">
      <Layout
        header={
          <DialogHeader
            title={t(
              errorKind === 'upstream' ? 'admin.ops.errorDetails.upstreamErrors' : 'admin.ops.errorDetails.requestErrors',
            )}
            onOpenChange={reportOpen}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={3}>
              <HStack gap={3} vAlign="end" wrap="wrap">
                <TextInput
                  label={t('common.search')}
                  placeholder={t('admin.ops.errorDetails.searchPlaceholder')}
                  startIcon={MagnifyingGlassIcon}
                  hasClear
                  width={340}
                  value={query}
                  onChange={setQuery}
                />
                <Selector
                  label={t('admin.ops.errorLog.status')}
                  width={120}
                  value={statusCode}
                  onChange={choose(setStatusCode)}
                  options={[
                    all,
                    ...STATUS_CODES.map((code) => ({ value: String(code), label: String(code) })),
                    { value: OTHER_STATUS, label: t('admin.ops.errorDetails.statusCodeOther') },
                  ]}
                />
                <Selector
                  label={t('admin.ops.errorLog.phase')}
                  width={130}
                  value={phase}
                  onChange={choose(setPhase)}
                  options={[all, ...PHASES.map((name) => ({ value: name, label: t(`admin.ops.errorDetails.phase.${name}`) }))]}
                />
                <Selector
                  label={t('admin.ops.errorDetail.classificationKeys.owner')}
                  width={120}
                  value={owner}
                  onChange={choose(setOwner)}
                  options={[all, ...OWNERS.map((name) => ({ value: name, label: t(`admin.ops.errorDetails.owner.${name}`) }))]}
                />
                <Selector
                  label={t('common.view')}
                  width={120}
                  value={view}
                  onChange={choose((value: string) => setView(value as OpsErrorListView))}
                  options={[
                    { value: 'errors', label: t('admin.ops.errorDetails.viewErrors') },
                    { value: 'excluded', label: t('admin.ops.errorDetails.viewExcluded') },
                    { value: 'all', label: t('common.all') },
                  ]}
                />
                <Button label={t('common.reset')} variant="secondary" onClick={reset} />
              </HStack>

              {failure != null ? (
                <Banner status="error" title={t('admin.ops.failedToLoadData')} description={failure || undefined} />
              ) : (
                // No total before the first answer: "0" would read as "no errors".
                (rows.length > 0 || !isLoading) && (
                  <HStack gap={2} vAlign="center">
                    <OpsFacts facts={[{ label: bare(t('admin.ops.errorDetails.total')), value: formatNumber(total) }]} />
                    {isLoading && <Spinner size="sm" />}
                  </HStack>
                )
              )}

              {rows.length === 0 ? (
                // A failed load leaves only its banner.
                (isLoading || failure == null) && (
                  <Center padding={10}>
                    {isLoading ? (
                      <Spinner />
                    ) : (
                      <EmptyState isCompact headingLevel={3} title={t('admin.ops.errorLog.noErrors')} />
                    )}
                  </Center>
                )
              ) : (
                <Table<Row>
                  data={rows}
                  columns={columns}
                  idKey={(row) => row.id}
                  density="compact"
                  dividers="rows"
                  hasHover
                  verticalAlign="top"
                  plugins={{ sort: sortPlugin, pagination }}
                />
              )}
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
