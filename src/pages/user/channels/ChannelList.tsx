import { Fragment, type ReactNode } from 'react'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { UserAvailableChannel } from '@/api/channels'
import { useI18n } from '~/i18n'
import { GroupList, ModelList, PlatformBadge } from './ChannelCells'
import type { GroupRates } from './channelsModel'

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <VStack gap={1}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      {children}
    </VStack>
  )
}

/**
 * The channels in a narrow window, where the table would have to be dragged sideways: one below the other,
 * each with its platforms, and per platform the groups and the models under their column names.
 * Port of the mobile list of AvailableChannelsTable.vue.
 */
export function ChannelList({ channels, rates }: { channels: UserAvailableChannel[]; rates: GroupRates }) {
  const { t } = useI18n()
  return (
    <VStack gap={4}>
      {channels.map((channel, index) => (
        <Fragment key={channel.name}>
          {index > 0 && <Divider />}
          <VStack gap={4}>
            <VStack gap={0.5}>
              {/* Sized as the title of a card; in the outline it comes right under the title of the page. */}
              <Heading level={4} accessibilityLevel={2}>
                {channel.name}
              </Heading>
              {channel.description && (
                <Text type="supporting" color="secondary">
                  {channel.description}
                </Text>
              )}
            </VStack>
            {channel.platforms.map((section) => (
              <VStack key={section.platform} gap={2}>
                <HStack>
                  <PlatformBadge platform={section.platform} />
                </HStack>
                <Labelled label={t('availableChannels.columns.groups')}>
                  <GroupList groups={section.groups} rates={rates} />
                </Labelled>
                <Labelled label={t('availableChannels.columns.supportedModels')}>
                  <ModelList models={section.supported_models} />
                </Labelled>
              </VStack>
            ))}
          </VStack>
        </Fragment>
      ))}
    </VStack>
  )
}
