import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline'
import type { PaymentOrder } from '@/types/payment'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { CancelOrderDialog } from './orders/CancelOrderDialog'
import { MyOrderTable } from './orders/MyOrderTable'
import { RefundRequestDialog } from './orders/RefundRequestDialog'
import { STATUS_CHOICES } from './orders/myOrderModel'
import { useMyOrders } from './orders/useMyOrders'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'

/**
 * The user's own orders: top-ups and subscription purchases, with what was paid and how each stands.
 * An unpaid order can be cancelled, and a completed one asked back where its payment provider allows.
 * Port of views/user/UserOrdersView.vue.
 */
export function OrdersPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const list = useMyOrders()
  const [cancelling, setCancelling] = useState<PaymentOrder | null>(null)
  const [refunding, setRefunding] = useState<PaymentOrder | null>(null)
  const loadFailed = t('common.loadFailed')

  return (
    <Page
      title={t('orders.title')}
      description={t('orders.subtitle')}
      actions={
        <>
          <IconButton
            label={t('common.refresh')}
            tooltip={t('common.refresh')}
            icon={<Icon icon={ArrowPathIcon} />}
            isLoading={list.isLoading}
            onClick={list.reload}
          />
          <Button label={t('payment.result.backToRecharge')} variant="primary" onClick={() => navigate('/purchase')} />
        </>
      }
    >
      <Card>
        <VStack gap={4}>
          {/* One filter, in a grid so it is as wide as a filter of the other lists. */}
          <Grid columns={{ minWidth: 190, max: 4 }} gap={3}>
            <Selector
              label={t('payment.orders.status')}
              width="100%"
              value={list.status || ALL}
              onChange={(value) => list.pickStatus(value === ALL ? '' : value)}
              options={[
                { value: ALL, label: t('common.all') },
                ...STATUS_CHOICES.map((status) => ({
                  value: status,
                  label: t(`payment.status.${status.toLowerCase()}`),
                })),
              ]}
            />
          </Grid>

          {list.failure != null && (
            <Banner
              status="error"
              title={loadFailed}
              description={list.failure !== loadFailed ? list.failure : undefined}
              endContent={<Button size="sm" variant="secondary" label={t('common.refresh')} onClick={list.reload} />}
            />
          )}

          {list.items.length === 0 ? (
            // A failed first load leaves only its banner.
            (list.isLoading || list.failure == null) && (
              <Center padding={8}>
                {list.isLoading ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <EmptyState
                    isCompact
                    headingLevel={5}
                    icon={<Icon icon={ReceiptPercentIcon} size="lg" color="secondary" />}
                    title={t('payment.orders.empty')}
                  />
                )}
              </Center>
            )
          ) : (
            <MyOrderTable list={list} onCancel={setCancelling} onRequestRefund={setRefunding} />
          )}

          {list.total > 0 && (
            <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {`${t('common.total')}: ${list.total} ${t('pagination.results')}`}
              </Text>
              <Pagination
                page={list.page}
                onChange={list.setPage}
                totalItems={list.total}
                pageSize={list.pageSize}
                pageSizeOptions={list.pageSizeOptions}
                onPageSizeChange={list.changePageSize}
                variant="input"
                size="sm"
              />
            </HStack>
          )}
        </VStack>
      </Card>

      {cancelling && (
        <CancelOrderDialog order={cancelling} onClose={() => setCancelling(null)} onChanged={list.reload} />
      )}
      {refunding && (
        <RefundRequestDialog order={refunding} onClose={() => setRefunding(null)} onChanged={list.reload} />
      )}
    </Page>
  )
}
