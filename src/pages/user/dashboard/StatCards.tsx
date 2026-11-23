import type { ComponentType, SVGProps } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import {
  BanknotesIcon,
  BoltIcon,
  ChartBarIcon,
  CircleStackIcon,
  ClockIcon,
  CubeIcon,
  CurrencyDollarIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import type { UserDashboardStats } from '@/api/usage'
import { useI18n } from '~/i18n'
import { formatCost, formatDuration, formatTokens, formatUsd } from './dashboardModel'

interface Stat {
  key: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  iconColor: 'blue' | 'purple' | 'green' | 'teal' | 'orange' | 'cyan' | 'pink' | 'yellow'
  label: string
  value: string
  /** What the value is, told on hover: for a value with a second figure beside it. */
  valueHint?: string
  /** A second figure, or the unit, set small beside the value. */
  aside?: string
  asideHint?: string
  /** A line under the value that is not a figure. */
  note?: string
  /** Figures under the value, as label and number. */
  facts?: { label: string; value: string }[]
}

// Same build as the cards of the management dashboard, plus the second figure beside the value.
function StatCard({ stat }: { stat: Stat }) {
  const value = <Heading level={2}>{stat.value}</Heading>
  const aside = stat.aside && (
    <Text type="supporting" color="secondary" hasTabularNumbers>
      {stat.aside}
    </Text>
  )
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <Icon icon={stat.icon} color={stat.iconColor} />
          <Heading level={4}>{stat.label}</Heading>
        </HStack>
        <HStack gap={2} vAlign="end" wrap="wrap">
          {stat.valueHint ? <Tooltip content={stat.valueHint}>{value}</Tooltip> : value}
          {aside && (stat.asideHint ? <Tooltip content={stat.asideHint}>{aside}</Tooltip> : aside)}
        </HStack>
        {stat.note && (
          <Text type="supporting" color="secondary">
            {stat.note}
          </Text>
        )}
        {stat.facts && (
          <HStack gap={3} wrap="wrap">
            {stat.facts.map((fact) => (
              <HStack key={fact.label} gap={1} vAlign="center">
                <Text type="supporting" color="secondary">
                  {fact.label}
                </Text>
                <Text type="supporting" weight="medium" hasTabularNumbers>
                  {fact.value}
                </Text>
              </HStack>
            ))}
          </HStack>
        )}
      </VStack>
    </Card>
  )
}

const CARD_MIN_WIDTH = 220
// Two cards and the gap between them (gap 4 is 16px). A pair gets a column of its own only where both of its
// cards fit side by side, so the cards always read row by row.
const PAIR_MIN_WIDTH = CARD_MIN_WIDTH * 2 + 16

/**
 * A row of cards that reflows down to one per row. Four cards sit in two pairs, so they go four, two or one
 * to a row and a narrow window never leaves a single card alone on its row.
 */
function StatRow({ stats }: { stats: Stat[] }) {
  const cards = stats.map((stat) => <StatCard key={stat.key} stat={stat} />)
  if (cards.length !== 4) {
    return (
      <Grid columns={{ minWidth: CARD_MIN_WIDTH, repeat: 'fit' }} gap={4}>
        {cards}
      </Grid>
    )
  }
  return (
    // `max` is what lets the column shrink below its minimum: without it a window narrower than a pair would
    // keep the pair at full width and push it off the screen.
    <Grid columns={{ minWidth: PAIR_MIN_WIDTH, max: 2, repeat: 'fit' }} gap={4}>
      {[0, 2].map((start) => (
        <Grid key={start} columns={{ minWidth: CARD_MIN_WIDTH, repeat: 'fit' }} gap={4}>
          {cards[start]}
          {cards[start + 1]}
        </Grid>
      ))}
    </Grid>
  )
}

/** The figures of the account: what is left, and what was used today and in all. */
export function StatCards({
  stats,
  balance,
  isSimple,
}: {
  stats: UserDashboardStats
  balance: number
  /** Simple mode has no billing, so no balance is shown. */
  isSimple: boolean
}) {
  const { t, locale } = useI18n()
  const count = (value: number | undefined) => (value || 0).toLocaleString(locale)
  const tokens = (value: number | undefined) => formatTokens(value || 0)
  const cost = (value: number | undefined) => `$${formatCost(value || 0)}`
  const tokenFacts = (input: number, output: number, cacheCreation: number, cacheRead: number) => [
    { label: t('dashboard.input'), value: tokens(input) },
    { label: t('dashboard.output'), value: tokens(output) },
    { label: t('dashboard.cache'), value: tokens((cacheCreation || 0) + (cacheRead || 0)) },
  ]

  const balanceStat: Stat = {
    key: 'balance',
    icon: BanknotesIcon,
    iconColor: 'green',
    label: t('dashboard.balance'),
    value: `$${formatUsd(balance)}`,
    note: t('common.available'),
  }
  const account: Stat[] = [
    {
      key: 'apiKeys',
      icon: KeyIcon,
      iconColor: 'blue',
      label: t('dashboard.apiKeys'),
      value: count(stats.total_api_keys),
      facts: [{ label: t('common.active'), value: count(stats.active_api_keys) }],
    },
    {
      key: 'todayRequests',
      icon: ChartBarIcon,
      iconColor: 'teal',
      label: t('dashboard.todayRequests'),
      value: count(stats.today_requests),
      facts: [{ label: t('common.total'), value: count(stats.total_requests) }],
    },
    {
      key: 'todayCost',
      icon: CurrencyDollarIcon,
      iconColor: 'purple',
      label: t('dashboard.todayCost'),
      // What was charged, and beside it what the same requests cost at the standard rate.
      value: cost(stats.today_actual_cost),
      valueHint: t('dashboard.actual'),
      aside: `/ ${cost(stats.today_cost)}`,
      asideHint: t('dashboard.standard'),
      facts: [{ label: t('common.total'), value: `${cost(stats.total_actual_cost)} / ${cost(stats.total_cost)}` }],
    },
  ]
  const usage: Stat[] = [
    {
      key: 'todayTokens',
      icon: CubeIcon,
      iconColor: 'yellow',
      label: t('dashboard.todayTokens'),
      value: tokens(stats.today_tokens),
      facts: tokenFacts(
        stats.today_input_tokens,
        stats.today_output_tokens,
        stats.today_cache_creation_tokens,
        stats.today_cache_read_tokens,
      ),
    },
    {
      key: 'totalTokens',
      icon: CircleStackIcon,
      iconColor: 'cyan',
      label: t('dashboard.totalTokens'),
      value: tokens(stats.total_tokens),
      facts: tokenFacts(
        stats.total_input_tokens,
        stats.total_output_tokens,
        stats.total_cache_creation_tokens,
        stats.total_cache_read_tokens,
      ),
    },
    {
      key: 'performance',
      icon: BoltIcon,
      iconColor: 'orange',
      label: t('dashboard.performance'),
      value: tokens(stats.rpm),
      aside: 'RPM',
      facts: [{ label: 'TPM', value: tokens(stats.tpm) }],
    },
    {
      key: 'avgResponse',
      icon: ClockIcon,
      iconColor: 'pink',
      label: t('dashboard.avgResponse'),
      value: formatDuration(stats.average_duration_ms || 0),
      note: t('dashboard.averageTime'),
    },
  ]

  return (
    <>
      <StatRow stats={isSimple ? account : [balanceStat, ...account]} />
      <StatRow stats={usage} />
    </>
  )
}
