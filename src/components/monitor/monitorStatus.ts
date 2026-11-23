/**
 * Maps channel-monitor health/status values onto Astryx StatusDot variants.
 * Health bands follow features/channel-monitor-v2/monitorFormat.ts
 * (score0..score10, green→yellow→red); V1 statuses follow
 * useChannelMonitorFormat.statusBadgeClass.
 */
import type { HealthState, MonitorHealth } from '@/api/channelMonitorV2'
import type { MonitorStatus } from '@/api/channelMonitor'
import { healthScoreClass, type HealthDisplayMode } from '@/features/channel-monitor-v2/monitorFormat'

export type StatusVariant = 'success' | 'warning' | 'error' | 'neutral'

function variantForClass(klass: string): StatusVariant {
  const band = /^health-score(\d+)$/.exec(klass)
  if (band) {
    const score = Number(band[1])
    if (score >= 8) return 'success'
    if (score >= 5) return 'warning'
    return 'error'
  }
  if (klass === 'health-healthy') return 'success'
  if (klass === 'health-warning') return 'warning'
  if (klass === 'health-critical') return 'error'
  return 'neutral'
}

export function healthStateVariant(state: HealthState | undefined): StatusVariant {
  return variantForClass(`health-${state || 'unknown'}`)
}

/** Score-banded variant for a row/bucket under the selected health mode. */
export function healthVariant(health: MonitorHealth | undefined, mode: HealthDisplayMode, requestCount: number): StatusVariant {
  if (!health) return 'neutral'
  return variantForClass(healthScoreClass(health, mode, requestCount))
}

export function monitorStatusVariant(status: MonitorStatus | '' | undefined): StatusVariant {
  if (status === 'operational') return 'success'
  if (status === 'degraded') return 'warning'
  if (status === 'failed') return 'error'
  return 'neutral'
}
