import { VStack } from '@astryxdesign/core/Stack'
import { proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { MonitorMetric } from '@/api/channelMonitorV2'
import {
  formatMonitorMs,
  formatMonitorPercent,
  formatMonitorThroughput,
  formatMonitorTokensPerSecond,
} from '@/features/channel-monitor-v2/monitorFormat'
import { exactTokensPerSecond, isMissingValue, latencyDetail } from './statusFormat'

/**
 * The figure columns the models table and the user ranking share. The two throughput columns are left out for
 * viewers who may not see throughput.
 */
export function metricColumns<T extends Record<string, unknown>>(
  metricsOf: (item: T) => MonitorMetric,
  {
    t,
    locale,
    showThroughput,
  }: {
    t: (key: string, params?: Record<string, unknown>) => string
    locale: string
    showThroughput: boolean
  },
): TableColumn<T>[] {
  const success: TableColumn<T> = {
    key: 'success',
    header: t('channelMonitorV2.metrics.successRate'),
    width: proportional(1, { minWidth: 110 }),
    renderCell: (item) => {
      const metrics = metricsOf(item)
      return (
        <VStack gap={0}>
          <Text hasTabularNumbers>{formatMonitorPercent(1 - metrics.error_rate)}</Text>
          <Text type="supporting">
            {t('channelMonitorV2.metrics.errorRateValue', { value: formatMonitorPercent(metrics.error_rate) })}
          </Text>
        </VStack>
      )
    },
  }
  const ttft: TableColumn<T> = {
    key: 'ttft',
    header: t('channelMonitorV2.metrics.ttftP50'),
    width: proportional(2, { minWidth: 250 }),
    renderCell: (item) => {
      const metrics = metricsOf(item)
      const detail = latencyDetail(metrics.ttft)
      return (
        <VStack gap={0}>
          <Text hasTabularNumbers>{formatMonitorMs(metrics.ttft.p50_ms)}</Text>
          {!isMissingValue(detail) && <Text type="supporting">{detail}</Text>}
        </VStack>
      )
    },
  }
  const tps: TableColumn<T> = {
    key: 'tps',
    header: t('channelMonitorV2.metrics.tps'),
    width: proportional(0.7, { minWidth: 80 }),
    renderCell: (item) => {
      const { tpm } = metricsOf(item)
      return (
        <Tooltip content={exactTokensPerSecond(tpm, locale)}>
          <Text hasTabularNumbers>{formatMonitorTokensPerSecond(tpm)}</Text>
        </Tooltip>
      )
    },
  }
  const cache: TableColumn<T> = {
    key: 'cache',
    header: t('channelMonitorV2.metrics.cacheRate'),
    width: proportional(0.7, { minWidth: 80 }),
    renderCell: (item) => <Text hasTabularNumbers>{formatMonitorPercent(metricsOf(item).cache_rate)}</Text>,
  }
  const rpm: TableColumn<T> = {
    key: 'rpm',
    header: t('channelMonitorV2.metrics.rpm'),
    width: proportional(0.7, { minWidth: 80 }),
    renderCell: (item) => <Text hasTabularNumbers>{formatMonitorThroughput(metricsOf(item).rpm)}</Text>,
  }
  return showThroughput ? [success, ttft, tps, cache, rpm] : [success, ttft, cache]
}
