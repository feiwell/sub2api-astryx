import { useEffect, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { extractApiErrorMessage } from '@/utils/apiError'
import { providerLabel } from '~/components/monitor/monitorText'
import { t as translate, useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { AssociatedMonitorBrief, ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import { toast } from '~/lib/toast'
import { pickedMonitorIds } from './monitorTemplate'

/**
 * Copies the request of a template over that of the monitors created from it: all of them, or those picked.
 * Mount it for each opening. Port of components/admin/monitor/MonitorTemplateApplyPickerDialog.vue.
 */
export function MonitorTemplateApplyDialog({
  template,
  onClose,
  onApplied,
}: {
  template: ChannelMonitorTemplate
  onClose: () => void
  /** The template was applied; monitors, and what the template says of them, are out of date. */
  onApplied: () => void
}) {
  const { t } = useI18n()
  // Null until the monitors are read.
  const [monitors, setMonitors] = useState<AssociatedMonitorBrief[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [isApplying, setApplying] = useState(false)

  useEffect(() => {
    let isCurrent = true
    adminAPI.channelMonitorTemplate.listAssociatedMonitors(template.id).then(
      (answer) => {
        if (!isCurrent) return
        const items = answer.items || []
        setMonitors(items)
        // Every monitor starts picked: bringing all of them in line is what a template is mostly applied for.
        setPicked(items.map((monitor) => String(monitor.id)))
      },
      (error: unknown) => {
        if (!isCurrent) return
        setMonitors([])
        setFailure(extractApiErrorMessage(error, translate('common.error')))
      },
    )
    return () => {
      isCurrent = false
    }
  }, [template.id])

  const all = monitors ?? []
  const ids = pickedMonitorIds(all, picked)

  const close = () => {
    if (!isApplying) onClose()
  }
  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) close()
  }

  const apply = async () => {
    if (isApplying || ids.length === 0) return
    setApplying(true)
    let affected: number
    try {
      affected = (await adminAPI.channelMonitorTemplate.apply(template.id, ids)).affected
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
      setApplying(false)
      return
    }
    toast.success(t('admin.channelMonitor.template.applySuccess', { n: affected }))
    onApplied()
    onClose()
  }

  const describe = (monitor: AssociatedMonitorBrief) => {
    const provider = providerLabel(monitor.provider, t)
    if (monitor.provider !== 'openai') return provider
    const apiMode =
      monitor.api_mode === 'responses'
        ? t('admin.channelMonitor.form.apiModeResponses')
        : t('admin.channelMonitor.form.apiModeChatCompletions')
    return `${provider} · ${apiMode}`
  }

  return (
    // While the template is being applied the dialog stays: Escape, the close button and Cancel are off.
    <Dialog
      isOpen
      onOpenChange={reportOpen}
      width={520}
      maxHeight="80dvh"
      purpose={isApplying ? 'required' : 'form'}
    >
      <Layout
        header={
          <DialogHeader
            title={t('admin.channelMonitor.template.applyPickerTitle', { name: template.name })}
            onOpenChange={isApplying ? undefined : reportOpen}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={3} hAlign="stretch">
              <Text type="supporting">{t('admin.channelMonitor.template.applyPickerHint')}</Text>

              {failure && <Banner status="error" title={failure} />}

              {monitors === null ? (
                <Center padding={6}>
                  <Spinner label={t('common.loading')} />
                </Center>
              ) : all.length === 0 ? (
                // A failed load leaves only its banner.
                !failure && (
                  <Center padding={6}>
                    <Text type="supporting">{t('admin.channelMonitor.template.applyPickerEmpty')}</Text>
                  </Center>
                )
              ) : (
                <>
                  <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                    <HStack gap={1} vAlign="center">
                      <Button
                        label={t('common.selectAll')}
                        variant="ghost"
                        size="sm"
                        isDisabled={isApplying || ids.length === all.length}
                        onClick={() => setPicked(all.map((monitor) => String(monitor.id)))}
                      />
                      <Button
                        label={t('admin.channelMonitor.template.selectNone')}
                        variant="ghost"
                        size="sm"
                        isDisabled={isApplying || ids.length === 0}
                        onClick={() => setPicked([])}
                      />
                    </HStack>
                    <Text type="supporting" hasTabularNumbers>
                      {t('admin.channelMonitor.template.selectedCount', { n: ids.length, total: all.length })}
                    </Text>
                  </HStack>
                  <CheckboxList
                    label={t('admin.channelMonitor.template.applyButton')}
                    isLabelHidden
                    hasDividers
                    value={picked}
                    onChange={setPicked}
                    isDisabled={isApplying}
                  >
                    {all.map((monitor) => (
                      <CheckboxListItem
                        key={monitor.id}
                        value={String(monitor.id)}
                        label={monitor.name}
                        description={describe(monitor)}
                        // A monitor switched off takes the template all the same; it only does not check.
                        endContent={monitor.enabled ? undefined : <Badge label={t('common.disabled')} />}
                      />
                    ))}
                  </CheckboxList>
                </>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isApplying} onClick={close} />
              <Button
                label={
                  isApplying
                    ? t('common.submitting')
                    : t('admin.channelMonitor.template.applyPickerConfirm', { n: ids.length })
                }
                variant="primary"
                isLoading={isApplying}
                isDisabled={ids.length === 0}
                onClick={() => void apply()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
