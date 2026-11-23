import { useState } from 'react'
import { VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { MonitorList } from './channel-monitor/MonitorList'
import { monitorSystemMode } from './channel-monitor/monitorMode'
import { MonitorV2SettingsPanel } from './channel-monitor/MonitorV2SettingsPanel'
import { useMonitorV2Settings } from './channel-monitor/useMonitorV2Settings'

const TABS = ['v2', 'legacy'] as const
type MonitorTab = (typeof TABS)[number]

/**
 * Channel monitoring for admins. The system runs one of two monitors: the one that probes each channel on a
 * schedule, or the one that reads the health of channels off real traffic. This page sets up both, a tab
 * each. Port of views/admin/ChannelMonitorView.vue.
 */
export default function AdminChannelMonitorPage() {
  const { t } = useI18n()
  const settings = useAppStore((s) => s.publicSettings)
  const mode = monitorSystemMode(settings)
  const isProbing = mode === 'v1'
  // The page opens on the tab of the monitor the system runs, until a tab is picked by hand.
  const [pickedTab, setPickedTab] = useState<MonitorTab | null>(null)
  const tab = pickedTab ?? (isProbing ? 'legacy' : 'v2')
  // Held here so that edits not yet saved are still there after a look at the other tab.
  const v2Settings = useMonitorV2Settings(tab === 'v2')

  return (
    <Page
      title={t('admin.channelMonitor.title')}
      description={isProbing ? t('channelMonitorV2.admin.descriptionV1') : t('channelMonitorV2.admin.descriptionV2')}>
      <VStack gap={4}>
        <TabList
          value={tab}
          onChange={(value) => setPickedTab(TABS.find((key) => key === value) ?? 'v2')}
          hasDivider
          aria-label={t('channelMonitorV2.admin.tabAria')}>
          <Tab value="v2" label={t('channelMonitorV2.admin.tabV2')} />
          <Tab
            value="legacy"
            label={isProbing ? t('channelMonitorV2.admin.tabV1Active') : t('channelMonitorV2.admin.tabV1History')}
          />
        </TabList>

        {tab === 'v2' ? (
          <MonitorV2SettingsPanel settings={v2Settings} mode={mode} />
        ) : (
          <MonitorList canRun={isProbing} />
        )}
      </VStack>
    </Page>
  )
}
