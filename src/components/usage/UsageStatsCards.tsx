import type { ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HoverCard } from '@astryxdesign/core/HoverCard'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { UsageStatsResponse } from '@/types'
import { useI18n } from '~/i18n'
import { formatAverageDuration, formatTokenTotal } from './usageFormat'

// Shown in place of a figure that is not known: a zero would read as "nothing was used".
const NOT_KNOWN = '-'

function StatCard({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <Card>
      <VStack gap={2}>
        <Heading level={4}>{label}</Heading>
        <Heading level={2}>{value}</Heading>
        {children}
      </VStack>
    </Card>
  )
}

function BreakdownLine({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={4} hAlign="between" vAlign="center">
      <Text type="supporting">{label}</Text>
      <Text type="supporting" color="primary" weight="medium" hasTabularNumbers>
        {value}
      </Text>
    </HStack>
  )
}

/**
 * The four figures above a usage list: requests, tokens, cost and average duration over what the list is
 * narrowed to. `stats` is null while they are not known, before the first answer and after a failed one.
 */
export function UsageStatsCards({
  stats,
  hasStruckStandardCost = false,
  accountCost,
}: {
  stats: UsageStatsResponse | null
  /** Strike the standard price through, where what was charged is the figure that counts. */
  hasStruckStandardCost?: boolean
  /** What the upstream accounts were charged for the same requests, where the viewer may know it. */
  accountCost?: number | null
}) {
  const { t } = useI18n()
  const tokens = (value: number | undefined) => formatTokenTotal(value || 0)

  return (
    <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={4}>
      <StatCard
        label={t('usage.totalRequests')}
        value={stats ? (stats.total_requests || 0).toLocaleString() : NOT_KNOWN}>
        <Text type="supporting">{t('usage.inSelectedRange')}</Text>
      </StatCard>

      <StatCard label={t('usage.totalTokens')} value={stats ? tokens(stats.total_tokens) : NOT_KNOWN}>
        {stats && (
          <HStack gap={1} wrap="wrap">
            <Text type="supporting" hasTabularNumbers>
              {`${t('usage.in')}: ${tokens(stats.total_input_tokens)}`}
            </Text>
            <Text type="supporting">/</Text>
            <Text type="supporting" hasTabularNumbers>
              {`${t('usage.out')}: ${tokens(stats.total_output_tokens)}`}
            </Text>
            <Text type="supporting">/</Text>
            <Text type="supporting" hasTabularNumbers>
              <HoverCard
                label={t('usage.cacheBreakdown')}
                placement="below"
                content={
                  <VStack gap={1.5} hAlign="stretch">
                    <Text type="label">{t('usage.cacheBreakdown')}</Text>
                    <BreakdownLine
                      label={t('usage.cacheCreationTokensLabel')}
                      value={tokens(stats.total_cache_creation_tokens)}
                    />
                    <BreakdownLine
                      label={t('usage.cacheReadTokensLabel')}
                      value={tokens(stats.total_cache_read_tokens)}
                    />
                  </VStack>
                }>
                {`${t('usage.cacheTotal')}: ${tokens(stats.total_cache_tokens)}`}
              </HoverCard>
            </Text>
          </HStack>
        )}
      </StatCard>

      <StatCard
        label={t('usage.totalCost')}
        value={stats ? `$${(stats.total_actual_cost || 0).toFixed(4)}` : NOT_KNOWN}>
        {stats && (
          <HStack gap={1} wrap="wrap">
            {accountCost != null && (
              <>
                <Text type="supporting" hasTabularNumbers>
                  {`${t('usage.accountCost')} $${accountCost.toFixed(4)}`}
                </Text>
                <Text type="supporting">·</Text>
              </>
            )}
            <Text type="supporting">{t('usage.standardCost')}</Text>
            <Text type="supporting" hasTabularNumbers hasStrikethrough={hasStruckStandardCost}>
              {`$${(stats.total_cost || 0).toFixed(4)}`}
            </Text>
          </HStack>
        )}
      </StatCard>

      <StatCard
        label={t('usage.avgDuration')}
        value={stats ? formatAverageDuration(stats.average_duration_ms || 0) : NOT_KNOWN}
      />
    </Grid>
  )
}
