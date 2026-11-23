import type { ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useI18n } from '~/i18n'
import type { ContentModerationConfig, ContentModerationRuntimeStatus } from '~/lib/api/admin/riskControl'
import { formatCount } from './riskFormat'
import { apiKeyStatusColor, apiKeyStatusLabelKey, modeLabel, modelFilterSummary, normalizeModelFilter } from './riskModel'
import { keyHealthCounts, savedKeyStatuses } from './riskStatus'

const CELL_MIN_WIDTH = 220
const CELL_COUNT = 4
const SKELETON_HEIGHT = 104

/** One headline of the saved setup: what it is about, the headline, and what stands behind it. */
function OverviewCell({
  label,
  value,
  mark,
  children,
}: {
  label: string
  value: string
  mark?: ReactNode
  children?: ReactNode
}) {
  return (
    <Card padding={4}>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Text type="supporting">{label}</Text>
          {mark}
        </HStack>
        <Heading level={3}>{value}</Heading>
        {children}
      </VStack>
    </Card>
  )
}

/** The cells' places while the first load is under way. */
export function RiskOverviewSkeleton() {
  return (
    <Grid columns={{ minWidth: CELL_MIN_WIDTH, repeat: 'fit' }} gap={3} aria-hidden>
      {Array.from({ length: CELL_COUNT }, (_, index) => (
        <Skeleton key={index} index={index} width="100%" height={SKELETON_HEIGHT} />
      ))}
    </Grid>
  )
}

/**
 * The audit setup at a glance: whether it is on, the keys it calls with, what it covers, and how
 * many records match the filters below (a dash while the list has not told: null is not "none").
 * It tells what is saved, never what a form holds unsaved.
 */
export function RiskOverview({
  config,
  status,
  logsTotal,
}: {
  config: ContentModerationConfig
  status: ContentModerationRuntimeStatus | null
  logsTotal: number | null
}) {
  const { t, locale } = useI18n()

  const keyCounts = keyHealthCounts(savedKeyStatuses(status, config), config.api_key_count)
  const modelSummary = modelFilterSummary(normalizeModelFilter(config.model_filter), t)
  const groupCount = Array.isArray(config.group_ids) ? config.group_ids.length : 0

  return (
    <Grid columns={{ minWidth: CELL_MIN_WIDTH, repeat: 'fit' }} gap={3}>
      <OverviewCell
        label={t('admin.riskControl.overview.status')}
        value={config.enabled ? t('admin.riskControl.overview.enabled') : t('admin.riskControl.overview.disabled')}
        // The audit switch means nothing while risk control is off for the whole system.
        mark={
          status && !status.risk_control_enabled ? (
            <Token size="sm" color="orange" label={t('admin.riskControl.riskSwitchOff')} />
          ) : undefined
        }>
        <Text type="supporting">{modeLabel(config.mode, t)}</Text>
      </OverviewCell>

      <OverviewCell
        label={t('admin.riskControl.overview.apiKey')}
        value={
          config.api_key_configured
            ? t('admin.riskControl.apiKeyCount', { count: config.api_key_count })
            : t('admin.riskControl.notConfigured')
        }>
        {!config.api_key_configured ? (
          <Text type="supporting" maxLines={1} hasTruncateTooltip>
            {config.model || '-'}
          </Text>
        ) : keyCounts.length > 0 ? (
          <HStack gap={1} wrap="wrap">
            {keyCounts.map(({ status: keyStatus, count }) => (
              <Token
                key={keyStatus}
                size="sm"
                color={apiKeyStatusColor(keyStatus)}
                label={`${t(apiKeyStatusLabelKey(keyStatus))} ${formatCount(count, locale)}`}
              />
            ))}
          </HStack>
        ) : (
          <Text type="supporting">{t('admin.riskControl.apiKeyStatusUnknown')}</Text>
        )}
      </OverviewCell>

      <OverviewCell
        label={t('admin.riskControl.overview.groupScope')}
        value={config.all_groups ? t('admin.riskControl.allGroups') : formatCount(groupCount, locale)}>
        <Text type="supporting">
          {config.all_groups ? modelSummary : `${t('admin.riskControl.selectedGroupsHint')} · ${modelSummary}`}
        </Text>
      </OverviewCell>

      <OverviewCell
        label={t('admin.riskControl.overview.logs')}
        value={logsTotal == null ? '-' : formatCount(logsTotal, locale)}>
        <Text type="supporting">{t('admin.riskControl.overview.currentFilter')}</Text>
      </OverviewCell>
    </Grid>
  )
}
