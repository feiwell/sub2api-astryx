// Copyright (c) Meta Platforms, Inc. and affiliates.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { DateRange } from '@astryxdesign/core/Calendar'
import {
  ArrowPathIcon,
  BoltIcon,
  ChartBarIcon,
  CircleStackIcon,
  ClockIcon,
  CubeIcon,
  KeyIcon,
  ServerIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import type { DashboardStats, ModelStat, TrendDataPoint, UserSpendingRankingItem, UserUsageTrendPoint } from '@/types'
import { TokenTrendChart } from '~/components/charts/TokenTrendChart'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { useBatchImageAccess } from '~/stores/batchImageAccess'
import {
  DATE_PRESETS,
  formatCost,
  formatDuration,
  formatNumber,
  formatTokens,
  granularityFor,
  last24HoursRange,
  type Granularity,
  type TrendMetric,
} from './dashboard/format'
import { DistributionCard } from './dashboard/DistributionCard'
import { MetricCard, MetricRow, type MetricFact, type MetricIcon } from './dashboard/MetricCard'
import { EMPTY_RANKING, type SpendingRanking } from './dashboard/SpendingRankingTable'
import { UserTrendCard } from './dashboard/UserTrendCard'

const TOP_USERS = 12
const TOKEN_CHART_HEIGHT = 260

function QuickAction({
  icon,
  iconColor,
  title,
  description,
  onClick,
}: {
  icon: MetricIcon
  iconColor: 'cyan' | 'green'
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <ClickableCard label={title} onClick={onClick}>
      <HStack gap={3} vAlign="center">
        <Icon icon={icon} color={iconColor} />
        <StackItem size="fill">
          <VStack gap={0}>
            <Text type="body" weight="medium">
              {title}
            </Text>
            <Text type="supporting" color="secondary">
              {description}
            </Text>
          </VStack>
        </StackItem>
        <Icon icon="chevronRight" size="sm" color="tertiary" />
      </HStack>
    </ClickableCard>
  )
}

export function AdminDashboardPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const canUseBatchImage = useBatchImageAccess((s) => s.canUseBatchImage)
  const refreshBatchImageAccess = useBatchImageAccess((s) => s.refresh)

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartsLoading, setChartsLoading] = useState(false)
  const [trend, setTrend] = useState<TrendDataPoint[]>([])
  const [models, setModels] = useState<ModelStat[]>([])
  const [userTrend, setUserTrend] = useState<UserUsageTrendPoint[]>([])
  const [userTrendLoading, setUserTrendLoading] = useState(false)
  const [userTrendMetric, setUserTrendMetric] = useState<TrendMetric>('tokens')
  const [ranking, setRanking] = useState<SpendingRanking>(EMPTY_RANKING)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rankingError, setRankingError] = useState(false)

  const [range, setRange] = useState<DateRange>(last24HoursRange)
  const [granularity, setGranularity] = useState<Granularity>('hour')

  // Each loader keeps only its latest request: a slow earlier answer never overwrites a newer one.
  const hasStats = useRef(false)
  const snapshotSeq = useRef(0)
  const userTrendSeq = useRef(0)
  const rankingSeq = useRef(0)

  const loadSnapshot = async (r: DateRange, g: Granularity, includeStats: boolean) => {
    const seq = ++snapshotSeq.current
    if (includeStats && !hasStats.current) setLoading(true)
    setChartsLoading(true)
    try {
      const res = await adminAPI.dashboard.getSnapshotV2({
        start_date: r.start,
        end_date: r.end,
        granularity: g,
        include_stats: includeStats,
        include_trend: true,
        include_model_stats: true,
        include_group_stats: false,
        include_users_trend: false,
      })
      if (seq !== snapshotSeq.current) return
      if (includeStats && res.stats) {
        hasStats.current = true
        setStats(res.stats)
      }
      setTrend(res.trend || [])
      setModels(res.models || [])
    } catch (error) {
      if (seq !== snapshotSeq.current) return
      toast.error(t('admin.dashboard.failedToLoad'))
      console.error('Error loading dashboard snapshot:', error)
    } finally {
      if (seq === snapshotSeq.current) {
        setLoading(false)
        setChartsLoading(false)
      }
    }
  }

  const loadUserTrend = async (r: DateRange, g: Granularity, metric: TrendMetric) => {
    const seq = ++userTrendSeq.current
    setUserTrendLoading(true)
    try {
      const res = await adminAPI.dashboard.getUserUsageTrend({
        start_date: r.start,
        end_date: r.end,
        granularity: g,
        limit: TOP_USERS,
        metric,
      })
      if (seq !== userTrendSeq.current) return
      setUserTrend(res.trend || [])
    } catch (error) {
      if (seq !== userTrendSeq.current) return
      console.error('Error loading users trend:', error)
      setUserTrend([])
    } finally {
      if (seq === userTrendSeq.current) setUserTrendLoading(false)
    }
  }

  const loadRanking = async (r: DateRange) => {
    const seq = ++rankingSeq.current
    setRankingLoading(true)
    setRankingError(false)
    try {
      const res = await adminAPI.dashboard.getUserSpendingRanking({
        start_date: r.start,
        end_date: r.end,
        limit: TOP_USERS,
      })
      if (seq !== rankingSeq.current) return
      setRanking({
        items: res.ranking || [],
        totalActualCost: res.total_actual_cost || 0,
        totalRequests: res.total_requests || 0,
        totalTokens: res.total_tokens || 0,
      })
    } catch (error) {
      if (seq !== rankingSeq.current) return
      console.error('Error loading user spending ranking:', error)
      setRanking(EMPTY_RANKING)
      setRankingError(true)
    } finally {
      if (seq === rankingSeq.current) setRankingLoading(false)
    }
  }

  const refreshAll = () => {
    void loadSnapshot(range, granularity, true)
    void loadUserTrend(range, granularity, userTrendMetric)
    void loadRanking(range)
  }

  // The stat cards are all-time / today figures: a new range or granularity reloads the charts only.
  const reloadCharts = (r: DateRange, g: Granularity) => {
    void loadSnapshot(r, g, false)
    void loadUserTrend(r, g, userTrendMetric)
    void loadRanking(r)
  }

  useEffect(() => {
    void refreshBatchImageAccess()
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRangeChange = (next: DateRange | null) => {
    if (!next) return
    const nextGranularity = granularityFor(next)
    setRange(next)
    setGranularity(nextGranularity)
    reloadCharts(next, nextGranularity)
  }

  const handleGranularityChange = (value: string) => {
    const next: Granularity = value === 'day' ? 'day' : 'hour'
    if (next === granularity) return
    setGranularity(next)
    reloadCharts(range, next)
  }

  const handleMetricChange = (metric: TrendMetric) => {
    if (metric === userTrendMetric) return
    setUserTrendMetric(metric)
    setUserTrend([])
    void loadUserTrend(range, granularity, metric)
  }

  const goToUserUsage = (user: UserSpendingRankingItem) => {
    const query = new URLSearchParams({ user_id: String(user.user_id), start_date: range.start, end_date: range.end })
    navigate(`/admin/usage?${query.toString()}`)
  }

  const presets = useMemo(() => DATE_PRESETS.map((preset) => ({ label: t(preset.labelKey), getRange: preset.getRange })), [t])

  const costFacts = (actual: number, account: number, standard: number): MetricFact[] => [
    { label: t('admin.dashboard.actual'), value: `$${formatCost(actual)}` },
    { label: t('admin.dashboard.accountCost'), value: `$${formatCost(account)}` },
    { label: t('admin.dashboard.standard'), value: `$${formatCost(standard)}` },
  ]

  return (
    <Page
      title={t('admin.dashboard.title')}
      description={t('admin.dashboard.description')}
      actions={
        <Button
          label={t('common.refresh')}
          variant="secondary"
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={loading || chartsLoading}
          onClick={refreshAll}
        />
      }
    >
      {stats ? (
        <VStack gap={6}>
          <VStack gap={4}>
            <MetricRow>
              <MetricCard
                icon={KeyIcon}
                iconColor="blue"
                label={t('admin.dashboard.apiKeys')}
                value={formatNumber(stats.total_api_keys)}
                facts={[{ label: t('common.active'), value: formatNumber(stats.active_api_keys) }]}
              />
              <MetricCard
                icon={ServerIcon}
                iconColor="purple"
                label={t('admin.dashboard.accounts')}
                value={formatNumber(stats.total_accounts)}
                facts={[
                  { label: t('common.active'), value: formatNumber(stats.normal_accounts) },
                  ...(stats.error_accounts > 0
                    ? [{ label: t('common.error'), value: formatNumber(stats.error_accounts), tone: 'error' as const }]
                    : []),
                ]}
              />
              <MetricCard
                icon={ChartBarIcon}
                iconColor="green"
                label={t('admin.dashboard.todayRequests')}
                value={formatNumber(stats.today_requests)}
                facts={[{ label: t('common.total'), value: formatNumber(stats.total_requests) }]}
              />
              <MetricCard
                icon={UserPlusIcon}
                iconColor="teal"
                label={t('admin.dashboard.users')}
                value={`+${formatNumber(stats.today_new_users)}`}
                facts={[{ label: t('common.total'), value: formatNumber(stats.total_users) }]}
              />
            </MetricRow>
            <MetricRow>
              <MetricCard
                icon={CubeIcon}
                iconColor="orange"
                label={t('admin.dashboard.todayTokens')}
                value={formatTokens(stats.today_tokens)}
                facts={costFacts(stats.today_actual_cost, stats.today_account_cost, stats.today_cost)}
              />
              <MetricCard
                icon={CircleStackIcon}
                iconColor="cyan"
                label={t('admin.dashboard.totalTokens')}
                value={formatTokens(stats.total_tokens)}
                facts={costFacts(stats.total_actual_cost, stats.total_account_cost, stats.total_cost)}
              />
              <MetricCard
                icon={BoltIcon}
                iconColor="yellow"
                label={t('admin.dashboard.performance')}
                value={formatTokens(stats.rpm)}
                unit="RPM"
                facts={[{ label: 'TPM', value: formatTokens(stats.tpm) }]}
              />
              <MetricCard
                icon={ClockIcon}
                iconColor="pink"
                label={t('admin.dashboard.avgResponse')}
                value={formatDuration(stats.average_duration_ms)}
                facts={[{ label: t('admin.dashboard.activeUsers'), value: formatNumber(stats.active_users) }]}
              />
            </MetricRow>
          </VStack>

          <VStack gap={3}>
            <Heading level={3}>{t('admin.dashboard.quickActions')}</Heading>
            <Grid columns={{ minWidth: 280, repeat: 'fill' }} gap={4}>
              {canUseBatchImage && (
                <QuickAction
                  icon={SparklesIcon}
                  iconColor="cyan"
                  title={t('admin.dashboard.batchImage')}
                  description={t('admin.dashboard.batchImageDesc')}
                  onClick={() => navigate('/batch-image')}
                />
              )}
              <QuickAction
                icon={Squares2X2Icon}
                iconColor="green"
                title={t('admin.dashboard.groupPricing')}
                description={t('admin.dashboard.groupPricingDesc')}
                onClick={() => navigate('/admin/groups')}
              />
            </Grid>
          </VStack>

          <Divider />

          <Card padding={4}>
            <HStack gap={4} vAlign="end" wrap="wrap">
              <DateRangeInput
                label={t('admin.dashboard.timeRange')}
                value={range}
                presets={presets}
                hasClear={false}
                onChange={handleRangeChange}
                width={280}
              />
              <SegmentedControl
                label={t('admin.dashboard.granularity')}
                value={granularity}
                onChange={handleGranularityChange}
              >
                <SegmentedControlItem value="day" label={t('admin.dashboard.day')} />
                <SegmentedControlItem value="hour" label={t('admin.dashboard.hour')} />
              </SegmentedControl>
            </HStack>
          </Card>

          <Grid columns={{ minWidth: 480, repeat: 'fit' }} gap={4}>
            <Card>
              <VStack gap={4}>
                <Heading level={3}>{t('admin.dashboard.tokenUsageTrend')}</Heading>
                {trend.length > 0 ? (
                  <TokenTrendChart trend={trend} />
                ) : chartsLoading ? (
                  <Center height={TOKEN_CHART_HEIGHT}>
                    <Spinner />
                  </Center>
                ) : (
                  <EmptyState isCompact headingLevel={4} title={t('admin.dashboard.noDataAvailable')} />
                )}
              </VStack>
            </Card>
            <UserTrendCard
              points={userTrend}
              loading={userTrendLoading}
              metric={userTrendMetric}
              onMetricChange={handleMetricChange}
            />
          </Grid>

          <DistributionCard
            models={models}
            modelsLoading={chartsLoading}
            ranking={ranking}
            rankingLoading={rankingLoading}
            hasRankingError={rankingError}
            range={range}
            onUserClick={goToUserUsage}
          />
        </VStack>
      ) : loading ? (
        <Center padding={10}>
          <Spinner />
        </Center>
      ) : (
        <EmptyState headingLevel={2} title={t('admin.dashboard.failedToLoad')} />
      )}
    </Page>
  )
}
