import { Fragment, useEffect, useRef, type ComponentType, type SVGProps } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useAnnounce } from '@astryxdesign/core/hooks'
import {
  BoltIcon,
  CheckBadgeIcon,
  ClockIcon,
  CurrencyDollarIcon,
  QuestionMarkCircleIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import type { RedeemHistoryItem } from '@/api'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import { entryColor, entryKind, entryTitleKey, entryTrace, entryValue, type EntryKind } from './redeemModel'
import type { HistoryFailure, RedeemHistory } from './useRedeemHistory'

const KIND_ICONS: Record<EntryKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  balance: CurrencyDollarIcon,
  concurrency: BoltIcon,
  subscription: CheckBadgeIcon,
  invitation: TicketIcon,
  other: QuestionMarkCircleIcon,
}

function HistoryRow({ item }: { item: RedeemHistoryItem }) {
  const { t, locale } = useI18n()
  const value = entryValue(item, t)
  const trace = entryTrace(item, t)
  return (
    <HStack gap={3} vAlign="center">
      <Icon icon={KIND_ICONS[entryKind(item.type)]} color={entryColor(item)} />
      <StackItem size="fill">
        <VStack gap={0}>
          <Text weight="medium" maxLines={2}>
            {t(entryTitleKey(item))}
          </Text>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDateTime(item.used_at, undefined, locale)}
          </Text>
          {/* What the administrator wrote about the change. On this side it has the room to be read. */}
          {item.notes && (
            <Text type="supporting" color="secondary" maxLines={2}>
              {item.notes}
            </Text>
          )}
        </VStack>
      </StackItem>
      {/* At most half of the row: a long group name is cut short instead of pushing the title out. */}
      <VStack gap={0} maxWidth="50%">
        {value && (
          <Text weight="semibold" justify="end" maxLines={2} hasTabularNumbers>
            {value}
          </Text>
        )}
        {trace && (
          <Text type="supporting" color="secondary" justify="end" maxLines={1} hasTabularNumbers>
            {trace}
          </Text>
        )}
      </VStack>
    </HStack>
  )
}

/** The codes the user has used and the changes administrators made, newest first. */
export function HistoryCard({
  history,
  isRedeeming,
}: {
  history: RedeemHistory
  /** A code is on its way: the list is about to start over, so its pages are not to be turned. */
  isRedeeming: boolean
}) {
  const { t } = useI18n()
  const announce = useAnnounce()
  const banner = useRef<HTMLDivElement>(null)
  const told = useRef<HistoryFailure | null>(null)
  const { failure } = history

  // A load that failed is told to screen readers. When the user had asked for it, its banner is brought into
  // view as well: the banner is at the top of the list, and the pages are turned at its bottom.
  useEffect(() => {
    if (!failure || failure === told.current) return
    told.current = failure
    announce(t('redeem.historyLoadFailed'))
    if (failure.isAsked) banner.current?.scrollIntoView({ block: 'nearest' })
  }, [failure, announce, t])

  return (
    <Card>
      <VStack gap={3}>
        <Heading level={4}>{t('redeem.recentActivity')}</Heading>

        {failure && (
          <Banner
            ref={banner}
            status="error"
            title={t('redeem.historyLoadFailed')}
            description={failure.reason || undefined}
            endContent={
              <Button
                size="sm"
                variant="secondary"
                label={t('common.refresh')}
                isLoading={history.isLoading}
                onClick={history.reload}
              />
            }
          />
        )}

        {history.items.length > 0 ? (
          history.items.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && <Divider />}
              <HistoryRow item={item} />
            </Fragment>
          ))
        ) : history.hasLoaded ? (
          <EmptyState
            isCompact
            headingLevel={5}
            icon={<Icon icon={ClockIcon} size="lg" color="secondary" />}
            title={t('redeem.historyWillAppear')}
          />
        ) : (
          // A first load that failed leaves only its banner.
          history.isLoading && (
            <Center padding={6}>
              <Spinner label={t('common.loading')} />
            </Center>
          )
        )}

        {history.total > 0 && (
          <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {`${t('common.total')}: ${history.total} ${t('pagination.results')}`}
            </Text>
            <Pagination
              page={history.page}
              onChange={history.goToPage}
              totalItems={history.total}
              pageSize={history.pageSize}
              pageSizeOptions={history.pageSizeOptions}
              onPageSizeChange={history.changePageSize}
              variant="input"
              size="sm"
              isDisabled={history.isLoading || isRedeeming}
            />
          </HStack>
        )}
      </VStack>
    </Card>
  )
}
