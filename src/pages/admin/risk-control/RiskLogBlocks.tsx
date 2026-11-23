import { Divider } from '@astryxdesign/core/Divider'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import { LogOutcomeBadge, LogUnbanButton, LogViewButton, type LogRow } from './riskLogColumns'
import {
  NO_VALUE,
  callerText,
  highestText,
  inputText,
  latencyText,
  noticeText,
  routeText,
  violationText,
} from './riskLogs'
import type { RiskLogs } from './useRiskLogs'

const joined = (parts: Array<string | false | null | undefined>) =>
  parts.filter((part) => part && part !== NO_VALUE).join(' · ')

/**
 * The records one under the other, each as a block: what the table tells, where the table would
 * not fit and would have to scroll sideways.
 */
export function RiskLogBlocks({
  rows,
  list,
  onView,
}: {
  rows: LogRow[]
  list: RiskLogs
  onView: (log: LogRow) => void
}) {
  const { t, locale } = useI18n()
  return (
    <VStack gap={3}>
      {rows.map((row) => (
        <VStack key={row.id} gap={2}>
          <Divider />
          <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <LogOutcomeBadge log={row} />
              <Text type="supporting" hasTabularNumbers>
                {formatDateTime(row.created_at) || NO_VALUE}
              </Text>
            </HStack>
            <HStack gap={1} vAlign="center">
              <LogUnbanButton log={row} list={list} />
              <LogViewButton onClick={() => onView(row)} />
            </HStack>
          </HStack>
          <VStack gap={0.5}>
            <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
              {joined([row.user_email, callerText(row)]) || NO_VALUE}
            </Text>
            <Text type="supporting" wordBreak="break-all">
              {joined([row.group_name, row.endpoint, routeText(row)])}
            </Text>
            <Text type="supporting" hasTabularNumbers wordBreak="break-word">
              {joined([
                highestText(row),
                row.matched_keyword && `${t('admin.riskControl.matchedKeyword')}: ${row.matched_keyword}`,
                violationText(row, t),
                noticeText(row, t),
                latencyText(row.upstream_latency_ms, locale),
                row.queue_delay_ms != null && t('admin.riskControl.queueDelay', { ms: row.queue_delay_ms }),
              ])}
            </Text>
          </VStack>
          {/* No hover tip, as in the table: the view button shows the input in full. */}
          <Text type="supporting" color="primary" maxLines={2} hasTruncateTooltip={false} wordBreak="break-word">
            {inputText(row)}
          </Text>
        </VStack>
      ))}
    </VStack>
  )
}
