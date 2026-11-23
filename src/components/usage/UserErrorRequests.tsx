import { useEffect, useState, type ComponentProps } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableSortable, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { EyeIcon } from '@heroicons/react/24/outline'
import { getMyErrorDetail } from '@/api/usage'
import type { UserErrorRequest, UserErrorRequestDetail } from '@/types'
import { mapErrorSortKey, numericRequestTypeKind } from '@/utils/errorBadges'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { ColumnChoice } from './ColumnPicker'
import { IpGeoCell } from './IpGeo'
import { RequestTypeToken } from './UsageLogCells'
import type { UsageLogSort } from './UsageLogTable'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<UserErrorRequest, keyof UserErrorRequest>

type Translate = (key: string) => string
type TokenColor = NonNullable<ComponentProps<typeof Token>['color']>

const NO_VALUE = '-'

// What went wrong and when cannot be hidden; neither can the way into the detail.
const ALWAYS_SHOWN = ['status', 'created_at', 'actions']

// The header that sorts by status is the "status" column; the server calls the order "status_code".
const columnOfSort = (sortBy: string) => (sortBy === 'status_code' ? 'status' : sortBy)

/** Server faults red, rate limiting purple, other refusals orange. */
function statusColor(code: number): TokenColor {
  if (code >= 500) return 'red'
  if (code === 429) return 'purple'
  if (code >= 400) return 'orange'
  return 'gray'
}

function StatusToken({ code }: { code: number }) {
  return <Token size="sm" color={statusColor(code)} label={code ? String(code) : NO_VALUE} />
}

