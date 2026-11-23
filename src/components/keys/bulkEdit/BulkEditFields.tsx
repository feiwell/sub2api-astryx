import type { ReactNode } from 'react'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/Stack'
import { TextArea } from '@astryxdesign/core/TextArea'
import type { Group } from '@/types'
import { useI18n } from '~/i18n'
import {
  IP_FIELDS,
  LIMIT_FIELDS,
  type BulkEditField,
  type BulkEditForm,
  type BulkEditProblem,
  type BulkEditProblems,
  type IpField,
  type LimitField,
} from './bulkEditForm'

/** The element that holds one field, so the dialog can bring a field with a problem into view. */
export const fieldBlockId = (idPrefix: string, field: BulkEditField) => `${idPrefix}-${field}`

interface TickedFieldProps {
  id: string
  label: string
  /** What to enter; shown with the input. */
  hint?: string
  isTicked: boolean
  onTick: (isTicked: boolean) => void
  isDisabled: boolean
  children: ReactNode
}

/** A field takes part in the edit only once ticked; its input stays out of the way until then. */
function TickedField({ id, label, hint, isTicked, onTick, isDisabled, children }: TickedFieldProps) {
  return (
    <VStack gap={2} hAlign="stretch" id={id}>
      {/* The checkbox is the visible label of the input below, whose own label is hidden. A hidden
          label hides the input's description with it, so the hint is the checkbox's description. */}
      <CheckboxInput
        label={label}
        description={isTicked ? hint : undefined}
        value={isTicked}
        onChange={onTick}
        isDisabled={isDisabled}
      />
      {isTicked && children}
    </VStack>
  )
}

interface BulkEditFieldsProps {
  form: BulkEditForm
  onChange: (change: (form: BulkEditForm) => BulkEditForm) => void
  groups: Group[]
  /** The problems to point out: those the last attempt to apply found and that still stand. */
  problems: BulkEditProblems
  isDisabled: boolean
  idPrefix: string
  /** A number or date input holds text it cannot read, so its value is not what the user sees. */
  onEntryError: (field: BulkEditField, hasError: boolean) => void
}

/** The fields a bulk edit can change, in the order of BulkEditKeysModal.vue. */
export function BulkEditFields({
  form,
  onChange,
  groups,
  problems,
  isDisabled,
  idPrefix,
  onEntryError,
}: BulkEditFieldsProps) {
  const { t } = useI18n()
  const { enabled } = form

  const problemText = (problem: BulkEditProblem) => {
    if (problem === 'group') return t('keys.groupRequired')
    if (problem === 'limit') return t('keys.bulkEdit.invalidLimit')
    return t('keys.bulkEdit.invalidExpiration')
  }
  const errorOf = (field: BulkEditField) => {
    const problem = problems[field]
    return problem ? { type: 'error' as const, message: problemText(problem) } : undefined
  }

  const limitLabel = (field: LimitField) => {
    if (field === 'quota') return t('keys.quotaAmount')
    if (field === 'rate_limit_5h') return t('keys.rateLimit5h')
    if (field === 'rate_limit_1d') return t('keys.rateLimit1d')
    return t('keys.rateLimit7d')
  }
  const ipLabel = (field: IpField) => (field === 'ip_whitelist' ? t('keys.ipWhitelist') : t('keys.ipBlacklist'))

  const block = (field: BulkEditField, label: string, hint?: string) => ({
    id: fieldBlockId(idPrefix, field),
    label,
    hint,
    isTicked: enabled[field],
    onTick: (isTicked: boolean) =>
      onChange((current) => ({ ...current, enabled: { ...current.enabled, [field]: isTicked } })),
    isDisabled,
  })

  return (
    <VStack gap={4} hAlign="stretch">
      <TickedField {...block('group_id', t('keys.groupLabel'))}>
        <Selector
          label={t('keys.groupLabel')}
          isLabelHidden
          value={form.groupId === null ? '' : String(form.groupId)}
          onChange={(value) => onChange((current) => ({ ...current, groupId: value ? Number(value) : null }))}
          options={groups.map((group) => ({ value: String(group.id), label: group.name }))}
          placeholder={t('keys.selectGroup')}
          emptyText={t('common.noGroupsAvailable')}
          hasSearch
          searchPlaceholder={t('keys.searchGroup')}
          emptySearchText={t('keys.noGroupFound')}
          isDisabled={isDisabled}
          status={errorOf('group_id')}
        />
      </TickedField>

      <TickedField {...block('status', t('keys.statusLabel'))}>
        <Selector
          label={t('keys.statusLabel')}
          isLabelHidden
          value={form.status}
          onChange={(value) => onChange((current) => ({ ...current, status: value as BulkEditForm['status'] }))}
          options={[
            { value: 'active', label: t('keys.enable') },
            { value: 'inactive', label: t('keys.disable') },
          ]}
          isDisabled={isDisabled}
        />
      </TickedField>

      {LIMIT_FIELDS.map((field) => (
        <TickedField key={field} {...block(field, limitLabel(field), t('keys.bulkEdit.limitHint'))}>
          <NumberInput
            label={limitLabel(field)}
            isLabelHidden
            value={form.limits[field]}
            onChange={(amount: number | null) =>
              onChange((current) => ({ ...current, limits: { ...current.limits, [field]: amount } }))
            }
            onEntryErrorChange={(error) => onEntryError(field, error !== null)}
            // No minimum: the input would turn a negative amount into 0, and 0 lifts the cap.
            step={0.01}
            // The dialog scrolls; a wheel turn over a focused amount must not change it.
            isWheelEnabled={false}
            hasClear
            isDisabled={isDisabled}
            status={errorOf(field)}
          />
        </TickedField>
      ))}

      <TickedField {...block('expires_at', t('keys.expiration'))}>
        <CheckboxInput
          label={t('keys.noExpiration')}
          value={form.neverExpires}
          onChange={(neverExpires) => onChange((current) => ({ ...current, neverExpires }))}
          isDisabled={isDisabled}
        />
        {!form.neverExpires && (
          <DateTimeInput
            label={t('keys.expirationDate')}
            value={(form.expirationDate || undefined) as ISODateTimeString | undefined}
            onChange={(value) => onChange((current) => ({ ...current, expirationDate: value ?? '' }))}
            onEntryErrorChange={(error) => onEntryError('expires_at', error !== null)}
            hasClear
            isDisabled={isDisabled}
            status={errorOf('expires_at')}
          />
        )}
      </TickedField>

      {IP_FIELDS.map((field) => (
        <TickedField key={field} {...block(field, ipLabel(field), t('keys.bulkEdit.ipHint'))}>
          <TextArea
            label={ipLabel(field)}
            isLabelHidden
            value={form.ipLists[field]}
            onChange={(text) =>
              onChange((current) => ({ ...current, ipLists: { ...current.ipLists, [field]: text } }))
            }
            rows={3}
            hasSpellCheck={false}
            isDisabled={isDisabled}
          />
        </TickedField>
      ))}
    </VStack>
  )
}
