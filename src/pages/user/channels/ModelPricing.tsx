import { Badge } from '@astryxdesign/core/Badge'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { UserSupportedModel } from '@/api/channels'
import { platformLabel } from '@/utils/platformColors'
import { useI18n } from '~/i18n'
import { billingModeKey, priceLines, tierLines } from './channelsModel'

function Line({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap={4} hAlign="between" vAlign="center">
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text type="supporting" color="primary" weight="medium" hasTabularNumbers textWrap="nowrap">
        {value}
      </Text>
    </HStack>
  )
}

/**
 * What a model costs on a channel: how it is billed, its prices, and its tiers where the price depends on
 * the size of the request. Shown when a model is pointed at. Port of the popover of SupportedModelChip.vue.
 */
export function ModelPricing({ model }: { model: UserSupportedModel }) {
  const { t } = useI18n()
  const text = (key: string) => t(`availableChannels.pricing.${key}`)
  const { pricing } = model
  const mode = pricing ? billingModeKey(pricing) : null
  const tiers = pricing ? tierLines(pricing) : []

  return (
    <VStack gap={1.5} hAlign="stretch">
      <HStack gap={4} hAlign="between" vAlign="center">
        <Text type="label">{model.name}</Text>
        {model.platform && <Badge variant="neutral" label={platformLabel(model.platform)} />}
      </HStack>
      <Divider />
      {pricing == null ? (
        <Text type="supporting" color="secondary">
          {t('availableChannels.noPricing')}
        </Text>
      ) : (
        <>
          <Line label={text('billingMode')} value={mode ? text(mode) : '-'} />
          {priceLines(pricing).map((line) => (
            <Line
              key={line.label}
              label={text(line.label)}
              value={line.unit ? `${line.amount} ${text(line.unit)}` : line.amount}
            />
          ))}
          {tiers.length > 0 && (
            <>
              <Divider />
              <Text type="supporting" weight="medium">
                {text('intervals')}
              </Text>
              {tiers.map((tier, index) => (
                <Line
                  key={index}
                  label={tier.label}
                  value={tier.unit ? `${tier.amount} ${text(tier.unit)}` : tier.amount}
                />
              ))}
            </>
          )}
        </>
      )}
    </VStack>
  )
}
