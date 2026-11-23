import { HStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { MonitorUserRow } from '@/api/channelMonitorV2'
import { useI18n } from '~/i18n'
import { RankBadge } from './RankBadge'
import { metricColumns } from './statusColumns'

interface UserItem extends Record<string, unknown> {
  key: string
  row: MonitorUserRow
}

/** The users with the most traffic in the range. The viewer's own row is marked. */
export function StatusUsersTable({ rows, showThroughput }: { rows: MonitorUserRow[]; showThroughput: boolean }) {
  const { t, locale } = useI18n()

  const columns: TableColumn<UserItem>[] = [
    {
      key: 'rank',
      header: t('channelMonitorV2.table.rank'),
      width: pixel(88),
      renderCell: ({ row }) => <RankBadge rank={row.rank} />,
    },
    {
      key: 'user',
      header: t('channelMonitorV2.table.user'),
      width: proportional(1.6, { minWidth: 160 }),
      renderCell: ({ row }) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text weight="semibold" color={row.is_self ? 'accent' : 'primary'}>
            {row.display_label}
          </Text>
          {row.is_self && <Token size="sm" color="blue" label={t('channelMonitorV2.currentUser')} />}
        </HStack>
      ),
    },
    ...metricColumns<UserItem>((item) => item.row.metrics, { t, locale, showThroughput }),
  ]

  return (
    <Table
      // Masked names can repeat, so the position in the ranking is part of the key.
      data={rows.map((row, index) => ({ key: `${index}:${row.user_id || row.display_label}`, row }))}
      columns={columns}
      idKey="key"
    />
  )
}
