import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useI18n } from '~/i18n'
import type { ContentModerationAPIKeyLoad, ContentModerationRuntimeStatus } from '~/lib/api/admin/riskControl'
import { formatCount, formatMs } from './riskFormat'
import { apiKeyStatusColor, apiKeyStatusLabelKey } from './riskModel'
import { busiestKeyTotal, sortedKeyLoads } from './riskStatus'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<ContentModerationAPIKeyLoad, keyof ContentModerationAPIKeyLoad>

// The two flexible columns share what the fixed ones leave, so the wider minimum sets both.
const KEY_COLUMN_MIN_WIDTH = 140
const TOTAL_COLUMN_MIN_WIDTH = 120
const ACTIVE_COLUMN_WIDTH = 60
const LATENCY_COLUMN_WIDTH = 84

/** The narrowest the key table gets before it scrolls sideways. */
export const KEY_LOAD_TABLE_MIN_WIDTH =
  2 * Math.max(KEY_COLUMN_MIN_WIDTH, TOTAL_COLUMN_MIN_WIDTH) + ACTIVE_COLUMN_WIDTH + 2 * LATENCY_COLUMN_WIDTH

/**
 * How the synchronous audit spreads its calls over the audit keys. A key's bar is measured
 * against the busiest key, so the bars compare the keys with each other.
 */
export function RiskKeyLoadCard({
  status,
  workerCount,
}: {
  status: ContentModerationRuntimeStatus | null
  /** The saved pool size, told until the service reports its own. */
  workerCount: number
}) {
  const { t, locale } = useI18n()
  const count = (value: number | undefined) => formatCount(value ?? 0, locale)
  const loads: Row[] = sortedKeyLoads(status)
  const busiest = busiestKeyTotal(loads)

  const figure = (text: string) => (
    <Text type="supporting" hasTabularNumbers textWrap="nowrap">
      {text}
    </Text>
  )

  const columns: TableColumn<Row>[] = [
    {
      key: 'masked',
      header: t('admin.riskControl.apiKey'),
      // Room for the masked key; the state label wraps under it when the card is narrow.
      width: proportional(1, { minWidth: KEY_COLUMN_MIN_WIDTH }),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="code" textWrap="nowrap">{`#${row.index + 1} ${row.masked || '-'}`}</Text>
          <Token size="sm" color={apiKeyStatusColor(row.status)} label={t(apiKeyStatusLabelKey(row.status))} />
        </HStack>
      ),
    },
    {
      key: 'total',
      header: t('admin.riskControl.preBlockKeyTotalShort'),
      width: proportional(1, { minWidth: TOTAL_COLUMN_MIN_WIDTH }),
      renderCell: (row) => (
        <VStack gap={1} hAlign="stretch">
          <ProgressBar label={row.masked || `#${row.index + 1}`} isLabelHidden value={row.total || 0} max={busiest} />
          <Text type="supporting" hasTabularNumbers>
            {t('admin.riskControl.preBlockAPIKeyTotals', {
              total: count(row.total),
              success: count(row.success),
              errors: count(row.errors),
            })}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'active',
      header: t('admin.riskControl.preBlockKeyActiveShort'),
      width: pixel(ACTIVE_COLUMN_WIDTH),
      align: 'end',
      renderCell: (row) => figure(count(row.active)),
    },
    {
      key: 'avg_latency_ms',
      header: t('admin.riskControl.preBlockKeyAvgShort'),
      width: pixel(LATENCY_COLUMN_WIDTH),
      align: 'end',
      renderCell: (row) => figure(formatMs(row.avg_latency_ms, locale)),
    },
    {
      key: 'last_latency_ms',
      header: t('admin.riskControl.preBlockKeyLastShort'),
      width: pixel(LATENCY_COLUMN_WIDTH),
      align: 'end',
      renderCell: (row) => figure(formatMs(row.last_latency_ms, locale)),
    },
  ]

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={4}>{t('admin.riskControl.preBlockAPIKeyLoad')}</Heading>
          <Text type="supporting">{t('admin.riskControl.preBlockAPIKeyLoadHint')}</Text>
          <Text type="supporting" hasTabularNumbers>
            {t('admin.riskControl.preBlockAPIKeyLoadSummary', {
              active: count(status?.pre_block_api_key_active),
              available: count(status?.pre_block_api_key_available_count),
              total: count(status?.pre_block_api_key_total_calls),
              workerActive: count(status?.active_workers),
              workerTotal: count(status?.worker_count ?? workerCount),
            })}
          </Text>
        </VStack>
        {loads.length > 0 ? (
          <Table<Row>
            data={loads}
            columns={columns}
            idKey={(row) => row.key_hash || String(row.index)}
            density="compact"
            dividers="rows"
          />
        ) : (
          <Text type="supporting">{t('admin.riskControl.preBlockAPIKeyLoadEmpty')}</Text>
        )}
      </VStack>
    </Card>
  )
}