/** One failed request in full: what the list shows of it, and the body the upstream answered with. */
function UserErrorDetailDialog({ errorId, onClose }: { errorId: number; onClose: () => void }) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<UserErrorRequestDetail | null>(null)
  const [hasFailed, setFailed] = useState(false)

  useEffect(() => {
    let isStale = false
    getMyErrorDetail(errorId)
      .then((answer) => {
        if (!isStale) setDetail(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[usage-errors] failed to load the detail', error)
        setFailed(true)
      })
    return () => {
      isStale = true
    }
  }, [errorId])

  const close = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  return (
    <Dialog isOpen onOpenChange={close} width={760} maxHeight="85dvh">
      <Layout
        header={<DialogHeader title={t('usage.errors.detail.title')} onOpenChange={close} />}
        content={
          <LayoutContent isScrollable>
            {hasFailed ? (
              <Banner status="error" title={t('usage.errors.detail.loadFailed')} />
            ) : !detail ? (
              <Center padding={8}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : (
              <VStack gap={4}>
                <MetadataList columns={2} label={{ position: 'top' }}>
                  <MetadataListItem label={t('usage.errors.time')}>{formatDateTime(detail.created_at)}</MetadataListItem>
                  <MetadataListItem label={t('usage.errors.model')}>{detail.model || NO_VALUE}</MetadataListItem>
                  <MetadataListItem label={t('usage.errors.endpoint')}>
                    {detail.inbound_endpoint || NO_VALUE}
                  </MetadataListItem>
                  <MetadataListItem label={t('usage.errors.status')}>
                    <StatusToken code={detail.status_code} />
                  </MetadataListItem>
                  <MetadataListItem label={t('usage.errors.category')}>
                    {t(`usage.errors.categories.${detail.category}`)}
                  </MetadataListItem>
                  <MetadataListItem label={t('usage.errors.platform')}>{detail.platform || NO_VALUE}</MetadataListItem>
                  {detail.upstream_status_code != null && (
                    <MetadataListItem label={t('usage.errors.detail.upstreamStatus')}>
                      {detail.upstream_status_code}
                    </MetadataListItem>
                  )}
                </MetadataList>
                {detail.message && (
                  <VStack gap={1}>
                    <Text type="label" color="secondary">
                      {t('usage.errors.message')}
                    </Text>
                    <Text wordBreak="break-all">{detail.message}</Text>
                  </VStack>
                )}
                {detail.error_body && (
                  <VStack gap={1}>
                    <Text type="label" color="secondary">
                      {t('usage.errors.detail.responseBody')}
                    </Text>
                    <CodeBlock code={detail.error_body} language="json" isWrapped maxHeight="40vh" width="100%" />
                  </VStack>
                )}
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  )
}

/** The columns of the failed-request list, in the order they show. Widths leave room for the English headers. */
function userErrorColumns(t: Translate, onOpen: (id: number) => void): TableColumn<Row>[] {
  return [
    {
      key: 'key_name',
      header: t('usage.errors.keyName'),
      width: proportional(1.2, { minWidth: 130 }),
      renderCell: (row) => (
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text type="supporting" color="primary" maxLines={1} hasTruncateTooltip>
            {row.key_name || NO_VALUE}
          </Text>
          {row.key_deleted && <Token size="sm" color="red" label={t('usage.errors.keyDeleted')} />}
        </HStack>
      ),
    },
    {
      key: 'model',
      header: t('usage.errors.model'),
      sortable: true,
      width: proportional(1.4, { minWidth: 150 }),
      renderCell: (row) =>
        row.model ? (
          <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
            {row.model}
          </Text>
        ) : (
          <Text type="supporting">{NO_VALUE}</Text>
        ),
    },
    {
      key: 'endpoint',
      header: t('usage.errors.endpoint'),
      width: proportional(1.4, { minWidth: 150 }),
      renderCell: (row) => (
        <Text type="supporting" wordBreak="break-all">
          {`${t('usage.inbound')}: ${row.inbound_endpoint?.trim() || NO_VALUE}`}
        </Text>
      ),
    },
    {
      key: 'client_ip',
      header: 'IP',
      // Wide enough for a looked-up place beside its two icons; an IPv6 address is shown whole, on two lines.
      // The share grows with the minimum: the largest minimum per share sets the width of every flexible column.
      width: proportional(1.6, { minWidth: 190 }),
      renderCell: (row) =>
        row.client_ip ? (
          <VStack gap={0.5}>
            <Text type="supporting" hasTabularNumbers wordBreak="break-all">
              {row.client_ip}
            </Text>
            <IpGeoCell ip={row.client_ip} />
          </VStack>
        ) : (
          <Text type="supporting">{NO_VALUE}</Text>
        ),
    },
    {
      key: 'group',
      header: t('admin.usage.group'),
      width: proportional(1, { minWidth: 110 }),
      renderCell: (row) =>
        row.group_name ? (
          <Token size="sm" color="purple" label={row.group_name} />
        ) : (
          <Text type="supporting">{NO_VALUE}</Text>
        ),
    },
    {
      key: 'type',
      header: t('usage.type'),
      width: pixel(104),
      renderCell: (row) => {
        const requestType = numericRequestTypeKind(row.request_type, row.stream)
        return requestType ? <RequestTypeToken requestType={requestType} /> : <Text type="supporting">{NO_VALUE}</Text>
      },
    },
    {
      key: 'platform',
      header: t('usage.errors.platform'),
      width: proportional(0.8, { minWidth: 100 }),
      renderCell: (row) => (
        <Text type="supporting" color="primary">
          {row.platform || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'category',
      header: t('usage.errors.category'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => (
        <Text type="supporting" color="primary">
          {t(`usage.errors.categories.${row.category}`)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('usage.errors.status'),
      sortable: true,
      width: pixel(104),
      renderCell: (row) => <StatusToken code={row.status_code} />,
    },
    {
      key: 'message',
      header: t('usage.errors.message'),
      width: proportional(2, { minWidth: 200 }),
      renderCell: (row) => (
        <Text type="supporting" maxLines={1} hasTruncateTooltip>
          {row.message || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'created_at',
      header: t('usage.errors.time'),
      sortable: true,
      width: pixel(172),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {formatDateTime(row.created_at)}
        </Text>
      ),
    },
    {
      key: 'user_agent',
      header: t('usage.userAgent'),
      width: proportional(1.6, { minWidth: 220 }),
      renderCell: (row) => (
        <Text type="supporting" maxLines={1} hasTruncateTooltip>
          {row.user_agent || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: pixel(112),
      align: 'end',
      renderCell: (row) => (
        <Button
          label={t('common.view')}
          variant="ghost"
          size="sm"
          icon={<Icon icon={EyeIcon} />}
          onClick={() => onOpen(row.id)}
        />
      ),
    },
  ]
}

/** The columns of the failed-request list that can be hidden, for its column picker. */
export function userErrorColumnChoices(t: Translate): ColumnChoice[] {
  return userErrorColumns(t, () => {})
    .filter((column) => !ALWAYS_SHOWN.includes(column.key))
    .map((column) => ({ key: column.key, label: String(column.header) }))
}

/**
 * The rows of a user's own failed requests; "view" opens one in full. Sorting is done by the server:
 * `sort.by` and what `onSortChange` gives are the server's names for the order, and `onSortChange(null)` says
 * the order was cleared.
 */
export function UserErrorRequests({
  rows,
  hiddenColumns,
  sort,
  onSortChange,
}: {
  rows: UserErrorRequest[]
  hiddenColumns: string[]
  sort: UsageLogSort
  onSortChange: (sort: UsageLogSort | null) => void
}) {
  const { t } = useI18n()
  const [detailId, setDetailId] = useState<number | null>(null)
  const data: Row[] = rows
  const columns = userErrorColumns(t, setDetailId).filter(
    (column) => ALWAYS_SHOWN.includes(column.key) || !hiddenColumns.includes(column.key),
  )
  const sortPlugin = useTableSortable<Row, string>({
    sort: [{ sortKey: columnOfSort(sort.by), direction: sort.order === 'asc' ? 'ascending' : 'descending' }],
    onSortChange: (next) => {
      const first = next[0]
      onSortChange(
        first
          ? { by: mapErrorSortKey(String(first.sortKey)), order: first.direction === 'ascending' ? 'asc' : 'desc' }
          : null,
      )
    },
  })

  return (
    <>
      <Table<Row>
        data={data}
        columns={columns}
        idKey={(row) => row.id}
        density="compact"
        dividers="rows"
        hasHover
        plugins={{ sort: sortPlugin }}
      />
      {detailId != null && <UserErrorDetailDialog key={detailId} errorId={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}
