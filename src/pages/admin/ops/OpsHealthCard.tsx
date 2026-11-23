import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Popover } from '@astryxdesign/core/Popover'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { LightBulbIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import type { OpsDashboardOverview } from '~/lib/api/admin/ops'
import { OpsCardHeader } from './OpsStatCard'
import { buildDiagnosis, finite, healthTone, isSystemIdle, type DiagnosisItem, type OpsTone } from './health'

const DIAGNOSIS_TONE: Record<DiagnosisItem['type'], OpsTone | 'accent'> = {
  critical: 'error',
  warning: 'warning',
  info: 'accent',
}

const DIAGNOSIS_LABEL_KEY: Record<DiagnosisItem['type'], string> = {
  critical: 'common.critical',
  warning: 'common.warning',
  info: 'common.info',
}

/** Overall health score with the diagnosis the current figures lead to. */
export function OpsHealthCard({ overview }: { overview: OpsDashboardOverview }) {
  const { t } = useI18n()
  const isIdle = isSystemIdle(overview)
  const score = finite(overview.health_score)
  const tone = healthTone(overview)
  const status = isIdle
    ? t('admin.ops.idleStatus')
    : score == null
      ? t('admin.ops.noData')
      : score >= 90
        ? t('admin.ops.healthyStatus')
        : t('admin.ops.riskyStatus')

  const diagnosis = buildDiagnosis(overview, t)
  const issues = diagnosis.filter((item) => item.type !== 'info')
  const hasCritical = issues.some((item) => item.type === 'critical')

  return (
    <Card>
      <VStack gap={3}>
        <OpsCardHeader
          title={t('admin.ops.healthCondition')}
          help={t('admin.ops.healthHelp')}
          action={
            <Popover
              label={t('admin.ops.diagnosis.title')}
              alignment="end"
              width={380}
              content={<DiagnosisList items={diagnosis} />}
            >
              <Button
                label={t('admin.ops.diagnosis.title')}
                variant="ghost"
                size="sm"
                icon={<Icon icon={LightBulbIcon} />}
                endContent={
                  issues.length > 0 ? (
                    <Badge label={issues.length} variant={hasCritical ? 'error' : 'warning'} />
                  ) : undefined
                }
              />
            </Popover>
          }
        />
        <HStack gap={2} vAlign="center">
          <StatusDot variant={tone} label={status} />
          <Heading level={2}>{isIdle ? status : (score ?? '--')}</Heading>
          {!isIdle && (
            <Text type="supporting" color="secondary">
              {status}
            </Text>
          )}
        </HStack>
        <ProgressBar label={t('admin.ops.health')} isLabelHidden value={isIdle ? 0 : (score ?? 0)} variant={tone} />
        <VStack gap={1}>
          {diagnosis.slice(0, 3).map((item) => (
            <DiagnosisHeadline key={item.key} item={item} />
          ))}
        </VStack>
      </VStack>
    </Card>
  )
}

function DiagnosisHeadline({ item, isStrong = false }: { item: DiagnosisItem; isStrong?: boolean }) {
  const { t } = useI18n()
  return (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={DIAGNOSIS_TONE[item.type]} label={t(DIAGNOSIS_LABEL_KEY[item.type])} />
      <StackItem size="fill">
        <Text type={isStrong ? 'body' : 'supporting'} weight={isStrong ? 'medium' : undefined} maxLines={isStrong ? undefined : 1}>
          {item.message}
        </Text>
      </StackItem>
    </HStack>
  )
}

/** Every finding with what it affects and what to do about it. */
function DiagnosisList({ items }: { items: DiagnosisItem[] }) {
  const { t } = useI18n()
  return (
    <VStack gap={3}>
      <Heading level={4}>{t('admin.ops.diagnosis.title')}</Heading>
      {items.map((item) => (
        <VStack key={item.key} gap={1}>
          <DiagnosisHeadline item={item} isStrong />
          <Text type="supporting" color="secondary">
            {item.impact}
          </Text>
          {item.action && (
            <HStack gap={1} vAlign="start">
              <Icon icon={LightBulbIcon} size="xsm" color="accent" />
              <StackItem size="fill">
                <Text type="supporting">{item.action}</Text>
              </StackItem>
            </HStack>
          )}
        </VStack>
      ))}
      <Divider />
      <Text type="supporting" color="secondary">
        {t('admin.ops.diagnosis.footer')}
      </Text>
    </VStack>
  )
}
