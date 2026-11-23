import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import type { ContentModerationConfig } from '~/lib/api/admin/riskControl'
import { useI18n } from '~/i18n'
import { RiskSettingsBasicTab } from './RiskSettingsBasicTab'
import { RiskSettingsKeywordsTab } from './RiskSettingsKeywordsTab'
import { RiskSettingsResponseTab } from './RiskSettingsResponseTab'
import { RiskSettingsRetentionTab } from './RiskSettingsRetentionTab'
import { RiskSettingsRuntimeTab } from './RiskSettingsRuntimeTab'
import { RiskSettingsScopeTab } from './RiskSettingsScopeTab'
import { RiskSettingsThresholdsTab } from './RiskSettingsThresholdsTab'
import type { RiskControl } from './useRiskControl'
import { SETTINGS_TABS, useRiskSettings, type RiskSettings, type SettingsTab } from './useRiskSettings'

const DIALOG_WIDTH = 1120
// The tabs differ a lot in length. The dialog hangs from one line instead of being centered in the
// height, so the tab strip stays where the pointer is when the tab changes. A positioned Dialog no
// longer centers itself in the width either: `start` does that, down to the gutter Dialog keeps.
const DIALOG_POSITION = { top: '5dvh', start: `max(1rem, calc((100% - ${DIALOG_WIDTH}px) / 2))` } as const
// Short tabs share one panel height.
const PANEL_MIN_HEIGHT = 'min(62vh, 36rem)'

function SettingsPanel({ settings, control }: { settings: RiskSettings; control: RiskControl }) {
  switch (settings.tab) {
    case 'basic':
      return <RiskSettingsBasicTab settings={settings} control={control} />
    case 'scope':
      return <RiskSettingsScopeTab settings={settings} control={control} />
    case 'runtime':
      return <RiskSettingsRuntimeTab settings={settings} control={control} />
    case 'response':
      return <RiskSettingsResponseTab settings={settings} />
    case 'riskThresholds':
      return <RiskSettingsThresholdsTab settings={settings} />
    case 'keywords':
      return <RiskSettingsKeywordsTab settings={settings} />
    case 'retention':
      return <RiskSettingsRetentionTab settings={settings} control={control} />
  }
}

/**
 * The content moderation settings. Mount it only while it is open: it edits a draft of the saved
 * config, and closing it without saving drops the draft.
 */
export function RiskSettingsDialog({
  control,
  config,
  onSaved,
  onClose,
}: {
  control: RiskControl
  /** The saved config the dialog starts from. */
  config: ContentModerationConfig
  /** A save went through: what the page shows beside the config is out of date. */
  onSaved: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const settings = useRiskSettings({ control, config, onSaved, onClose })

  const tabLabels: Record<SettingsTab, string> = {
    basic: t('admin.riskControl.tabs.basic'),
    scope: t('admin.riskControl.tabs.scope'),
    runtime: t('admin.riskControl.tabs.runtime'),
    response: t('admin.riskControl.tabs.response'),
    riskThresholds: t('admin.riskControl.tabs.riskThresholds'),
    keywords: t('admin.riskControl.tabs.keywords'),
    retention: t('admin.riskControl.tabs.retention'),
  }

  // A save on its way ends by itself: until then the dialog stays, so its outcome is seen.
  const close = () => {
    if (!settings.isSaving) onClose()
  }
  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) close()
  }
  const selectTab = (value: string) => {
    const next = SETTINGS_TABS.find((tab) => tab === value)
    if (next) settings.setTab(next)
  }

  return (
    <Dialog
      isOpen
      onOpenChange={reportOpen}
      width={DIALOG_WIDTH}
      maxHeight="90dvh"
      position={DIALOG_POSITION}
      purpose="form"
    >
      <Layout
        header={<DialogHeader title={t('admin.riskControl.settingsTitle')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={5}>
              <TabList value={settings.tab} onChange={selectTab} hasDivider>
                {SETTINGS_TABS.map((tab) => (
                  <Tab key={tab} value={tab} label={tabLabels[tab]} />
                ))}
              </TabList>
              <VStack minHeight={PANEL_MIN_HEIGHT}>
                <SettingsPanel settings={settings} control={control} />
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                label={t('common.cancel')}
                variant="secondary"
                isDisabled={settings.isSaving}
                onClick={close}
              />
              <Button
                label={t('admin.riskControl.saveConfig')}
                variant="primary"
                icon={<Icon icon={CheckCircleIcon} />}
                isLoading={settings.isSaving}
                onClick={() => void settings.save()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
