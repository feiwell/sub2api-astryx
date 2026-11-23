import { useMemo, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTableRowExpansion, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import type { UserBreakdownItem } from '@/types'
import { useI18n } from '~/i18n'
import { formatCost, formatNumber, formatTokens, toFiniteNumber } from '~/pages/admin/dashboard/format'

type Metric = 'tokens' | 'actual_cost'
type Translate = (key: string, params?: Record<string, unknown>) => string

// Past this many rows the list scrolls inside its card, so the four cards of the page stay comparable in height.
const MAX_ROWS_BEFORE_SCROLL = 8
const SCROLL_HEIGHT = 420

/** One row of a distribution: a model, a group or an endpoint, with what it used. */
export interface DistributionItem {
  key: string
  name: string
  requests: number
  total_tokens: number
  actual_cost: number
  cost: number
  /** What the upstream accounts were charged. Left out by a distribution that does not know it. */
  account_cost?: number
  /** False for a row whose users cannot be asked for. */
  canOpen?: boolean
}

interface UsageRow extends Record<string, unknown> {
  key: string
  name: string
  requests: number
  total_tokens: number
  actual_cost: number
  cost: number
  account_cost: number
}

interface DistributionRow extends UsageRow {
  /** Share of the chosen metric over all rows, 0-100. */
  share: number
  canOpen: boolean
}

/** A choice between ways of counting the same usage, shown beside the title. */
export interface SourceToggle<S extends string> {
  label: string
  options: { value: S; label: string }[]
  value: S
  onChange: (value: S) => void
}

const money = (value: number) => `$${formatCost(value)}`

function Figure({ children }: { children: string }) {
  return (
    <Text type="supporting" color="primary" hasTabularNumbers textWrap="nowrap">
      {children}
    </Text>
  )
}

/** Requests, tokens and costs: the same columns for the rows of a distribution and for the users behind one. */
function figureColumns<Row extends UsageRow>(t: Translate, hasAccountCost: boolean): TableColumn<Row>[] {
  const columns: TableColumn<Row>[] = [
    {
      key: 'requests',
      header: t('admin.dashboard.requests'),
      width: proportional(1, { minWidth: 64 }),
      align: 'end',
      renderCell: (row) => <Figure>{formatNumber(row.requests)}</Figure>,
    },
    {
      key: 'total_tokens',
      header: t('admin.dashboard.tokens'),
      width: proportional(1, { minWidth: 64 }),
      align: 'end',
      renderCell: (row) => <Figure>{formatTokens(row.total_tokens)}</Figure>,
    },
    {
      key: 'actual_cost',
      header: `${t('admin.dashboard.actual')} / ${t('admin.dashboard.standard')}`,
      width: proportional(1.4, { minWidth: 90 }),
      align: 'end',
      renderCell: (row) => (
        <VStack gap={0} hAlign="end">
          <Figure>{money(row.actual_cost)}</Figure>
          <Text type="supporting" hasTabularNumbers textWrap="nowrap">
            {money(row.cost)}
          </Text>
        </VStack>
      ),
    },
  ]
  if (hasAccountCost) {
    columns.push({
      key: 'account_cost',
      header: t('admin.dashboard.accountCost'),
      width: proportional(1, { minWidth: 64 }),
      align: 'end',
      renderCell: (row) => <Figure>{money(row.account_cost)}</Figure>,
    })
  }
  return columns
}

type UsersState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; users: UserBreakdownItem[] }

function UsersBehindRow({ state }: { state: UsersState }) {
  const { t } = useI18n()
  if (state.status === 'loading') {
    return (
      <Center padding={3}>
        <Spinner size="sm" label={t('common.loading')} />
      </Center>
    )
  }
  if (state.status === 'failed' || state.users.length === 0) {
    return (
      <Center padding={3}>
        <Text type="supporting">
          {state.status === 'failed' ? t('admin.dashboard.failedToLoad') : t('admin.dashboard.noDataAvailable')}
        </Text>
      </Center>
    )
  }
  const rows: UsageRow[] = state.users.map((user) => ({
    key: String(user.user_id),
    name: user.email || t('admin.redeem.userPrefix', { id: user.user_id }),
    requests: user.requests,
    total_tokens: user.total_tokens,
    actual_cost: user.actual_cost,
    cost: user.cost,
    account_cost: toFiniteNumber(user.account_cost),
  }))
  const columns: TableColumn<UsageRow>[] = [
    {
      key: 'name',
      header: t('admin.dashboard.spendingRankingUser'),
      width: proportional(2.4, { minWidth: 150 }),
      renderCell: (row) => (
        <Text type="supporting" color="primary" maxLines={1} hasTruncateTooltip>
          {row.name}
        </Text>
      ),
    },
    // A user is always known with what the accounts were charged for them.
    ...figureColumns<UsageRow>(t, true),
  ]
  return <Table data={rows} columns={columns} idKey="key" density="compact" />
}

