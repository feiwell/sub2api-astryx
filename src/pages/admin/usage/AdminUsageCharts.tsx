import { useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { TokenTrendChart } from '~/components/charts/TokenTrendChart'
import { useI18n } from '~/i18n'
import { getUserBreakdown } from '~/lib/api/admin/dashboard'
import { AdminDistributionCard } from './AdminDistributionCard'
import {
  buildUserBreakdownParams,
  userBreakdownScope,
  type DistributionRowRef,
  type EndpointSource,
  type ModelSource,
} from './adminUsageQuery'
import type { AdminUsage } from './useAdminUsage'

const MODEL_SOURCES: { value: ModelSource; labelKey: string }[] = [
  { value: 'requested', labelKey: 'usage.requestedModel' },
  { value: 'upstream', labelKey: 'usage.upstreamModel' },
  { value: 'mapping', labelKey: 'usage.mapping' },
]

const ENDPOINT_SOURCES: { value: EndpointSource; labelKey: string }[] = [
  { value: 'inbound', labelKey: 'usage.inbound' },
  { value: 'upstream', labelKey: 'usage.upstream' },
  { value: 'path', labelKey: 'usage.path' },
]

/**
 * Where everyone's usage went, by model, by group and by endpoint, and the token trend over the range. Models
 * and endpoints can be counted in three ways each; a row of any of the three opens the users behind it.
 */
export function AdminUsageCharts({ usage }: { usage: AdminUsage }) {
  const { t } = useI18n()
  const [endpointSource, setEndpointSource] = useState<EndpointSource>('inbound')
  const { filters, modelSource, stats } = usage

  const usersBehind = (row: DistributionRowRef) =>
    getUserBreakdown(buildUserBreakdownParams(filters, row)).then((answer) => answer.users || [])
  // What an open list of users was asked under: other filters, or a refresh, make it out of date.
  const scope = `${userBreakdownScope(filters)}#${usage.reloadTick}`

  const endpoints =
    (endpointSource === 'upstream'
      ? stats?.upstream_endpoints
      : endpointSource === 'path'
        ? stats?.endpoint_paths
        : stats?.endpoints) || []

  return (
    // `max` also lets a column be narrower than its minimum on a screen that is narrower still.
    <Grid columns={{ minWidth: 420, max: 2, repeat: 'fit' }} gap={4}>
      <AdminDistributionCard
        title={t('admin.dashboard.modelDistribution')}
        dimensionLabel={t('admin.dashboard.model')}
        items={usage.modelStats.map((item) => ({
          key: item.model,
          name: item.model,
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
          account_cost: item.account_cost ?? 0,
        }))}
        isLoading={usage.isModelStatsLoading}
        sourceToggle={{
          label: t('admin.dashboard.model'),
          options: MODEL_SOURCES.map((source) => ({ value: source.value, label: t(source.labelKey) })),
          value: modelSource,
          onChange: usage.setModelSource,
        }}
        scope={`${scope}#${modelSource}`}
        loadUsers={(model) => usersBehind({ model, source: modelSource })}
      />
      <AdminDistributionCard
        title={t('admin.dashboard.groupDistribution')}
        dimensionLabel={t('admin.dashboard.group')}
        items={usage.groupStats.map((item) => ({
          key: String(item.group_id),
          name: item.group_name || t('admin.dashboard.noGroup'),
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
          account_cost: item.account_cost ?? 0,
          // Usage outside every group has no group to ask its users by.
          canOpen: item.group_id > 0,
        }))}
        isLoading={usage.isChartLoading}
        scope={scope}
        loadUsers={(groupId) => usersBehind({ groupId: Number(groupId) })}
      />
      <AdminDistributionCard
        title={t('usage.endpointDistribution')}
        dimensionLabel={t('usage.endpoint')}
        items={endpoints.map((item) => ({
          key: item.endpoint,
          name: item.endpoint || '-',
          requests: item.requests,
          total_tokens: item.total_tokens,
          actual_cost: item.actual_cost,
          cost: item.cost,
        }))}
        isLoading={usage.isStatsLoading}
        sourceToggle={{
          label: t('usage.endpoint'),
          options: ENDPOINT_SOURCES.map((source) => ({ value: source.value, label: t(source.labelKey) })),
          value: endpointSource,
          onChange: setEndpointSource,
        }}
        scope={`${scope}#${endpointSource}`}
        loadUsers={(endpoint) => usersBehind({ endpoint, source: endpointSource })}
      />
      <Card padding={4}>
        <VStack gap={3}>
          <Heading level={4}>{t('admin.dashboard.tokenUsageTrend')}</Heading>
          {usage.trend.length > 0 ? (
            <TokenTrendChart trend={usage.trend} />
          ) : usage.isChartLoading ? (
            <Center padding={6}>
              <Spinner label={t('common.loading')} />
            </Center>
          ) : (
            <EmptyState isCompact headingLevel={5} title={t('admin.dashboard.noDataAvailable')} />
          )}
        </VStack>
      </Card>
    </Grid>
  )
}
