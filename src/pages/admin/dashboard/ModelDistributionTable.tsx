import { useMemo, useRef, useState } from 'react'
import { Center } from '@astryxdesign/core/Center'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, useTableRowExpansion, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import type { DateRange } from '@astryxdesign/core/Calendar'
import type { ModelStat, UserBreakdownItem } from '@/types'
import { getUserBreakdown } from '~/lib/api/admin/dashboard'
import { useI18n } from '~/i18n'
import { formatCost, formatNumber, formatTokens, toFiniteNumber } from './format'

// Past this many models the list scrolls inside the card instead of pushing the rest of the page down.
const MAX_ROWS_BEFORE_SCROLL = 10
const SCROLL_HEIGHT = 560

interface UsageRow extends Record<string, unknown> {
  key: string
  name: string
  requests: number
  total_tokens: number
  actual_cost: number
  account_cost: number
  cost: number
}

interface ModelRow extends UsageRow {
  /** Share of all tokens in the range, 0-100. */
  share: number
}

type UsageFigure = 'requests' | 'total_tokens' | 'actual_cost' | 'account_cost' | 'cost'

const money = (value: number) => `$${formatCost(value)}`

/** Requests, tokens and the three cost figures: shared by the model rows and their per-user breakdown. */
function useUsageColumns<Row extends UsageRow>(): TableColumn<Row>[] {
  const { t } = useI18n()
  const figure = (key: UsageFigure, header: string, format: (value: number) => string): TableColumn<Row> => ({
    key,
    header,
    width: proportional(1, { minWidth: 76 }),
    align: 'end',
    renderCell: (row) => (
      <Text hasTabularNumbers textWrap="nowrap">
        {format(row[key])}
      </Text>
    ),
  })
  return [
    figure('requests', t('admin.dashboard.requests'), formatNumber),
    figure('total_tokens', t('admin.dashboard.tokens'), formatTokens),
    figure('actual_cost', t('admin.dashboard.actual'), money),
    figure('account_cost', t('admin.dashboard.accountCost'), money),
    figure('cost', t('admin.dashboard.standard'), money),
  ]
}

function UserBreakdown({ users, loading }: { users: UserBreakdownItem[]; loading: boolean }) {
  const { t } = useI18n()
  const figures = useUsageColumns<UsageRow>()
  if (loading) {
    return (
      <Center padding={3}>
        <Spinner size="sm" />
      </Center>
    )
  }
  if (users.length === 0) {
    return (
      <Center padding={3}>
        <Text type="supporting" color="secondary">
          {t('admin.dashboard.noDataAvailable')}
        </Text>
      </Center>
    )
  }
  const rows: UsageRow[] = users.map((user) => ({
    key: String(user.user_id),
    name: user.email || t('admin.redeem.userPrefix', { id: user.user_id }),
    requests: user.requests,
    total_tokens: user.total_tokens,
    actual_cost: user.actual_cost,
    account_cost: user.account_cost,
    cost: user.cost,
  }))
  const columns: TableColumn<UsageRow>[] = [
    {
      key: 'name',
      header: t('admin.dashboard.spendingRankingUser'),
      width: proportional(3, { minWidth: 180 }),
      renderCell: (row) => <Text maxLines={1}>{row.name}</Text>,
    },
    ...figures,
  ]
  return <Table data={rows} columns={columns} idKey="key" density="compact" />
}

/**
 * Token share per model for the selected range (port of ModelDistributionChart's
 * model view). A row opens the users behind that model.
 */
export function ModelDistributionTable({ models, range }: { models: ModelStat[]; range: DateRange }) {
  const { t } = useI18n()
  const figures = useUsageColumns<ModelRow>()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [users, setUsers] = useState<UserBreakdownItem[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const requestSeq = useRef(0)

  const rows = useMemo<ModelRow[]>(() => {
    const total = models.reduce((sum, model) => sum + toFiniteNumber(model.total_tokens), 0)
    return [...models]
      .sort((a, b) => toFiniteNumber(b.total_tokens) - toFiniteNumber(a.total_tokens))
      .map((model) => ({
        key: model.model,
        name: model.model,
        requests: model.requests,
        total_tokens: model.total_tokens,
        actual_cost: model.actual_cost,
        account_cost: toFiniteNumber(model.account_cost),
        cost: model.cost,
        share: total > 0 ? (toFiniteNumber(model.total_tokens) / total) * 100 : 0,
      }))
  }, [models])

  // One model open at a time; its users are fetched again on every expansion.
  const toggle = (model: string) => {
    const seq = ++requestSeq.current
    if (expanded === model) {
      setExpanded(null)
      return
    }
    setExpanded(model)
    setUsers([])
    setUsersLoading(true)
    getUserBreakdown({ start_date: range.start, end_date: range.end, model, model_source: 'requested' })
      .then((res) => {
        if (seq === requestSeq.current) setUsers(res.users || [])
      })
      .catch(() => {
        if (seq === requestSeq.current) setUsers([])
      })
      .finally(() => {
        if (seq === requestSeq.current) setUsersLoading(false)
      })
  }

  const expandedKeys = useMemo(() => new Set(expanded === null ? [] : [expanded]), [expanded])
  const expansion = useTableRowExpansion<ModelRow>({
    expandedKeys,
    onToggle: toggle,
    getRowKey: (row) => row.key,
    getRowLabel: (row) => row.name,
    renderExpanded: () => <UserBreakdown users={users} loading={usersLoading} />,
    hasRowClickExpansion: true,
  })

  const columns: TableColumn<ModelRow>[] = [
    {
      key: 'name',
      header: t('admin.dashboard.model'),
      width: proportional(3, { minWidth: 200 }),
      renderCell: (row) => (
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <Text maxLines={1}>{row.name}</Text>
            </StackItem>
            <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
              {row.share.toFixed(1)}%
            </Text>
          </HStack>
          <ProgressBar label={row.name} isLabelHidden value={row.share} />
        </VStack>
      ),
    },
    ...figures,
  ]

  const table = <Table data={rows} columns={columns} idKey="key" density="compact" hasHover plugins={{ expansion }} />
  if (rows.length <= MAX_ROWS_BEFORE_SCROLL) return table
  return (
    <ScrollableArea label={t('admin.dashboard.modelDistribution')} height={SCROLL_HEIGHT}>
      {table}
    </ScrollableArea>
  )
}
