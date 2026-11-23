import { useEffect, useState, type ReactNode } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { Token } from '@astryxdesign/core/Token'
import { ArrowPathIcon, UserIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import {
  opsAPI,
  type OpsAccountAvailabilityStatsResponse,
  type OpsConcurrencyStatsResponse,
  type OpsUserConcurrencyStatsResponse,
} from '~/lib/api/admin/ops'
import { OpsCardHeader } from './OpsStatCard'
import {
  accountRows,
  dimensionOf,
  formatRemaining,
  groupRows,
  loadTone,
  platformRows,
  userRows,
  type AccountStatus,
  type ConcurrencyAccountRow,
  type ConcurrencySummaryRow,
  type ConcurrencyUserRow,
} from './concurrency'
import { errorMessage } from './errors'
import type { OpsTone } from './health'
import { OPS_CHART_HEIGHT } from './opsChart'

// The card stands beside charts: its body is as tall as their plot, and a long list scrolls inside it.
const BODY_HEIGHT = OPS_CHART_HEIGHT
const LIST_HEIGHT = BODY_HEIGHT - 28
/** Up to this many entries fit the list height; a short list keeps its own height instead of a scroll box. */
const ROWS_BEFORE_SCROLL = 3

interface AccountStats {
  loads: OpsConcurrencyStatsResponse
  availability: OpsAccountAvailabilityStatsResponse
}

/**
 * Who is using the capacity right now: running requests against the limit, and what waits in the queue.
 * It lists one level below the page's filter (platforms, a platform's groups, a group's accounts), or users.
 */
export function OpsConcurrencyCard({
  platform,
  groupId,
  refreshKey,
  isEnabled,
  onDisabled,
}: {
  platform: string
  groupId: number | null
  /** Changes on every page refresh; the card reloads with it. */
  refreshKey: number
  /** Realtime monitoring can be switched off in the settings; the card then loads nothing. */
  isEnabled: boolean
  /** The backend reported realtime monitoring as switched off. */
  onDisabled: () => void
}) {
  const { t } = useI18n()
  const [isByUser, setByUser] = useState(false)
  const [reloads, setReloads] = useState(0)
  const [stats, setStats] = useState<AccountStats | null>(null)
  const [users, setUsers] = useState<OpsUserConcurrencyStatsResponse | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  // refreshKey and reloads are not sent; they are here so a page refresh or the card's own button reloads it.
  useEffect(() => {
    if (!isEnabled) return
    let cancelled = false
    setLoading(true)
    setErrorText('')
    const request = isByUser
      ? opsAPI.getUserConcurrencyStats().then((next) => {
          if (cancelled) return
          setUsers(next)
          if (next?.enabled === false) onDisabled()
        })
      : Promise.all([
          opsAPI.getConcurrencyStats(platform, groupId),
          opsAPI.getAccountAvailabilityStats(platform, groupId),
        ]).then(([loads, availability]) => {
          if (cancelled) return
          setStats({ loads, availability })
          if (loads?.enabled === false || availability?.enabled === false) onDisabled()
        })
    request
      .catch((error) => {
        if (cancelled) return
        console.error('[ops] failed to load concurrency', error)
        setErrorText(errorMessage(error) || t('admin.ops.concurrency.loadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEnabled, isByUser, platform, groupId, refreshKey, reloads, onDisabled, t])

  const isBusy = isEnabled && isLoading
  const dimension = dimensionOf(isByUser, platform, groupId)
  const listTitle = {
    platform: t('admin.ops.concurrency.byPlatform'),
    group: t('admin.ops.concurrency.byGroup'),
    account: t('admin.ops.concurrency.byAccount'),
    user: t('admin.ops.concurrency.byUser'),
  }[dimension]

  let rows: ReactNode[]
  if (dimension === 'user') {
    rows = userRows(users).map((row) => <UserRow key={row.key} row={row} />)
  } else if (dimension === 'account') {
    rows = accountRows(stats?.loads, stats?.availability, groupId).map((row) => <AccountRow key={row.key} row={row} />)
  } else {
    const summaries =
      dimension === 'group'
        ? groupRows(stats?.loads, stats?.availability, platform)
        : platformRows(stats?.loads, stats?.availability)
    rows = summaries.map((row) => <SummaryRow key={row.key} row={row} />)
  }

  // Nothing listed while the answer is on its way or did not come: that is not "0 entries, no data".
  const isUnknown = rows.length === 0 && (isBusy || errorText !== '')

  const viewSwitchLabel = isByUser
    ? t('admin.ops.concurrency.switchToPlatform')
    : t('admin.ops.concurrency.switchToUser')

  return (
    <Card>
      <VStack gap={3}>
        <OpsCardHeader
          title={t('admin.ops.concurrency.title')}
          action={
            <HStack gap={1} vAlign="center">
              <ToggleButton
                size="sm"
                isIconOnly
                icon={<Icon icon={UserIcon} />}
                label={viewSwitchLabel}
                tooltip={viewSwitchLabel}
                isPressed={isByUser}
                isDisabled={!isEnabled}
                onPressedChange={setByUser}
              />
              <IconButton
                size="sm"
                variant="ghost"
                icon={<Icon icon={ArrowPathIcon} />}
                label={t('common.refresh')}
                tooltip={t('common.refresh')}
                isLoading={isBusy}
                isDisabled={!isEnabled}
                onClick={() => setReloads((count) => count + 1)}
              />
            </HStack>
          }
        />
        {isEnabled && errorText && <Banner status="error" title={errorText} />}
        {!isEnabled ? (
          <Center height={BODY_HEIGHT}>
            <Text type="supporting" color="secondary">
              {t('admin.ops.concurrency.disabledHint')}
            </Text>
          </Center>
        ) : (
          <VStack gap={2}>
            <HStack gap={2} hAlign="between" vAlign="center">
              <Text type="supporting" weight="medium">
                {listTitle}
              </Text>
              {!isUnknown && (
                <Text type="supporting" color="secondary">
                  {t('admin.ops.concurrency.totalRows', { count: rows.length })}
                </Text>
              )}
            </HStack>
            {rows.length === 0 ? (
              <Center height={LIST_HEIGHT}>
                {isBusy && <Spinner />}
                {!isUnknown && (
                  <Text type="supporting" color="secondary">
                    {t('admin.ops.concurrency.empty')}
                  </Text>
                )}
              </Center>
            ) : rows.length > ROWS_BEFORE_SCROLL ? (
              <ScrollableArea label={listTitle} height={LIST_HEIGHT}>
                <VStack gap={4}>{rows}</VStack>
              </ScrollableArea>
            ) : (
              <VStack gap={4}>{rows}</VStack>
            )}
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

/** One entry of the list: name, running requests against the limit, a bar for the load, then its marks. */
function LoadRow({
  name,
  inUse,
  capacity,
  loadPercent,
  status,
  children,
}: {
  name: string
  inUse: number
  capacity: number
  loadPercent: number
  /** Takes the place of the load percentage at the end of the first line. */
  status?: ReactNode
  /** What goes under the bar: account counts, queue length. */
  children?: ReactNode
}) {
  return (
    <VStack gap={1}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Text weight="medium" maxLines={1}>
            {name}
          </Text>
        </StackItem>
        <Text type="supporting" weight="medium" hasTabularNumbers textWrap="nowrap">
          {inUse}/{capacity}
        </Text>
        {status ?? (
          <Text type="supporting" color="secondary" hasTabularNumbers textWrap="nowrap">
            {Math.round(loadPercent)}%
          </Text>
        )}
      </HStack>
      <ProgressBar
        label={name}
        isLabelHidden
        value={Math.min(100, Math.max(0, loadPercent))}
        variant={loadTone(loadPercent)}
      />
      {children}
    </VStack>
  )
}

function QueueMark({ queued }: { queued: number }) {
  const { t } = useI18n()
  if (queued <= 0) return null
  return <Token size="sm" color="blue" label={t('admin.ops.concurrency.queued', { count: queued })} />
}

function Marks({ note, children }: { note?: string; children?: ReactNode }) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {note && (
        <Text type="supporting" color="secondary">
          {note}
        </Text>
      )}
      {children}
    </HStack>
  )
}

function SummaryRow({ row }: { row: ConcurrencySummaryRow }) {
  const { t } = useI18n()
  const accounts = `${t('admin.ops.accountAvailability.available')} ${row.availableAccounts}/${row.totalAccounts} (${row.availabilityPercent}%)`
  return (
    <LoadRow name={row.name} inUse={row.inUse} capacity={row.capacity} loadPercent={row.loadPercent}>
      <Marks note={row.platform ? `${row.platform.toUpperCase()} · ${accounts}` : accounts}>
        {row.rateLimitedAccounts > 0 && (
          <Token
            size="sm"
            color="orange"
            label={t('admin.ops.concurrency.rateLimited', { count: row.rateLimitedAccounts })}
          />
        )}
        {row.errorAccounts > 0 && (
          <Token size="sm" color="red" label={t('admin.ops.concurrency.errorAccounts', { count: row.errorAccounts })} />
        )}
        <QueueMark queued={row.queued} />
      </Marks>
    </LoadRow>
  )
}

function AccountRow({ row }: { row: ConcurrencyAccountRow }) {
  return (
    <LoadRow
      name={row.name}
      inUse={row.inUse}
      capacity={row.capacity}
      loadPercent={row.loadPercent}
      status={<AccountStatusMark status={row.status} />}
    >
      {(row.groupName || row.queued > 0) && (
        <Marks note={row.groupName}>
          <QueueMark queued={row.queued} />
        </Marks>
      )}
    </LoadRow>
  )
}

function UserRow({ row }: { row: ConcurrencyUserRow }) {
  return (
    <LoadRow name={row.name} inUse={row.inUse} capacity={row.capacity} loadPercent={row.loadPercent}>
      {(row.email || row.queued > 0) && (
        <Marks note={row.email}>
          <QueueMark queued={row.queued} />
        </Marks>
      )}
    </LoadRow>
  )
}

/** Whether an account takes requests, and for a rate limit or an overload how long it still lasts. */
function AccountStatusMark({ status }: { status: AccountStatus }) {
  const { t } = useI18n()
  let tone: OpsTone = 'neutral'
  let text = t('admin.ops.accountAvailability.unavailable')
  let detail = ''
  if (status.kind === 'available') {
    tone = 'success'
    text = t('admin.ops.accountAvailability.available')
  } else if (status.kind === 'rateLimited') {
    tone = 'warning'
    text = `${t('admin.accounts.status.rateLimited')} ${formatRemaining(status.remainingSeconds)}`
  } else if (status.kind === 'overloaded') {
    tone = 'error'
    text = `${t('admin.accounts.status.overloaded')} ${formatRemaining(status.remainingSeconds)}`
  } else if (status.kind === 'error') {
    tone = 'error'
    text = t('admin.ops.accountAvailability.accountError')
    detail = status.message
  }
  return (
    <HStack gap={1} vAlign="center">
      <StatusDot variant={tone} label={text} tooltip={detail || text} />
      <Text type="supporting" textWrap="nowrap">
        {text}
      </Text>
    </HStack>
  )
}
