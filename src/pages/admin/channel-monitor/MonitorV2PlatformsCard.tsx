import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import type { MonitorConfig } from '@/api/channelMonitorV2'
import { listPlatforms } from '@/constants/platformCatalog'
import { useI18n } from '~/i18n'
import { MonitorModelsField } from './MonitorModelsField'
import {
  platformsToAdd,
  settingsPlatformName,
  withPlatformAdded,
  withPlatformEnabled,
  withPlatformModels,
  withPlatformModelsAdded,
} from './monitorV2Settings'

const PICKER_WIDTH = 220

/**
 * The platforms the monitor covers and, for each, the models that get a row of their own; the rest of a
 * platform's models are shown together as "other". A platform with no model named shows all of its models.
 * Changes the draft only.
 */
export function MonitorV2PlatformsCard({
  config,
  onChange,
  isDisabled,
}: {
  config: MonitorConfig
  onChange: (edit: (config: MonitorConfig) => MonitorConfig) => void
  isDisabled: boolean
}) {
  const { t } = useI18n()
  // The platform picked to be added; empty while none is.
  const [picked, setPicked] = useState('')
  const addable = platformsToAdd(
    config,
    listPlatforms().map((spec) => ({ value: String(spec.id), label: spec.display_name })),
  )
  const canAdd = addable.some((option) => option.value === picked)

  const add = () => {
    if (!canAdd) return
    onChange((current) => withPlatformAdded(current, picked))
    setPicked('')
  }

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={0.5}>
          <Heading level={4}>{t('channelMonitorV2.settings.platformsTitle')}</Heading>
          <Text type="supporting" color="secondary">
            {t('channelMonitorV2.settings.platformsHint')}
          </Text>
        </VStack>

        {addable.length > 0 && (
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Selector
              // A new one for each list of platforms left, so it starts over with nothing picked.
              key={addable.length}
              label={t('channelMonitorV2.settings.selectPlatform')}
              isLabelHidden
              placeholder={t('channelMonitorV2.settings.selectPlatform')}
              width={PICKER_WIDTH}
              options={addable}
              value={picked}
              onChange={setPicked}
              isDisabled={isDisabled}
            />
            <Button
              label={t('channelMonitorV2.settings.addPlatform')}
              variant="secondary"
              isDisabled={isDisabled || !canAdd}
              onClick={add}
            />
          </HStack>
        )}

        <Grid columns={{ minWidth: 340, max: 2 }} gap={5}>
          {config.platforms.map((setting) => {
            const { platform } = setting
            const name = settingsPlatformName(platform)
            const hasNamedModels = setting.models.length > 0
            return (
              <VStack key={platform} gap={2}>
                <HStack gap={3} hAlign="between" vAlign="center">
                  <Switch
                    label={name}
                    value={setting.enabled}
                    onChange={(enabled) => onChange((current) => withPlatformEnabled(current, platform, enabled))}
                    isDisabled={isDisabled}
                  />
                  <Badge
                    variant={hasNamedModels ? 'neutral' : 'info'}
                    label={
                      hasNamedModels
                        ? t('channelMonitorV2.settings.badgeOther')
                        : t('channelMonitorV2.settings.badgeAllModels')
                    }
                  />
                </HStack>
                <MonitorModelsField
                  // The switch above already shows the platform's name.
                  label={`${name} · ${t('channelMonitorV2.filters.model')}`}
                  isLabelHidden
                  placeholder={t('channelMonitorV2.settings.modelsPlaceholder')}
                  models={setting.models}
                  onAdd={(entry) => onChange((current) => withPlatformModelsAdded(current, platform, entry))}
                  onChange={(models) => onChange((current) => withPlatformModels(current, platform, models))}
                  isDisabled={isDisabled}
                />
              </VStack>
            )
          })}
        </Grid>
      </VStack>
    </Card>
  )
}
