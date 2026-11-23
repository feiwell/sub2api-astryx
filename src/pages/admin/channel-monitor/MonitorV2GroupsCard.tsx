import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { Heading } from '@astryxdesign/core/Heading'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { MonitorConfig } from '@/api/channelMonitorV2'
import type { AdminGroup } from '@/types'
import { useI18n } from '~/i18n'
import { settingsPlatformName, unlistedGroupIds, withGroups } from './monitorV2Settings'

// The card beside this one lists the 17 kinds of error in full. A list of groups about as long is shown in
// full too; a longer one scrolls inside the card, at about the height of that list.
const LIST_MAX_ROWS = 16
const LIST_HEIGHT = 480

/** The groups whose traffic the monitor reads. With none ticked it reads all of them. Changes the draft only. */
export function MonitorV2GroupsCard({
  config,
  groups,
  onChange,
  isDisabled,
}: {
  config: MonitorConfig
  groups: AdminGroup[]
  onChange: (edit: (config: MonitorConfig) => MonitorConfig) => void
  isDisabled: boolean
}) {
  const { t } = useI18n()
  const count = config.group_ids.length
  const rows = [
    // Groups deleted since they were ticked: listed by id, so they can be unticked.
    ...unlistedGroupIds(config, groups).map((id) => ({ id, name: `#${id}`, note: '' })),
    ...groups.map((group) => ({
      id: group.id,
      name: group.name,
      note: `${settingsPlatformName(group.platform)} · #${group.id}`,
    })),
  ]

  const list = (
    <CheckboxList
      label={t('channelMonitorV2.settings.groupsTitle')}
      isLabelHidden
      density="compact"
      value={config.group_ids.map(String)}
      onChange={(values) => onChange((current) => withGroups(current, values.map(Number)))}
      isDisabled={isDisabled}
    >
      {rows.map((row) => (
        <CheckboxListItem
          key={row.id}
          value={String(row.id)}
          label={row.name}
          endContent={
            row.note ? (
              <Text type="supporting" color="secondary">
                {row.note}
              </Text>
            ) : undefined
          }
        />
      ))}
    </CheckboxList>
  )

  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={3} hAlign="between" vAlign="start">
          <VStack gap={0.5}>
            <Heading level={4}>{t('channelMonitorV2.settings.groupsTitle')}</Heading>
            <Text type="supporting" color="secondary">
              {count > 0
                ? t('channelMonitorV2.settings.groupsSelected', { count })
                : t('channelMonitorV2.settings.groupsAll')}
            </Text>
          </VStack>
          {count > 0 && (
            <Button
              label={t('channelMonitorV2.settings.groupsAll')}
              variant="ghost"
              size="sm"
              isDisabled={isDisabled}
              onClick={() => onChange((current) => withGroups(current, []))}
            />
          )}
        </HStack>

        {rows.length === 0 ? (
          <Text type="supporting">{t('channelMonitorV2.settings.groupsEmpty')}</Text>
        ) : rows.length > LIST_MAX_ROWS ? (
          <ScrollableArea label={t('channelMonitorV2.settings.groupsTitle')} height={LIST_HEIGHT}>
            {list}
          </ScrollableArea>
        ) : (
          list
        )}
      </VStack>
    </Card>
  )
}
