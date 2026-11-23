import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { MonitorSnapshot } from '@/api/channelMonitorV2'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { bootstrapPercent } from './statusFormat'

function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale || undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/**
 * How current the figures on the page are: up to when the data reaches, whether the history is complete, and,
 * when fetching failed, why, with a way to try again.
 */
export function StatusSummary({
  snapshot,
  isLoading,
  isRefreshing,
  loadError,
  onRetry,
}: {
  snapshot: MonitorSnapshot | null
  isLoading: boolean
  isRefreshing: boolean
  loadError: unknown
  onRetry: () => void
}) {
  const { t, locale } = useI18n()
  const coverage = snapshot?.coverage
  const isBootstrapping = Boolean(coverage?.bootstrap?.active)
  const percent = bootstrapPercent(coverage?.bootstrap?.progress_percent)
  const hasFailed = loadError != null

  const state = isLoading
    ? t('common.loading')
    : isRefreshing
      ? t('channelMonitorV2.updating')
      : coverage?.data_through
        ? t('channelMonitorV2.updatedTo', { time: formatTime(coverage.data_through, locale) })
        : ''
  const failure = t('channelMonitorV2.loadFailed')
  const reason = hasFailed ? extractApiErrorMessage(loadError, failure) : ''
  const isPartial = Boolean(coverage && !coverage.coverage_complete && !isBootstrapping)
  // With nothing fetched yet there is no time to report, and the banner below already says what went wrong.
  const hasStatusLine = state !== '' || isPartial || isBootstrapping
  if (!hasStatusLine && !hasFailed) return null

  return (
    <VStack gap={3} hAlign="stretch">
      {hasStatusLine && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <StatusDot
            variant={isLoading || isRefreshing ? 'neutral' : hasFailed ? 'error' : 'success'}
            label={state || failure}
            isPulsing={isRefreshing}
          />
          {state && <Text type="supporting">{state}</Text>}
          {isPartial && <Token size="sm" color="yellow" label={t('channelMonitorV2.partialCoverage')} />}
          {isBootstrapping && (
            <Token size="sm" color="blue" label={t('channelMonitorV2.bootstrap.progress', { percent })} />
          )}
        </HStack>
      )}

      {hasFailed && (
        <Banner
          status="error"
          title={failure}
          description={reason !== failure ? reason : undefined}
          endContent={
            <Button size="sm" variant="secondary" label={t('common.refresh')} isLoading={isRefreshing} onClick={onRetry} />
          }
        />
      )}

      {isBootstrapping && (
        <Banner
          status="info"
          title={t('channelMonitorV2.bootstrap.title')}
          description={t('channelMonitorV2.bootstrap.description')}
          collapsible={false}
        >
          <ProgressBar label={t('channelMonitorV2.bootstrap.working')} value={percent} hasValueLabel />
        </Banner>
      )}
    </VStack>
  )
}
