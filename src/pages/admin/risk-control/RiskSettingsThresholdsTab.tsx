import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { RISK_THRESHOLD_CATEGORIES, RISK_THRESHOLD_DEFAULTS } from './riskForm'
import { formatPercent } from './riskFormat'
import { engineLabel } from './riskModel'
import { SettingNumber, SettingsSection } from './RiskSettingsParts'
import type { RiskSettings } from './useRiskSettings'

// Thirteen short fields: three side by side where they fit.
const THRESHOLD_COLUMNS = { minWidth: 220, max: 3 } as const

/**
 * The score each category must reach to count as a hit, for the engine selected on the basic tab.
 * Each engine keeps its own thresholds: their scores do not mean the same.
 */
export function RiskSettingsThresholdsTab({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const { draft, engine } = settings
  // Counts the resets: the fields start over after one, so text a field refused does not outlive it.
  const [resets, setResets] = useState(0)
  const reset = () => {
    settings.resetThresholds()
    setResets((count) => count + 1)
  }

  return (
    <SettingsSection
      title={`${engineLabel(draft.engine)} · ${t('admin.riskControl.riskThresholds')}`}
      hint={t('admin.riskControl.riskThresholdsHint')}
      actions={
        <Button
          icon={<Icon icon={ArrowUturnLeftIcon} />}
          label={t('admin.riskControl.riskThresholdReset')}
          onClick={reset}
        />
      }
    >
      {draft.engine === 'typesafe' && <Banner status="warning" title={t('admin.riskControl.typeSafeThresholds')} />}
      <Grid key={resets} columns={THRESHOLD_COLUMNS} gap={4}>
        {RISK_THRESHOLD_CATEGORIES.map((category) => (
          <SettingNumber
            key={category}
            settings={settings}
            field={`threshold:${category}`}
            label={category}
            description={t('admin.riskControl.riskThresholdDefault', {
              value: formatPercent(RISK_THRESHOLD_DEFAULTS[category]),
            })}
            units="%"
            value={engine.thresholds[category] ?? RISK_THRESHOLD_DEFAULTS[category]}
            min={0}
            max={100}
            step={0.1}
            isIntegerOnly={false}
            onChange={(percent) => settings.setThreshold(category, percent)}
          />
        ))}
      </Grid>
    </SettingsSection>
  )
}
