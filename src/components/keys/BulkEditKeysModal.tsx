import { useEffect, useId, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { keysAPI } from '@/api'
import type { ApiKey, Group } from '@/types'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { BulkEditFields, fieldBlockId } from './bulkEdit/BulkEditFields'
import {
  BULK_EDIT_FIELDS,
  buildUpdates,
  emptyBulkEditForm,
  findProblems,
  hasTickedField,
  type BulkEditField,
  type BulkEditForm,
  type BulkEditProblems,
} from './bulkEdit/bulkEditForm'

type SelectedKey = Pick<ApiKey, 'id' | 'name'>

interface BulkEditKeysModalProps {
  isOpen: boolean
  onClose: () => void
  /** These keys were updated; the list should reload and stop selecting them. */
  onSuccess: (updatedIds: number[]) => void
  selectedKeys: SelectedKey[]
  groups: Group[]
}

interface Failure {
  id: number
  name: string
  message: string
}

const DIALOG_WIDTH = 560

const NO_FIELDS: ReadonlySet<BulkEditField> = new Set()

/** Change the ticked fields of all selected keys at once (port of BulkEditKeysModal.vue). */
export function BulkEditKeysModal({ isOpen, ...dialog }: BulkEditKeysModalProps) {
  // Mounted per opening, so each one starts with nothing ticked and its own copy of the selection.
  return isOpen ? <BulkEditDialog {...dialog} /> : null
}

function BulkEditDialog({ onClose, onSuccess, selectedKeys, groups }: Omit<BulkEditKeysModalProps, 'isOpen'>) {
  const { t } = useI18n()
  const idPrefix = useId()
  const failuresId = `${idPrefix}-failures`

  const [form, setForm] = useState<BulkEditForm>(emptyBulkEditForm)
  // The keys still to update: the selection when the dialog opened, then only those that failed.
  // The page drops updated keys from its selection behind the dialog, which must not shift this.
  const [pending, setPending] = useState<SelectedKey[]>(() => selectedKeys.map(({ id, name }) => ({ id, name })))
  const [failures, setFailures] = useState<Failure[]>([])
  const [isSaving, setSaving] = useState(false)
  // Problems are pointed out only where an attempt to apply ran into them, not while filling in.
  const [flagged, setFlagged] = useState<ReadonlySet<BulkEditField>>(NO_FIELDS)
  const [entryErrors, setEntryErrors] = useState<ReadonlySet<BulkEditField>>(NO_FIELDS)

  const found = findProblems(form, groups)
  // Text a number or date input cannot read leaves its last value in the form; that must not be sent.
  const unreadable = [...entryErrors].filter(
    (field) => form.enabled[field] && !(field === 'expires_at' && form.neverExpires),
  )
  const shownProblems: BulkEditProblems = {}
  for (const field of flagged) {
    if (found[field]) shownProblems[field] = found[field]
  }
  // An input marks unreadable text as invalid by itself, as soon as it is left; this words the reason.
  for (const field of unreadable) {
    shownProblems[field] = field === 'expires_at' ? 'expiration' : 'limit'
  }
  const canApply = pending.length > 0 && hasTickedField(form)

  useEffect(() => {
    if (failures.length > 0) document.getElementById(failuresId)?.scrollIntoView({ block: 'nearest' })
  }, [failures, failuresId])

  const close = () => {
    if (!isSaving) onClose()
  }
  const reportOpen = (open: boolean) => {
    if (!open) close()
  }

  const reportEntryError = (field: BulkEditField, hasError: boolean) =>
    setEntryErrors((current) => {
      if (current.has(field) === hasError) return current
      const next = new Set(current)
      if (hasError) next.add(field)
      else next.delete(field)
      return next
    })

  const errorMessage = (error: unknown): string => {
    const message = (error as { message?: unknown } | null)?.message
    return typeof message === 'string' && message ? message : t('keys.failedToSave')
  }

  const apply = async () => {
    if (isSaving || !canApply) return
    // The date input reports unreadable text for its date half only. Its time half marks itself
    // invalid and keeps the last time it could read, which is not what the user sees either.
    const showsInvalidEntry = (field: BulkEditField) =>
      form.enabled[field] &&
      document.getElementById(fieldBlockId(idPrefix, field))?.querySelector('input[aria-invalid="true"]') != null
    const blocking = BULK_EDIT_FIELDS.filter(
      (field) => found[field] || unreadable.includes(field) || showsInvalidEntry(field),
    )
    if (blocking.length > 0) {
      setFlagged(new Set(blocking.filter((field) => found[field])))
      // The topmost of them comes into view and takes the focus.
      const block = document.getElementById(fieldBlockId(idPrefix, blocking[0]))
      block?.scrollIntoView({ block: 'nearest' })
      // The input marked invalid; else the first control after the tick box: a dropdown's button,
      // or a number or date input.
      const control =
        block?.querySelector<HTMLElement>('input[aria-invalid="true"]') ??
        block?.querySelector<HTMLElement>('button[aria-haspopup], input:not([type="checkbox"])')
      control?.focus()
      return
    }

    setSaving(true)
    try {
      const result = await keysAPI.bulkUpdate(
        pending.map((key) => key.id),
        buildUpdates(form),
      )
      const failedIds = new Set(result.failures.map(({ id }) => id))
      setFailures(
        result.failures.map(({ id, error }) => ({
          id,
          name: pending.find((key) => key.id === id)?.name ?? '',
          message: errorMessage(error),
        })),
      )
      setPending(pending.filter((key) => failedIds.has(key.id)))
      if (result.succeededIds.length > 0) onSuccess(result.succeededIds)
      if (result.failures.length > 0) {
        toast.error(
          t('keys.bulkEdit.partialFailure', {
            success: result.succeededIds.length,
            failed: result.failures.length,
          }),
        )
      } else {
        toast.success(t('keys.bulkEdit.success', { count: result.succeededIds.length }))
        onClose()
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    // While keys are being updated the dialog stays: Escape, the close button and Cancel are off.
    <Dialog isOpen onOpenChange={reportOpen} width={DIALOG_WIDTH} purpose={isSaving ? 'required' : 'form'}>
      <Layout
        header={<DialogHeader title={t('keys.bulkEdit.title')} onOpenChange={isSaving ? undefined : reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={5} hAlign="stretch">
              <VStack gap={1}>
                <Text type="label">{t('keys.bulkEdit.selectedCount', { count: pending.length })}</Text>
                <Text type="supporting">{t('keys.bulkEdit.hint')}</Text>
              </VStack>

              {failures.length > 0 && (
                <VStack id={failuresId} hAlign="stretch">
                  <Banner
                    status="error"
                    role="alert"
                    title={t('keys.bulkEdit.failedKeys')}
                    description={t('keys.bulkEdit.failureHint')}
                    collapsible={{ defaultIsOpen: true }}
                  >
                    <VStack gap={1}>
                      {failures.map((failure) => (
                        <Text key={failure.id} type="supporting" color="primary" wordBreak="break-word">
                          #{failure.id} {failure.name}: {failure.message}
                        </Text>
                      ))}
                    </VStack>
                  </Banner>
                </VStack>
              )}

              <BulkEditFields
                form={form}
                onChange={setForm}
                groups={groups}
                problems={shownProblems}
                isDisabled={isSaving}
                idPrefix={idPrefix}
                onEntryError={reportEntryError}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isSaving} onClick={close} />
              <Button
                label={isSaving ? t('keys.saving') : t('keys.bulkEdit.apply', { count: pending.length })}
                variant="primary"
                isLoading={isSaving}
                isDisabled={!canApply}
                onClick={() => void apply()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
