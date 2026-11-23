import { Card } from '@astryxdesign/core/Card'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { MonitorErrorRow } from '@/api/channelMonitorV2'
import { formatMonitorPercent, monitorErrorCategoryLabel } from '@/features/channel-monitor-v2/monitorFormat'
import { useI18n } from '~/i18n'
import { errorBarPercent } from './statusFormat'

type ErrorDetail = NonNullable<MonitorErrorRow['details']>[number]

/** One sample of an error category: where it happened, the status codes, how often, and what the upstream said. */
function ErrorSample({ detail }: { detail: ErrorDetail }) {
  const { t } = useI18n()
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Token size="sm" color="gray" label={detail.platform || '-'} />
          <Text weight="medium" maxLines={1}>
            {detail.model || '-'}
          </Text>
          {detail.status_code ? (
            <Text type="supporting">{t('channelMonitorV2.errorDetail.http', { code: detail.status_code })}</Text>
          ) : null}
          {detail.upstream_status_code ? (
            <Text type="supporting">{t('channelMonitorV2.errorDetail.upstream', { code: detail.upstream_status_code })}</Text>
          ) : null}
          <Text type="supporting" hasTabularNumbers>{`×${detail.count}`}</Text>
        </HStack>
        <Text type="supporting" wordBreak="break-word">
          {detail.message || detail.error_type || t('channelMonitorV2.errorDetail.noMessage')}
        </Text>
      </VStack>
    </Card>
  )
}

/**
 * The share of each kind of error among the errors in the range. A kind the administrator chose to ignore is
 * marked and drawn grey. Samples of the errors are for administrators only.
 */
export function StatusErrorsList({ rows, isAdmin }: { rows: MonitorErrorRow[]; isAdmin: boolean }) {
  const { t, te } = useI18n()
  const labelOf = (category: string) => {
    const key = `channelMonitorV2.errorCategories.${category}`
    return te(key) ? t(key) : monitorErrorCategoryLabel(category)
  }

  return (
    <VStack gap={2} hAlign="stretch">
      {rows.map((row) => {
        const label = labelOf(row.category)
        const samples = isAdmin ? row.details || [] : []
        return (
          <Card key={row.category} variant="muted" padding={3}>
            <Collapsible
              defaultIsOpen={false}
              trigger={
                <HStack gap={3} vAlign="center" width="100%">
                  <HStack gap={1.5} vAlign="center" width={200}>
                    <Text maxLines={1} color={row.ignored ? 'secondary' : 'primary'}>
                      {label}
                    </Text>
                    {row.ignored && <Token size="sm" color="gray" label={t('channelMonitorV2.ignored')} />}
                  </HStack>
                  <VStack gap={0} width="100%">
                    <ProgressBar
                      label={label}
                      isLabelHidden
                      value={errorBarPercent(row.rate)}
                      variant={row.ignored ? 'neutral' : 'error'}
                    />
                  </VStack>
                  <Text type="supporting" hasTabularNumbers>
                    {formatMonitorPercent(row.rate)}
                  </Text>
                </HStack>
              }
            >
              <VStack gap={2} paddingBlockStart={3} hAlign="stretch">
                {samples.length > 0 ? (
                  samples.map((detail, index) => (
                    <ErrorSample key={`${index}:${detail.message || detail.error_type || ''}`} detail={detail} />
                  ))
                ) : (
                  <Text type="supporting">
                    {t(isAdmin ? 'channelMonitorV2.errorDetail.noMessage' : 'channelMonitorV2.errorDetail.empty')}
                  </Text>
                )}
              </VStack>
            </Collapsible>
          </Card>
        )
      })}
    </VStack>
  )
}
