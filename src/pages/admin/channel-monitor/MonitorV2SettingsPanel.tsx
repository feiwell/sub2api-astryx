import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { CheckIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import type { MonitorSystemMode } from './monitorMode'
import { MonitorV2ErrorsCard } from './MonitorV2ErrorsCard'
import { MonitorV2GroupsCard } from './MonitorV2GroupsCard'
import { MonitorV2PlatformsCard } from './MonitorV2PlatformsCard'
import { MonitorV2ThresholdsCard, type ThresholdEntryErrors } from './MonitorV2ThresholdsCard'
import { namedModelCount, REFRESH_INTERVALS } from './monitorV2Settings'
import type { MonitorV2SettingsState } from './useMonitorV2Settings'

/**
 * The settings of the monitor that reads channel health off real traffic: whether it runs and how often it
 * sums up, which platforms, models and groups it covers, which errors it ignores, and where it draws the
 * line between healthy and not. Edits wait for the save button. The settings themselves live in the page,
 * see useMonitorV2Settings. Port of features/channel-monitor-v2/MonitorSettingsPanel.vue.
 */
export function MonitorV2SettingsPanel({
  settings,
  mode,
}: {
  settings: MonitorV2SettingsState
  /** The monitor the system runs; these settings take effect only while it is this one. */
  mode: MonitorSystemMode
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  // Text a number field refused never reached the draft, so the draft can be clean while a field is not.
  const [entryErrors, setEntryErrors] = useState<ThresholdEntryErrors>({})
  const { draft, isSaving, revision } = settings
  const hasRefusedEntry = Object.values(entryErrors).some(Boolean)

  // The fields start over with each new draft, and what they had refused goes with them.
  useEffect(() => setEntryErrors({}), [revision])

  const save = () => {
    // A save now would not save what the field shows.
    if (hasRefusedEntry) toast.error(t('admin.settings.features.affiliate.fixNumbers'))
    else settings.save()
  }

  const refreshButton = (
    <Button
      label={t('common.refresh')}
      variant="secondary"
      size="sm"
      isLoading={settings.isLoading}
      onClick={settings.reload}
    />
  )
  const saveFailed = t('channelMonitorV2.settings.saveFailed')
  const namedModels = draft ? namedModelCount(draft) : 0

  return (
    <VStack gap={4}>
      <Card>
        <HStack gap={4} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <VStack gap={1}>
              <Heading level={3}>{t('channelMonitorV2.settings.title')}</Heading>
              <Text type="supporting" color="secondary">
                {t('channelMonitorV2.settings.description')}
              </Text>
            </VStack>
          </StackItem>
          <HStack gap={2}>
            <Button
              label={t('common.reset')}
              variant="secondary"
              isDisabled={(!settings.isDirty && !hasRefusedEntry) || isSaving}
              onClick={settings.reset}
            />
            <Button
              label={t('channelMonitorV2.settings.save')}
              variant="primary"
              icon={<Icon icon={CheckIcon} />}
              isLoading={isSaving}
              isDisabled={!settings.isDirty}
              onClick={save}
            />
          </HStack>
        </HStack>
      </Card>

      {mode !== 'v2' && (
        <Banner
          status="warning"
          title={t('channelMonitorV2.settings.modeBanner', {
            mode: mode === 'v1' ? t('channelMonitorV2.settings.modeV1') : t('channelMonitorV2.settings.modeClosed'),
            modeV2: t('channelMonitorV2.settings.modeV2'),
          })}
          endContent={
            <Button
              label={t('admin.settings.tabs.features')}
              variant="secondary"
              size="sm"
              onClick={() => navigate('/admin/settings')}
            />
          }
        />
      )}

      {settings.failure && <Banner status="error" title={settings.failure} endContent={refreshButton} />}

      {settings.conflict && (
        // Stays until the settings are read again: no save of this draft can go through.
        <Banner
          status="warning"
          title={saveFailed}
          description={settings.conflict !== saveFailed ? settings.conflict : undefined}
          endContent={refreshButton}
        />
      )}

      {!draft ? (
        // A failed first load leaves only its banner.
        settings.isLoading && (
          <Card>
            <Center padding={8}>
              <Spinner label={t('channelMonitorV2.settings.loading')} />
            </Center>
          </Card>
        )
      ) : (
        <>
          <Card>
            <VStack gap={4}>
              <Switch
                label={t('channelMonitorV2.settings.enableTitle')}
                description={t('channelMonitorV2.settings.enableHint')}
                labelPosition="start"
                labelSpacing="spread"
                width="100%"
                value={draft.enabled}
                onChange={(enabled) => settings.change((current) => ({ ...current, enabled }))}
                isDisabled={isSaving}
              />
              <Divider />
              <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
                <VStack gap={0.5}>
                  <Text type="label">{t('channelMonitorV2.settings.refreshTitle')}</Text>
                  <Text type="supporting" color="secondary">
                    {t('channelMonitorV2.settings.refreshHint')}
                  </Text>
                </VStack>
                <SegmentedControl
                  label={t('channelMonitorV2.settings.refreshAria')}
                  value={String(draft.refresh_interval_seconds)}
                  onChange={(value) => {
                    const seconds = REFRESH_INTERVALS.find((interval) => String(interval) === value)
                    if (seconds) settings.change((current) => ({ ...current, refresh_interval_seconds: seconds }))
                  }}
                  isDisabled={isSaving}
                >
                  {REFRESH_INTERVALS.map((seconds) => (
                    <SegmentedControlItem key={seconds} value={String(seconds)} label={`${seconds / 60} min`} />
                  ))}
                </SegmentedControl>
              </HStack>
            </VStack>
          </Card>

          <MonitorV2PlatformsCard config={draft} onChange={settings.change} isDisabled={isSaving} />

          <Grid columns={{ minWidth: 360, max: 2 }} gap={4}>
            <MonitorV2GroupsCard
              config={draft}
              groups={settings.groups}
              onChange={settings.change}
              isDisabled={isSaving}
            />
            <MonitorV2ErrorsCard config={draft} onChange={settings.change} isDisabled={isSaving} />
          </Grid>

          <MonitorV2ThresholdsCard
            config={draft}
            revision={revision}
            entryErrors={entryErrors}
            onChange={settings.change}
            onEntryError={(field, error) => setEntryErrors((current) => ({ ...current, [field]: error ?? undefined }))}
            isDisabled={isSaving}
          />

          <Banner
            status="info"
            title={
              namedModels === 0
                ? t('channelMonitorV2.settings.namedModelsEmpty')
                : t('channelMonitorV2.settings.namedModelsCount', { count: namedModels })
            }
          />

          <Card>
            <VStack gap={2}>
              <Text type="label">{t('channelMonitorV2.settings.userContractTitle')}</Text>
              <List listStyle="disc" density="compact">
                <ListItem label={t('channelMonitorV2.settings.userContract.health')} />
                <ListItem label={t('channelMonitorV2.settings.userContract.trend')} />
                <ListItem label={t('channelMonitorV2.settings.userContract.latency')} />
                <ListItem label={t('channelMonitorV2.settings.userContract.models')} />
              </List>
            </VStack>
          </Card>
        </>
      )}
    </VStack>
  )
}
