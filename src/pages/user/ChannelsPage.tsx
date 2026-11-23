import { useDeferredValue, useMemo, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { ArrowPathIcon, InboxIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { ChannelList } from './channels/ChannelList'
import { ChannelTable } from './channels/ChannelTable'
import { filterChannels } from './channels/channelsModel'
import { useAvailableChannels } from './channels/useAvailableChannels'

// Below this width the table would have to be dragged sideways; the Vue page changes over at the same one.
const ROOM_FOR_TABLE = '(min-width: 1024px)'

/**
 * The channels the user can reach: per channel its platforms, and per platform the groups the user can use
 * there, with their rates, and the models it serves, with their prices. The list can be searched.
 * Port of views/user/AvailableChannelsView.vue and components/channels/AvailableChannelsTable.vue.
 */
export function ChannelsPage() {
  const { t } = useI18n()
  const list = useAvailableChannels()
  const { channels } = list
  const [search, setSearch] = useState('')
  // Typing stays quick while a long list is filtered.
  const query = useDeferredValue(search)
  const shown = useMemo(() => (channels ? filterChannels(channels, query) : []), [channels, query])
  const hasRoomForTable = useMediaQuery(ROOM_FOR_TABLE, true)
  const loadFailed = t('common.loadFailed')
  const failureText = list.hasFailed ? extractApiErrorMessage(list.failure, loadFailed) : null

  const content = () => {
    if (channels == null) {
      // A failed first load leaves only its banner.
      return (
        list.isLoading && (
          <Center padding={8}>
            <Spinner label={t('common.loading')} />
          </Center>
        )
      )
    }
    if (shown.length === 0) {
      // With channels to search in, nothing shown means nothing matched.
      const isNoMatch = channels.length > 0
      return (
        <Center padding={8}>
          <EmptyState
            isCompact
            headingLevel={5}
            icon={<Icon icon={isNoMatch ? MagnifyingGlassIcon : InboxIcon} size="lg" color="secondary" />}
            title={isNoMatch ? t('availableChannels.tryDifferentSearch') : t('availableChannels.empty')}
          />
        </Center>
      )
    }
    return hasRoomForTable ? (
      <ChannelTable channels={shown} rates={list.rates} search={query} />
    ) : (
      <ChannelList channels={shown} rates={list.rates} />
    )
  }

  return (
    <Page
      title={t('availableChannels.title')}
      description={t('availableChannels.description')}
      actions={
        <IconButton
          label={t('common.refresh')}
          tooltip={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={list.isLoading}
          onClick={list.refresh}
        />
      }
    >
      <Card>
        <VStack gap={4}>
          {/* One field, in a grid so it is as wide as a filter of the other lists. */}
          <Grid columns={{ minWidth: 260, max: 3 }} gap={3}>
            <TextInput
              type="search"
              label={t('common.search')}
              isLabelHidden
              width="100%"
              placeholder={t('availableChannels.searchPlaceholder')}
              startIcon={MagnifyingGlassIcon}
              hasClear
              value={search}
              onChange={setSearch}
            />
          </Grid>

          {failureText != null && (
            <Banner
              status="error"
              title={loadFailed}
              description={failureText !== loadFailed ? failureText : undefined}
              endContent={<Button size="sm" variant="secondary" label={t('common.refresh')} onClick={list.refresh} />}
            />
          )}

          {content()}
        </VStack>
      </Card>
    </Page>
  )
}
