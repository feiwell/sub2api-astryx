import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid, GridSpan } from '@astryxdesign/core/Grid'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { HStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { PromptAuditEndpointDraft } from '@/features/prompt-audit/types'
import { DEFAULT_GUARD_MODEL } from '@/features/prompt-audit/viewModel'
import { useI18n } from '~/i18n'
import { entryErrorStatus, hasCredential, isCredentialInvalid } from './configText'

// The ranges the server accepts.
const TIMEOUT_MS = { min: 100, max: 30000 }
const INPUT_LIMIT = { min: 128, max: 100000 }

type NumberField = 'timeout_ms' | 'input_limit'

/**
 * Adds a guard node or edits one. "Save" hands the node back for the draft; it reaches the
 * server with the rest of the configuration. Mounted only while open, so it starts from `endpoint`.
 */
export function AuditEndpointDialog({
  endpoint,
  isNew,
  onSave,
  onClose,
}: {
  /** The node as the draft has it; a new one comes with the defaults filled in. */
  endpoint: PromptAuditEndpointDraft
  isNew: boolean
  onSave: (endpoint: PromptAuditEndpointDraft) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(endpoint)
  const change = (patch: Partial<PromptAuditEndpointDraft>) => setDraft((current) => ({ ...current, ...patch }))
  // By field: text typed into a number field that the field refused. The node still holds the number from before.
  const [entryErrors, setEntryErrors] = useState<Partial<Record<NumberField, NumberInputEntryError>>>({})
  const reportEntryError = (field: NumberField) => (error: NumberInputEntryError | null) =>
    setEntryErrors((current) => ({ ...current, [field]: error ?? undefined }))

  const hasTypedKey = draft.token.trim() !== ''
  // A saved key that can no longer be decrypted is not one to keep: the field asks for a new one.
  const isKeyLost = isCredentialInvalid(draft)
  // Left empty, the field keeps the saved key: unless that one is lost, or ticked to be cleared.
  const keepsSavedKey = hasCredential(draft) && !isKeyLost
  const isComplete = [draft.name, draft.id, draft.base_url].every((value) => value.trim() !== '')
  // Saving then would hand back a number other than the one the field shows.
  const hasRefusedNumber = Object.values(entryErrors).some(Boolean)
  const canSave = isComplete && !hasRefusedNumber
  const requiredStatus = (value: string) =>
    value.trim() === '' ? { type: 'error' as const, message: t('common.required') } : undefined

  const save = () => {
    if (!canSave) return
    onSave({
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      base_url: draft.base_url.trim(),
      // What the server takes an empty model for; filled in here so the list shows it right away.
      model: draft.model.trim() || DEFAULT_GUARD_MODEL,
      token: draft.token.trim(),
      // A key typed now replaces the saved one: there is nothing left to clear.
      clear_token: hasTypedKey ? false : draft.clear_token,
    })
  }

  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={640} maxHeight="90dvh" purpose="form">
      <Layout
        header={
          <DialogHeader
            title={isNew ? t('admin.promptAudit.pool.add') : t('admin.promptAudit.pool.edit')}
            onOpenChange={reportOpen}
          />
        }
        content={
          <LayoutContent>
            <Grid columns={{ minWidth: 240, max: 2 }} gap={4}>
              <TextInput
                label={t('admin.promptAudit.pool.name')}
                isRequired
                width="100%"
                value={draft.name}
                onChange={(name) => change({ name })}
                status={requiredStatus(draft.name)}
              />
              {/* Events, probe results and the saved key go by the id: a node keeps the one it was added with. */}
              <TextInput
                label={t('admin.promptAudit.pool.id')}
                isRequired
                isDisabled={!isNew}
                width="100%"
                value={draft.id}
                onChange={(id) => change({ id })}
                status={requiredStatus(draft.id)}
              />
              <GridSpan columns="full">
                <TextInput
                  label={t('admin.promptAudit.pool.baseUrl')}
                  isRequired
                  width="100%"
                  inputMode="url"
                  value={draft.base_url}
                  onChange={(base_url) => change({ base_url })}
                  status={requiredStatus(draft.base_url)}
                />
              </GridSpan>
              <GridSpan columns="full">
                {/* The saved key never comes back from the server: the field holds only what is typed now. */}
                <TextInput
                  type="password"
                  label={t('admin.promptAudit.pool.apiKey')}
                  width="100%"
                  autoComplete="new-password"
                  value={draft.token}
                  onChange={(token) => change({ token })}
                  placeholder={keepsSavedKey ? t('admin.promptAudit.pool.keepSecret') : undefined}
                  description={t('admin.promptAudit.pool.secretHint')}
                  status={isKeyLost ? { type: 'warning', message: t('admin.promptAudit.pool.reenterSecret') } : undefined}
                />
              </GridSpan>
              {draft.has_token && (
                <GridSpan columns="full">
                  <CheckboxInput
                    label={t('admin.promptAudit.pool.clearSecret')}
                    value={draft.clear_token && !hasTypedKey}
                    isDisabled={hasTypedKey}
                    onChange={(clear_token) => change({ clear_token })}
                  />
                </GridSpan>
              )}
              <GridSpan columns="full">
                <TextInput
                  label={t('admin.promptAudit.pool.model')}
                  width="100%"
                  placeholder={DEFAULT_GUARD_MODEL}
                  value={draft.model}
                  onChange={(model) => change({ model })}
                />
              </GridSpan>
              <NumberInput
                label={t('admin.promptAudit.pool.timeout')}
                isRequired
                isIntegerOnly
                isWheelEnabled={false}
                width="100%"
                min={TIMEOUT_MS.min}
                max={TIMEOUT_MS.max}
                value={draft.timeout_ms}
                onChange={(timeout_ms) => change({ timeout_ms })}
                onEntryErrorChange={reportEntryError('timeout_ms')}
                status={entryErrorStatus(entryErrors.timeout_ms)}
              />
              <NumberInput
                label={t('admin.promptAudit.pool.inputLimit')}
                isRequired
                isIntegerOnly
                isWheelEnabled={false}
                width="100%"
                min={INPUT_LIMIT.min}
                max={INPUT_LIMIT.max}
                value={draft.input_limit}
                onChange={(input_limit) => change({ input_limit })}
                onEntryErrorChange={reportEntryError('input_limit')}
                status={entryErrorStatus(entryErrors.input_limit)}
              />
            </Grid>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button label={t('common.save')} variant="primary" isDisabled={!canSave} onClick={save} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
