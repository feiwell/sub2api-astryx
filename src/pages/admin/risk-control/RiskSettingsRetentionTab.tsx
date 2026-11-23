import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { CircleStackIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { SETTING_RANGES } from './riskForm'
import { formatCount } from './riskFormat'
import { FIELD_COLUMNS, SettingNumber } from './RiskSettingsParts'
import type { RiskControl } from './useRiskControl'
import type { RiskSettings } from './useRiskSettings'

/** How long audit records are kept, and what the last cleanup removed. */
export function RiskSettingsRetentionTab({ settings, control }: { settings: RiskSettings; control: RiskControl }) {
  const { t, locale } = useI18n()
  const { draft } = settings

  return (
    <VStack gap={4}>
      <Grid columns={FIELD_COLUMNS} gap={4}>
        <SettingNumber
          settings={settings}
          field="hit_retention_days"
          label={t('admin.riskControl.hitRetentionDays')}
          value={draft.hit_retention_days}
          {...SETTING_RANGES.hit_retention_days}
          onChange={(hit_retention_days) => settings.edit({ hit_retention_days })}
        />
        <SettingNumber
          settings={settings}
          field="non_hit_retention_days"
          label={t('admin.riskControl.nonHitRetentionDays')}
          value={draft.non_hit_retention_days}
          {...SETTING_RANGES.non_hit_retention_days}
          onChange={(non_hit_retention_days) => settings.edit({ non_hit_retention_days })}
        />
      </Grid>
      <HStack gap={2} vAlign="center">
        <Icon icon={CircleStackIcon} size="sm" color="secondary" />
        <Text type="supporting" hasTabularNumbers>
          {t('admin.riskControl.cleanupStats', {
            hit: formatCount(control.status?.last_cleanup_deleted_hit, locale),
            nonHit: formatCount(control.status?.last_cleanup_deleted_non_hit, locale),
          })}
        </Text>
      </HStack>
    </VStack>
  )
}
