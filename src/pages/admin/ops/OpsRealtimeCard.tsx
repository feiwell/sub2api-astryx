import { useEffect, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { opsAPI, type OpsRateSummary } from '~/lib/api/admin/ops'
import { OpsCardHeader, OpsFacts } from './OpsStatCard'
import { realtimeWindowsFor, type OpsTimeRange, type RealtimeWindow } from './filters'
import { formatRate } from './health'

interface Rates {
  qps: OpsRateSummary
  tps: OpsRateSummary
}

const ZERO: OpsRateSummary = { current: 0, peak: 0, avg: 0 }
const ZERO_RATES: Rates = { qps: ZERO, tps: ZERO }

/** Requests and tokens per second over the last minutes: now, at the peak and on average. */
export function OpsRealtimeCard({
  timeRange,
  platform,
  groupId,
  refreshKey,
  isEnabled,
  onDisabled,
}: {
  timeRange: OpsTimeRange
  platform: string
  groupId: number | null
  /** Changes on every page refresh; the card reloads with it. */
  refreshKey: number
  /** Realtime monitoring can be switched off in the settings; the card then shows zeros. */
  isEnabled: boolean
  /** The backend reported realtime monitoring as switched off. */
  onDisabled: () => void
}) {
  const { t } = useI18n()
  const spans = realtimeWindowsFor(timeRange)
  // Every change of the time range starts at one minute again. The reset happens while rendering,
  // so the card never loads the old window for the new range.
  const [choice, setChoice] = useState<RealtimeWindow>('1min')
  const [choiceTimeRange, setChoiceTimeRange] = useState(timeRange)
  if (choiceTimeRange !== timeRange) {
    setChoiceTimeRange(timeRange)
    setChoice('1min')
  }
  const span = spans.includes(choice) ? choice : '1min'
  const [loaded, setLoaded] = useState<Rates | null>(null)

  // timeRange and refreshKey are not sent; they are here so a new range or a refresh reloads the card.
  useEffect(() => {
    if (!isEnabled) return
    let cancelled = false
    opsAPI
      .getRealtimeTrafficSummary(span, platform, groupId)
      .then((res) => {
        if (cancelled) return
        if (res?.enabled === false) onDisabled()
        setLoaded(res?.summary ? { qps: res.summary.qps, tps: res.summary.tps } : null)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[ops] failed to load realtime traffic', error)
        setLoaded(null)
      })
    return () => {
      cancelled = true
    }
  }, [isEnabled, span, platform, groupId, timeRange, refreshKey, onDisabled])

  const rates = isEnabled ? loaded : ZERO_RATES
  const tpsLabel = t('admin.ops.tps')

  return (
    <Card>
      <VStack gap={3}>
        <OpsCardHeader
          title={t('admin.ops.realtime')}
          help={t('admin.ops.tooltips.qps')}
          action={
            <SegmentedControl
              label={t('admin.ops.window')}
              size="sm"
              value={span}
              onChange={(next) => {
                const picked = spans.find((item) => item === next)
                if (picked) setChoice(picked)
              }}
            >
              {spans.map((item) => (
                <SegmentedControlItem key={item} value={item} label={item} />
              ))}
            </SegmentedControl>
          }
        />
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            {t('admin.ops.current')}
          </Text>
          <HStack gap={5} vAlign="end" wrap="wrap">
            <CurrentRate value={formatRate(rates?.qps?.current, '0.0')} unit="QPS" />
            <CurrentRate value={formatRate(rates?.tps?.current, '0.0')} unit={tpsLabel} />
          </HStack>
        </VStack>
        <HStack gap={6} wrap="wrap">
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              {t('admin.ops.peak')}
            </Text>
            <OpsFacts
              facts={[
                { label: 'QPS', value: formatRate(rates?.qps?.peak) },
                { label: tpsLabel, value: formatRate(rates?.tps?.peak) },
              ]}
            />
          </VStack>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              {t('admin.ops.average')}
            </Text>
            <OpsFacts
              facts={[
                { label: 'QPS', value: formatRate(rates?.qps?.avg) },
                { label: tpsLabel, value: formatRate(rates?.tps?.avg) },
              ]}
            />
          </VStack>
        </HStack>
        {!isEnabled && (
          <Text type="supporting" color="secondary">
            {t('admin.ops.concurrency.disabledHint')}
          </Text>
        )}
      </VStack>
    </Card>
  )
}

function CurrentRate({ value, unit }: { value: string; unit: string }) {
  return (
    <HStack gap={1} vAlign="end">
      <Heading level={2}>{value}</Heading>
      <Text type="supporting" color="secondary">
        {unit}
      </Text>
    </HStack>
  )
}
