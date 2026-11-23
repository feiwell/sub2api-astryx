import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid, type GridColumns } from '@astryxdesign/core/Grid'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import type { UserMonitorDetail, UserMonitorView } from '@/api/channelMonitor'
import { isChannelMonitorQuotaVisible } from '@/utils/featureFlags'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { ProbeCard } from './ProbeCard'
import { windowAvailability, type ProbeWindow } from './probeCards'

/** As many cards side by side as fit at this width or wider. */
const COLUMNS: GridColumns = { minWidth: 300, repeat: 'fill' }
const PLACEHOLDER_COUNT = 6
const PLACEHOLDER_HEIGHT = 320

/**
 * The monitors as cards. Before the first answer it shows the outlines of cards; with no monitors to show it
 * says so. When the first fetch failed it shows nothing: the page says what went wrong above it.
 */
export function ProbeCardGrid({
  items,
  details,
  pendingDetails,
  timeWindow,
  isLoading,
  hasLoaded,
  onOpen,
}: {
  items: UserMonitorView[]
  details: Readonly<Record<number, UserMonitorDetail>>
  pendingDetails: ReadonlySet<number>
  timeWindow: ProbeWindow
  isLoading: boolean
  hasLoaded: boolean
  onOpen: (item: UserMonitorView) => void
}) {
  const { t } = useI18n()
  // Whether quotas show is a public setting, so follow it when it changes.
  useAppStore((s) => s.publicSettings)
  const showQuota = isChannelMonitorQuotaVisible()

  if (items.length === 0) {
    if (isLoading) {
      return (
        <Grid columns={COLUMNS} gap={5} aria-hidden data-probe-placeholders>
          {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
            <Skeleton key={index} index={index} width="100%" height={PLACEHOLDER_HEIGHT} />
          ))}
        </Grid>
      )
    }
    if (!hasLoaded) return null
    return <EmptyState title={t('channelStatus.empty.title')} description={t('channelStatus.empty.description')} />
  }

  return (
    <Grid columns={COLUMNS} gap={5}>
      {items.map((item) => {
        const detail = details[item.id]
        return (
          <ProbeCard
            key={item.id}
            item={item}
            timeWindow={timeWindow}
            availability={windowAvailability(item, timeWindow, detail)}
            // An earlier figure stays on the card while a newer one is fetched.
            isAvailabilityPending={pendingDetails.has(item.id) && !detail}
            showQuota={showQuota}
            onOpen={onOpen}
          />
        )
      })}
    </Grid>
  )
}
