import { HoverCard } from '@astryxdesign/core/HoverCard'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableSortable, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import type { AdminUsageLog } from '@/types'
import { formatReasoningEffort, reasoningEffortValuesEqual } from '@/utils/format'
import { formatMultiplier } from '@/utils/formatters'
import type { ColumnChoice } from '~/components/usage/ColumnPicker'
import { CostCell } from '~/components/usage/UsageLogCells'
import { usageLogColumns } from '~/components/usage/UsageLogTable'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import type { UsageSort } from '~/pages/user/usage/usageQuery'
import { accountBilled, modelAudit, modelSteps, sentUpstreamModel } from './adminUsageFormat'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<AdminUsageLog, keyof AdminUsageLog>

type Translate = (key: string) => string

const NO_VALUE = '-'

// The order the columns show in: the Vue page's.
const COLUMN_ORDER = [
  'user',
  'api_key',
  'account',
  'model',
  'reasoning_effort',
  'endpoint',
  'group',
  'stream',
  'billing_mode',
  'tokens',
  'cost',
  'latency',
  'created_at',
  'request_id',
  'upstream_request_id',
  'user_agent',
  'ip_address',
]

// Who made the request and when: the two columns that cannot be hidden.
const ALWAYS_SHOWN = ['user', 'created_at']

// A step further down a mapping chain sits further in; spaces that would not collapse do the indenting.
const mappedTo = (step: string, depth: number) => `${'\u00a0\u00a0'.repeat(depth - 1)}↳ ${step}`

function UserCell({ row, onUserClick }: { row: Row; onUserClick: (userId: number) => void }) {
  const { t } = useI18n()
  return (
    <VStack gap={0.5}>
      {row.user?.email ? (
        <Link type="supporting" tooltip={t('admin.usage.clickToViewBalance')} onClick={() => onUserClick(row.user_id)}>
          {row.user.email}
        </Link>
      ) : (
        <Text type="supporting">{NO_VALUE}</Text>
      )}
      <HStack gap={1} vAlign="center">
        <Text type="supporting" hasTabularNumbers>{`#${row.user_id}`}</Text>
        {row.user?.deleted_at && <Token size="sm" color="red" label={t('admin.usage.userDeletedBadge')} />}
      </HStack>
    </VStack>
  )
}

