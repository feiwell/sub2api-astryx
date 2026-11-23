import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { KEY_LOAD_TABLE_MIN_WIDTH, RiskKeyLoadCard } from './RiskKeyLoadCard'
import { engineLabel } from './riskModel'
import { RiskOverview, RiskOverviewSkeleton } from './RiskOverview'
import { RiskPreBlockCard } from './RiskPreBlockCard'
import { isEngineUnavailable, runtimeModeOf } from './riskStatus'
import { RiskWorkerCard } from './RiskWorkerCard'
import type { RiskControl } from './useRiskControl'

const RUNTIME_SKELETON_HEIGHT = 240
// The two runtime cards sit side by side only while the key table fits its card. A table in a
// card runs from edge to edge, so the card may be as narrow as the table.
const RUNTIME_CARD_MIN_WIDTH = KEY_LOAD_TABLE_MIN_WIDTH

/**
 * The upper half of the risk control page: which engine audits, the saved setup at a glance, and
 * the running counters of the mode in use. A failed load shows as a failure, never as defaults
 * that could be mistaken for the saved setup.
 */
export function RiskSummary({ control, logsTotal }: { control: RiskControl; logsTotal: number | null }) {
  const { t } = useI18n()
  const { config, status } = control

  if (!config) {
    if (control.isLoading) {
      return (
        <VStack gap={6} hAlign="stretch" aria-hidden>
          <RiskOverviewSkeleton />
          <Skeleton width="100%" height={RUNTIME_SKELETON_HEIGHT} />
        </VStack>
      )
    }
    const title = t('admin.riskControl.loadFailed')
    return (
      <Banner
        status="error"
        title={title}
        description={control.failure && control.failure !== title ? control.failure : undefined}
        endContent={<Button size="sm" variant="secondary" label={t('common.refresh')} onClick={control.reload} />}
      />
    )
  }

  const mode = runtimeModeOf(status, config)
  return (
    <VStack gap={6} hAlign="stretch">
      <VStack gap={2} hAlign="stretch">
        <Text type="supporting">
          {`${t('admin.riskControl.activeEngine', { engine: engineLabel(status?.engine ?? config.engine) })} · ${t('admin.riskControl.autoRefresh')}`}
        </Text>
        {isEngineUnavailable(status) && <Banner status="warning" title={t('admin.riskControl.engineUnavailable')} />}
      </VStack>

      <RiskOverview config={config} status={status} logsTotal={logsTotal} />

      {mode === 'pre_block' && (
        <Grid columns={{ minWidth: RUNTIME_CARD_MIN_WIDTH, max: 2 }} gap={4}>
          <RiskPreBlockCard status={status} />
          <RiskKeyLoadCard status={status} workerCount={config.worker_count} />
        </Grid>
      )}
      {mode === 'observe' && <RiskWorkerCard status={status} config={config} />}
    </VStack>
  )
}
