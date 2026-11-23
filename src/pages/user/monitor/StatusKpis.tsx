import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { HealthState, MonitorSnapshot } from '@/api/channelMonitorV2'
import {
  formatLatencyKpiSecondary,
  formatMonitorMs,
  formatMonitorPercent,
  formatMonitorThroughput,
  formatMonitorTokensPerSecond,
  ttftDisplayState,
} from '@/features/channel-monitor-v2/monitorFormat'
import { healthStateVariant } from '~/components/monitor/monitorStatus'
import { useI18n } from '~/i18n'
import {
  detailParts,
  exactRate,
  exactTokensPerSecond,
  healthLegendKey,
  isMissingValue,
  latencyDetail,
} from './statusFormat'

/**
 * One headline figure: what it measures, the figure, whether it is healthy, and the measures behind it.
 * `exact` is the same figure unshortened, shown on hover.
 */
function MetricCell({
  label,
  value,
  detail,
  state,
  exact,
}: {
  label: string
  value: string
  detail?: string
  state?: HealthState
  exact?: string
}) {
  const { t } = useI18n()
  const parts = detailParts(detail)
  const variant = healthStateVariant(state)
  const figure = <Heading level={3}>{value}</Heading>

  return (
    <Card padding={4}>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Text type="supporting">{label}</Text>
          {state && !isMissingValue(value) && <StatusDot variant={variant} label={t(healthLegendKey(variant))} />}
        </HStack>
        {exact ? <Tooltip content={exact}>{figure}</Tooltip> : figure}
        {parts.length > 1 ? (
          <HStack gap={1} wrap="wrap">
            {parts.map((part) => (
              <Token key={part} size="sm" color="gray" label={part} />
            ))}
          </HStack>
        ) : (
          parts.length === 1 && <Text type="supporting">{parts[0]}</Text>
        )}
      </VStack>
    </Card>
  )
}

/** The headline figures of the filtered traffic. Throughput is left out for viewers who may not see it. */
export function StatusKpis({
  snapshot,
  isLoading,
  showThroughput,
}: {
  snapshot: MonitorSnapshot | null
  isLoading: boolean
  showThroughput: boolean
}) {
  const { t, locale } = useI18n()

  if (!snapshot) {
    if (!isLoading) return null
    return (
      <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3} aria-hidden>
        {Array.from({ length: showThroughput ? 5 : 4 }, (_, index) => (
          <Skeleton key={index} index={index} width="100%" height={104} />
        ))}
      </Grid>
    )
  }

  const { metrics, health } = snapshot
  return (
    <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={3} role="group" aria-label={t('channelMonitorV2.summaryAria')}>
      <MetricCell
        label={t('channelMonitorV2.metrics.successRate')}
        value={formatMonitorPercent(1 - metrics.error_rate)}
        detail={t('channelMonitorV2.metrics.errorRateValue', { value: formatMonitorPercent(metrics.error_rate) })}
        state={health.error_rate}
      />
      <MetricCell
        label={t('channelMonitorV2.metrics.ttftP50')}
        value={formatMonitorMs(metrics.ttft.p50_ms)}
        detail={formatLatencyKpiSecondary(metrics.ttft.avg_ms, metrics.ttft.p90_ms, metrics.ttft.p95_ms)}
        state={ttftDisplayState(health.ttft, metrics.ttft)}
        exact={latencyDetail(metrics.ttft)}
      />
      {showThroughput && (
        <MetricCell
          label={t('channelMonitorV2.metrics.tps')}
          value={formatMonitorTokensPerSecond(metrics.tpm)}
          detail={t('channelMonitorV2.metrics.tpsDetail')}
          exact={exactTokensPerSecond(metrics.tpm, locale)}
        />
      )}
      <MetricCell
        label={t('channelMonitorV2.metrics.cacheRate')}
        value={formatMonitorPercent(metrics.cache_rate)}
        detail={t('channelMonitorV2.metrics.cacheDetail')}
        state={health.cache || health.overall}
      />
      {showThroughput && (
        <MetricCell
          label={t('channelMonitorV2.metrics.rpm')}
          value={formatMonitorThroughput(metrics.rpm)}
          detail={t('channelMonitorV2.metrics.rpmDetail')}
          exact={exactRate(metrics.rpm, locale)}
        />
      )}
    </Grid>
  )
}
