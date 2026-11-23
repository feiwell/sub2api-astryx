import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Text } from '@astryxdesign/core/Text'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import {
  ArrowTrendingUpIcon,
  BoltIcon,
  CalculatorIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  CubeIcon,
  CurrencyDollarIcon,
  FireIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline'
import type { Account, AccountUsageHistory, AccountUsageStatsResponse, EndpointStat } from '@/types'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { SERIES_COLORS, readChartInk, type ChartInk } from '~/components/charts/chartTheme'
import { UsageDistributionCard, type DistributionMetric } from '~/components/charts/UsageDistributionCard'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const STATS_DAYS = 30

const formatCost = (value: number): string => {
  if (value >= 1000) return (value / 1000).toFixed(2) + 'K'
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(3)
  return value.toFixed(4)
}

const formatNumber = (value: number): string => {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M'
  if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K'
  return value.toLocaleString()
}

const formatTokens = (value: number): string => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

const formatDuration = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`)

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>
type IconColor = 'green' | 'blue' | 'yellow' | 'purple' | 'cyan' | 'orange' | 'teal' | 'pink' | 'accent'

/** Headline figure with its label, icon and a supporting line. */
function SummaryTile({
  label,
  icon,
  iconColor,
  value,
  detail,
}: {
  label: string
  icon: HeroIcon
  iconColor: IconColor
  value: string
  detail: ReactNode
}) {
  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Text type="supporting">{label}</Text>
          <Icon icon={icon} size="sm" color={iconColor} />
        </HStack>
        <Text size="2xl" weight="bold" hasTabularNumbers>
          {value}
        </Text>
        <Text type="supporting">{detail}</Text>
      </VStack>
    </Card>
  )
}

/** Titled card of label/value rows. */
function DetailCard({
  title,
  icon,
  iconColor,
  rows,
}: {
  title: string
  icon: HeroIcon
  iconColor: IconColor
  rows: { label: string; value: string; isHighlighted?: boolean }[]
}) {
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <Icon icon={icon} size="sm" color={iconColor} />
          <Text weight="semibold">{title}</Text>
        </HStack>
        <VStack gap={2}>
          {rows.map((row) => (
            <HStack key={row.label} gap={2} vAlign="center" hAlign="between">
              <Text type="supporting">{row.label}</Text>
              <Text weight="semibold" color={row.isHighlighted ? 'accent' : 'primary'} hasTabularNumbers>
                {row.value}
              </Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Card>
  )
}

/**
 * Daily trend over the stats window: account-billed and user-billed cost on
 * the left axis (USD), request count on the right axis.
 */
function UsageTrendChart({ history }: { history: AccountUsageHistory[] }) {
  const { t } = useI18n()
  const colorMode = useAppStore((s) => s.colorMode)
  const hostRef = useRef<HTMLElement>(null)
  const [ink, setInk] = useState<ChartInk | null>(null)

  useLayoutEffect(() => {
    setInk(readChartInk(hostRef.current))
  }, [colorMode])

  const colors = SERIES_COLORS[colorMode]
  const accountCostLabel = `${t('usage.accountBilled')} (USD)`
  const userCostLabel = `${t('usage.userBilled')} (USD)`
  const requestsLabel = t('admin.accounts.stats.requests')
  const pointRadius = history.length > 20 ? 0 : 3

  const data = {
    labels: history.map((h) => h.label),
    datasets: [
      {
        label: accountCostLabel,
        data: history.map((h) => h.actual_cost),
        borderColor: colors[0],
        backgroundColor: colors[0],
        yAxisID: 'y',
      },
      {
        label: userCostLabel,
        data: history.map((h) => h.user_cost),
        borderColor: colors[2],
        backgroundColor: colors[2],
        borderDash: [5, 5],
        yAxisID: 'y',
      },
      {
        label: requestsLabel,
        data: history.map((h) => h.requests),
        borderColor: colors[1],
        backgroundColor: colors[1],
        yAxisID: 'y1',
      },
    ].map((ds) => ({
      ...ds,
      borderWidth: 2,
      tension: 0.3,
      pointRadius,
      pointHoverRadius: 5,
      pointBorderColor: ink?.surface,
      pointBorderWidth: 2,
    })),
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: { color: ink?.muted, usePointStyle: true, pointStyle: 'line', boxWidth: 16, font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = Number(ctx.parsed.y)
            return ctx.dataset.yAxisID === 'y'
              ? `${ctx.dataset.label}: $${formatCost(value)}`
              : `${ctx.dataset.label}: ${formatNumber(value)}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: ink?.grid },
        ticks: { color: ink?.muted, maxRotation: 45, minRotation: 0, autoSkipPadding: 12 },
      },
      y: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        grid: { color: ink?.grid },
        border: { display: false },
        ticks: { color: ink?.muted, callback: (v) => '$' + formatCost(Number(v)) },
        title: { display: true, text: accountCostLabel, color: ink?.muted },
      },
      y1: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        border: { display: false },
        ticks: { color: ink?.muted, callback: (v) => formatNumber(Number(v)) },
        title: { display: true, text: requestsLabel, color: ink?.muted },
      },
    },
  }

  return (
    <VStack ref={hostRef} height={256}>
      {ink && <Line data={data} options={options} />}
    </VStack>
  )
}

