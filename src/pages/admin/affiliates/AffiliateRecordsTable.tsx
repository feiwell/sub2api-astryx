import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Grid } from '@astryxdesign/core/Grid'
import { Center } from '@astryxdesign/core/Center'
import { Section } from '@astryxdesign/core/Section'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { TextInput } from '@astryxdesign/core/TextInput'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/utils'
import { Text } from '@astryxdesign/core/Text'
import { Code } from '@astryxdesign/core/Code'
import { Link } from '@astryxdesign/core/Link'
import { Badge } from '@astryxdesign/core/Badge'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import {
  Table,
  pixel,
  proportional,
  useTablePagination,
  useTableSortable,
  type TableColumn,
  type TableSortState,
} from '@astryxdesign/core/Table'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { adminAPI } from '~/lib/api/admin'
import type {
  AffiliateInviteRecord,
  AffiliateRebateRecord,
  AffiliateTransferRecord,
  AffiliateUserOverview,
  ListAffiliateRecordsParams,
} from '~/lib/api/admin/affiliates'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { formatDateTime as formatDisplayDateTime } from '@/utils/format'
import {
  getConfiguredTableDefaultPageSize,
  getConfiguredTablePageSizeOptions,
} from '@/utils/tablePreferences'
import { OrderStatus } from '~/components/payment/OrderStatus'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { AffiliateOfflineWithdrawDialog } from './AffiliateOfflineWithdrawDialog'

export type AffiliateRecordType = 'invites' | 'rebates' | 'transfers'

type AffiliateRecord = AffiliateInviteRecord | AffiliateRebateRecord | AffiliateTransferRecord

/**
 * One table row. The three record shapes are merged into a single optional-field
 * row so one Table can render any of them.
 */
type RecordRow = {
  __id: string
  inviter_id?: number
  inviter_email?: string
  inviter_username?: string
  invitee_id?: number | null
  invitee_email?: string
  invitee_username?: string
  user_id?: number
  user_email?: string
  username?: string
  aff_code?: string
  total_rebate?: number
  order_id?: number | null
  out_trade_no?: string
  order_amount?: number | null
  pay_amount?: number | null
  rebate_amount?: number
  payment_type?: string
  order_status?: string
  action?: string
  amount?: number
  balance_after?: number | null
  available_quota_after?: number | null
  frozen_quota_after?: number | null
  history_quota_after?: number | null
  created_at?: string
  [key: string]: unknown
}

function formatAmount(value: number | null | undefined): string {
  return Number(value || 0).toFixed(2)
}

function formatPercent(value: number | null | undefined): string {
  const rounded = Math.round(Number(value || 0) * 100) / 100
  return `${rounded.toString()}%`
}

function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function Dash() {
  return (
    <Text type="supporting" color="disabled">
      -
    </Text>
  )
}

function AmountText({ value, strong }: { value: number | null | undefined; strong?: boolean }) {
  return (
    <Text
      type="supporting"
      weight={strong ? 'semibold' : 'normal'}
      hasTabularNumbers
      style={strong ? { color: 'var(--color-text-success)' } : undefined}
    >
      {`$${formatAmount(value)}`}
    </Text>
  )
}

