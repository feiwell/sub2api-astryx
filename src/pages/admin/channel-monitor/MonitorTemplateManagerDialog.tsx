import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { extractApiErrorMessage } from '@/utils/apiError'
import { providerLabel } from '~/components/monitor/monitorText'
import { t as translate, useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { BodyOverrideMode } from '~/lib/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import { toast } from '~/lib/toast'
import { MonitorTemplateApplyDialog } from './MonitorTemplateApplyDialog'
import { MonitorTemplateFormDialog } from './MonitorTemplateFormDialog'
import { FORM_PROVIDERS, normalApiMode } from './monitorForm'
import {
  providerForNewTemplate,
  templateBodyMode,
  templateHeaderCount,
  templateProviders,
  templatesOf,
} from './monitorTemplate'

// Wide enough for the tabs of all providers to show side by side on a desktop.
const DIALOG_WIDTH = 920
// Providers have different numbers of templates; the dialog should not jump from one tab to the next.
const LIST_MIN_HEIGHT = 240

/**
 * The request templates: what a check sends on top of, or in place of, the usual request, kept under a name
 * so that many monitors can share it. Here they are listed by provider, created, edited, deleted, and
 * applied again to the monitors created from them. Mount it for each opening.
 * Port of components/admin/monitor/MonitorTemplateManagerDialog.vue.
 */
export function MonitorTemplateManagerDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void
  /** A template was created, saved, deleted or applied; what is shown of the monitors is out of date. */
  onChanged: () => void
}) {
  const { t } = useI18n()
  // Null until the templates are read.
  const [templates, setTemplates] = useState<ChannelMonitorTemplate[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)
  // The provider picked to have its templates listed.
  const [pickedProvider, setPickedProvider] = useState<string>(FORM_PROVIDERS[0])
  // The template in the form: one of the list, or a new one.
  const [editing, setEditing] = useState<ChannelMonitorTemplate | 'new' | null>(null)
  const [applying, setApplying] = useState<ChannelMonitorTemplate | null>(null)
  const [toDelete, setToDelete] = useState<ChannelMonitorTemplate | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  // The templates are read again after every change; only the answer to the last reading counts.
  const lastLoad = useRef(0)

  const load = useCallback(() => {
    const request = ++lastLoad.current
    setLoading(true)
    adminAPI.channelMonitorTemplate.list().then(
      (answer) => {
        if (request !== lastLoad.current) return
        setTemplates(answer.items || [])
        setFailure(null)
        setLoading(false)
      },
      (error: unknown) => {
        if (request !== lastLoad.current) return
        setFailure(extractApiErrorMessage(error, translate('common.error')))
        setLoading(false)
      },
    )
  }, [])

  useEffect(load, [load])

  const reportChange = () => {
    load()
    onChanged()
  }

  const confirmDelete = () => {
    if (!toDelete) return
    setDeleting(true)
    adminAPI.channelMonitorTemplate
      .del(toDelete.id)
      .then(() => {
        toast.success(t('admin.channelMonitor.template.deleteSuccess'))
        reportChange()
      })
      .catch((error: unknown) => {
        console.error('[channel-monitor] failed to delete a template', error)
        toast.error(extractApiErrorMessage(error, t('common.error')))
      })
      .finally(() => {
        setDeleting(false)
        setToDelete(null)
      })
  }

  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  const all = templates ?? []
  const providers = templateProviders(all)
  // A provider only a stored template had is no longer listed once that template is deleted.
  const listed = providers.includes(pickedProvider) ? pickedProvider : providers[0]
  const shown = templatesOf(all, listed)

  const bodyModeLabels: Record<BodyOverrideMode, string> = {
    off: t('admin.channelMonitor.advanced.bodyModeOff'),
    merge: t('admin.channelMonitor.advanced.bodyModeMerge'),
    replace: t('admin.channelMonitor.advanced.bodyModeReplace'),
  }

  const row = (template: ChannelMonitorTemplate) => {
    const bodyMode = templateBodyMode(template)
    const associated = template.associated_monitors || 0
    const facts = [t('admin.channelMonitor.template.headersSummary', { n: templateHeaderCount(template) })]
    if (associated > 0) facts.push(t('admin.channelMonitor.template.associatedCount', { n: associated }))

    return (
      <ListItem
        key={template.id}
        align="first-line"
        label={
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text weight="semibold">{template.name}</Text>
            <Badge variant={bodyMode === 'off' ? 'neutral' : 'info'} label={bodyModeLabels[bodyMode]} />
            {template.provider === 'openai' && (
              <Badge
                label={
                  normalApiMode(template.api_mode) === 'responses'
                    ? t('admin.channelMonitor.form.apiModeResponses')
                    : t('admin.channelMonitor.form.apiModeChatCompletions')
                }
              />
            )}
          </HStack>
        }
        description={
          <VStack gap={1}>
            {template.description && <Text type="supporting">{template.description}</Text>}
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {facts.join(' · ')}
            </Text>
          </VStack>
        }
        endContent={
          <HStack gap={1} vAlign="center">
            <Button
              label={t('admin.channelMonitor.template.applyButton')}
              tooltip={t('admin.channelMonitor.template.applyTooltip')}
              variant="secondary"
              size="sm"
              // A template no monitor was created from has nothing to be applied to.
              isDisabled={associated === 0}
              onClick={() => setApplying(template)}
            />
            <IconButton
              label={t('common.edit')}
              tooltip={t('common.edit')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={PencilSquareIcon} />}
              onClick={() => setEditing(template)}
            />
            <IconButton
              label={t('common.delete')}
              tooltip={t('common.delete')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={TrashIcon} />}
              onClick={() => setToDelete(template)}
            />
          </HStack>
        }
      />
    )
  }

  return (
    <>
      <Dialog isOpen onOpenChange={reportOpen} width={DIALOG_WIDTH} maxHeight="85dvh" purpose="info">
        <Layout
          header={
            <DialogHeader title={t('admin.channelMonitor.template.managerTitle')} onOpenChange={reportOpen} />
          }
          content={
            <LayoutContent>
              <VStack gap={3} hAlign="stretch">
                <TabList
                  value={listed}
                  onChange={setPickedProvider}
                  hasDivider
                  aria-label={t('admin.channelMonitor.form.provider')}
                >
                  {providers.map((provider) => {
                    const count = templatesOf(all, provider).length
                    return (
                      <Tab
                        key={provider}
                        value={provider}
                        label={providerLabel(provider, t)}
                        endContent={count > 0 ? <Badge label={count} /> : undefined}
                      />
                    )
                  })}
                </TabList>

                <HStack hAlign="end">
                  <Button
                    label={t('admin.channelMonitor.template.createButton')}
                    variant="primary"
                    icon={<Icon icon={PlusIcon} />}
                    onClick={() => setEditing('new')}
                  />
                </HStack>

                {failure && (
                  <Banner
                    status="error"
                    title={failure}
                    endContent={
                      <Button
                        label={t('common.refresh')}
                        variant="secondary"
                        size="sm"
                        isLoading={isLoading}
                        onClick={load}
                      />
                    }
                  />
                )}

                <VStack hAlign="stretch" minHeight={LIST_MIN_HEIGHT}>
                  {templates === null ? (
                    // A failed first load leaves only its banner.
                    isLoading && (
                      <Center padding={8}>
                        <Spinner label={t('common.loading')} />
                      </Center>
                    )
                  ) : shown.length === 0 ? (
                    <Center padding={8}>
                      <Text type="supporting">{t('admin.channelMonitor.template.emptyState')}</Text>
                    </Center>
                  ) : (
                    <List hasDividers>{shown.map(row)}</List>
                  )}
                </VStack>
              </VStack>
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

      {editing && (
        <MonitorTemplateFormDialog
          template={editing === 'new' ? null : editing}
          provider={providerForNewTemplate(listed)}
          onClose={() => setEditing(null)}
          onSaved={(provider) => {
            // A new template is shown where it went, which need not be the provider looked at.
            setPickedProvider(provider)
            reportChange()
          }}
        />
      )}

      {applying && (
        <MonitorTemplateApplyDialog
          template={applying}
          onClose={() => setApplying(null)}
          onApplied={reportChange}
        />
      )}

      {toDelete && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen && !isDeleting) setToDelete(null)
          }}
          title={t('common.delete')}
          description={t('admin.channelMonitor.template.deleteConfirm', {
            name: toDelete.name,
            n: toDelete.associated_monitors || 0,
          })}
          actionLabel={t('common.delete')}
          actionVariant="destructive"
          cancelLabel={t('common.cancel')}
          isActionLoading={isDeleting}
          onAction={confirmDelete}
        />
      )}
    </>
  )
}
