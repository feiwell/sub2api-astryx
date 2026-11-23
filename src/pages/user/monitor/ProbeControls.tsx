import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { AutoRefreshMenu } from './AutoRefreshMenu'
import { PROBE_WINDOWS, type ProbeWindow } from './probeCards'
import type { AutoRefresh } from './useAutoRefresh'

/**
 * What the viewer can set on the page of monitor cards: the window availability is counted over, and when
 * the page refreshes. Between them it says in a word whether every monitor passed its latest check.
 */
export function ProbeControls({
  timeWindow,
  onWindowChange,
  overall,
  isRefreshing,
  onRefresh,
  refresh,
}: {
  timeWindow: ProbeWindow
  onWindowChange: (next: ProbeWindow) => void
  /** Null until the monitors have arrived: before that there is nothing to judge. */
  overall: 'operational' | 'degraded' | null
  isRefreshing: boolean
  onRefresh: () => void
  refresh: AutoRefresh
}) {
  const { t } = useI18n()

  return (
    <>
      <SegmentedControl
        size="sm"
        label={t('monitorCommon.availabilityPrefix')}
        value={timeWindow}
        onChange={(next) => onWindowChange(next as ProbeWindow)}
      >
        {PROBE_WINDOWS.map((choice) => (
          <SegmentedControlItem key={choice} value={choice} label={t(`channelStatus.windowTab.${choice}`)} />
        ))}
      </SegmentedControl>
      {overall && (
        <Badge
          variant={overall === 'operational' ? 'success' : 'warning'}
          label={t(`channelStatus.overall.${overall}`)}
          data-probe-overall={overall}
        />
      )}
      <Button
        size="sm"
        variant="secondary"
        icon={<Icon icon={ArrowPathIcon} />}
        label={t('common.refresh')}
        isLoading={isRefreshing}
        onClick={onRefresh}
      />
      <AutoRefreshMenu refresh={refresh} />
    </>
  )
}
