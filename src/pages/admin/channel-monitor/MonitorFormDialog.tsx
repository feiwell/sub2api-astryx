import { useEffect, useId, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack } from '@astryxdesign/core/Stack'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { ChannelMonitor } from '~/lib/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import { toast } from '~/lib/toast'
import { useAppStore } from '~/stores/app'
import { MonitorFormFields, type MonitorNumberField } from './MonitorFormFields'
import { MonitorKeyPickerDialog } from './MonitorKeyPickerDialog'
import {
  createMonitorRequest,
  defaultIntervalSeconds,
  monitorFormOf,
  monitorFormProblems,
  newMonitorForm,
  updateMonitorRequest,
  type MonitorForm,
  type MonitorFormProblems,
} from './monitorForm'

const DIALOG_WIDTH = 640

const NO_PROBLEMS: MonitorFormProblems = {}
const NO_FIELDS: ReadonlySet<MonitorNumberField> = new Set()

/**
 * Creates a monitor, or edits one. Mount it for each opening: it starts from the monitor it is given, or
 * from an empty form. Port of components/admin/monitor/MonitorFormDialog.vue.
 */
export function MonitorFormDialog({
  monitor,
  onClose,
  onSaved,
}: {
  /** The monitor to edit; null to create one. */
  monitor: ChannelMonitor | null
  onClose: () => void
  /** A monitor was created or saved; the list is out of date. */
  onSaved: () => void
}) {
  const { t } = useI18n()
  const fieldsId = useId()
  const siteInterval = useAppStore((s) => s.publicSettings?.channel_monitor_default_interval_seconds)

  const [form, setForm] = useState<MonitorForm>(() => {
    const interval = defaultIntervalSeconds(siteInterval)
    return monitor ? monitorFormOf(monitor, interval) : newMonitorForm(interval)
  })
  const [templates, setTemplates] = useState<ChannelMonitorTemplate[]>([])
  const [isSaving, setSaving] = useState(false)
  // Problems are pointed out once saving was tried, not while the form is filled in.
  const [wasSaveTried, setSaveTried] = useState(false)
  // The number fields whose text no number can be read from. Such a field keeps its last number, which is
  // not what the user sees, so it must not be saved.
  const [unreadable, setUnreadable] = useState<ReadonlySet<MonitorNumberField>>(NO_FIELDS)
  // A custom request that is there is shown: what a monitor sends should not be out of sight.
  const [isAdvancedOpen, setAdvancedOpen] = useState(
    () =>
      form.templateId !== null ||
      form.request.bodyMode !== 'off' ||
      form.request.headers.some((row) => row.name !== '' || row.value !== ''),
  )
  const [isPickingKey, setPickingKey] = useState(false)
  // Raised to send the focus to the first field that stands in the way of saving.
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    let isCurrent = true
    adminAPI.channelMonitorTemplate.list().then(
      (answer) => {
        if (isCurrent) setTemplates(answer.items || [])
      },
      // The form can be filled in without templates; only the list of them stays empty.
      (error: unknown) => console.warn('[channel-monitor] templates failed to load', error),
    )
    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (focusRequest === 0) return
    const field = document.getElementById(fieldsId)?.querySelector<HTMLElement>('[aria-invalid="true"]')
    field?.scrollIntoView({ block: 'nearest' })
    field?.focus()
  }, [focusRequest, fieldsId])

  const problems = monitorFormProblems(form, monitor !== null)
  const cannotSave = Object.keys(problems).length > 0 || unreadable.size > 0

  const reportNumberEntryError = (field: MonitorNumberField, hasError: boolean) =>
    setUnreadable((current) => {
      if (current.has(field) === hasError) return current
      const next = new Set(current)
      if (hasError) next.add(field)
      else next.delete(field)
      return next
    })

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
      if (problems.headerName || problems.body) setAdvancedOpen(true)
      setFocusRequest((request) => request + 1)
      return
    }
    setSaving(true)
    try {
      if (monitor) await adminAPI.channelMonitor.update(monitor.id, updateMonitorRequest(form))
      else await adminAPI.channelMonitor.create(createMonitorRequest(form))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
      setSaving(false)
      return
    }
    toast.success(monitor ? t('admin.channelMonitor.updateSuccess') : t('admin.channelMonitor.createSuccess'))
    onSaved()
    onClose()
  }

  const saveLabel = isSaving ? t('common.submitting') : monitor ? t('common.update') : t('common.create')

  return (
    <>
      {/* While the monitor is being saved the dialog stays: Escape, the close button and Cancel are off. */}
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
              title={monitor ? t('admin.channelMonitor.editTitle') : t('admin.channelMonitor.createTitle')}
              onOpenChange={isSaving ? undefined : reportOpen}
            />
          }
          content={
            <LayoutContent>
              <MonitorFormFields
                id={fieldsId}
                form={form}
                onEdit={setForm}
                monitor={monitor}
                templates={templates}
                problems={wasSaveTried ? problems : NO_PROBLEMS}
                showProblems={wasSaveTried}
                isAdvancedOpen={isAdvancedOpen}
                onAdvancedOpenChange={setAdvancedOpen}
                onPickKey={() => setPickingKey(true)}
                onNumberEntryError={reportNumberEntryError}
                isDisabled={isSaving}
              />
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

      {isPickingKey && (
        <MonitorKeyPickerDialog
          provider={form.provider}
          onPick={(apiKey) => {
            setForm((current) => ({ ...current, apiKey }))
            setPickingKey(false)
          }}
          onClose={() => setPickingKey(false)}
        />
      )}
    </>
  )
}
