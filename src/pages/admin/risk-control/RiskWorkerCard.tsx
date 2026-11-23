import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { ContentModerationConfig, ContentModerationRuntimeStatus } from '~/lib/api/admin/riskControl'
import { formatCount, formatPercent } from './riskFormat'
import { RiskStatCell } from './RiskStatCell'
import { queueUsagePercent, workerSlots, type WorkerSlotState } from './riskStatus'

const SLOT_COLOR: Record<WorkerSlotState, 'blue' | 'green' | 'gray'> = { active: 'blue', idle: 'green', disabled: 'gray' }
const SLOT_TEXT: Record<WorkerSlotState, string> = {
  active: 'admin.riskControl.workerActive',
  idle: 'admin.riskControl.workerIdle',
  disabled: 'admin.riskControl.workerDisabled',
}

/**
 * The async side of the audit: the queue of audit and record tasks, and the workers that empty it.
 * The synchronous pre-block audit does not pass through here.
 */
export function RiskWorkerCard({
  status,
  config,
}: {
  status: ContentModerationRuntimeStatus | null
  /** The saved sizes, told until the service reports its own. */
  config: Pick<ContentModerationConfig, 'worker_count' | 'queue_size'>
}) {
  const { t, locale } = useI18n()
  const count = (value: number | undefined) => formatCount(value ?? 0, locale)
  const usage = queueUsagePercent(status)
  const slots = workerSlots(status, config)
  const workerTotal = status?.worker_count ?? config.worker_count
  const idleWorkers = status?.idle_workers ?? config.worker_count
  const lastCleanup = status?.last_cleanup_at ? formatDateTime(status.last_cleanup_at) || '-' : ''

  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={4}>{t('admin.riskControl.workerStatus')}</Heading>
            <Text type="supporting">{t('admin.riskControl.workerStatusHint')}</Text>
          </VStack>
          {lastCleanup && (
            <Text type="supporting" hasTabularNumbers>
              {t('admin.riskControl.lastCleanup', { time: lastCleanup })}
            </Text>
          )}
        </HStack>

        <Grid columns={{ minWidth: 320, max: 2 }} gap={6}>
          <VStack gap={4} hAlign="stretch">
            <VStack gap={1} hAlign="stretch">
              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <Text weight="medium">{t('admin.riskControl.queueUsage')}</Text>
                <Text type="supporting" hasTabularNumbers>
                  {`${count(status?.queue_length)} / ${count(status?.queue_size ?? config.queue_size)} · ${formatPercent(usage)}`}
                </Text>
              </HStack>
              <ProgressBar label={t('admin.riskControl.queueUsage')} isLabelHidden value={usage} max={100} />
            </VStack>
            <Grid columns={{ minWidth: 120, repeat: 'fit' }} gap={4}>
              <RiskStatCell label={t('admin.riskControl.activeWorkers')} value={count(status?.active_workers)} />
              <RiskStatCell label={t('admin.riskControl.idleWorkers')} value={count(idleWorkers)} />
              <RiskStatCell label={t('admin.riskControl.processed')} value={count(status?.processed)} />
              <RiskStatCell
                label={t('admin.riskControl.droppedErrors')}
                value={count((status?.dropped ?? 0) + (status?.errors ?? 0))}
              />
            </Grid>
          </VStack>

          <VStack gap={3} hAlign="stretch">
            <VStack gap={0.5}>
              <Text weight="medium">{t('admin.riskControl.workerPool')}</Text>
              <Text type="supporting" hasTabularNumbers>
                {t('admin.riskControl.workerPoolMeta', {
                  active: count(status?.active_workers),
                  idle: count(idleWorkers),
                  total: count(workerTotal),
                })}
              </Text>
            </VStack>
            {/* The colour repeats what the line above counts; each slot also tells its state on hover. */}
            <HStack gap={1} wrap="wrap">
              {slots.map((slot) => (
                <Tooltip key={slot.id} content={t(SLOT_TEXT[slot.state])}>
                  <Token size="sm" color={SLOT_COLOR[slot.state]} label={`#${slot.id}`} description={t(SLOT_TEXT[slot.state])} />
                </Tooltip>
              ))}
            </HStack>
          </VStack>
        </Grid>
      </VStack>
    </Card>
  )
}
