import { ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { Switch } from '@astryxdesign/core/Switch'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { HStack } from '@astryxdesign/core/Stack'
import { PencilSquareIcon, ServerIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { ProviderInstance } from '@/types/payment'
import type { TypeOption } from '@/components/payment/providerConfig'
import { PAYMENT_MODE_POPUP, PAYMENT_MODE_QRCODE, PAYMENT_MODE_REDIRECT } from '@/components/payment/providerConfig'
import { useI18n } from '~/i18n'

export type ProviderToggleField = 'enabled' | 'refund_enabled' | 'allow_user_refund'

export const PROVIDER_KEY_LABELS: Record<string, string> = {
  easypay: 'admin.settings.payment.providerEasypay',
  alipay: 'admin.settings.payment.providerAlipay',
  wxpay: 'admin.settings.payment.providerWxpay',
  stripe: 'admin.settings.payment.providerStripe',
  airwallex: 'admin.settings.payment.providerAirwallex',
}

interface ProviderCardProps {
  provider: ProviderInstance
  /** Whether the provider's payment type is enabled in the payment settings. */
  enabled: boolean
  availableTypes: TypeOption[]
  onToggleField: (field: ProviderToggleField) => void
  onToggleType: (type: string) => void
  onEdit: () => void
  onDelete: () => void
}

export function ProviderCard({
  provider,
  enabled,
  availableTypes,
  onToggleField,
  onToggleType,
  onEdit,
  onDelete,
}: ProviderCardProps) {
  const { t } = useI18n()

  const keyLabelKey = PROVIDER_KEY_LABELS[provider.provider_key]
  const keyLabel = keyLabelKey ? t(keyLabelKey) : provider.provider_key

  let modeLabel = ''
  if (provider.payment_mode === PAYMENT_MODE_QRCODE) modeLabel = t('admin.settings.payment.modeQRCode')
  else if (provider.payment_mode === PAYMENT_MODE_POPUP) modeLabel = t('admin.settings.payment.modePopup')
  else if (provider.payment_mode === PAYMENT_MODE_REDIRECT) modeLabel = t('admin.settings.payment.modeRedirect')

  const isActive = provider.enabled && enabled
  const supported = Array.isArray(provider.supported_types) ? provider.supported_types : []

  return (
    <ListItem
      itemKey={provider.id}
      isDisabled={!enabled}
      startContent={<Icon icon={ServerIcon} size="sm" color={isActive ? 'success' : 'secondary'} />}
      label={
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text weight="medium">{provider.name}</Text>
          <Text type="supporting">{keyLabel}</Text>
          {modeLabel && <Text type="supporting">· {modeLabel}</Text>}
        </HStack>
      }
      description={
        enabled ? (
          availableTypes.length > 0 && (
            <HStack gap={1} wrap="wrap">
              {availableTypes.map(pt => (
                <ToggleButton
                  key={pt.value}
                  size="sm"
                  label={pt.label}
                  isPressed={supported.includes(pt.value)}
                  onPressedChange={() => onToggleType(pt.value)}
                />
              ))}
            </HStack>
          )
        ) : (
          `${t('admin.settings.payment.typeDisabled')} — ${t('admin.settings.payment.enableTypesFirst')}`
        )
      }
      endContent={
        <HStack gap={4} vAlign="center" wrap="wrap">
          <Switch
            size="sm"
            label={t('common.enabled')}
            value={provider.enabled}
            isDisabled={!enabled}
            onChange={() => onToggleField('enabled')}
          />
          <Switch
            size="sm"
            label={t('admin.settings.payment.refundEnabled')}
            value={provider.refund_enabled}
            isDisabled={!enabled}
            onChange={() => onToggleField('refund_enabled')}
          />
          {provider.refund_enabled && (
            <Switch
              size="sm"
              label={t('admin.settings.payment.allowUserRefund')}
              value={provider.allow_user_refund}
              isDisabled={!enabled}
              onChange={() => onToggleField('allow_user_refund')}
            />
          )}
          <HStack gap={1}>
            <Button
              size="sm"
              variant="ghost"
              label={t('common.edit')}
              icon={<Icon icon={PencilSquareIcon} />}
              isDisabled={!enabled}
              onClick={onEdit}
            />
            <Button
              size="sm"
              variant="ghost"
              label={t('common.delete')}
              icon={<Icon icon={TrashIcon} />}
              isDisabled={!enabled}
              onClick={onDelete}
            />
          </HStack>
        </HStack>
      }
    />
  )
}
