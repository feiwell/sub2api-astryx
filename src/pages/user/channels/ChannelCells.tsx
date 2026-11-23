import type { ComponentProps } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { HoverCard } from '@astryxdesign/core/HoverCard'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { ClockIcon, GlobeAltIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import type { UserAvailableGroup, UserSupportedModel } from '@/api/channels'
import { formatPeakRateWindow, serverTimezoneLabel } from '@/utils/peak-rate'
import { platformLabel } from '@/utils/platformColors'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { ModelPricing } from './ModelPricing'
import { isSubscriptionGroup, ownRateOf, rateText, splitGroups, type GroupRates } from './channelsModel'

type IconSource = ComponentProps<typeof Icon>['icon']

/** The platform a row of a channel is about. */
export function PlatformBadge({ platform }: { platform: string }) {
  return <Badge variant="neutral" label={platformLabel(platform)} />
}

/**
 * A group with its rate, and after it the hours its rate is raised in, where it has such hours.
 * Mirrors GroupBadge.vue with the peak chip of AvailableChannelsTable.vue.
 */
function GroupToken({ group, rates, timezone }: { group: UserAvailableGroup; rates: GroupRates; timezone: string }) {
  const { t } = useI18n()
  const rate = rateText(group, rates)
  // Empty for a group without peak hours.
  const peak = formatPeakRateWindow(group, timezone)
  return (
    // No wider than the line it is on, so that a long name is cut short instead of sticking out.
    <HStack gap={1} vAlign="center" wrap="wrap" maxWidth="100%">
      <Token
        size="sm"
        // A rate of the user's own stands out from the default ones around it.
        color={ownRateOf(group, rates) === null ? 'default' : 'blue'}
        label={group.name}
        endContent={
          <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
            {isSubscriptionGroup(group) ? `${t('groups.subscription')} · ${rate}` : rate}
          </Text>
        }
      />
      {/* A tab stop, so that the note on the peak hours is within reach of the keyboard too. */}
      {peak && (
        <Tooltip content={t('common.peakRateTooltip', { window: peak }) + t('common.peakRateImageNote')}>
          <Token size="sm" color="yellow" icon={<Icon icon={ClockIcon} size="xsm" />} label={peak} tabIndex={0} />
        </Tooltip>
      )}
    </HStack>
  )
}

function GroupLine({
  icon,
  label,
  hint,
  groups,
  rates,
  timezone,
}: {
  icon: IconSource
  label: string
  /** What this kind of group is, told when the label is pointed at. */
  hint: string
  groups: UserAvailableGroup[]
  rates: GroupRates
  timezone: string
}) {
  return (
    <HStack gap={1.5} vAlign="center" wrap="wrap">
      <HStack gap={1} vAlign="center">
        <Icon icon={icon} size="sm" color="secondary" />
        <Text type="supporting" color="secondary" textWrap="nowrap">
          <Tooltip content={hint}>{label}</Tooltip>
        </Text>
      </HStack>
      {groups.map((group) => (
        <GroupToken key={group.id} group={group} rates={rates} timezone={timezone} />
      ))}
    </HStack>
  )
}

/**
 * The groups of one platform the user can use on a channel: the ones granted to the user first, then the
 * ones open to everyone.
 */
export function GroupList({ groups, rates }: { groups: UserAvailableGroup[]; rates: GroupRates }) {
  const { t } = useI18n()
  // Peak hours are the server's, so they are told with its timezone.
  const timezone = serverTimezoneLabel(useAppStore((s) => s.publicSettings?.server_utc_offset))
  const { exclusive, open } = splitGroups(groups)

  if (groups.length === 0) {
    return (
      <Text type="supporting" color="secondary">
        -
      </Text>
    )
  }
  return (
    <VStack gap={2}>
      {exclusive.length > 0 && (
        <GroupLine
          icon={ShieldCheckIcon}
          label={t('availableChannels.exclusive')}
          hint={t('availableChannels.exclusiveTooltip')}
          groups={exclusive}
          rates={rates}
          timezone={timezone}
        />
      )}
      {open.length > 0 && (
        <GroupLine
          icon={GlobeAltIcon}
          label={t('availableChannels.public')}
          hint={t('availableChannels.publicTooltip')}
          groups={open}
          rates={rates}
          timezone={timezone}
        />
      )}
    </VStack>
  )
}

/** The models of one platform a channel serves. Pointing at one, or moving the focus to it, shows its prices. */
export function ModelList({ models }: { models: UserSupportedModel[] }) {
  const { t } = useI18n()
  if (models.length === 0) {
    return (
      <Text type="supporting" color="secondary">
        {t('availableChannels.noModels')}
      </Text>
    )
  }
  return (
    <HStack gap={1.5} wrap="wrap">
      {models.map((model, index) => (
        // The position is part of the key: nothing promises that a model is listed once.
        <HoverCard key={`${index}/${model.name}`} content={<ModelPricing model={model} />} label={model.name}>
          <Token size="sm" label={model.name} tabIndex={0} />
        </HoverCard>
      ))}
    </HStack>
  )
}
