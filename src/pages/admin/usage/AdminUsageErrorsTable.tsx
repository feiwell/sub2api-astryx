import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableSortable, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { mapErrorSortKey } from '@/utils/errorBadges'
import { mapErrorCategory } from '@/utils/errorCategory'
import { formatDateTime } from '@/views/admin/ops/utils/opsFormatters'
import type { ColumnChoice } from '~/components/usage/ColumnPicker'
import { IpGeoCell } from '~/components/usage/IpGeo'
import { useI18n } from '~/i18n'
import type { OpsErrorLog } from '~/lib/api/admin/ops'
import { OpsErrorDetailDialog } from '~/pages/admin/ops/OpsErrorDetailDialog'
import {
  displayModel,
  errorTypeBadge,
  hasModelMapping,
  requestTypeName,
  severityVariant,
  statusColor,
  summarizeMessage,
} from '~/pages/admin/ops/errorLog'
import type { UsageSort } from '~/pages/user/usage/usageQuery'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<OpsErrorLog, keyof OpsErrorLog>

type Translate = (key: string) => string

const NO_VALUE = '-'

// Who failed, how and when cannot be hidden; neither can the way into the detail.
const ALWAYS_SHOWN = ['user', 'status', 'created_at', 'actions']

// The header that sorts by status is the "status" column; the server calls the order "status_code".
const columnOfSort = (sortBy: string) => (sortBy === 'status_code' ? 'status' : sortBy)

/**
 * The columns of the admin list of failed requests, in the order the Vue page shows them. The cells are those
 * of the error list of the ops page, with a user that opens their balance history and an address that can be
 * looked up.
 */