/** The model asked for, what it was mapped to on the way upstream, and an upstream that answered as another. */
function ModelCell({ row }: { row: Row }) {
  const { t } = useI18n()
  const [asked, ...mapped] = modelSteps(row)
  const audit = modelAudit(row)
  const auditLines = [
    { label: t('usage.requestedModel'), value: row.model || NO_VALUE },
    { label: t('usage.sentUpstreamModel'), value: sentUpstreamModel(row) || NO_VALUE },
    { label: t('usage.upstreamResponseModel'), value: row.upstream_response_model || NO_VALUE },
  ]
  return (
    <VStack gap={0.5}>
      <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
        {asked}
      </Text>
      {mapped.map((step, index) => (
        <Text key={index} type="supporting" wordBreak="break-all">
          {mappedTo(step, index + 1)}
        </Text>
      ))}
      {audit && (
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Text type="supporting" wordBreak="break-all">
            <HoverCard
              label={t('usage.upstreamModelMismatch')}
              content={
                <VStack gap={1.5} hAlign="stretch">
                  {auditLines.map((line) => (
                    <HStack key={line.label} gap={4} hAlign="between" vAlign="center">
                      <Text type="supporting">{line.label}</Text>
                      <Text type="supporting" color="primary" weight="medium">
                        {line.value}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              }>
              {`↳ ${t('usage.upstreamResponseModel')}: ${row.upstream_response_model}`}
            </HoverCard>
          </Text>
          {audit === 'variant' ? (
            <Token size="sm" color="yellow" label={t('usage.modelVariant')} />
          ) : (
            <Token size="sm" color="orange" label={t('usage.modelMismatch')} />
          )}
        </HStack>
      )}
    </VStack>
  )
}

/** The reasoning effort asked for, and the one sent upstream when the two differ. */
function ReasoningEffortCell({ row }: { row: Row }) {
  const asked = row.reasoning_effort?.trim() || ''
  const sent = row.upstream_reasoning_effort?.trim() || ''
  const isMapped = asked !== '' && sent !== '' && !reasoningEffortValuesEqual(asked, sent)
  return (
    <VStack gap={0.5}>
      <Text type="supporting" color="primary">
        {formatReasoningEffort(row.reasoning_effort)}
      </Text>
      {isMapped && <Text type="supporting">{mappedTo(formatReasoningEffort(row.upstream_reasoning_effort), 1)}</Text>}
    </VStack>
  )
}

/** An id that is too long to read and is there to be copied: its start, and a button that copies all of it. */
function CopyableId({ value, copiedMessage }: { value: string | null | undefined; copiedMessage: string }) {
  const { t } = useI18n()
  if (!value) return <Text type="supporting">{NO_VALUE}</Text>
  return (
    <HStack gap={1} vAlign="center">
      <StackItem size="fill">
        <Text type="supporting" maxLines={1} hasTruncateTooltip>
          {value}
        </Text>
      </StackItem>
      <IconButton
        variant="ghost"
        size="sm"
        label={t('keys.copyToClipboard')}
        tooltip={t('keys.copyToClipboard')}
        icon={<Icon icon={ClipboardDocumentIcon} />}
        onClick={() => void copyToClipboard(value, copiedMessage)}
      />
    </HStack>
  )
}

/** What the user was charged, and under it what the upstream account was, where the account has a rate. */
function AdminCostCell({ row }: { row: Row }) {
  const { t } = useI18n()
  const billed = accountBilled(row)
  return (
    <CostCell
      row={row}
      extraDetails={[
        { label: t('usage.accountMultiplier'), value: `${formatMultiplier(row.account_rate_multiplier ?? 1)}x` },
        { label: t('usage.accountBilled'), value: `$${billed.toFixed(8)}` },
      ]}
      footnote={
        row.account_rate_multiplier != null && (
          <Text type="supporting" hasTabularNumbers textWrap="nowrap">
            <Tooltip content={t('usage.accountBilled')}>{`A $${billed.toFixed(6)}`}</Tooltip>
          </Text>
        )
      }
    />
  )
}

/** The columns only the admin list has, or shows differently from a user's own list. */
function adminColumns(t: Translate, onUserClick: (userId: number) => void): TableColumn<Row>[] {
  return [
    {
      key: 'user',
      header: t('admin.usage.user'),
      width: proportional(1.6, { minWidth: 190 }),
      renderCell: (row) => <UserCell row={row} onUserClick={onUserClick} />,
    },
    {
      key: 'account',
      header: t('admin.usage.account'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => (
        <Text type="supporting" color="primary" maxLines={1} hasTruncateTooltip>
          {row.account?.name || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'model',
      header: t('usage.model'),
      sortable: true,
      width: proportional(1.6, { minWidth: 180 }),
      renderCell: (row) => <ModelCell row={row} />,
    },
    {
      key: 'reasoning_effort',
      header: t('usage.reasoningEffort'),
      width: pixel(148),
      renderCell: (row) => <ReasoningEffortCell row={row} />,
    },
    {
      key: 'endpoint',
      header: t('usage.endpoint'),
      width: proportional(1.6, { minWidth: 180 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" wordBreak="break-all">
            {`${t('usage.inbound')}: ${row.inbound_endpoint?.trim() || NO_VALUE}`}
          </Text>
          <Text type="supporting" wordBreak="break-all">
            {`${t('usage.upstream')}: ${row.upstream_endpoint?.trim() || NO_VALUE}`}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'cost',
      header: t('usage.cost'),
      width: pixel(140),
      renderCell: (row) => <AdminCostCell row={row} />,
    },
    {
      key: 'request_id',
      header: t('admin.usage.requestId'),
      width: pixel(190),
      renderCell: (row) => <CopyableId value={row.request_id} copiedMessage={t('admin.usage.requestIdCopied')} />,
    },
    {
      key: 'upstream_request_id',
      header: t('admin.usage.upstreamRequestId'),
      width: pixel(190),
      renderCell: (row) => (
        <CopyableId value={row.upstream_request_id} copiedMessage={t('admin.usage.upstreamRequestIdCopied')} />
      ),
    },
  ]
}

/** Every column of the admin usage list, in the order they show: a user's columns with the admin's among them. */
function adminUsageColumns(t: Translate, onUserClick: (userId: number) => void): TableColumn<Row>[] {
  const byKey = new Map<string, TableColumn<Row>>()
  for (const column of usageLogColumns<Row>(t)) byKey.set(column.key, column)
  for (const column of adminColumns(t, onUserClick)) byKey.set(column.key, column)
  const ipAddress = byKey.get('ip_address')
  if (ipAddress) byKey.set('ip_address', { ...ipAddress, header: t('admin.usage.ipAddress') })
  return COLUMN_ORDER.flatMap((key) => byKey.get(key) ?? [])
}

/** The columns of the admin usage list that can be hidden, for its column picker. */
export function adminUsageColumnChoices(t: Translate): ColumnChoice[] {
  return adminUsageColumns(t, () => {})
    .filter((column) => !ALWAYS_SHOWN.includes(column.key))
    .map((column) => ({ key: column.key, label: String(column.header) }))
}

/**
 * The rows of the admin usage list. Sorting is done by the server: a click on a sortable header asks for the
 * list in that order, and `onSortChange(null)` says the order was cleared. A click on a user's email asks for
 * that user's balance history.
 */
export function AdminUsageTable({
  rows,
  hiddenColumns,
  sort,
  onSortChange,
  onUserClick,
}: {
  rows: AdminUsageLog[]
  hiddenColumns: string[]
  sort: UsageSort
  onSortChange: (sort: UsageSort | null) => void
  onUserClick: (userId: number) => void
}) {
  const { t } = useI18n()
  const data: Row[] = rows
  const columns = adminUsageColumns(t, onUserClick).filter(
    (column) => ALWAYS_SHOWN.includes(column.key) || !hiddenColumns.includes(column.key),
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