function DistributionTable({
  title,
  dimensionLabel,
  rows,
  hasAccountCost,
  loadUsers,
}: {
  title: string
  dimensionLabel: string
  rows: DistributionRow[]
  hasAccountCost: boolean
  loadUsers: (key: string) => Promise<UserBreakdownItem[]>
}) {
  const { t } = useI18n()
  const [opened, setOpened] = useState<string | null>(null)
  const [usersState, setUsersState] = useState<UsersState>({ status: 'loading' })
  const requestSeq = useRef(0)

  // One row open at a time; its users are asked for again every time it opens.
  const toggle = (key: string) => {
    const seq = ++requestSeq.current
    if (opened === key) {
      setOpened(null)
      return
    }
    setOpened(key)
    setUsersState({ status: 'loading' })
    loadUsers(key)
      .then((users) => {
        if (seq === requestSeq.current) setUsersState({ status: 'ready', users })
      })
      .catch((error) => {
        if (seq !== requestSeq.current) return
        console.error('[admin-usage] failed to load the users behind a row', error)
        setUsersState({ status: 'failed' })
      })
  }

  const expandedKeys = useMemo(() => new Set(opened === null ? [] : [opened]), [opened])
  const expansion = useTableRowExpansion<DistributionRow>({
    expandedKeys,
    onToggle: toggle,
    getRowKey: (row) => row.key,
    getRowLabel: (row) => row.name,
    getIsItemExpandable: (row) => row.canOpen,
    renderExpanded: () => <UsersBehindRow state={usersState} />,
    hasRowClickExpansion: true,
  })

  const columns: TableColumn<DistributionRow>[] = [
    {
      key: 'name',
      header: dimensionLabel,
      width: proportional(2.4, { minWidth: 150 }),
      renderCell: (row) => (
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <Text type="supporting" color="primary" weight="medium" maxLines={1} hasTruncateTooltip>
                {row.name}
              </Text>
            </StackItem>
            <Text type="supporting" hasTabularNumbers textWrap="nowrap">
              {`${row.share.toFixed(1)}%`}
            </Text>
          </HStack>
          <ProgressBar label={row.name} isLabelHidden value={row.share} />
        </VStack>
      ),
    },
    ...figureColumns<DistributionRow>(t, hasAccountCost),
  ]

  const table = <Table data={rows} columns={columns} idKey="key" density="compact" hasHover plugins={{ expansion }} />
  if (rows.length <= MAX_ROWS_BEFORE_SCROLL) return table
  return (
    <ScrollableArea label={title} height={SCROLL_HEIGHT}>
      {table}
    </ScrollableArea>
  )
}

/**
 * Where the usage went, one row per model, group or endpoint, ranked by tokens or by what was charged. A row
 * opens the users behind it. Port of the Model/Group/EndpointDistributionChart cards of the admin usage page.
 */
export function AdminDistributionCard<S extends string = never>({
  title,
  dimensionLabel,
  items,
  isLoading,
  sourceToggle,
  scope,
  loadUsers,
}: {
  title: string
  /** Header of the first column (model, group, endpoint). */
  dimensionLabel: string
  items: DistributionItem[]
  isLoading: boolean
  sourceToggle?: SourceToggle<S>
  /** What the rows were counted under. An open list of users closes when it changes: it was asked for under the old one. */
  scope: string
  loadUsers: (key: string) => Promise<UserBreakdownItem[]>
}) {
  const { t } = useI18n()
  const [metric, setMetric] = useState<Metric>('tokens')

  const rows = useMemo<DistributionRow[]>(() => {
    const measure = (item: DistributionItem) =>
      toFiniteNumber(metric === 'tokens' ? item.total_tokens : item.actual_cost)
    const total = items.reduce((sum, item) => sum + measure(item), 0)
    return [...items]
      .sort((a, b) => measure(b) - measure(a))
      .map((item) => ({
        key: item.key,
        name: item.name,
        requests: item.requests,
        total_tokens: item.total_tokens,
        actual_cost: item.actual_cost,
        cost: item.cost,
        account_cost: toFiniteNumber(item.account_cost),
        share: total > 0 ? (measure(item) / total) * 100 : 0,
        canOpen: item.canOpen ?? true,
      }))
  }, [items, metric])

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={4}>{title}</Heading>
          <HStack gap={2} vAlign="center" wrap="wrap">
            {sourceToggle && (
              <SegmentedControl
                label={sourceToggle.label}
                size="sm"
                value={sourceToggle.value}
                onChange={(next) => {
                  const picked = sourceToggle.options.find((option) => option.value === next)
                  if (picked) sourceToggle.onChange(picked.value)
                }}>
                {sourceToggle.options.map((option) => (
                  <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
                ))}
              </SegmentedControl>
            )}
            <SegmentedControl
              label={title}
              size="sm"
              value={metric}
              onChange={(next) => setMetric(next === 'actual_cost' ? 'actual_cost' : 'tokens')}>
              <SegmentedControlItem value="tokens" label={t('admin.dashboard.metricTokens')} />
              <SegmentedControlItem value="actual_cost" label={t('admin.dashboard.metricActualCost')} />
            </SegmentedControl>
          </HStack>
        </HStack>
        {rows.length === 0 ? (
          isLoading ? (
            <Center padding={6}>
              <Spinner label={t('common.loading')} />
            </Center>
          ) : (
            <EmptyState isCompact headingLevel={5} title={t('admin.dashboard.noDataAvailable')} />
          )
        ) : (
          <DistributionTable
            key={scope}
            title={title}
            dimensionLabel={dimensionLabel}
            rows={rows}
            hasAccountCost={items.some((item) => item.account_cost != null)}
            loadUsers={loadUsers}
          />
        )}
      </VStack>
    </Card>
  )
}