function adminErrorColumns(
  t: Translate,
  onUserClick: (userId: number) => void,
  onOpen: (errorId: number) => void,
): TableColumn<Row>[] {
  const detailsLabel = t('admin.ops.errorLog.details')
  const dash = <Text type="supporting">{NO_VALUE}</Text>

  return [
    {
      key: 'user',
      header: t('admin.ops.errorLog.user'),
      width: proportional(1.4, { minWidth: 170 }),
      renderCell: (row) => {
        const userId = row.user_id
        if (!userId) return dash
        return (
          <VStack gap={0.5}>
            {row.user_email ? (
              <Link type="supporting" tooltip={t('admin.usage.clickToViewBalance')} onClick={() => onUserClick(userId)}>
                {row.user_email}
              </Link>
            ) : (
              dash
            )}
            <Text type="supporting" hasTabularNumbers>{`#${userId}`}</Text>
          </VStack>
        )
      },
    },
    {
      key: 'api_key',
      header: t('admin.ops.errorLog.apiKey'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) =>
        row.api_key_id || row.api_key_name ? (
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Text type="supporting" color="primary" wordBreak="break-all">
              {row.api_key_name || `#${row.api_key_id}`}
            </Text>
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
        row.account_id ? (
          <Text type="supporting" color="primary" wordBreak="break-all">
            {row.account_name || `#${row.account_id}`}
          </Text>
        ) : (
          dash
        ),
    },
    {
      key: 'platform',
      header: t('admin.ops.errorLog.platform'),
      width: pixel(104),
      renderCell: (row) =>
        row.platform ? (
          <Text type="supporting" color="primary">
            {row.platform}
          </Text>
        ) : (
          dash
        ),
    },
    {
      key: 'model',
      header: t('admin.ops.errorLog.model'),
      sortable: true,
      width: proportional(1.2, { minWidth: 150 }),
      renderCell: (row) =>
        hasModelMapping(row) ? (
          <VStack gap={0.5}>
            <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
              {row.requested_model}
            </Text>
            <Text type="supporting" wordBreak="break-all">
              {`↳ ${row.upstream_model}`}
            </Text>
          </VStack>
        ) : displayModel(row) ? (
          <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
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
            {`${t('usage.inbound')}: ${row.inbound_endpoint?.trim() || NO_VALUE}`}
          </Text>
          {row.upstream_endpoint && (
            <Text type="supporting" wordBreak="break-all">
              {`${t('usage.upstream')}: ${row.upstream_endpoint.trim() || NO_VALUE}`}
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
        row.group_id ? <Token size="sm" color="purple" label={row.group_name || `#${row.group_id}`} /> : dash,
    },
    {
      key: 'type',
      header: t('admin.ops.errorLog.type'),
      width: pixel(112),
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
        <Text type="supporting" color="primary">
          {t(`usage.errors.categories.${mapErrorCategory(row.phase, row.type)}`)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('admin.ops.errorLog.status'),
      sortable: true,
      width: pixel(172),
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
      key: 'message',
      header: t('admin.ops.errorLog.message'),
      width: proportional(2.4, { minWidth: 260 }),
      renderCell: (row) => {
        const summary = row.message ? summarizeMessage(row.message, t) : ''
        return summary ? (
          <Text type="supporting" maxLines={2} hasTruncateTooltip>
            {summary}
          </Text>
        ) : (
          dash
        )
      },
    },
    {
      key: 'created_at',
      header: t('admin.ops.errorLog.time'),
      sortable: true,
      width: pixel(150),
      // The table has no row click, so the time opens the error.
      renderCell: (row) => (
        <Link
          type="supporting"
          tooltip={row.request_id || row.client_request_id || undefined}
          onClick={() => onOpen(row.id)}>
          {formatDateTime(row.created_at)}
        </Link>
      ),
    },
    {
      key: 'user_agent',
      header: t('usage.userAgent'),
      width: proportional(1.6, { minWidth: 220 }),
      renderCell: (row) =>
        row.user_agent ? (
          <Text type="supporting" maxLines={2} hasTruncateTooltip>
            {row.user_agent}
          </Text>
        ) : (
          dash
        ),
    },
    {
      key: 'client_ip',
      header: t('admin.ops.errorLog.ip'),
      // Wide enough for a looked-up place beside its two icons; an IPv6 address is shown whole, on two lines.
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
          dash
        ),
    },
    {
      key: 'actions',
      header: t('admin.ops.errorLog.action'),
      width: pixel(72),
      align: 'end',
      renderCell: (row) => (
        <IconButton
          label={detailsLabel}
          tooltip={detailsLabel}
          variant="ghost"
          size="sm"
          icon={<Icon icon={DocumentTextIcon} />}
          onClick={() => onOpen(row.id)}
        />
      ),
    },
  ]
}

const ignore = () => {}

/** The columns of the admin list of failed requests that can be hidden, for its column picker. */
export function adminErrorColumnChoices(t: Translate): ColumnChoice[] {
  return adminErrorColumns(t, ignore, ignore)
    .filter((column) => !ALWAYS_SHOWN.includes(column.key))
    .map((column) => ({ key: column.key, label: String(column.header) }))
}

/**
 * The rows of everyone's failed requests; the time and the button at the end of a row open it in full, and a
 * user's email asks for that user's balance history. Sorting is done by the server: `sort.by` and what
 * `onSortChange` gives are the server's names for the order, and `onSortChange(null)` says the order was cleared.
 */
export function AdminUsageErrorsTable({
  rows,
  hiddenColumns,
  sort,
  onSortChange,
  onUserClick,
}: {
  rows: OpsErrorLog[]
  hiddenColumns: string[]
  sort: UsageSort
  onSortChange: (sort: UsageSort | null) => void
  onUserClick: (userId: number) => void
}) {
  const { t } = useI18n()
  const [detailId, setDetailId] = useState<number | null>(null)
  const data: Row[] = rows
  const columns = adminErrorColumns(t, onUserClick, setDetailId).filter(
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
  const closeDetail = () => setDetailId(null)

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
      {detailId != null && (
        // The list stays where it was under the dialog: going back to it and closing are the same step here.
        <OpsErrorDetailDialog
          key={detailId}
          errorId={detailId}
          errorKind="request"
          onBack={closeDetail}
          onClose={closeDetail}
        />
      )}
    </>
  )
}
