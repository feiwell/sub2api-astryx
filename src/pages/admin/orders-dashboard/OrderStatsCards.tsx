import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Grid } from '@astryxdesign/core/Grid'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { CurrencyAmounts, DashboardStats } from '@/types/payment'
import { formatPaymentAmount } from '@/components/payment/currency'
import { useI18n } from '~/i18n'
import { sortedAmounts } from './dashboardModel'

function RevenueValue({ amounts, locale }: { amounts: CurrencyAmounts; locale: string }) {
  const entries = sortedAmounts(amounts)
  if (!entries.length) return <Heading level={3}>-</Heading>
  return (
    <VStack gap={0.5}>
      {entries.map(([currency, amount]) => (
        <Text key={currency} type="large" weight="semibold" hasTabularNumbers>
          {formatPaymentAmount(amount, currency, locale)}
        </Text>
      ))}
    </VStack>
  )
}

function RevenueCard({
  title,
  amounts,
  count,
  locale,
  ordersLabel,
}: {
  title: string
  amounts: CurrencyAmounts
  count: number
  locale: string
  ordersLabel: string
}) {
  return (
    <Card>
      <VStack gap={2}>
        <Text type="label" color="secondary">{title}</Text>
        <RevenueValue amounts={amounts} locale={locale} />
        <Text type="supporting" color="secondary" hasTabularNumbers>{`${count} ${ordersLabel}`}</Text>
      </VStack>
    </Card>
  )
}

export function OrderStatsCards({ stats }: { stats: DashboardStats }) {
  const { t, locale } = useI18n()
  return (
    <Grid columns={{ minWidth: 240, max: 4 }} gap={4}>
      <RevenueCard
        title={t('payment.admin.todayRevenue')}
        amounts={stats.today_amount}
        count={stats.today_count}
        locale={locale}
        ordersLabel={t('payment.admin.orders')}
      />
      <RevenueCard
        title={t('payment.admin.totalRevenue')}
        amounts={stats.total_amount}
        count={stats.total_count}
        locale={locale}
        ordersLabel={t('payment.admin.orders')}
      />
      <Card>
        <VStack gap={2}>
          <Text type="label" color="secondary">{t('payment.admin.todayOrders')}</Text>
          <Heading level={2}>{stats.today_count}</Heading>
        </VStack>
      </Card>
      <Card>
        <VStack gap={2}>
          <Text type="label" color="secondary">{t('payment.admin.avgAmount')}</Text>
          {sortedAmounts(stats.avg_amount).length ? (
            <VStack gap={0.5}>
              {sortedAmounts(stats.avg_amount).map(([currency, amount]) => (
                <Text key={currency} type="large" weight="semibold" hasTabularNumbers>
                  {formatPaymentAmount(amount, currency, locale)}
                </Text>
              ))}
            </VStack>
          ) : (
            <HStack><Heading level={2}>-</Heading></HStack>
          )}
        </VStack>
      </Card>
    </Grid>
  )
}
