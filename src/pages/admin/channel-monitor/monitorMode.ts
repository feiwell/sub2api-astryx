import type { PublicSettings } from '@/types'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'

/**
 * Which channel monitor the system runs: none, the one that probes each channel on a schedule (v1), or the
 * one that reads the health of channels off real traffic (v2). Only one of the two runs at a time.
 */
export type MonitorSystemMode = 'closed' | 'v1' | 'v2'

export function monitorSystemMode(settings: Partial<PublicSettings> | null | undefined): MonitorSystemMode {
  if (!resolveFeatureFlag(settings, FeatureFlags.channelMonitor)) return 'closed'
  // Anything but "v2" is v1: that is what the server runs when the setting is missing or unknown.
  return settings?.channel_monitor_mode === 'v2' ? 'v2' : 'v1'
}
