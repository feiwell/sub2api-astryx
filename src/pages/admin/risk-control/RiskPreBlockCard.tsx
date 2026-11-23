import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import type { ContentModerationRuntimeStatus } from '~/lib/api/admin/riskControl'
import { formatCount, formatMs } from './riskFormat'
import { RiskStatCell } from './RiskStatCell'

const CELL_MIN_WIDTH = 132

/**
 * The counters of the synchronous audit, the one that runs before a request is let through.
 * They count since the service started; the async record tasks are not among them.
 */
export function RiskPreBlockCard({ status }: { status: ContentModerationRuntimeStatus | null }) {
  const { t, locale } = useI18n()
  const count = (value: number | undefined) => formatCount(value ?? 0, locale)

  const cells = [
    { key: 'active', value: count(status?.pre_block_active), label: 'preBlockActive' },
    { key: 'checked', value: count(status?.pre_block_checked), label: 'preBlockChecked' },
    { key: 'allowed', value: count(status?.pre_block_allowed), label: 'preBlockAllowed' },
    { key: 'blocked', value: count(status?.pre_block_blocked), label: 'preBlockBlocked' },
    { key: 'errors', value: count(status?.pre_block_errors), label: 'preBlockErrors' },
    { key: 'latency', value: formatMs(status?.pre_block_avg_latency_ms ?? 0, locale), label: 'preBlockAvgLatency' },
  ]

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={4}>{t('admin.riskControl.preBlockSyncStatus')}</Heading>
          <Text type="supporting">{t('admin.riskControl.preBlockSyncHint')}</Text>
        </VStack>
        <Grid columns={{ minWidth: CELL_MIN_WIDTH, repeat: 'fit' }} gap={4}>
          {cells.map((cell) => (
            <RiskStatCell
              key={cell.key}
              label={t(`admin.riskControl.${cell.label}`)}
              value={cell.value}
              hint={t(`admin.riskControl.${cell.label}Hint`)}
            />
          ))}
        </Grid>
      </VStack>
    </Card>
  )
}
