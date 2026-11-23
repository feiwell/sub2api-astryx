import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon, PlusIcon, RectangleStackIcon } from '@heroicons/react/24/outline'
import type { SubscriptionPlan } from '@/types/payment'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { DeletePlanDialog } from './payment-plans/DeletePlanDialog'
import { PlanFormDialog } from './payment-plans/PlanFormDialog'
import { PlanTable } from './payment-plans/PlanTable'
import { usePaymentPlans } from './payment-plans/usePaymentPlans'

/**
 * The subscription plans the site sells: what each costs, how long it lasts and which group it
 * subscribes its buyer to. Plans are created, edited, put on sale or taken off, and deleted here.
 * Port of views/admin/orders/AdminPaymentPlansView.vue.
 */
export function AdminPaymentPlansPage() {
  const { t } = useI18n()
  const list = usePaymentPlans()
  // The plan in the form dialog; 'new' while the dialog creates one.
  const [edited, setEdited] = useState<SubscriptionPlan | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SubscriptionPlan | null>(null)
  const loadFailed = t('common.loadFailed')
  const refreshButton = <Button size="sm" variant="secondary" label={t('common.refresh')} onClick={list.reload} />

  return (
    <Page
      title={t('admin.orders.plans.title')}
      description={t('admin.orders.plans.subtitle')}
      actions={
        <HStack gap={2} vAlign="center">
          <IconButton
            label={t('common.refresh')}
            tooltip={t('common.refresh')}
            icon={<Icon icon={ArrowPathIcon} />}
            isLoading={list.isLoading}
            onClick={list.reload}
          />
          <Button
            label={t('payment.admin.createPlan')}
            variant="primary"
            icon={<Icon icon={PlusIcon} />}
            onClick={() => setEdited('new')}
          />
        </HStack>
      }
    >
      <Card>
        <VStack gap={4}>
          {list.failure != null && (
            <Banner
              status="error"
              title={loadFailed}
              description={list.failure !== loadFailed ? list.failure : undefined}
              endContent={refreshButton}
            />
          )}

          {/* Without the groups the plans still list, but no group can be picked for one. */}
          {list.haveGroupsFailed && (
            <Banner status="warning" title={t('admin.groups.failedToLoad')} endContent={refreshButton} />
          )}

          {list.plans.length === 0 ? (
            // A failed first load leaves only its banner.
            (list.isLoading || list.failure == null) && (
              <Center padding={8}>
                {list.isLoading ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <EmptyState
                    isCompact
                    headingLevel={5}
                    icon={<Icon icon={RectangleStackIcon} size="lg" color="secondary" />}
                    title={t('empty.noData')}
                  />
                )}
              </Center>
            )
          ) : (
            <PlanTable list={list} onEdit={setEdited} onDelete={setDeleting} />
          )}
        </VStack>
      </Card>

      {edited && (
        <PlanFormDialog plan={edited === 'new' ? null : edited} list={list} onClose={() => setEdited(null)} />
      )}
      {deleting && <DeletePlanDialog plan={deleting} onClose={() => setDeleting(null)} onDeleted={list.reload} />}
    </Page>
  )
}
