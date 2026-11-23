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
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTablePagination, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { ArrowPathIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import { getConfiguredTablePageSizeOptions, normalizeTablePageSize } from '@/utils/tablePreferences'
import { formatDateTime } from '@/views/admin/ops/utils/opsFormatters'
import { useI18n } from '~/i18n'
import { opsAPI, type OpsRequestDetail } from '~/lib/api/admin/ops'
import { copyToClipboard } from '~/lib/clipboard'
import { loadAccountNamesFor } from './accountNames'
import { statusColor } from './errorLog'
import { errorMessage } from './errors'
import { formatCustomRange, resolveOpsWindow, timeRangeMinutes, type OpsCustomRange, type OpsFilters } from './filters'
import type { OpsRequestsPreset } from './useOpsDetails'

const DEFAULT_PAGE_SIZE = 10
const NO_VALUE = '-'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<OpsRequestDetail, keyof OpsRequestDetail>

/** The requests behind a figure of the ops page, newest or slowest first as the opening card asked. */
export function OpsRequestDetailsDialog({
  isOpen,
  preset,
  filters,
  customRange,
  onOpenError,
  onClose,
}: {
  /** False while one of its errors is on show: the dialog hides and keeps its page for the way back. */
  isOpen: boolean
  preset: OpsRequestsPreset
  filters: OpsFilters
  /** The window picked by hand; only set while the time range is "custom". */
  customRange: OpsCustomRange | null
  onOpenError: (errorId: number) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  // The sizes on offer are the ones set in the system settings; the first one used is the nearest of them.
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [pageSize, setPageSize] = useState(() => normalizeTablePageSize(DEFAULT_PAGE_SIZE))
  const [reloads, setReloads] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [accountNames, setAccountNames] = useState<Map<number, string>>(() => new Map())

  const { timeRange, platform, groupId } = filters
  const { kind = 'all', sort = 'created_at_desc' } = preset
  const customStart = customRange?.start ?? ''
  const customEnd = customRange?.end ?? ''

  // reloads is not sent; it is here so the refresh button asks again.
  useEffect(() => {
    let isStale = false
    const span = resolveOpsWindow(timeRange, customStart && customEnd ? { start: customStart, end: customEnd } : null)
    setLoading(true)
    setFailure(null)
    opsAPI
      .listRequestDetails({
        start_time: span.start,
        end_time: span.end,
        page,
        page_size: pageSize,
        kind,
        sort,
        platform: platform || undefined,
        group_id: groupId ?? undefined,
      })
      .then((answer) => {
        if (isStale) return
        const nextTotal = answer.total || 0
        setRows(answer.items || [])
        setTotal(nextTotal)
        // Requests can leave the window between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
        if (page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load request details', error)
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
  }, [timeRange, customStart, customEnd, platform, groupId, kind, sort, page, pageSize, reloads])

  useEffect(() => {
    const ids = rows.map((row) => row.account_id).filter((id): id is number => typeof id === 'number' && id > 0)
    if (ids.length === 0) return
    let isStale = false
    loadAccountNamesFor(ids)
      .then((names) => {
        if (!isStale) setAccountNames(names)
      })
      .catch((error) => console.warn('[ops] failed to load account names', error))
    return () => {
      isStale = true
    }
  }, [rows])

  const pagination = useTablePagination<Row>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: (size) => {
      setPageSize(size)
      setPage(1)
    },
    pageSizeOptions,
  })

  const minutes = timeRangeMinutes(timeRange)
  const rangeText = customRange
    ? formatCustomRange(customRange)
    : minutes >= 60
      ? t('admin.ops.requestDetails.rangeHours', { n: Math.round(minutes / 60) })
      : t('admin.ops.requestDetails.rangeMinutes', { n: minutes })

  // A list opened from the first-token card is sorted by that delay, so it shows it in place of the duration.
  const showsFirstToken = sort === 'ttft_desc'
  const accountLabel = (id: number | null | undefined) =>
    typeof id === 'number' && id > 0 ? accountNames.get(id) || `#${id}` : NO_VALUE
  const copyLabel = t('admin.ops.requestDetails.copy')

  const columns: TableColumn<Row>[] = [
    {
      key: 'created_at',
      header: t('admin.ops.requestDetails.table.time'),
      width: pixel(140),
      renderCell: (row) => <Text hasTabularNumbers>{formatDateTime(row.created_at)}</Text>,
    },
    {
      key: 'kind',
      header: t('admin.ops.requestDetails.table.kind'),
      width: pixel(80),
      renderCell: (row) =>
        row.kind === 'error' ? (
          <Badge variant="error" label={t('admin.ops.requestDetails.kind.error')} />
        ) : (
          <Badge variant="success" label={t('admin.ops.requestDetails.kind.success')} />
        ),
    },
    {
      key: 'platform',
      header: t('admin.ops.requestDetails.table.platform'),
      width: pixel(110),
      renderCell: (row) => <Text>{(row.platform || 'unknown').toUpperCase()}</Text>,
    },
    {
      key: 'model',
      header: t('admin.ops.requestDetails.table.model'),
      width: proportional(1.5, { minWidth: 140 }),
      renderCell: (row) => <Text wordBreak="break-all">{row.model || NO_VALUE}</Text>,
    },
    {
      key: 'account_id',
      header: t('admin.ops.requestDetails.table.account'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => <Text wordBreak="break-all">{accountLabel(row.account_id)}</Text>,
    },
    {
      key: 'latency',
      header: t(showsFirstToken ? 'admin.ops.ttftLabel' : 'admin.ops.requestDetails.table.duration'),
      width: pixel(110),
      align: 'end',
      renderCell: (row) => {
        const ms = showsFirstToken ? row.first_token_ms : row.duration_ms
        return <Text hasTabularNumbers>{typeof ms === 'number' ? `${ms} ms` : NO_VALUE}</Text>
      },
    },
    {
      key: 'status_code',
      header: t('admin.ops.requestDetails.table.status'),
      width: pixel(90),
      renderCell: (row) =>
        typeof row.status_code === 'number' ? (
          <Token size="sm" color={statusColor(row.status_code)} label={String(row.status_code)} />
        ) : (
          <Text>{NO_VALUE}</Text>
        ),
    },
    {
      key: 'request_id',
      header: t('admin.ops.requestDetails.table.requestId'),
      width: proportional(2, { minWidth: 200 }),
      renderCell: (row) =>
        row.request_id ? (
          <HStack gap={1} vAlign="center">
            <Text type="code" wordBreak="break-all">
              {row.request_id}
            </Text>
            <IconButton
              label={copyLabel}
              tooltip={copyLabel}
              variant="ghost"
              size="sm"
              icon={<Icon icon={ClipboardDocumentIcon} />}
              onClick={() => void copyToClipboard(row.request_id, t('admin.ops.requestDetails.requestIdCopied'))}
            />
          </HStack>
        ) : (
          <Text>{NO_VALUE}</Text>
        ),
    },
    {
      key: 'actions',
      header: t('admin.ops.requestDetails.table.actions'),
      width: pixel(110),
      renderCell: (row) => {
        const errorId = row.error_id
        return row.kind === 'error' && errorId ? (
          <Button
            label={t('admin.ops.requestDetails.viewError')}
            variant="ghost"
            size="sm"
            onClick={() => onOpenError(errorId)}
          />
        ) : (
          <Text>{NO_VALUE}</Text>
        )
      },
    },
  ]

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={reportOpen} width={1280} maxHeight="90dvh" purpose="info">
      <Layout
        header={<DialogHeader title={preset.title} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={3}>
              <HStack gap={3} hAlign="between" vAlign="center">
                <Text type="supporting" color="secondary">
                  {t('admin.ops.requestDetails.rangeLabel', { range: rangeText })}
                </Text>
                <Button
                  label={t('common.refresh')}
                  variant="secondary"
                  size="sm"
                  icon={<Icon icon={ArrowPathIcon} />}
                  isLoading={isLoading}
                  onClick={() => setReloads((count) => count + 1)}
                />
              </HStack>

              {failure != null && (
                <Banner
                  status="error"
                  title={t('admin.ops.requestDetails.failedToLoad')}
                  description={failure || undefined}
                />
              )}

              {rows.length === 0 ? (
                // A failed load leaves only its banner.
                (isLoading || failure == null) && (
                  <Center padding={10}>
                    {isLoading ? (
                      <Spinner />
                    ) : (
                      <EmptyState
                        isCompact
                        headingLevel={3}
                        title={t('admin.ops.requestDetails.empty')}
                        description={t('admin.ops.requestDetails.emptyHint')}
                      />
                    )}
                  </Center>
                )
              ) : (
                // No idKey: a request has no id of its own (a retry repeats the request id), so rows go by position.
                <Table<Row>
                  data={rows}
                  columns={columns}
                  density="compact"
                  dividers="rows"
                  hasHover
                  plugins={{ pagination }}
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
