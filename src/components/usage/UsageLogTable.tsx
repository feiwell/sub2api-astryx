import { VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableSortable, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { UsageLog } from '@/types'
import { formatDateTime, formatReasoningEffort } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { ColumnChoice } from './ColumnPicker'
import { IpGeoCell } from './IpGeo'
import { BillingModeCell, CostCell, LatencyCell, RequestTypeCell, TokensCell } from './UsageLogCells'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
export type UsageLogRow = Pick<UsageLog, keyof UsageLog>
type Row = UsageLogRow

type Translate = (key: string) => string

export interface UsageLogSort {
  by: string
  order: 'asc' | 'desc'
}

const NO_VALUE = '-'

// The column that tells the rows apart in time; it cannot be hidden.
const ALWAYS_SHOWN = 'created_at'

/**
 * The columns of a usage list, in the order they show. Widths leave room for the English headers. A list whose
 * rows carry more than a usage record builds its own columns around these.
 */
export function usageLogColumns<R extends UsageLogRow = UsageLogRow>(t: Translate): TableColumn<R>[] {
  return [
    {
      key: 'api_key',
      header: t('usage.apiKeyFilter'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => (
        <Text type="supporting" color="primary" maxLines={1} hasTruncateTooltip>
          {row.api_key?.name || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'model',
      header: t('usage.model'),
      sortable: true,
      width: proportional(1.4, { minWidth: 150 }),
      renderCell: (row) => (
        <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
          {row.model}
        </Text>
      ),
    },
    {
      key: 'reasoning_effort',
      header: t('usage.reasoningEffort'),
      width: pixel(148),
      renderCell: (row) => (
        <Text type="supporting" color="primary">
          {formatReasoningEffort(row.reasoning_effort)}
        </Text>
      ),
    },
    {
      key: 'endpoint',
      header: t('usage.endpoint'),
      width: proportional(1.4, { minWidth: 150 }),
      renderCell: (row) => (
        <Text type="supporting" wordBreak="break-all">
          {`${t('usage.inbound')}: ${row.inbound_endpoint?.trim() || NO_VALUE}`}
        </Text>
      ),
    },
    {
      key: 'ip_address',
      header: 'IP',
      // Wide enough for a looked-up place beside its two icons; an IPv6 address is shown whole, on two lines.
      // The share grows with the minimum: the largest minimum per share sets the width of every flexible column.
      width: proportional(1.6, { minWidth: 190 }),
      renderCell: (row) =>
        row.ip_address ? (
          <VStack gap={0.5}>
            <Text type="supporting" hasTabularNumbers wordBreak="break-all">
              {row.ip_address}
            </Text>
            <IpGeoCell ip={row.ip_address} />
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
        row.group ? (
          <Token size="sm" color="purple" label={row.group.name} />
        ) : (
          <Text type="supporting">{NO_VALUE}</Text>
        ),
    },
    {
      key: 'stream',
      header: t('usage.type'),
      width: pixel(112),
      renderCell: (row) => <RequestTypeCell row={row} />,
    },
    {
      key: 'billing_mode',
      header: t('admin.usage.billingMode'),
      width: pixel(124),
      renderCell: (row) => <BillingModeCell row={row} />,
    },
    {
      key: 'tokens',
      header: t('usage.tokens'),
      width: proportional(1.4, { minWidth: 170 }),
      renderCell: (row) => <TokensCell row={row} />,
    },
    {
      key: 'cost',
      header: t('usage.cost'),
      width: pixel(140),
      renderCell: (row) => <CostCell row={row} />,
    },
    {
      key: 'latency',
      header: t('usage.latency'),
      width: pixel(168),
      renderCell: (row) => <LatencyCell row={row} />,
    },
    {
      key: 'created_at',
      header: t('usage.time'),
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
  ]
}

/** The columns of a usage list that can be hidden, for its column picker. */
export function usageLogColumnChoices(t: Translate): ColumnChoice[] {
  return usageLogColumns(t)
    .filter((column) => column.key !== ALWAYS_SHOWN)
    .map((column) => ({ key: column.key, label: String(column.header) }))
}

/**
 * The rows of a usage list. Sorting is done by the server: a click on a sortable header asks for the list in
 * that order, and `onSortChange(null)` says the order was cleared.
 */
export function UsageLogTable({
  rows,
  hiddenColumns,
  sort,
  onSortChange,
}: {
  rows: UsageLog[]
  hiddenColumns: string[]
  sort: UsageLogSort
  onSortChange: (sort: UsageLogSort | null) => void
}) {
  const { t } = useI18n()
  const data: Row[] = rows
  const columns = usageLogColumns(t).filter(
    (column) => column.key === ALWAYS_SHOWN || !hiddenColumns.includes(column.key),
  )
  const sortPlugin = useTableSortable<Row, string>({
    sort: [{ sortKey: sort.by, direction: sort.order === 'asc' ? 'ascending' : 'descending' }],
    onSortChange: (next) => {
      const first = next[0]
      onSortChange(first ? { by: String(first.sortKey), order: first.direction === 'ascending' ? 'asc' : 'desc' } : null)
    },
  })

  return (
    <Table<Row>
      data={data}
      columns={columns}
      idKey={(row) => row.id}
      density="compact"
      dividers="rows"
      hasHover
      plugins={{ sort: sortPlugin }}
    />
  )
}
