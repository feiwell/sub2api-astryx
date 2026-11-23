import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { Page } from '~/components/common/Page'
import { DailyRevenueChart } from './orders-dashboard/DailyRevenueChart'
import { OrderStatsCards } from './orders-dashboard/OrderStatsCards'
import { PaymentMethodsCard } from './orders-dashboard/PaymentMethodsCard'
import { TopUsersCard } from './orders-dashboard/TopUsersCard'
import { useOrdersDashboard } from './orders-dashboard/useOrdersDashboard'

const DAYS_OPTIONS = [7, 30, 90] as const

export function AdminOrdersDashboardPage() {
  const { t } = useI18n()
  const [days, setDays] = useState(30)
  const dashboard = useOrdersDashboard(days)
  const actions = (
    <>
      <SegmentedControl
        label={t('admin.orders.dashboard.period')}
        value={String(days)}
        onChange={(value) => setDays(Number(value))}
      >
        {DAYS_OPTIONS.map((day) => <SegmentedControlItem key={day} value={String(day)} label={`${day}${t('payment.admin.daySuffix')}`} />)}
      </SegmentedControl>
      <IconButton
        label={t('common.refresh')}
        tooltip={t('common.refresh')}
        icon={<Icon icon={ArrowPathIcon} />}
        isLoading={dashboard.isLoading}
        onClick={dashboard.reload}
      />
    </>
  )
  const errorMessage = dashboard.failure
    ? extractI18nErrorMessage(dashboard.failure, t, 'payment.errors', t('common.error'))
    : null

  return (
    <Page title={t('admin.orders.dashboard.title')} description={t('admin.orders.dashboard.subtitle')} actions={actions}>
      <VStack gap={6} hAlign="stretch">
        {errorMessage && (
          <Banner
            status="error"
            title={errorMessage}
            endContent={<Button size="sm" variant="secondary" label={t('common.refresh')} onClick={dashboard.reload} />}
          />
        )}
        {!dashboard.stats && dashboard.isLoading ? (
          <Center height={240}><Spinner label={t('common.loading')} /></Center>
        ) : dashboard.stats ? (
          <VStack gap={6} hAlign="stretch">
            <OrderStatsCards stats={dashboard.stats} />
            <DailyRevenueChart data={dashboard.stats.daily_series} />
            <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={6}>
              <PaymentMethodsCard methods={dashboard.stats.payment_methods} />
              <TopUsersCard usersByCurrency={dashboard.stats.top_users} />
            </Grid>
          </VStack>
        ) : null}
      </VStack>
    </Page>
  )
}
