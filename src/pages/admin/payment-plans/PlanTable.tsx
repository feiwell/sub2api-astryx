import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Table, pixel, proportional, useTableStickyColumns, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { SubscriptionPlan } from '@/types/payment'
import { useI18n } from '~/i18n'
import { groupPlatformLabel } from '../groups/groupPlatform'
import { planGroup, planOriginalPriceText, planPriceText, validityUnitOf } from './planModel'
import type { PaymentPlans } from './usePaymentPlans'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<SubscriptionPlan, keyof SubscriptionPlan>

// In a narrower window the table scrolls sideways, and the actions stay in reach. Not on a phone: held in
// place there, they would cover most of what is left of the row.
const PINNED_COLUMNS = { endKeys: ['actions'] }
const NO_PINNED_COLUMNS = {}
const ROOM_TO_PIN = '(min-width: 768px)'

/**
 * The subscription plans, in the order they are sold in. A plan is put on sale or taken off straight
 * from its row. Port of the table of views/admin/orders/AdminPaymentPlansView.vue.
 */
export function PlanTable({
  list,
  onEdit,
  onDelete,
}: {
  list: PaymentPlans
  onEdit: (plan: SubscriptionPlan) => void
  onDelete: (plan: SubscriptionPlan) => void
}) {
  const { t } = useI18n()
  const hasRoomToPin = useMediaQuery(ROOM_TO_PIN, true)
  const pinned = useTableStickyColumns<Row>(hasRoomToPin ? PINNED_COLUMNS : NO_PINNED_COLUMNS)
  const rows: Row[] = list.plans

  const groupCell = (row: Row) => {
    const group = planGroup(row, list.groups, list.areGroupsKnown)
    if (group.kind === 'none') {
      return (
        <Text type="supporting" color="secondary">
          -
        </Text>
      )
    }
    if (group.kind === 'number') {
      return (
        <HStack gap={1.5} vAlign="center" wrap="wrap">
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {`#${group.id}`}
          </Text>
          {group.isMissing && <Badge variant="error" label={t('payment.admin.groupMissing')} />}
        </HStack>
      )
    }
    const details = [
      group.platform && groupPlatformLabel(t, group.platform),
      group.rate !== null && `${group.rate}x`,
    ].filter(Boolean)
    return (
      <VStack gap={0.5}>
        <Text type="supporting" maxLines={1} hasTruncateTooltip>
          {group.name}
        </Text>
        {details.length > 0 && (
          <Text type="supporting" color="secondary" hasTabularNumbers maxLines={1} hasTruncateTooltip>
            {details.join(' · ')}
          </Text>
        )}
      </VStack>
    )
  }

  const columns: TableColumn<Row>[] = [
    {
      key: 'id',
      header: 'ID',
      width: pixel(72),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {row.id}
        </Text>
      ),
    },
    {
      key: 'name',
      header: t('payment.admin.planName'),
      width: proportional(2, { minWidth: 140 }),
      renderCell: (row) => (
        <Text type="supporting" weight="medium" maxLines={2} hasTruncateTooltip wordBreak="break-word">
          {row.name}
        </Text>
      ),
    },
    {
      key: 'group_id',
      header: t('payment.admin.group'),
      width: proportional(2, { minWidth: 150 }),
      renderCell: groupCell,
    },
    {
      key: 'price',
      header: t('payment.admin.price'),
      width: proportional(1.5, { minWidth: 130 }),
      renderCell: (row) => {
        const original = planOriginalPriceText(row)
        return (
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Text type="supporting" weight="medium" hasTabularNumbers textWrap="nowrap">
              {planPriceText(row)}
            </Text>
            {row.currency && (
              <Text type="supporting" color="secondary" textWrap="nowrap">
                {row.currency}
              </Text>
            )}
            {original && (
              <Text type="supporting" color="secondary" hasStrikethrough hasTabularNumbers textWrap="nowrap">
                {original}
              </Text>
            )}
          </HStack>
        )
      },
    },
    {
      key: 'validity_days',
      header: t('payment.admin.validity'),
      width: pixel(108),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {`${row.validity_days} ${t(`payment.admin.${validityUnitOf(row.validity_unit)}`)}`}
        </Text>
      ),
    },
    {
      key: 'for_sale',
      header: t('payment.admin.forSale'),
      width: pixel(96),
      renderCell: (row) => (
        <Switch
          // The rows tell their switches apart by the name of the plan.
          label={`${t('payment.admin.forSale')} · ${row.name}`}
          isLabelHidden
          size="sm"
          value={row.for_sale}
          isDisabled={!!list.switching[row.id]}
          onChange={() => void list.toggleForSale(row)}
        />
      ),
    },
    {
      key: 'sort_order',
      header: t('payment.admin.sortOrder'),
      width: pixel(112),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {row.sort_order}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: pixel(104),
      align: 'end',
      renderCell: (row) => (
        <HStack gap={1} vAlign="center" hAlign="end">
          <IconButton
            label={t('common.edit')}
            tooltip={t('common.edit')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={PencilSquareIcon} />}
            onClick={() => onEdit(row)}
          />
          <IconButton
            label={t('common.delete')}
            tooltip={t('common.delete')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={TrashIcon} />}
            onClick={() => onDelete(row)}
          />
        </HStack>
      ),
    },
  ]

  return (
    <Table<Row>
      data={rows}
      columns={columns}
      idKey={(row) => row.id}
      density="compact"
      dividers="rows"
      hasHover
      plugins={{ pinned }}
    />
  )
}
