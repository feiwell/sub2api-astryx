import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { OrderDetailDialog } from './orders/OrderDetailDialog'
import { OrderFilterBar } from './orders/OrderFilterBar'
import { OrderTable } from './orders/OrderTable'
import { RefundDialog } from './orders/RefundDialog'
import type { AdminOrder } from './orders/orderModel'
import { useAdminOrders } from './orders/useAdminOrders'

/**
 * Every order placed on the site: top-ups and subscription purchases, with what was paid and how each
 * stands. An order can be looked at in full, and cancelled, retried or refunded where its status allows.
 * Port of views/admin/orders/AdminOrdersView.vue.
 */
export function AdminOrdersPage() {
  const { t } = useI18n()
  const list = useAdminOrders()
  const [viewed, setViewed] = useState<AdminOrder | null>(null)
  const [refunding, setRefunding] = useState<AdminOrder | null>(null)
  const loadFailed = t('common.loadFailed')

  return (
    <Page
      title={t('admin.orders.title')}
      description={t('admin.orders.subtitle')}
      actions={
        <IconButton
          label={t('common.refresh')}
          tooltip={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={list.isLoading}
          onClick={list.reload}
        />
      }
    >
      <Card>
        <VStack gap={4}>
          <OrderFilterBar list={list} />

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
            <OrderTable list={list} onView={setViewed} onRefund={setRefunding} />
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

      {viewed && <OrderDetailDialog order={viewed} onClose={() => setViewed(null)} />}
      {refunding && <RefundDialog order={refunding} onClose={() => setRefunding(null)} onChanged={list.reload} />}
    </Page>
  )
}
