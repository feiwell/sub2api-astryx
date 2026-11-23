import type { ComponentProps } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableSortable, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { InboxIcon } from '@heroicons/react/24/outline'
import { formatCompactNumber, formatCostFixed } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { PickedOption, RankingSortKey } from './adminUsageQuery'
import { RANKING_SIZES, type AdminUserRankingState } from './useAdminUserRanking'

// A type alias, not an interface: the table's row type asks for an index signature, which only an alias gives.
type Row = {
  rank: number
  user_id: number
  email: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_tokens: number
  total_tokens: number
  actual_cost: number
}

/** The figures a ranking can be made by: each is a column of it. */
type Figure = RankingSortKey & keyof Row

const FIGURES: Figure[] = ['requests', 'input_tokens', 'output_tokens', 'cache_tokens', 'total_tokens', 'actual_cost']

// Gold, silver and bronze for the first three.
const MEDALS: NonNullable<ComponentProps<typeof Token>['color']>[] = ['yellow', 'gray', 'orange']

const count = (value: number) => value.toLocaleString()
const money = (value: number) => `$${formatCostFixed(value, 4)}`

/**
 * The users who used the most under the page's filters, ranked by the figure of the header that was clicked.
 * A user's name narrows the page to that user. Port of components/admin/usage/UserTokenRanking.vue.
 */
export function AdminUserRanking({
  ranking,
  onPickUser,
}: {
  ranking: AdminUserRankingState
  onPickUser: (user: PickedOption) => void
}) {
  const { t } = useI18n()
  const rows: Row[] = ranking.users.map((user, index) => ({
    rank: index + 1,
    user_id: user.user_id,
    email: user.email,
    requests: user.requests,
    input_tokens: user.input_tokens,
    output_tokens: user.output_tokens,
    cache_tokens: user.cache_tokens,
    total_tokens: user.total_tokens,
    actual_cost: user.actual_cost,
  }))

  const figure = (
    key: Figure,
    header: string,
    format: (value: number) => string,
    isTotal = false,
  ): TableColumn<Row> => ({
    key,
    header,
    sortable: true,
    align: 'end',
    width: proportional(1, { minWidth: 112 }),
    renderCell: (row) => (
      <Text type="supporting" color="primary" weight={isTotal ? 'medium' : undefined} hasTabularNumbers textWrap="nowrap">
        {format(row[key])}
      </Text>
    ),
  })

  const columns: TableColumn<Row>[] = [
    {
      key: 'rank',
      header: '#',
      width: pixel(64),
      renderCell: (row) =>
        row.rank <= MEDALS.length ? (
          <Token size="sm" color={MEDALS[row.rank - 1]} label={String(row.rank)} />
        ) : (
          <Text type="supporting" hasTabularNumbers>
            {String(row.rank)}
          </Text>
        ),
    },
    {
      key: 'user',
      header: t('admin.usage.tokenRanking.columns.user'),
      width: proportional(2.4, { minWidth: 220 }),
      // The table has no row click, so the name is what narrows the page to the user.
      renderCell: (row) => (
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Link
            type="supporting"
            tooltip={t('admin.usage.tokenRanking.rowHint')}
            onClick={() => onPickUser({ id: row.user_id, label: row.email || String(row.user_id) })}>
            {row.email || t('admin.redeem.userPrefix', { id: row.user_id })}
          </Link>
          <Text type="supporting" hasTabularNumbers>{`#${row.user_id}`}</Text>
        </HStack>
      ),
    },
    figure('requests', t('admin.usage.tokenRanking.columns.requests'), count),
    figure('input_tokens', t('admin.usage.tokenRanking.columns.inputTokens'), formatCompactNumber),
    figure('output_tokens', t('admin.usage.tokenRanking.columns.outputTokens'), formatCompactNumber),
    figure('cache_tokens', t('admin.usage.tokenRanking.columns.cacheTokens'), formatCompactNumber),
    figure('total_tokens', t('admin.usage.tokenRanking.columns.totalTokens'), formatCompactNumber, true),
    figure('actual_cost', t('admin.usage.tokenRanking.columns.cost'), money, true),
  ]

  const sortPlugin = useTableSortable<Row, string>({
    sort: [{ sortKey: ranking.sortBy, direction: 'descending' }],
    // A ranking only runs from the most down: a click on the header it is ranked by changes nothing.
    onSortChange: (next) => {
      const picked = FIGURES.find((key) => key === next[0]?.sortKey)
      if (picked) ranking.setSortBy(picked)
    },
  })

  return (
    <VStack gap={4}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <Text type="supporting">{t('admin.usage.tokenRanking.subtitle')}</Text>
        <HStack gap={3} vAlign="center">
          {!ranking.isLoading && rows.length > 0 && (
            <Text type="supporting" hasTabularNumbers>
              {t('admin.usage.tokenRanking.userCount', { count: rows.length })}
            </Text>
          )}
          <Selector
            label="Top N"
            isLabelHidden
            width={120}
            value={String(ranking.limit)}
            onChange={(value) => ranking.setLimit(Number(value))}
            options={RANKING_SIZES.map((size) => ({ value: String(size), label: `Top ${size}` }))}
          />
        </HStack>
      </HStack>

      {ranking.hasFailed && <Banner status="error" title={t('admin.dashboard.failedToLoad')} />}

      {rows.length === 0 ? (
        // A failed first load leaves only its banner.
        (ranking.isLoading || !ranking.hasFailed) && (
          <Center padding={8}>
            {ranking.isLoading ? (
              <Spinner label={t('common.loading')} />
            ) : (
              <EmptyState
                isCompact
                headingLevel={5}
                icon={<Icon icon={InboxIcon} size="lg" color="secondary" />}
                title={t('admin.dashboard.noDataAvailable')}
              />
            )}
          </Center>
        )
      ) : (
        <Table<Row>
          data={rows}
          columns={columns}
          idKey={(row) => row.user_id}
          density="compact"
          dividers="rows"
          hasHover
          plugins={{ sort: sortPlugin }}
        />
      )}
    </VStack>
  )
}