const endpointItems = (stats: EndpointStat[] | undefined) =>
  (stats || []).map((e) => ({
    key: e.endpoint,
    label: e.endpoint || '-',
    requests: e.requests,
    total_tokens: e.total_tokens,
    actual_cost: e.actual_cost,
    cost: e.cost,
  }))

interface AccountStatsDialogProps {
  isOpen: boolean
  account: Account | null
  onClose: () => void
}

/**
 * Port of AccountStatsModal.vue: the account's last-30-day usage summary,
 * today / peak-day breakdowns, the daily cost and request trend, and the
 * model and endpoint distributions.
 */
export function AccountStatsDialog({ isOpen, account, onClose }: AccountStatsDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<AccountUsageStatsResponse | null>(null)
  const [modelMetric, setModelMetric] = useState<DistributionMetric>('tokens')
  const [inboundMetric, setInboundMetric] = useState<DistributionMetric>('tokens')
  const [upstreamMetric, setUpstreamMetric] = useState<DistributionMetric>('tokens')

  // Load stats when the dialog opens; drop them when it closes.
  useEffect(() => {
    if (!isOpen || !account) {
      setStats(null)
      return
    }
    let active = true
    setLoading(true)
    adminAPI.accounts
      .getStats(account.id, STATS_DAYS)
      .then((data) => {
        if (active) setStats(data)
      })
      .catch((error) => {
        console.error('Failed to load account stats:', error)
        if (active) setStats(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isOpen, account])

  const summary = stats?.summary
  const usd = (value: number | undefined) => `$${formatCost(value || 0)}`

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={1080} maxHeight="90dvh">
      <Layout
        header={<DialogHeader title={t('admin.accounts.usageStatistics')} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            <VStack gap={6} hAlign="stretch">
              {account && (
                <Card variant="muted" padding={3}>
                  <HStack gap={3} vAlign="center" hAlign="between">
                    <HStack gap={3} vAlign="center">
                      <Icon icon={ChartBarIcon} color="accent" />
                      <VStack gap={1}>
                        <Text weight="semibold">{account.name}</Text>
                        <Text type="supporting">{t('admin.accounts.last30DaysUsage')}</Text>
                      </VStack>
                    </HStack>
                    <Badge label={account.status} variant={account.status === 'active' ? 'success' : 'neutral'} />
                  </HStack>
                </Card>
              )}

              {loading ? (
                <Center padding={10}>
                  <Spinner />
                </Center>
              ) : stats && summary ? (
                <>
                  {/* Row 1: main figures */}
                  <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
                    <SummaryTile
                      label={t('admin.accounts.stats.totalCost')}
                      icon={CurrencyDollarIcon}
                      iconColor="green"
                      value={usd(summary.total_cost)}
                      detail={`${t('admin.accounts.stats.accumulatedCost')} (${t('usage.userBilled')}: ${usd(
                        summary.total_user_cost,
                      )} · ${t('admin.accounts.stats.standardCost')}: ${usd(summary.total_standard_cost)})`}
                    />
                    <SummaryTile
                      label={t('admin.accounts.stats.totalRequests')}
                      icon={BoltIcon}
                      iconColor="blue"
                      value={formatNumber(summary.total_requests)}
                      detail={t('admin.accounts.stats.totalCalls')}
                    />
                    <SummaryTile
                      label={t('admin.accounts.stats.avgDailyCost')}
                      icon={CalculatorIcon}
                      iconColor="yellow"
                      value={usd(summary.avg_daily_cost)}
                      detail={`${t('admin.accounts.stats.basedOnActualDays', { days: summary.actual_days_used })} (${t(
                        'usage.userBilled',
                      )}: ${usd(summary.avg_daily_user_cost)})`}
                    />
                    <SummaryTile
                      label={t('admin.accounts.stats.avgDailyRequests')}
                      icon={PresentationChartLineIcon}
                      iconColor="purple"
                      value={formatNumber(Math.round(summary.avg_daily_requests))}
                      detail={t('admin.accounts.stats.avgDailyUsage')}
                    />
                  </Grid>

                  {/* Row 2: today, highest cost day, highest request day */}
                  <Grid columns={{ minWidth: 260, max: 3 }} gap={4}>
                    <DetailCard
                      title={t('admin.accounts.stats.todayOverview')}
                      icon={ClockIcon}
                      iconColor="cyan"
                      rows={[
                        { label: t('usage.accountBilled'), value: usd(summary.today?.cost) },
                        { label: t('usage.userBilled'), value: usd(summary.today?.user_cost) },
                        { label: t('admin.accounts.stats.requests'), value: formatNumber(summary.today?.requests || 0) },
                        { label: t('admin.accounts.stats.tokens'), value: formatTokens(summary.today?.tokens || 0) },
                      ]}
                    />
                    <DetailCard
                      title={t('admin.accounts.stats.highestCostDay')}
                      icon={FireIcon}
                      iconColor="orange"
                      rows={[
                        { label: t('admin.accounts.stats.date'), value: summary.highest_cost_day?.label || '-' },
                        {
                          label: t('usage.accountBilled'),
                          value: usd(summary.highest_cost_day?.cost),
                          isHighlighted: true,
                        },
                        { label: t('usage.userBilled'), value: usd(summary.highest_cost_day?.user_cost) },
                        {
                          label: t('admin.accounts.stats.requests'),
                          value: formatNumber(summary.highest_cost_day?.requests || 0),
                        },
                      ]}
                    />
                    <DetailCard
                      title={t('admin.accounts.stats.highestRequestDay')}
                      icon={ArrowTrendingUpIcon}
                      iconColor="accent"
                      rows={[
                        { label: t('admin.accounts.stats.date'), value: summary.highest_request_day?.label || '-' },
                        {
                          label: t('admin.accounts.stats.requests'),
                          value: formatNumber(summary.highest_request_day?.requests || 0),
                          isHighlighted: true,
                        },
                        { label: t('usage.accountBilled'), value: usd(summary.highest_request_day?.cost) },
                        { label: t('usage.userBilled'), value: usd(summary.highest_request_day?.user_cost) },
                      ]}
                    />
                  </Grid>

                  {/* Row 3: tokens, performance, recent activity */}
                  <Grid columns={{ minWidth: 260, max: 3 }} gap={4}>
                    <DetailCard
                      title={t('admin.accounts.stats.accumulatedTokens')}
                      icon={CubeIcon}
                      iconColor="teal"
                      rows={[
                        { label: t('admin.accounts.stats.totalTokens'), value: formatTokens(summary.total_tokens) },
                        {
                          label: t('admin.accounts.stats.dailyAvgTokens'),
                          value: formatTokens(Math.round(summary.avg_daily_tokens)),
                        },
                      ]}
                    />
                    <DetailCard
                      title={t('admin.accounts.stats.performance')}
                      icon={BoltIcon}
                      iconColor="pink"
                      rows={[
                        {
                          label: t('admin.accounts.stats.avgResponseTime'),
                          value: formatDuration(summary.avg_duration_ms),
                        },
                        {
                          label: t('admin.accounts.stats.daysActive'),
                          value: `${summary.actual_days_used} / ${summary.days}`,
                        },
                      ]}
                    />
                    <DetailCard
                      title={t('admin.accounts.stats.recentActivity')}
                      icon={ClipboardDocumentListIcon}
                      iconColor="green"
                      rows={[
                        {
                          label: t('admin.accounts.stats.todayRequests'),
                          value: formatNumber(summary.today?.requests || 0),
                        },
                        { label: t('admin.accounts.stats.todayTokens'), value: formatTokens(summary.today?.tokens || 0) },
                        { label: t('admin.accounts.stats.todayCost'), value: usd(summary.today?.cost) },
                      ]}
                    />
                  </Grid>

                  {/* Usage trend */}
                  <Card padding={4}>
                    <VStack gap={4}>
                      <Heading level={4}>{t('admin.accounts.stats.usageTrend')}</Heading>
                      {stats.history?.length ? (
                        <UsageTrendChart history={stats.history} />
                      ) : (
                        <EmptyState isCompact title={t('admin.dashboard.noDataAvailable')} />
                      )}
                    </VStack>
                  </Card>

                  <UsageDistributionCard
                    title={t('admin.dashboard.modelDistribution')}
                    dimensionLabel={t('admin.dashboard.model')}
                    items={(stats.models || []).map((m) => ({
                      key: m.model,
                      label: m.model,
                      requests: m.requests,
                      total_tokens: m.total_tokens,
                      actual_cost: m.actual_cost,
                      cost: m.cost,
                    }))}
                    loading={false}
                    metric={modelMetric}
                    onMetricChange={setModelMetric}
                  />
                  <UsageDistributionCard
                    title={t('usage.inboundEndpoint')}
                    dimensionLabel={t('usage.endpoint')}
                    items={endpointItems(stats.endpoints)}
                    loading={false}
                    metric={inboundMetric}
                    onMetricChange={setInboundMetric}
                  />
                  <UsageDistributionCard
                    title={t('usage.upstreamEndpoint')}
                    dimensionLabel={t('usage.endpoint')}
                    items={endpointItems(stats.upstream_endpoints)}
                    loading={false}
                    metric={upstreamMetric}
                    onMetricChange={setUpstreamMetric}
                  />
                </>
              ) : (
                <EmptyState icon={<Icon icon={ChartBarIcon} size="lg" />} title={t('admin.accounts.stats.noData')} />
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
