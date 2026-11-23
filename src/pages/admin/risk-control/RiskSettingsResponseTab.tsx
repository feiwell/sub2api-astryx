import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import { SETTING_RANGES } from './riskForm'
import { FIELD_COLUMNS, SettingNumber, SettingToggle } from './RiskSettingsParts'
import type { RiskSettings } from './useRiskSettings'

/** What a hit leads to: how the request is refused, whether the user is mailed, and when they are banned. */
export function RiskSettingsResponseTab({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const { draft } = settings

  return (
    <VStack gap={4}>
      <Grid columns={FIELD_COLUMNS} gap={4}>
        <SettingNumber
          settings={settings}
          field="block_status"
          label={t('admin.riskControl.blockStatus')}
          value={draft.block_status}
          {...SETTING_RANGES.block_status}
          onChange={(block_status) => settings.edit({ block_status })}
        />
        <TextInput
          label={t('admin.riskControl.blockMessage')}
          width="100%"
          value={draft.block_message}
          onChange={(block_message) => settings.edit({ block_message })}
          // What an emptied field falls back to when it is saved.
          placeholder={t('admin.riskControl.defaultBlockMessage')}
        />
      </Grid>
      <SettingToggle
        label={t('admin.riskControl.emailOnHit')}
        hint={t('admin.riskControl.emailOnHitHint')}
        value={draft.email_on_hit}
        onChange={(email_on_hit) => settings.edit({ email_on_hit })}
      />
      {/* The ban and what it is counted by, together. */}
      <Card variant="muted" padding={4}>
        <VStack gap={4}>
          <SettingToggle
            label={t('admin.riskControl.autoBan')}
            hint={t('admin.riskControl.autoBanHint')}
            value={draft.auto_ban_enabled}
            onChange={(auto_ban_enabled) => settings.edit({ auto_ban_enabled })}
          />
          <Grid columns={FIELD_COLUMNS} gap={4}>
            <SettingNumber
              settings={settings}
              field="ban_threshold"
              label={t('admin.riskControl.banThreshold')}
              value={draft.ban_threshold}
              {...SETTING_RANGES.ban_threshold}
              onChange={(ban_threshold) => settings.edit({ ban_threshold })}
            />
            <SettingNumber
              settings={settings}
              field="violation_window_hours"
              label={t('admin.riskControl.violationWindowHours')}
              value={draft.violation_window_hours}
              {...SETTING_RANGES.violation_window_hours}
              onChange={(violation_window_hours) => settings.edit({ violation_window_hours })}
            />
          </Grid>
          <SettingToggle
            label={t('admin.riskControl.cyberPolicyExcludeBan')}
            hint={t('admin.riskControl.cyberPolicyExcludeBanHint')}
            value={draft.cyber_policy_exclude_from_ban_count}
            onChange={(on) => settings.edit({ cyber_policy_exclude_from_ban_count: on })}
          />
        </VStack>
      </Card>
    </VStack>
  )
}
