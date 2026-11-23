import type { ReactNode } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { SelectorOption, type SelectorOptionData } from '@astryxdesign/core/Selector'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { Group } from '@/types'
import { formatPeakRateWindow, serverTimezoneLabel } from '@/utils/peak-rate'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'

/**
 * Options and renderers for picking a group in a Selector, shared by the keys
 * table and the key form. Mirrors GroupBadge.vue / GroupOptionItem.vue: the
 * group name with its rate (or the user's own rate next to the default) and
 * the peak-hours surcharge.
 */
export function useGroupOptions(
  groups: Group[],
  userGroupRates: Record<number, number>,
  // A key can sit in a group the user can no longer pick; it still has to show.
  currentGroup?: Group | null,
) {
  const { t } = useI18n()
  const serverUtcOffset = useAppStore((s) => s.publicSettings?.server_utc_offset)

  const listed =
    currentGroup && !groups.some((group) => group.id === currentGroup.id) ? [...groups, currentGroup] : groups
  const groupsById = new Map(listed.map((group) => [String(group.id), group]))

  const options: SelectorOptionData[] = listed.map((group) => ({
    value: String(group.id),
    label: group.name,
    description: group.description || undefined,
  }))

  const userRateOf = (group: Group): number | null => {
    const userRate = userGroupRates[group.id]
    return userRate !== undefined && userRate !== null && userRate !== group.rate_multiplier ? userRate : null
  }

  /** One short badge: the user's own rate after the default one, the plan type, or the plain rate. */
  const rateBadge = (group: Group): ReactNode => {
    const userRate = userRateOf(group)
    if (userRate !== null) return <Badge variant="info" label={`${group.rate_multiplier}x → ${userRate}x`} />
    if (group.subscription_type === 'subscription') {
      return <Badge variant="neutral" label={t('groups.subscription')} />
    }
    return <Badge variant="neutral" label={`${group.rate_multiplier}x`} />
  }

  /** `09:00-18:00 ×1.5 (UTC+08:00)` for a group with a peak-hours surcharge, else an empty string. */
  const peakWindow = (group: Group) => formatPeakRateWindow(group, serverTimezoneLabel(serverUtcOffset))

  const platformLabel = (group: Group) => {
    const key = `admin.groups.platforms.${group.platform}`
    const label = t(key)
    return label === key ? group.platform : label
  }

  const renderOption = (option: SelectorOptionData): ReactNode => {
    const group = groupsById.get(option.value)
    if (!group) return <SelectorOption label={option.label || option.value} />
    const peak = peakWindow(group)
    const details = [group.description, peak && t('common.peakRateTooltip', { window: peak })].filter(Boolean)
    return (
      <SelectorOption
        label={`${group.name} · ${platformLabel(group)}`}
        description={details.length > 0 ? details.join(' · ') : undefined}
        endContent={rateBadge(group)}
      />
    )
  }

  const renderValue = (option: SelectorOptionData): ReactNode => {
    const group = groupsById.get(option.value)
    if (!group) return option.label || option.value
    return (
      <HStack gap={1.5} vAlign="center">
        <Text type="label" maxLines={1}>
          {group.name}
        </Text>
        {rateBadge(group)}
      </HStack>
    )
  }

  return { options, groupsById, peakWindow, renderOption, renderValue }
}
