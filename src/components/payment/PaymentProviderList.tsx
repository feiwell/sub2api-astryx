import { useEffect, useMemo, useState } from 'react'
import { createReorderable } from '@astryxdesign/core'
import { Heading } from '@astryxdesign/core/Heading'
import { List } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { ProviderInstance } from '@/types/payment'
import type { TypeOption } from '@/components/payment/providerConfig'
import { getAvailableTypes } from '@/components/payment/providerConfig'
import { useI18n } from '~/i18n'
import { ProviderCard, type ProviderToggleField } from './ProviderCard'
import { usePaymentMethodLabel } from './usePaymentMethodLabel'

interface PaymentProviderListProps {
  providers: ProviderInstance[]
  loading: boolean
  canCreate: boolean
  enabledPaymentTypes: string[]
  allPaymentTypes: TypeOption[]
  redirectLabel: string
  onRefresh: () => void
  onCreate: () => void
  onEdit: (provider: ProviderInstance) => void
  onDelete: (provider: ProviderInstance) => void
  onToggleField: (provider: ProviderInstance, field: ProviderToggleField) => void
  onToggleType: (provider: ProviderInstance, type: string) => void
  onReorder: (updates: { id: number; sort_order: number }[]) => void
}

export function PaymentProviderList({
  providers,
  loading,
  canCreate,
  enabledPaymentTypes,
  allPaymentTypes,
  redirectLabel,
  onRefresh,
  onCreate,
  onEdit,
  onDelete,
  onToggleField,
  onToggleType,
  onReorder,
}: PaymentProviderListProps) {
  const { t } = useI18n()
  const resolveLabel = usePaymentMethodLabel()
  const [localProviders, setLocalProviders] = useState<ProviderInstance[]>(providers)

  useEffect(() => {
    setLocalProviders([...providers])
  }, [providers])

  const reorderable = useMemo(
    () =>
      createReorderable({
        onReorder: ({ key, to }) => {
          const from = localProviders.findIndex(p => p.id === key)
          if (from < 0) return
          const next = [...localProviders]
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          setLocalProviders(next)
          onReorder(next.map((p, idx) => ({ id: p.id, sort_order: idx })))
        },
      }),
    [localProviders, onReorder],
  )

  return (
    <VStack gap={4} hAlign="stretch">
      <HStack gap={3} vAlign="center">
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={2}>{t('admin.settings.payment.providerManagement')}</Heading>
            <Text type="supporting" color="secondary">
              {t('admin.settings.payment.providerManagementDesc')}
            </Text>
          </VStack>
        </StackItem>
        <IconButton
          size="sm"
          label={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={loading}
          onClick={onRefresh}
        />
        <Button
          size="sm"
          variant={canCreate ? 'primary' : 'secondary'}
          label={t('admin.settings.payment.createProvider')}
          isDisabled={!canCreate}
          tooltip={canCreate ? undefined : t('admin.settings.payment.enableTypesFirst')}
          onClick={onCreate}
        />
      </HStack>

      {loading && localProviders.length === 0 ? (
        <HStack hAlign="center">
          <Spinner />
        </HStack>
      ) : localProviders.length > 0 ? (
        <List hasDividers reorderable={reorderable} edge="flush">
          {localProviders.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              enabled={enabledPaymentTypes.includes(p.provider_key)}
              availableTypes={getAvailableTypes(p.provider_key, allPaymentTypes, redirectLabel).map(resolveLabel)}
              onToggleField={field => onToggleField(p, field)}
              onToggleType={type => onToggleType(p, type)}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </List>
      ) : (
        <VStack gap={2} hAlign="center">
          <Text type="supporting">
            {canCreate
              ? t('admin.settings.payment.noProviders')
              : t('admin.settings.payment.enableTypesFirst')}
          </Text>
          {canCreate && (
            <Button
              size="sm"
              variant="primary"
              label={t('admin.settings.payment.createProvider')}
              onClick={onCreate}
            />
          )}
        </VStack>
      )}
    </VStack>
  )
}
