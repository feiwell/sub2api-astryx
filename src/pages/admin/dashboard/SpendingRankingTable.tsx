import { useMemo } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import type { UserSpendingRankingItem } from '@/types'
import { useI18n } from '~/i18n'
import { formatCost, formatNumber, formatTokens, toFiniteNumber, userLabel } from './format'

export interface SpendingRanking {
  items: UserSpendingRankingItem[]
  totalActualCost: number
  totalRequests: number
  totalTokens: number
}

export const EMPTY_RANKING: SpendingRanking = { items: [], totalActualCost: 0, totalRequests: 0, totalTokens: 0 }

interface RankingRow extends Record<string, unknown> {
  key: string
  /** "#1"... for ranked users, "Σ" for the remainder row. */
  rank: string
  label: string
  /** The ranked user; null on the remainder row, which is not a link. */
  user: UserSpendingRankingItem | null
  requests: number
  tokens: number
  actual_cost: number
  /** Share of the range's total spend, 0-100. */
  share: number
}

/**
 * Top spenders for the selected range (port of ModelDistributionChart's ranking
 * view). Everyone outside the list is summed into one "others" row.
 */
export function SpendingRankingTable({
  ranking,
  onUserClick,
}: {
  ranking: SpendingRanking
  onUserClick: (user: UserSpendingRankingItem) => void
}) {
  const { t } = useI18n()

  const rows = useMemo<RankingRow[]>(() => {
    const { items } = ranking
    if (items.length === 0) return []
    const total = toFiniteNumber(ranking.totalActualCost)
    const share = (cost: number) => (total > 0 ? Math.min((toFiniteNumber(cost) / total) * 100, 100) : 0)
    const sum = (pick: (item: UserSpendingRankingItem) => number) =>
      items.reduce((acc, item) => acc + toFiniteNumber(pick(item)), 0)
    const out: RankingRow[] = items.map((item, index) => ({
      key: `${item.user_id}-${index}`,
      rank: `#${index + 1}`,
      label: userLabel(item, (id) => t('admin.redeem.userPrefix', { id })),
      user: item,
      requests: item.requests,
      tokens: item.tokens,
      actual_cost: item.actual_cost,
      share: share(item.actual_cost),
    }))
    const other = {
      actual_cost: Math.max(total - sum((item) => item.actual_cost), 0),
      requests: Math.max(toFiniteNumber(ranking.totalRequests) - sum((item) => item.requests), 0),
      tokens: Math.max(toFiniteNumber(ranking.totalTokens) - sum((item) => item.tokens), 0),
    }
    if (other.actual_cost > 0.000001 || other.requests > 0 || other.tokens > 0) {
      out.push({
        key: 'others',
        rank: 'Σ',
        label: t('admin.dashboard.spendingRankingOther'),
        user: null,
        ...other,
        share: share(other.actual_cost),
      })
    }
    return out
  }, [ranking, t])

  const figure = (
    key: 'requests' | 'tokens' | 'actual_cost',
    header: string,
    format: (value: number) => string,
  ): TableColumn<RankingRow> => ({
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

  const columns: TableColumn<RankingRow>[] = [
    {
      key: 'label',
      header: t('admin.dashboard.spendingRankingUser'),
      width: proportional(3, { minWidth: 220 }),
      renderCell: (row) => (
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
              {row.rank}
            </Text>
            <StackItem size="fill">
              {row.user ? (
                <Link maxLines={1} onClick={() => row.user && onUserClick(row.user)}>
                  {row.label}
                </Link>
              ) : (
                <Text maxLines={1}>{row.label}</Text>
              )}
            </StackItem>
            <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
              {row.share.toFixed(1)}%
            </Text>
          </HStack>
          <ProgressBar label={row.label} isLabelHidden value={row.share} />
        </VStack>
      ),
    },
    figure('requests', t('admin.dashboard.spendingRankingRequests'), formatNumber),
    figure('tokens', t('admin.dashboard.spendingRankingTokens'), formatTokens),
    figure('actual_cost', t('admin.dashboard.spendingRankingSpend'), (value) => `$${formatCost(value)}`),
  ]

  return <Table data={rows} columns={columns} idKey="key" density="compact" />
}
