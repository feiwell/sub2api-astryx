import { Link } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import type { MonitorModelRow } from '@/api/channelMonitorV2'
import { useI18n } from '~/i18n'
import { metricColumns } from './statusColumns'
import { OTHER_MODELS, healthLegendKey, rowHealthVariant } from './statusFormat'

interface ModelItem extends Record<string, unknown> {
  key: string
  row: MonitorModelRow
}

/** The figures of each model on each platform. Choosing a model narrows the whole page down to it. */
export function StatusModelsTable({
  rows,
  showThroughput,
  onDrill,
}: {
  rows: MonitorModelRow[]
  showThroughput: boolean
  onDrill: (row: MonitorModelRow) => void
}) {
  const { t, locale } = useI18n()

  const columns: TableColumn<ModelItem>[] = [
    {
      key: 'model',
      header: t('channelMonitorV2.table.platformModel'),
      width: proportional(2, { minWidth: 200 }),
      renderCell: ({ row }) => {
        const variant = rowHealthVariant(row.health)
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot variant={variant} label={t(healthLegendKey(variant))} />
            <VStack gap={0}>
              <Text type="supporting">{row.platform}</Text>
              <Link weight="semibold" onClick={() => onDrill(row)}>
                {row.model === OTHER_MODELS ? t('channelMonitorV2.otherModels') : row.model}
              </Link>
            </VStack>
          </HStack>
        )
      },
    },
    ...metricColumns<ModelItem>((item) => item.row.metrics, { t, locale, showThroughput }),
  ]

  return (
    <Table
      data={rows.map((row) => ({ key: `${row.platform}:${row.model}`, row }))}
      columns={columns}
      idKey="key"
      hasHover
    />
  )
}
