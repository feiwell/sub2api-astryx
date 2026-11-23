import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { formatNumberLocaleString, formatTokensK } from '@/utils/format'
import { useI18n } from '~/i18n'

export type DistributionMetric = 'tokens' | 'actual_cost'

export interface DistributionItem {
  key: string
  label: string
  requests: number
  total_tokens: number
  actual_cost: number
  cost: number
}

interface DistributionRow extends Record<string, unknown> {
  key: string
  label: string
  requests: number
  total_tokens: number
  actual_cost: number
  cost: number
  share: number
}

const fmtCost = (n: number) => (n ?? 0).toFixed(4)

/**
 * Share-of-total breakdown (port of the Model/Group/EndpointDistributionChart
 * cards on the usage page): one row per entity, ranked by the chosen metric
 * (tokens or actual spend), with a single-hue share meter and the request,
 * token and cost figures beside it.
 */
export function UsageDistributionCard({
  title,
  dimensionLabel,
  items,
  loading,
  metric,
  onMetricChange,
}: {
  title: string
  /** Header of the first column (model, group, endpoint). */
  dimensionLabel: string
  items: DistributionItem[]
  loading: boolean
  metric: DistributionMetric
  onMetricChange: (metric: DistributionMetric) => void
}) {
  const { t } = useI18n()
  const value = (item: DistributionItem) => (metric === 'tokens' ? item.total_tokens : item.actual_cost) || 0
  const total = items.reduce((sum, item) => sum + value(item), 0)
  const rows: DistributionRow[] = [...items]
    .sort((a, b) => value(b) - value(a))
    .map((item) => ({ ...item, share: total > 0 ? (value(item) / total) * 100 : 0 }))

  const columns: TableColumn<DistributionRow>[] = [
    {
      key: 'label',
      header: dimensionLabel,
      width: proportional(3, { minWidth: 160 }),
      renderCell: (row) => (
        <VStack gap={1}>
          <HStack gap={2} hAlign="between" vAlign="center">
            <Text maxLines={1}>{row.label}</Text>
            <Text type="supporting" hasTabularNumbers>
              {row.share.toFixed(1)}%
            </Text>
          </HStack>
          <ProgressBar label={row.label} isLabelHidden value={row.share} />
        </VStack>
      ),
    },
    {
      key: 'requests',
      header: t('admin.dashboard.requests'),
      width: proportional(1, { minWidth: 72 }),
      align: 'end',
      renderCell: (row) => <Text hasTabularNumbers>{formatNumberLocaleString(row.requests)}</Text>,
    },
    {
      key: 'total_tokens',
      header: t('admin.dashboard.tokens'),
      width: proportional(1, { minWidth: 72 }),
      align: 'end',
      renderCell: (row) => <Text hasTabularNumbers>{formatTokensK(row.total_tokens)}</Text>,
    },
    {
      key: 'actual_cost',
      header: `${t('admin.dashboard.actual')} / ${t('admin.dashboard.standard')}`,
      width: proportional(1.4, { minWidth: 110 }),
      align: 'end',
      renderCell: (row) => (
        <VStack gap={0} hAlign="end">
          <Text hasTabularNumbers>${fmtCost(row.actual_cost)}</Text>
          <Text type="supporting" hasTabularNumbers hasStrikethrough>
            ${fmtCost(row.cost)}
          </Text>
        </VStack>
      ),
    },
  ]

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={4}>{title}</Heading>
          <SegmentedControl
            label={title}
            size="sm"
            value={metric}
            onChange={(next) => onMetricChange(next as DistributionMetric)}
          >
            <SegmentedControlItem value="tokens" label={t('admin.dashboard.metricTokens')} />
            <SegmentedControlItem value="actual_cost" label={t('admin.dashboard.metricActualCost')} />
          </SegmentedControl>
        </HStack>
        {loading && rows.length === 0 ? (
          <Center padding={6}>
            <Spinner />
          </Center>
        ) : rows.length === 0 ? (
          <EmptyState isCompact title={t('admin.dashboard.noDataAvailable')} />
        ) : (
          <Table data={rows} columns={columns} idKey="key" density="compact" />
        )}
      </VStack>
    </Card>
  )
}
