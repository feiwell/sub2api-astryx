import { useEffect, useRef, useState } from 'react'
import { HStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'

export interface OpsAutoRefresh {
  enabled: boolean
  intervalSeconds: number
}

/**
 * Counts down to the next automatic refresh and calls `onElapsed` when it is due. The count
 * restarts with every finished load (`restartKey`) and stands still while one is running or the tab is in
 * the background.
 */
function useCountdown({
  isEnabled,
  isPaused,
  seconds,
  restartKey,
  onElapsed,
}: {
  isEnabled: boolean
  isPaused: boolean
  seconds: number
  restartKey: number
  onElapsed: () => void
}): number {
  const [remaining, setRemaining] = useState(seconds)
  const remainingRef = useRef(seconds)
  const onElapsedRef = useRef(onElapsed)

  useEffect(() => {
    onElapsedRef.current = onElapsed
  }, [onElapsed])

  useEffect(() => {
    remainingRef.current = seconds
    setRemaining(seconds)
  }, [seconds, restartKey, isEnabled])

  useEffect(() => {
    if (!isEnabled || isPaused) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      if (remainingRef.current > 0) {
        remainingRef.current -= 1
        setRemaining(remainingRef.current)
        return
      }
      // Start over right away, so a refresh that never begins is retried one interval later, not every second.
      remainingRef.current = seconds
      setRemaining(seconds)
      onElapsedRef.current()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isEnabled, isPaused, seconds])

  return remaining
}

const pad = (value: number) => String(value).padStart(2, '0')

const formatTimestamp = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

/** Whether the page is loading, when it last refreshed, and how long until it refreshes by itself. */
export function OpsStatusLine({
  isLoading,
  hasFailed,
  lastUpdated,
  autoRefresh,
  restartKey,
  onAutoRefresh,
}: {
  isLoading: boolean
  /** The latest load brought no overview. */
  hasFailed: boolean
  /** When the overview last loaded successfully. */
  lastUpdated: Date | null
  autoRefresh: OpsAutoRefresh
  /** Changes whenever a load finishes. */
  restartKey: number
  onAutoRefresh: () => void
}) {
  const { t } = useI18n()
  const remaining = useCountdown({
    isEnabled: autoRefresh.enabled,
    isPaused: isLoading,
    seconds: autoRefresh.intervalSeconds,
    restartKey,
    onElapsed: onAutoRefresh,
  })
  const stateLabel = isLoading ? t('admin.ops.loadingText') : hasFailed ? t('common.error') : t('admin.ops.ready')

  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <StatusDot variant={isLoading ? 'neutral' : hasFailed ? 'error' : 'success'} label={stateLabel} />
      <Text type="supporting" color="secondary">
        {stateLabel}
      </Text>
      {lastUpdated && (
        <>
          <Text type="supporting" color="secondary">
            ·
          </Text>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {t('common.refresh')}: {formatTimestamp(lastUpdated)}
          </Text>
        </>
      )}
      {autoRefresh.enabled && (
        <>
          <Text type="supporting" color="secondary">
            ·
          </Text>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {t('admin.ops.autoRefreshRemaining', { seconds: remaining })}
          </Text>
        </>
      )}
    </HStack>
  )
}
