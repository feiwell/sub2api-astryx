import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import { LogOutcomeBadge, type LogRow } from './riskLogColumns'
import {
  NO_VALUE,
  auditSourceText,
  highestText,
  inputText,
  latencyText,
  noticeText,
  routeText,
  violationText,
} from './riskLogs'

const DIALOG_WIDTH = 880
// The input can run to pages; it scrolls in its own box so the facts above it stay in view.
const INPUT_MAX_HEIGHT = 'min(46vh, 26rem)'

/** One audit record in full: who sent what where, how the audit ended, and the input it saw. */
export function RiskLogDetailDialog({ log, onClose }: { log: LogRow; onClose: () => void }) {
  const { t, locale } = useI18n()
  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }
  const value = (text: string | null | undefined) => (
    <Text type="supporting" color="primary" wordBreak="break-word">
      {text || NO_VALUE}
    </Text>
  )

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={DIALOG_WIDTH} maxHeight="90dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.riskControl.inputDetailTitle')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <MetadataList columns="multi">
                <MetadataListItem label={t('admin.riskControl.table.time')}>
                  {value(formatDateTime(log.created_at))}
                </MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.result')}>
                  <LogOutcomeBadge log={log} />
                </MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.user')}>
                  {value([log.user_email, log.user_id ? `UID ${log.user_id}` : ''].filter(Boolean).join(' · '))}
                </MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.apiKey')}>{value(log.api_key_name)}</MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.group')}>{value(log.group_name)}</MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.endpoint')}>
                  {value(`${log.endpoint || NO_VALUE} · ${routeText(log)}`)}
                </MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.highest')}>{value(highestText(log))}</MetadataListItem>
                {log.matched_keyword && (
                  <MetadataListItem label={t('admin.riskControl.matchedKeyword')}>
                    {value(log.matched_keyword)}
                  </MetadataListItem>
                )}
                <MetadataListItem label={t('admin.riskControl.table.actionMeta')}>
                  {value(`${violationText(log, t)} · ${noticeText(log, t)}`)}
                </MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.table.latency')}>
                  {value(
                    [
                      latencyText(log.upstream_latency_ms, locale),
                      log.queue_delay_ms != null && t('admin.riskControl.queueDelay', { ms: log.queue_delay_ms }),
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  )}
                </MetadataListItem>
                <MetadataListItem label={t('admin.riskControl.auditSource')}>
                  {value(auditSourceText(log, t))}
                </MetadataListItem>
              </MetadataList>

              <VStack gap={2}>
                <Text type="label">{t('admin.riskControl.inputDetailContent')}</Text>
                <CodeBlock
                  code={inputText(log)}
                  language="plaintext"
                  hasLanguageLabel={false}
                  isWrapped
                  maxHeight={INPUT_MAX_HEIGHT}
                  width="100%"
                  size="sm"
                />
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
