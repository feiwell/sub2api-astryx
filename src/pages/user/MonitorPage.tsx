import { useEffect, useState } from 'react'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { useAppStore } from '~/stores/app'
import { StatusV1View } from './monitor/StatusV1View'
import { StatusV2View } from './monitor/StatusV2View'

/**
 * /monitor, the channel status page. The administrator chooses how channels are monitored, and the page
 * follows: scheduled probes show as one card for each monitor (V1), real traffic shows as figures, trend and
 * breakdowns (V2).
 */
export function MonitorPage() {
  const settings = useAppStore((s) => s.publicSettings)
  const [isReady, setIsReady] = useState(() => useAppStore.getState().publicSettingsLoaded)

  // The mode is a public setting. Showing a view before it is known could show the wrong one first.
  useEffect(() => {
    void useAppStore
      .getState()
      .fetchPublicSettings()
      .finally(() => setIsReady(true))
  }, [])

  if (!isReady) {
    return (
      <Center padding={10}>
        <Spinner />
      </Center>
    )
  }
  const isV1 = resolveFeatureFlag(settings, FeatureFlags.channelMonitor) && settings?.channel_monitor_mode !== 'v2'
  return isV1 ? <StatusV1View /> : <StatusV2View />
}
