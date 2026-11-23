import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { CheckCircleIcon, EyeIcon } from '@heroicons/react/24/outline'
import { formatDateOnly, formatTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { ContentModerationLog } from '~/lib/api/admin/riskControl'
import {
  NO_VALUE,
  callerText,
  canUnban,
  highestText,
  inputText,
  latencyText,
  logOutcome,
  noticeText,
  outcomeLabel,
  outcomeVariant,
  routeText,
  violationText,
} from './riskLogs'
import type { RiskLogs } from './useRiskLogs'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
export type LogRow = Pick<ContentModerationLog, keyof ContentModerationLog>

// The date on one line and the time under it: `2026/11/20`.
const TIME_COLUMN_WIDTH = 96
/**
 * The shares of the flexible columns, and the narrowest one share gets. The table takes its own
 * narrowest width from the column whose floor is largest for its share, so every floor follows the
 * share: no column then holds the others wider than they need to be.
 */
const SHARES = { user: 14, group: 10, endpoint: 13, result: 14, action: 12, latency: 9, input: 14 }
const SHARE_FLOOR = 10
const flexible = (share: number) => proportional(share, { minWidth: share * SHARE_FLOOR })

/** The narrowest the records table gets before it scrolls sideways. */
export const LOG_TABLE_MIN_WIDTH =
  TIME_COLUMN_WIDTH + SHARE_FLOOR * Object.values(SHARES).reduce((sum, share) => sum + share, 0)

/** How the record ended, as a coloured label. */
export function LogOutcomeBadge({ log }: { log: LogRow }) {
  const { t } = useI18n()
  const outcome = logOutcome(log)
  return <Badge variant={outcomeVariant(outcome)} label={outcomeLabel(outcome, t)} />
}

/** Lifts the ban a record put on its user. Renders nothing on a record that has no ban to lift. */
export function LogUnbanButton({ log, list }: { log: LogRow; list: RiskLogs }) {
  const { t } = useI18n()
  if (!canUnban(log)) return null
  const isBusy = list.unbanningUserId === log.user_id
  return (
    <Button
      label={t('admin.riskControl.unbanUser')}
      variant="secondary"
      size="sm"
      icon={<Icon icon={CheckCircleIcon} />}
      isLoading={isBusy}
      // One unban at a time: the buttons of other users wait for the one under way.
      isDisabled={list.unbanningUserId !== null && !isBusy}
      onClick={() => void list.unban(log)}
    />
  )
}

/** Opens the record in full. */
export function LogViewButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  const label = t('admin.riskControl.inputDetailTitle')
  return <IconButton label={label} tooltip={label} variant="ghost" size="sm" icon={<Icon icon={EyeIcon} />} onClick={onClick} />
}

/**
 * The columns of the records table. RiskControlView.vue has ten and scrolls sideways; here the
 * API key sits under the user and the highest score under the result, so the table fits its card.
 */
export function riskLogColumns({
  t,
  locale,
  list,
  onView,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  locale: string
  list: RiskLogs
  onView: (log: LogRow) => void
}): TableColumn<LogRow>[] {
  return [
    {
      key: 'created_at',
      header: t('admin.riskControl.table.time'),
      width: pixel(TIME_COLUMN_WIDTH),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" color="primary" hasTabularNumbers textWrap="nowrap">
            {formatDateOnly(row.created_at) || NO_VALUE}
          </Text>
          <Text type="supporting" hasTabularNumbers textWrap="nowrap">
            {formatTime(row.created_at)}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'user',
      header: `${t('admin.riskControl.table.user')} / ${t('admin.riskControl.table.apiKey')}`,
      width: flexible(SHARES.user),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" color="primary" maxLines={1} hasTruncateTooltip>
            {row.user_email || NO_VALUE}
          </Text>
          {callerText(row) && (
            <Text type="supporting" maxLines={1} hasTruncateTooltip>
              {callerText(row)}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'group_name',
      header: t('admin.riskControl.table.group'),
      width: flexible(SHARES.group),
      renderCell: (row) => (
        <Text type="supporting" color="primary" maxLines={2} hasTruncateTooltip wordBreak="break-word">
          {row.group_name || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'endpoint',
      header: t('admin.riskControl.table.endpoint'),
      width: flexible(SHARES.endpoint),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" color="primary" wordBreak="break-word">
            {row.endpoint || NO_VALUE}
          </Text>
          <Text type="supporting" maxLines={1} hasTruncateTooltip>
            {routeText(row)}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'result',
      header: `${t('admin.riskControl.table.result')} / ${t('admin.riskControl.table.highest')}`,
      width: flexible(SHARES.result),
      renderCell: (row) => (
        <VStack gap={1} hAlign="start">
          <LogOutcomeBadge log={row} />
          <Text type="supporting" hasTabularNumbers wordBreak="break-word">
            {highestText(row)}
          </Text>
          {row.matched_keyword && (
            <Text type="supporting" color="primary" weight="medium" maxLines={1} hasTruncateTooltip>
              {`${t('admin.riskControl.matchedKeyword')}: ${row.matched_keyword}`}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'action_meta',
      header: t('admin.riskControl.table.actionMeta'),
      width: flexible(SHARES.action),
      renderCell: (row) => (
        <VStack gap={1} hAlign="start">
          <VStack gap={0.5}>
            <Text type="supporting" color="primary" hasTabularNumbers>
              {violationText(row, t)}
            </Text>
            <Text type="supporting">{noticeText(row, t)}</Text>
          </VStack>
          <LogUnbanButton log={row} list={list} />
        </VStack>
      ),
    },
    {
      key: 'upstream_latency_ms',
      header: t('admin.riskControl.table.latency'),
      // `12,345 ms` at its narrowest; the queue delay under it needs the room a wider table gives.
      width: flexible(SHARES.latency),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" color="primary" hasTabularNumbers textWrap="nowrap">
            {latencyText(row.upstream_latency_ms, locale)}
          </Text>
          {row.queue_delay_ms != null && (
            <Text type="supporting" hasTabularNumbers>
              {t('admin.riskControl.queueDelay', { ms: row.queue_delay_ms })}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: 'input',
      header: t('admin.riskControl.table.input'),
      width: flexible(SHARES.input),
      renderCell: (row) => (
        <HStack gap={1} vAlign="start">
          <StackItem size="fill">
            {/* No hover tip: it would hold the whole input, pages of it at times. The button shows it in full. */}
            <Text type="supporting" color="primary" maxLines={2} hasTruncateTooltip={false} wordBreak="break-word">
              {inputText(row)}
            </Text>
          </StackItem>
          <LogViewButton onClick={() => onView(row)} />
        </HStack>
      ),
    },
  ]
}
