import { Grid } from '@astryxdesign/core/Grid'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { ORDER_TYPE_CHOICES, PAYMENT_TYPE_CHOICES, STATUS_CHOICES, type OrderFilters } from './orderModel'
import type { AdminOrders } from './useAdminOrders'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'

type ChoiceFilter = Exclude<keyof OrderFilters, 'keyword'>

/**
 * The filters of the order list. The search follows the typing after a short pause, or Enter;
 * a choice from a list applies at once.
 */
export function OrderFilterBar({ list }: { list: AdminOrders }) {
  const { t } = useI18n()
  const { filters } = list

  const choiceField = (
    field: ChoiceFilter,
    label: string,
    allLabel: string,
    choices: Array<{ value: string; label: string }>,
  ) => (
    <Selector
      label={label}
      width="100%"
      value={filters[field] || ALL}
      onChange={(value) => list.pick({ [field]: value === ALL ? '' : value } as Partial<OrderFilters>)}
      options={[{ value: ALL, label: allLabel }, ...choices]}
    />
  )

  return (
    <Grid columns={{ minWidth: 190 }} gap={3}>
      <TextInput
        label={t('common.search')}
        width="100%"
        placeholder={t('payment.admin.searchOrders')}
        startIcon={MagnifyingGlassIcon}
        hasClear
        value={filters.keyword}
        onChange={list.editKeyword}
        onEnter={list.search}
      />
      {choiceField(
        'status',
        t('payment.orders.status'),
        t('payment.admin.allStatuses'),
        STATUS_CHOICES.map((status) => ({ value: status, label: t(`payment.status.${status.toLowerCase()}`) })),
      )}
      {choiceField(
        'paymentType',
        t('payment.orders.paymentMethod'),
        t('payment.admin.allPaymentTypes'),
        PAYMENT_TYPE_CHOICES.map((type) => ({ value: type, label: t(`payment.methods.${type}`) })),
      )}
      {choiceField('orderType', t('payment.orders.orderType'), t('payment.admin.allOrderTypes'), [
        { value: ORDER_TYPE_CHOICES[0], label: t('payment.admin.balanceOrder') },
        { value: ORDER_TYPE_CHOICES[1], label: t('payment.admin.subscriptionOrder') },
      ])}
    </Grid>
  )
}
