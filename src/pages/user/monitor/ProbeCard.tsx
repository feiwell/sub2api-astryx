import { memo } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { UserMonitorView } from '@/api/channelMonitor'
import { MonitorQuota } from '~/components/monitor/MonitorQuota'
import { monitorStatusVariant } from '~/components/monitor/monitorStatus'
import {
  formatLatencyMs,
  formatMonitorModel,
  formatPercent,
  providerLabel,
  statusLabel,
} from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import { availabilityFill, TIMELINE_LENGTH, type ProbeWindow } from './probeCards'
import { ProbeTimeline } from './ProbeTimeline'
import { ProviderMark } from './ProviderMark'
import { HealthSwatch } from './PulseLegend'

/** One of the two latencies of the latest check. */
function LatencyCell({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="muted" padding={3}>
      <VStack gap={0.5}>
        <Text type="supporting">{label}</Text>
        <Text size="lg" weight="semibold" hasTabularNumbers>
          {value}
        </Text>
      </VStack>
    </Card>
  )
}

/**
 * One monitor: what it checks, how its latest check went, how often its checks passed over the chosen window,
 * and its latest checks one by one. The whole card opens the figures of every model the monitor checks.
 */
export const ProbeCard = memo(function ProbeCard({
  item,
  timeWindow,
  availability,
  isAvailabilityPending,
  showQuota,
  onOpen,
}: {
  item: UserMonitorView
  timeWindow: ProbeWindow
  /** The share of checks that passed over the window, in percent; null when there is none to show. */
  availability: number | null
  /** That share is being fetched, and there is no earlier one to show meanwhile. */
  isAvailabilityPending: boolean
  /** Whether viewers may see the quota of the account behind a monitor. */
  showQuota: boolean
  onOpen: (item: UserMonitorView) => void
}) {
  const { t } = useI18n()
  const history = t('monitorCommon.history60pts', { n: TIMELINE_LENGTH })
  const extraModels = item.extra_models?.length ?? 0

  return (
    <ClickableCard
      label={`${item.name} · ${t('channelStatus.detailTitle')}`}
      padding={5}
      onClick={() => onOpen(item)}
      data-probe-card={item.id}
    >
      {/* A card is as tall as the tallest in its row. The checks stay at its bottom, so they line up along the row. */}
      <VStack gap={4} hAlign="stretch" height="100%">
        <StackItem size="fill">
          <VStack gap={4} hAlign="stretch">
            {/* A long name is cut short; the mark and the status beside it keep their width. */}
            <HStack gap={3} vAlign="start">
              <StackItem size="static">
                <ProviderMark provider={item.provider} />
              </StackItem>
              <StackItem size="fill">
                <VStack gap={1.5}>
                  <Heading level={4} accessibilityLevel={2} maxLines={1} hasTruncateTooltip>
                    {item.name}
                  </Heading>
                  <HStack gap={1.5} vAlign="center" wrap="wrap">
                    <Token size="sm" label={providerLabel(item.provider, t)} />
                    <Text type="code" maxLines={1} hasTruncateTooltip>
                      {formatMonitorModel(item.primary_model, t)}
                    </Text>
                    {item.group_name && <Token size="sm" color="gray" label={item.group_name} />}
                  </HStack>
                </VStack>
              </StackItem>
              <StackItem size="static">
                <Badge
                  variant={monitorStatusVariant(item.primary_status)}
                  label={statusLabel(item.primary_status, t)}
                />
              </StackItem>
            </HStack>

            <Grid columns={2} gap={3}>
              <LatencyCell
                label={t('monitorCommon.dialogLatency')}
                value={formatLatencyMs(item.primary_latency_ms, t)}
              />
              <LatencyCell
                label={t('monitorCommon.endpointPing')}
                value={formatLatencyMs(item.primary_ping_latency_ms, t)}
              />
            </Grid>

            {showQuota && item.latest_quota && <MonitorQuota snapshot={item.latest_quota} />}

            <Divider />

            <VStack gap={1}>
              <HStack gap={3} hAlign="between" vAlign="center">
                <Text type="supporting">
                  {t('monitorCommon.availabilityPrefix')} · {t(`channelStatus.windowTab.${timeWindow}`)}
                </Text>
                {isAvailabilityPending ? (
                  <Skeleton width={88} height={28} aria-label={t('common.loading')} />
                ) : (
                  <HStack gap={2} vAlign="center" data-probe-availability>
                    {availability != null && <HealthSwatch fill={availabilityFill(availability)} />}
                    <Text size="xl" weight="semibold" hasTabularNumbers>
                      {formatPercent(availability)}
                    </Text>
                  </HStack>
                )}
              </HStack>
              {extraModels > 0 && (
                <Text type="supporting">{t('monitorCommon.extraModelsCount', { n: extraModels })}</Text>
              )}
            </VStack>
          </VStack>
        </StackItem>

        <ProbeTimeline points={item.timeline} label={`${item.name} · ${history}`} />
      </VStack>
    </ClickableCard>
  )
})