function NullableAmountText({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <Dash />
  return <AmountText value={value} />
}

function UserCell({
  id,
  email,
  username,
  isClickable,
  onOpen,
}: {
  id: number
  email?: string
  username?: string
  isClickable: boolean
  onOpen: (userId: number) => void
}) {
  return (
    <VStack gap={0.5} hAlign="start">
      <Code color="secondary" size="inherit">{`#${id}`}</Code>
      {isClickable ? (
        <Link onClick={() => onOpen(id)} size="sm" weight="medium">
          {email || '-'}
        </Link>
      ) : (
        <Text type="supporting" maxLines={1}>
          {email || '-'}
        </Text>
      )}
      <Text type="supporting" color="secondary" maxLines={1}>
        {username || '-'}
      </Text>
    </VStack>
  )
}

function OverviewStat({
  label,
  value,
  isMono,
}: {
  label: string
  value: string
  isMono?: boolean
}) {
  return (
    <Section padding={3} dividers={['top', 'bottom', 'start', 'end']}>
      <VStack gap={1} hAlign="start">
        <Text type="supporting" color="secondary">
          {label}
        </Text>
        {isMono ? <Code>{value}</Code> : <Text weight="semibold">{value}</Text>}
      </VStack>
    </Section>
  )
}

interface PersistedSort {
  sort_by: string
  sort_order: 'asc' | 'desc'
}

function sortableKeys(type: AffiliateRecordType): string[] {
  if (type === 'invites') {
    return ['inviter', 'invitee', 'aff_code', 'total_rebate', 'created_at']
  }
  if (type === 'rebates') {
    return [
      'order',
      'inviter',
      'invitee',
      'order_amount',
      'pay_amount',
      'payment_type',
      'order_status',
      'created_at',
    ]
  }
  return [
    'user',
    'action',
    'amount',
    'balance_after',
    'available_quota_after',
    'frozen_quota_after',
    'history_quota_after',
    'created_at',
  ]
}

function loadInitialSort(type: AffiliateRecordType): PersistedSort {
  const fallback: PersistedSort = { sort_by: 'created_at', sort_order: 'desc' }
  try {
    const raw = localStorage.getItem(`admin-affiliate-${type}-table-sort`)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { key?: string; order?: string }
    const key = typeof parsed.key === 'string' ? parsed.key : ''
    if (!sortableKeys(type).includes(key)) return fallback
    return { sort_by: key, sort_order: parsed.order === 'asc' ? 'asc' : 'desc' }
  } catch {
    return fallback
  }
}

/** Port of views/admin/affiliates/AdminAffiliateRecordsTable.vue. */
export function AffiliateRecordsTable({ type }: { type: AffiliateRecordType }) {
  const { t, te } = useI18n()

  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<AffiliateRecord[]>([])
  const [total, setTotal] = useState(0)

  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [startAt, setStartAt] = useState<ISODateString | undefined>(undefined)
  const [endAt, setEndAt] = useState<ISODateString | undefined>(undefined)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => getConfiguredTableDefaultPageSize())
  const [sortState, setSortState] = useState<PersistedSort>(() => loadInitialSort(type))
  const [refreshToken, setRefreshToken] = useState(0)

  const [overviewOpen, setOverviewOpen] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overview, setOverview] = useState<AffiliateUserOverview | null>(null)
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSeq = useRef(0)
  const overviewSeq = useRef(0)

  useEffect(() => {
    let cancelled = false
    const seq = ++loadSeq.current
    const params: ListAffiliateRecordsParams = {
      page,
      page_size: pageSize,
      search: appliedSearch.trim() || undefined,
      start_at: startAt || undefined,
      end_at: endAt || undefined,
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
      timezone: userTimezone(),
    }
    const fetchRecords = () => {
      if (type === 'invites') return adminAPI.affiliates.listInviteRecords(params)
      if (type === 'rebates') return adminAPI.affiliates.listRebateRecords(params)
      return adminAPI.affiliates.listTransferRecords(params)
    }
    setLoading(true)
    fetchRecords()
      .then((res) => {
        if (cancelled || seq !== loadSeq.current) return
        setRecords((res.items || []) as AffiliateRecord[])
        setTotal(res.total || 0)
      })
      .catch((error: unknown) => {
        if (cancelled || seq !== loadSeq.current) return
        toast.error(extractI18nErrorMessage(error, t, 'admin.affiliates.errors', t('common.error')))
      })
      .finally(() => {
        if (cancelled || seq !== loadSeq.current) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `t` is intentionally omitted: a locale switch must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, page, pageSize, appliedSearch, startAt, endAt, sortState, refreshToken])

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [])

  const handleSearchChange = useCallback((next: string) => {
    setSearch(next)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setAppliedSearch(next)
    }, 300)
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshToken((n) => n + 1)
  }, [])

  const openUserOverview = useCallback(
    async (userId: number) => {
      if (!userId) return
      const seq = ++overviewSeq.current
      setOverviewOpen(true)
      setOverviewLoading(true)
      setOverview(null)
      try {
        const data = await adminAPI.affiliates.getUserOverview(userId)
        if (seq !== overviewSeq.current) return
        setOverview(data)
      } catch (error) {
        if (seq !== overviewSeq.current) return
        setOverviewOpen(false)
        toast.error(extractI18nErrorMessage(error, t, 'admin.affiliates.errors', t('common.error')))
      } finally {
        if (seq === overviewSeq.current) setOverviewLoading(false)
      }
    },
    [t],
  )

  const rows = useMemo<RecordRow[]>(
    () =>
      records.map((record, index) => ({
        ...(record as unknown as Record<string, unknown>),
        __id: `${page}-${index}`,
      })),
    [records, page],
  )

  const isClickableUser = type !== 'transfers'

  const columns = useMemo<TableColumn<RecordRow>[]>(() => {
    const inviterColumn: TableColumn<RecordRow> = {
      key: 'inviter',
      header: t('admin.affiliates.records.inviter'),
      width: proportional(2, { minWidth: 180 }),
      sortable: true,
      renderCell: (row) => (
        <UserCell
          id={Number(row.inviter_id)}
          email={row.inviter_email}
          username={row.inviter_username}
          isClickable={isClickableUser}
          onOpen={(id) => void openUserOverview(id)}
        />
      ),
    }
    const inviteeColumn: TableColumn<RecordRow> = {
      key: 'invitee',
      header: t('admin.affiliates.records.invitee'),
      width: proportional(2, { minWidth: 180 }),
      sortable: true,
      renderCell: (row) =>
        row.invitee_id === null || row.invitee_id === undefined ? (
          <Dash />
        ) : (
          <UserCell
            id={Number(row.invitee_id)}
            email={row.invitee_email}
            username={row.invitee_username}
            isClickable={isClickableUser}
            onOpen={(id) => void openUserOverview(id)}
          />
        ),
    }
    const createdAtColumn = (labelKey: string): TableColumn<RecordRow> => ({
      key: 'created_at',
      header: t(labelKey),
      width: pixel(180),
      sortable: true,
      renderCell: (row) => (
        <Text type="supporting">{row.created_at ? formatDisplayDateTime(row.created_at) : '-'}</Text>
      ),
    })

    if (type === 'invites') {
      return [
        inviterColumn,
        inviteeColumn,
        {
          key: 'aff_code',
          header: t('admin.affiliates.records.affCode'),
          width: pixel(140),
          sortable: true,
          renderCell: (row) => <Code color="secondary">{row.aff_code || '-'}</Code>,
        },
        {
          key: 'total_rebate',
          header: t('admin.affiliates.records.totalRebate'),
          width: pixel(130),
          align: 'end',
          sortable: true,
          renderCell: (row) => <AmountText value={row.total_rebate} />,
        },
        createdAtColumn('admin.affiliates.records.invitedAt'),
      ]
    }

    if (type === 'rebates') {
      return [
        {
          key: 'order',
          header: t('admin.affiliates.records.order'),
          width: proportional(1.5, { minWidth: 160 }),
          sortable: true,
          renderCell: (row) =>
            row.order_id === null || row.order_id === undefined ? (
              <Dash />
            ) : (
              <VStack gap={0.5} hAlign="start">
                <Code>{`#${row.order_id}`}</Code>
                <Text type="supporting" color="secondary" maxLines={1}>
                  {row.out_trade_no || '-'}
                </Text>
              </VStack>
            ),
        },
        inviterColumn,
        inviteeColumn,
        {
          key: 'order_amount',
          header: t('admin.affiliates.records.orderAmount'),
          width: pixel(130),
          align: 'end',
          sortable: true,
          renderCell: (row) => <NullableAmountText value={row.order_amount} />,
        },
        {
          key: 'pay_amount',
          header: t('admin.affiliates.records.payAmount'),
          width: pixel(130),
          align: 'end',
          sortable: true,
          renderCell: (row) =>
            row.pay_amount === null || row.pay_amount === undefined ? (
              <Dash />
            ) : (
              <Text type="supporting" hasTabularNumbers>{`¥${formatAmount(row.pay_amount)}`}</Text>
            ),
        },
        {
          key: 'rebate_amount',
          header: t('admin.affiliates.records.rebateAmount'),
          width: pixel(130),
          align: 'end',
          renderCell: (row) => <AmountText value={row.rebate_amount} strong />,
        },
        {
          key: 'payment_type',
          header: t('admin.affiliates.records.paymentType'),
          width: pixel(140),
          sortable: true,
          renderCell: (row) => {
            if (!row.payment_type) return <Dash />
            const key = `payment.methods.${row.payment_type}`
            const label = te(key) ? t(key) : row.payment_type
            return <Text type="supporting">{label}</Text>
          },
        },
        {
          key: 'order_status',
          header: t('admin.affiliates.records.orderStatus'),
          width: pixel(160),
          sortable: true,
          renderCell: (row) => (row.order_status ? <OrderStatus status={row.order_status} /> : <Dash />),
        },
        createdAtColumn('admin.affiliates.records.rebatedAt'),
      ]
    }

    return [
      {
        key: 'user',
        header: t('admin.affiliates.records.user'),
        width: proportional(2, { minWidth: 180 }),
        sortable: true,
        renderCell: (row) => (
          <UserCell
            id={Number(row.user_id)}
            email={row.user_email}
            username={row.username}
            isClickable
            onOpen={(id) => void openUserOverview(id)}
          />
        ),
      },
      {
        key: 'action',
        header: t('admin.affiliates.records.outflowType'),
        width: pixel(150),
        sortable: true,
        renderCell: (row) => (
          <Badge
            variant={row.action === 'withdraw' ? 'warning' : 'info'}
            label={
              row.action === 'withdraw'
                ? t('admin.affiliates.outflowTypes.withdraw')
                : t('admin.affiliates.outflowTypes.transfer')
            }
          />
        ),
      },
      {
        key: 'amount',
        header: t('admin.affiliates.records.transferAmount'),
        width: pixel(130),
        align: 'end',
        sortable: true,
        renderCell: (row) => <AmountText value={row.amount} strong />,
      },
      {
        key: 'balance_after',
        header: t('admin.affiliates.records.balanceAfter'),
        width: pixel(130),
        align: 'end',
        sortable: true,
        renderCell: (row) => <NullableAmountText value={row.balance_after} />,
      },
      {
        key: 'available_quota_after',
        header: t('admin.affiliates.records.availableQuotaAfter'),
        width: pixel(140),
        align: 'end',
        sortable: true,
        renderCell: (row) => <NullableAmountText value={row.available_quota_after} />,
      },
      {
        key: 'frozen_quota_after',
        header: t('admin.affiliates.records.frozenQuotaAfter'),
        width: pixel(130),
        align: 'end',
        sortable: true,
        renderCell: (row) => <NullableAmountText value={row.frozen_quota_after} />,
      },
      {
        key: 'history_quota_after',
        header: t('admin.affiliates.records.historyQuotaAfter'),
        width: pixel(170),
        align: 'end',
        sortable: true,
        renderCell: (row) => <NullableAmountText value={row.history_quota_after} />,
      },
      createdAtColumn('admin.affiliates.records.transferredAt'),
    ]
  }, [isClickableUser, openUserOverview, t, te, type])

  const tableSort = useMemo<TableSortState>(
    () => [
      {
        sortKey: sortState.sort_by,
        direction: sortState.sort_order === 'asc' ? 'ascending' : 'descending',
      },
    ],
    [sortState],
  )

  const sortPlugin = useTableSortable<RecordRow>({
    sort: tableSort,
    onSortChange: (next) => {
      const entry = next[0]
      if (!entry) return
      const sort_by = String(entry.sortKey)
      const sort_order = entry.direction === 'ascending' ? 'asc' : 'desc'
      try {
        localStorage.setItem(
          `admin-affiliate-${type}-table-sort`,
          JSON.stringify({ key: sort_by, order: sort_order }),
        )
      } catch {
        // Sort order is a preference; a storage failure must not break sorting.
      }
      setPage(1)
      setSortState({ sort_by, sort_order })
    },
  })

  const paginationPlugin = useTablePagination<RecordRow>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    pageSizeOptions: getConfiguredTablePageSizeOptions(),
    onPageSizeChange: (size) => {
      setPageSize(size)
      setPage(1)
    },
    align: 'end',
    // Vue hides its Pagination entirely while there is nothing to page.
    position: total > 0 ? 'below' : 'none',
  })

  return (
    <VStack gap={4} hAlign="stretch">
      <HStack gap={3} vAlign="end" wrap="wrap">
        <VStack width={320}>
          <TextInput
            label={t('admin.affiliates.records.search')}
            isLabelHidden
            value={search}
            onChange={handleSearchChange}
            placeholder={t('admin.affiliates.records.searchPlaceholder')}
            startIcon="search"
            hasClear
          />
        </VStack>
        <VStack width={180}>
          <DateInput
            label={t('admin.affiliates.records.startAt')}
            isLabelHidden
            value={startAt}
            onChange={(value) => {
              setPage(1)
              setStartAt(value)
            }}
            placeholder={t('admin.affiliates.records.startAt')}
            hasClear
          />
        </VStack>
        <VStack width={180}>
          <DateInput
            label={t('admin.affiliates.records.endAt')}
            isLabelHidden
            value={endAt}
            onChange={(value) => {
              setPage(1)
              setEndAt(value)
            }}
            placeholder={t('admin.affiliates.records.endAt')}
            hasClear
          />
        </VStack>
        <IconButton
          label={t('common.refresh')}
          tooltip={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
          variant="secondary"
          // isLoading already blocks interaction; Vue spins the icon instead of dimming.
          isLoading={loading}
          onClick={handleRefresh}
        />
        {type === 'transfers' && (
          <StackItem size="fill">
            <HStack hAlign="end">
              <Button
                label={t('admin.affiliates.withdraw.button')}
                variant="primary"
                data-test="affiliate-withdraw-open"
                onClick={() => setWithdrawOpen(true)}
              />
            </HStack>
          </StackItem>
        )}
      </HStack>

      <Section padding={0}>
        <Table<RecordRow>
          /* Vue's DataTable replaces its rows with skeletons while loading. */
          data={loading ? [] : rows}
          columns={columns}
          idKey="__id"
          density="compact"
          hasHover
          rowIndexStart={(page - 1) * pageSize + 1}
          rowCount={total}
          plugins={{ sort: sortPlugin, pagination: paginationPlugin }}
          emptyState={
            loading ? (
              <Center padding={8}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : (
              <Center padding={8}>
                <EmptyState title={t('common.noData')} isCompact />
              </Center>
            )
          }
        />
      </Section>

      {type === 'transfers' && (
        <AffiliateOfflineWithdrawDialog
          isOpen={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          onSuccess={() => {
            setWithdrawOpen(false)
            setPage(1)
            handleRefresh()
          }}
        />
      )}

      <Dialog
        isOpen={overviewOpen}
        onOpenChange={(open) => !open && setOverviewOpen(false)}
        width={560}
      >
        <Layout
          height="auto"
          header={
            <DialogHeader
              title={t('admin.affiliates.overview.title')}
              onOpenChange={(open) => !open && setOverviewOpen(false)}
            />
          }
          content={
            <LayoutContent>
              {overviewLoading ? (
                <Center padding={8}>
                  <Spinner label={t('common.loading')} />
                </Center>
              ) : overview ? (
                <VStack gap={4} hAlign="stretch">
                  <Section variant="muted" padding={4}>
                    <VStack gap={0.5} hAlign="start">
                      <Code>{`#${overview.user_id}`}</Code>
                      <Text weight="medium">{overview.email || '-'}</Text>
                      <Text type="supporting" color="secondary">
                        {overview.username || '-'}
                      </Text>
                    </VStack>
                  </Section>
                  <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={3}>
                    <OverviewStat
                      label={t('admin.affiliates.overview.affCode')}
                      value={overview.aff_code || '-'}
                      isMono
                    />
                    <OverviewStat
                      label={t('admin.affiliates.overview.rebateRate')}
                      value={formatPercent(overview.rebate_rate_percent)}
                    />
                    <OverviewStat
                      label={t('admin.affiliates.overview.invitedCount')}
                      value={String(overview.invited_count)}
                    />
                    <OverviewStat
                      label={t('admin.affiliates.overview.rebatedInviteeCount')}
                      value={String(overview.rebated_invitee_count)}
                    />
                    <OverviewStat
                      label={t('admin.affiliates.overview.availableQuota')}
                      value={`$${formatAmount(overview.available_quota)}`}
                    />
                    <OverviewStat
                      label={t('admin.affiliates.overview.historyQuota')}
                      value={`$${formatAmount(overview.history_quota)}`}
                    />
                  </Grid>
                </VStack>
              ) : null}
            </LayoutContent>
          }
        />
      </Dialog>
    </VStack>
  )
}
