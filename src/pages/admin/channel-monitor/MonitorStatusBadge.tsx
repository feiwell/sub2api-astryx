import { Badge } from '@astryxdesign/core/Badge'
import { monitorStatusVariant } from '~/components/monitor/monitorStatus'
import { statusLabel } from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import type { MonitorStatus } from '~/lib/api/admin/channelMonitor'

/** How a check went, as a badge. */
export function MonitorStatusBadge({ status }: { status: MonitorStatus }) {
  const { t } = useI18n()
  return <Badge variant={monitorStatusVariant(status)} label={statusLabel(status, t)} />
}
