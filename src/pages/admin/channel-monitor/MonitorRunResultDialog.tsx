import { Fragment } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { MonitorQuota } from '~/components/monitor/MonitorQuota'
import { formatLatencyMs, formatMonitorModel } from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import type { CheckResult } from '~/lib/api/admin/channelMonitor'
import { MonitorStatusBadge } from './MonitorStatusBadge'

/**
 * How a check that was run by hand went: one result for each model of the monitor, with what the provider
 * answered and, for a monitor that reads quota, the quota. Port of
 * components/admin/monitor/MonitorRunResultDialog.vue.
 */
export function MonitorRunResultDialog({ results, onClose }: { results: CheckResult[]; onClose: () => void }) {
  const { t } = useI18n()
  const close = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  return (
    <Dialog isOpen onOpenChange={close} width={560} maxHeight="80dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.channelMonitor.runResultTitle')} onOpenChange={close} />}
        content={
          <LayoutContent>
            {results.length === 0 ? (
              <Text type="supporting">{t('common.noData')}</Text>
            ) : (
              <VStack gap={3} hAlign="stretch">
                {results.map((result, index) => (
                  <Fragment key={`${result.model}-${index}`}>
                    {index > 0 && <Divider />}
                    <HStack gap={3} hAlign="between" vAlign="start">
                      <StackItem size="fill">
                        <VStack gap={1} hAlign="stretch">
                          <Text type="code" wordBreak="break-all">
                            {formatMonitorModel(result.model, t)}
                          </Text>
                          {result.message && (
                            <Text type="supporting" wordBreak="break-all">
                              {result.message}
                            </Text>
                          )}
                          {result.quota && <MonitorQuota snapshot={result.quota} />}
                        </VStack>
                      </StackItem>
                      <HStack gap={2} vAlign="center">
                        <MonitorStatusBadge status={result.status} />
                        <Text type="supporting" color="primary" hasTabularNumbers textWrap="nowrap">
                          {formatLatencyMs(result.latency_ms, t)}
                        </Text>
                      </HStack>
                    </HStack>
                  </Fragment>
                ))}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
