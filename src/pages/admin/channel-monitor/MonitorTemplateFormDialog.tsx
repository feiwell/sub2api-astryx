import { useEffect, useId, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { extractApiErrorMessage } from '@/utils/apiError'
import { providerLabel } from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { APIMode, Provider } from '~/lib/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import { toast } from '~/lib/toast'
import { MonitorRequestFields } from './MonitorRequestFields'
import { FORM_PROVIDERS } from './monitorForm'
import {
  createTemplateRequest,
  newTemplateForm,
  templateFormOf,
  templateFormProblems,
  updateTemplateRequest,
  withTemplateProvider,
  type TemplateForm,
} from './monitorTemplate'

const DIALOG_WIDTH = 640

const API_MODES: readonly APIMode[] = ['chat_completions', 'responses']

/**
 * Creates a request template, or edits one. Mount it for each opening: it starts from the template it is
 * given, or from an empty form. The form of components/admin/monitor/MonitorTemplateManagerDialog.vue, as a
 * dialog of its own on top of the list of templates.
 */
export function MonitorTemplateFormDialog({
  template,
  provider,
  onClose,
  onSaved,
}: {
  /** The template to edit; null to create one. */
  template: ChannelMonitorTemplate | null
  /** The provider a new template starts with. */
  provider: Provider
  onClose: () => void
  /** A template was created or saved, for the provider given; the list is out of date. */
  onSaved: (provider: Provider) => void
}) {
  const { t } = useI18n()
  const fieldsId = useId()
  const [form, setForm] = useState<TemplateForm>(() =>
    template ? templateFormOf(template) : newTemplateForm(provider),
  )
  const [isSaving, setSaving] = useState(false)
  // Problems are pointed out once saving was tried, not while the form is filled in.
  const [wasSaveTried, setSaveTried] = useState(false)
  // Raised to send the focus to the first field that stands in the way of saving.
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    if (focusRequest === 0) return
    const field = document.getElementById(fieldsId)?.querySelector<HTMLElement>('[aria-invalid="true"]')
    field?.scrollIntoView({ block: 'nearest' })
    field?.focus()
  }, [focusRequest, fieldsId])

  const problems = templateFormProblems(form)
  const cannotSave = Object.keys(problems).length > 0

  const pickProvider = (value: string) => {
    const picked = FORM_PROVIDERS.find((known) => known === value)
    if (picked) setForm((current) => withTemplateProvider(current, picked))
  }
  const pickApiMode = (value: string) => {
    const apiMode = API_MODES.find((known) => known === value)
    if (apiMode) setForm((current) => ({ ...current, apiMode }))
  }

  const close = () => {
    if (!isSaving) onClose()
  }
  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) close()
  }

  const save = async () => {
    if (isSaving) return
    if (cannotSave) {
      setSaveTried(true)
      setFocusRequest((request) => request + 1)
      return
    }
    setSaving(true)
    try {
      if (template) await adminAPI.channelMonitorTemplate.update(template.id, updateTemplateRequest(form))
      else await adminAPI.channelMonitorTemplate.create(createTemplateRequest(form))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
      setSaving(false)
      return
    }
    toast.success(
      template ? t('admin.channelMonitor.template.updateSuccess') : t('admin.channelMonitor.template.createSuccess'),
    )
    onSaved(form.provider)
    onClose()
  }

  const saveLabel = isSaving ? t('common.submitting') : template ? t('common.update') : t('common.create')

  return (
    // While the template is being saved the dialog stays: Escape, the close button and Cancel are off.
    <Dialog
      isOpen
      onOpenChange={reportOpen}
      width={DIALOG_WIDTH}
      maxHeight="85dvh"
      purpose={isSaving ? 'required' : 'form'}
    >
      <Layout
        header={
          <DialogHeader
            title={template ? t('common.edit') : t('admin.channelMonitor.template.createButton')}
            subtitle={template?.name}
            onOpenChange={isSaving ? undefined : reportOpen}
          />
        }
        content={
          <LayoutContent>
            <VStack id={fieldsId} gap={4} hAlign="stretch">
              <TextInput
                label={t('admin.channelMonitor.template.form.name')}
                isRequired
                hasAutoFocus
                placeholder={t('admin.channelMonitor.template.form.namePlaceholder')}
                value={form.name}
                onChange={(name) => setForm((current) => ({ ...current, name }))}
                status={
                  wasSaveTried && problems.name
                    ? { type: 'error', message: t('admin.channelMonitor.template.missingName') }
                    : undefined
                }
                isDisabled={isSaving}
              />

              {/* A template keeps the provider it was created for: its monitors are of that provider. */}
              {!template && (
                <Selector
                  label={t('admin.channelMonitor.form.provider')}
                  isRequired
                  width="100%"
                  options={FORM_PROVIDERS.map((known) => ({ value: known, label: providerLabel(known, t) }))}
                  value={form.provider}
                  onChange={pickProvider}
                  isDisabled={isSaving}
                />
              )}

              {form.provider === 'openai' && (
                <RadioList
                  label={t('admin.channelMonitor.form.apiMode')}
                  value={form.apiMode}
                  onChange={pickApiMode}
                  isDisabled={isSaving}
                >
                  <RadioListItem
                    value="chat_completions"
                    label={t('admin.channelMonitor.form.apiModeChatCompletions')}
                    description={t('admin.channelMonitor.form.apiModeChatCompletionsHint')}
                  />
                  <RadioListItem
                    value="responses"
                    label={t('admin.channelMonitor.form.apiModeResponses')}
                    description={t('admin.channelMonitor.form.apiModeResponsesHint')}
                  />
                </RadioList>
              )}

              <TextInput
                label={t('admin.channelMonitor.template.form.description')}
                placeholder={t('admin.channelMonitor.template.form.descriptionPlaceholder')}
                value={form.description}
                onChange={(description) => setForm((current) => ({ ...current, description }))}
                isDisabled={isSaving}
              />

              <MonitorRequestFields
                draft={form.request}
                onChange={(request) => setForm((current) => ({ ...current, request }))}
                provider={form.provider}
                apiMode={form.apiMode}
                showProblems={wasSaveTried}
                isDisabled={isSaving}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isSaving} onClick={close} />
              <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={() => void save()} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
