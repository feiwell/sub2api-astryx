import { Fragment } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { ArrowRightIcon, BeakerIcon } from '@heroicons/react/24/outline'
import type { UsageLog } from '@/types'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import { formatCost } from './dashboardModel'

function RecentRow({ log }: { log: UsageLog }) {
  const { t, locale } = useI18n()
  return (
    <HStack gap={3} vAlign="center">
      <Icon icon={BeakerIcon} color="accent" />
      <StackItem size="fill">
        <VStack gap={0}>
          <Text weight="medium" maxLines={1} hasTruncateTooltip>
            {log.model}
          </Text>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDateTime(log.created_at, undefined, locale)}
          </Text>
        </VStack>
      </StackItem>
      {/* Keeps its own width: a long model name is cut short instead of pressing the figures onto two lines. */}
      <StackItem size="static">
        <VStack gap={0} hAlign="end">
          {/* What was charged, and beside it what the request cost at the standard rate. */}
          <HStack gap={1} vAlign="center">
            <Tooltip content={t('dashboard.actual')}>
              <Text weight="semibold" hasTabularNumbers>
                {`$${formatCost(log.actual_cost)}`}
              </Text>
            </Tooltip>
            <Tooltip content={t('dashboard.standard')}>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {`/ $${formatCost(log.total_cost)}`}
              </Text>
            </Tooltip>
          </HStack>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {`${(log.input_tokens + log.output_tokens).toLocaleString(locale)} ${t('dashboard.tokens')}`}
          </Text>
        </VStack>
      </StackItem>
    </HStack>
  )
}

/** The newest requests of the last days, with the way to all of them. */
export function RecentUsageCard({
  rows,
  isLoading,
  hasFailed,
}: {
  rows: UsageLog[]
  isLoading: boolean
  hasFailed: boolean
}) {
  const { t } = useI18n()
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={3} hAlign="between" vAlign="center">
          <Heading level={4}>{t('dashboard.recentUsage')}</Heading>
          <Badge label={t('dashboard.last7Days')} variant="neutral" />
        </HStack>
        {rows.length > 0 ? (
          <>
            {rows.map((log, index) => (
              <Fragment key={log.id}>
                {index > 0 && <Divider />}
                <RecentRow log={log} />
              </Fragment>
            ))}
            <Center>
              <Button
                variant="ghost"
                label={t('dashboard.viewAllUsage')}
                href="/usage"
                endContent={<Icon icon={ArrowRightIcon} size="sm" />}
              />
            </Center>
          </>
        ) : isLoading ? (
          <Center padding={6}>
            <Spinner label={t('common.loading')} />
          </Center>
        ) : hasFailed ? (
          // Not the invitation to start using the API: whether there are requests is not known.
          <EmptyState isCompact title={t('common.loadFailed')} />
        ) : (
          <EmptyState isCompact title={t('dashboard.noUsageRecords')} description={t('dashboard.startUsingApi')} />
        )}
      </VStack>
    </Card>
  )
}
