import { useCallback, useMemo, useState } from 'react'
import { HStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableGroupedRows, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import type { UserAvailableChannel } from '@/api/channels'
import { useI18n } from '~/i18n'
import { GroupList, ModelList, PlatformBadge } from './ChannelCells'
import { channelRows, type ChannelRow, type GroupRates } from './channelsModel'

const NONE_FOLDED = new Set<string>()
const channelOf = (row: ChannelRow) => row.channel
const keyOf = (row: ChannelRow) => row.key

/**
 * The channels in a wide window: a heading row per channel with its name and description, and under it a
 * row per platform with the groups the user can use there and the models it serves. A channel can be
 * folded away. Port of the table of AvailableChannelsTable.vue, which spans the name over its rows instead.
 */
export function ChannelTable({
  channels,
  rates,
  search,
}: {
  channels: UserAvailableChannel[]
  rates: GroupRates
  /** What the channels were searched for. */
  search: string
}) {
  const { t } = useI18n()
  // Channels folded away under one search are open again under the next, so that no match stays hidden.
  const [foldedUnder, setFoldedUnder] = useState({ search, names: NONE_FOLDED })
  const folded = foldedUnder.search === search ? foldedUnder.names : NONE_FOLDED

  const rows = useMemo(() => channelRows(channels), [channels])
  const descriptions = useMemo(
    () => new Map(channels.map((channel) => [channel.name, channel.description])),
    [channels],
  )

  const toggle = useCallback(
    (name: string) => {
      const names = new Set(folded)
      if (!names.delete(name)) names.add(name)
      setFoldedUnder({ search, names })
    },
    [folded, search],
  )
  const renderHeading = useCallback(
    (name: string) => {
      const description = descriptions.get(name)
      return (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="label" weight="semibold">
            {name}
          </Text>
          {description && (
            <Text type="supporting" color="secondary">
              {description}
            </Text>
          )}
        </HStack>
      )
    },
    [descriptions],
  )
  const grouped = useTableGroupedRows<ChannelRow>({
    data: rows,
    groupBy: channelOf,
    collapsedGroups: folded,
    onToggleGroup: toggle,
    renderGroupHeader: renderHeading,
    getRowKey: keyOf,
  })

  // The platform column has a fixed width. Given a weight instead, the table would be no narrower than
  // the column's floor divided by its small share, which is more than a 1024 window has room for.
  const columns: TableColumn<ChannelRow>[] = [
    {
      key: 'platform',
      header: t('availableChannels.columns.platform'),
      width: pixel(140),
      renderCell: (row) => <PlatformBadge platform={row.section.platform} />,
    },
    {
      key: 'groups',
      header: t('availableChannels.columns.groups'),
      width: proportional(3, { minWidth: 240 }),
      renderCell: (row) => <GroupList groups={row.section.groups} rates={rates} />,
    },
    {
      key: 'models',
      header: t('availableChannels.columns.supportedModels'),
      width: proportional(4, { minWidth: 300 }),
      renderCell: (row) => <ModelList models={row.section.supported_models} />,
    },
  ]

  return (
    <Table<ChannelRow>
      data={grouped.data}
      columns={columns}
      idKey={grouped.idKey}
      dividers="rows"
      verticalAlign="top"
      plugins={{ grouped: grouped.plugin }}
    />
  )
}
