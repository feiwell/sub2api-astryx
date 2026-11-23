import { useEffect, useId, useRef, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid } from '@astryxdesign/core/Grid'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { Selector, type SelectorOptionData } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { formatPaymentAmount } from '@/components/payment/currency'
import type { AdminGroup } from '@/types'
import type { SubscriptionPlan } from '@/types/payment'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { groupPlatformLabel } from '../groups/groupPlatform'
import { entryErrorStatus } from '../promptAudit/configText'
import {
  VALIDITY_UNITS,
  cnyCharge,
  currencyEntry,
  emptyPlanForm,
  limitText,
  planFormOf,
  planGroup,
  planProblems,
  planRequest,
  selectableGroups,
  type PlanForm,
  type ValidityUnit,
} from './planModel'
import type { PaymentPlans } from './usePaymentPlans'

const DIALOG_WIDTH = 640
const PRICE_STEP = 0.01
// A list of groups longer than this gets a search field.
const GROUPS_WITHOUT_SEARCH = 8

type NumberField = 'price' | 'originalPrice' | 'validityDays' | 'sortOrder'
type EntryErrors = Partial<Record<NumberField, NumberInputEntryError>>

/**
 * Creates a subscription plan, or edits the one it is given. Mount it for each opening. Port of
 * views/admin/orders/PlanEditDialog.vue.
 */
export function PlanFormDialog({
  plan,
  list,
  onClose,
}: {
  /** The plan to edit; null to create one. */
  plan: SubscriptionPlan | null
  list: PaymentPlans
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const fieldsId = useId()
  const chargeId = useId()
  const currencyHintId = useId()
  const [form, setForm] = useState<PlanForm>(() => (plan ? planFormOf(plan) : emptyPlanForm()))
  // The number fields that hold text they cannot take. Such a field keeps its last number, which is not
  // what the user sees, so the form must not be sent.
  const [entryErrors, setEntryErrors] = useState<EntryErrors>({})
  // Both again, where saving reads them without waiting for the next render: a number field takes over
  // what was typed, or refuses it, in the very keystroke or click that asks to save.
  const formNow = useRef(form)
  const entryErrorsNow = useRef<EntryErrors>({})
  const [isSaving, setSaving] = useState(false)
  // What is left out is pointed out once saving was tried, not while the form is filled in.
  const [wasSaveTried, setSaveTried] = useState(false)
  // Raised to send the focus to the first field that stands in the way of saving.
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    if (focusRequest === 0) return
    const field = document.getElementById(fieldsId)?.querySelector<HTMLElement>('[aria-invalid="true"]')
    field?.scrollIntoView({ block: 'nearest' })
    field?.focus()
  }, [focusRequest, fieldsId])

  const edit = (patch: Partial<PlanForm>) => {
    formNow.current = { ...formNow.current, ...patch }
    setForm(formNow.current)
  }

  const noteEntryError = (field: NumberField) => (error: NumberInputEntryError | null) => {
    const next = { ...entryErrorsNow.current }
    if (error) next[field] = error
    else delete next[field]
    entryErrorsNow.current = next
    setEntryErrors(next)
  }

  const problems = planProblems(form)
  const required = { type: 'error' as const, message: t('common.required') }

  // A wrong number is said at once, unlike a field not yet filled in: it is something that was typed.
  const numberStatus = (field: NumberField, problem: 'missing' | 'notPositive' | undefined, message: string) =>
    entryErrorStatus(entryErrors[field]) ??
    (problem === 'notPositive' || (problem === 'missing' && wasSaveTried)
      ? { type: 'error' as const, message }
      : undefined)

  const groupLabel = (group: Pick<AdminGroup, 'name' | 'platform' | 'rate_multiplier'>) =>
    `${group.name} — ${groupPlatformLabel(t, group.platform)} (${group.rate_multiplier}x)`

  const groupOptions: SelectorOptionData[] = selectableGroups(list.groups, plan?.group_id ?? null).map((group) => ({
    value: String(group.id),
    label: groupLabel(group),
  }))
  // The plan's own group still shows when it is not among the groups: gone, or the groups did not load.
  if (plan && plan.group_id > 0 && !list.groups.some((group) => group.id === plan.group_id)) {
    const own = planGroup(plan, list.groups, list.areGroupsKnown)
    if (own.kind === 'group') {
      const details = [own.platform && groupPlatformLabel(t, own.platform), own.rate !== null && `(${own.rate}x)`]
      groupOptions.push({
        value: String(plan.group_id),
        label: [own.name, details.filter(Boolean).join(' ')].filter(Boolean).join(' — '),
      })
    } else if (own.kind === 'number') {
      groupOptions.push({
        value: String(own.id),
        label: own.isMissing ? `#${own.id} · ${t('payment.admin.groupMissing')}` : `#${own.id}`,
      })
    }
  }

  const selectedGroup = form.groupId === null ? undefined : list.groups.find((group) => group.id === form.groupId)
  const limitLabel = (limit: number | null | undefined) => limitText(limit) ?? t('payment.admin.unlimited')

  const unitOptions: SelectorOptionData[] = VALIDITY_UNITS.map((unit) => ({
    value: unit,
    label: t(`payment.admin.${unit}`),
  }))

  // No preview while the price field holds text it cannot take: its last number is not what the user sees.
  const charge = entryErrors.price ? null : cnyCharge(form.price, list.config)
  const chargeText = charge
    ? [
        t('payment.admin.subscriptionCnyPayPreview', { amount: formatPaymentAmount(charge.amount, 'CNY', locale) }),
        charge.feeRate > 0 &&
          t('payment.admin.subscriptionCnyPayPreviewWithFee', {
            feeRate: charge.feeRate,
            total: formatPaymentAmount(charge.total, 'CNY', locale),
          }),
      ]
        .filter(Boolean)
        .join(' ')
    : undefined

  const close = () => {
    if (!isSaving) onClose()
  }
  const reportOpen = (isOpen: boolean) => {
    if (!isOpen) close()
  }

  const save = async () => {
    if (isSaving) return
    const request = Object.keys(entryErrorsNow.current).length > 0 ? null : planRequest(formNow.current)
    if (!request) {
      setSaveTried(true)
      setFocusRequest((asked) => asked + 1)
      return
    }
    setSaving(true)
    try {
      if (plan) await adminAPI.payment.updatePlan(plan.id, request)
      else await adminAPI.payment.createPlan(request)
    } catch (error) {
      // The dialog stays, with all that was filled in.
      toast.error(extractApiErrorMessage(error, t('common.error')))
      setSaving(false)
      return
    }
    toast.success(t('common.saved'))
    list.reload()
    onClose()
  }
  const saveOnEnter = () => void save()

  return (
    // While the plan is being saved the dialog stays: Escape, the close button and Cancel are off.
    <Dialog
      isOpen
      onOpenChange={reportOpen}
      width={DIALOG_WIDTH}
      maxHeight="90dvh"
      purpose={isSaving ? 'required' : 'form'}
    >
      <Layout
        header={
          <DialogHeader
            title={plan ? t('payment.admin.editPlan') : t('payment.admin.createPlan')}
            onOpenChange={isSaving ? undefined : reportOpen}
          />
        }
        content={
          <LayoutContent>
            <VStack id={fieldsId} gap={5} hAlign="stretch">
              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                <TextInput
                  label={t('payment.admin.planName')}
                  width="100%"
                  isRequired
                  value={form.name}
                  onChange={(name) => edit({ name })}
                  onEnter={saveOnEnter}
                  isDisabled={isSaving}
                  status={wasSaveTried && problems.name ? required : undefined}
                />
                <Selector
                  label={t('payment.admin.group')}
                  placeholder={t('payment.admin.selectGroup')}
                  width="100%"
                  isRequired
                  options={groupOptions}
                  hasSearch={groupOptions.length > GROUPS_WITHOUT_SEARCH}
                  value={form.groupId === null ? undefined : String(form.groupId)}
                  onChange={(id) => edit({ groupId: Number(id) })}
                  isDisabled={isSaving}
                  status={
                    wasSaveTried && problems.group
                      ? { type: 'error', message: t('payment.admin.groupRequired') }
                      : undefined
                  }
                />
              </Grid>

              {selectedGroup && (
                <VStack gap={2} hAlign="stretch">
                  <HStack gap={1.5} vAlign="center" wrap="wrap">
                    <Text type="label" wordBreak="break-word">
                      {selectedGroup.name}
                    </Text>
                    <Badge variant="neutral" label={groupPlatformLabel(t, selectedGroup.platform)} />
                    <Badge variant="info" label={`${selectedGroup.rate_multiplier}x`} />
                  </HStack>
                  <MetadataList columns={3}>
                    <MetadataListItem label={t('payment.admin.dailyLimit')}>
                      <Text hasTabularNumbers>{limitLabel(selectedGroup.daily_limit_usd)}</Text>
                    </MetadataListItem>
                    <MetadataListItem label={t('payment.admin.weeklyLimit')}>
                      <Text hasTabularNumbers>{limitLabel(selectedGroup.weekly_limit_usd)}</Text>
                    </MetadataListItem>
                    <MetadataListItem label={t('payment.admin.monthlyLimit')}>
                      <Text hasTabularNumbers>{limitLabel(selectedGroup.monthly_limit_usd)}</Text>
                    </MetadataListItem>
                  </MetadataList>
                </VStack>
              )}

              <TextArea
                label={t('payment.admin.planDescription')}
                rows={2}
                width="100%"
                isRequired
                value={form.description}
                onChange={(description) => edit({ description })}
                isDisabled={isSaving}
                status={wasSaveTried && problems.description ? required : undefined}
              />

              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                {/* The preview and the currency hint go below their fields instead of into the descriptions:
                    a description sits above the input and would push it out of line with the one beside it. */}
                <VStack gap={1} hAlign="stretch">
                  <NumberInput
                    label={t('payment.admin.price')}
                    aria-describedby={chargeText ? chargeId : undefined}
                    width="100%"
                    value={form.price}
                    // The number fields show what was typed and nothing else. With a lower bound above zero
                    // a field would quietly turn a smaller entry into the bound as it is left; unless it may
                    // be emptied it would put the last number back.
                    hasClear
                    min={0}
                    step={PRICE_STEP}
                    isRequired
                    // The dialog scrolls with the wheel: a field that passes under the pointer must not change with it.
                    isWheelEnabled={false}
                    isDisabled={isSaving}
                    onChange={(price) => edit({ price })}
                    onEntryErrorChange={noteEntryError('price')}
                    onEnter={saveOnEnter}
                    status={numberStatus('price', problems.price, t('payment.admin.priceRequired'))}
                  />
                  {chargeText && (
                    <Text id={chargeId} type="supporting" color="secondary">
                      {chargeText}
                    </Text>
                  )}
                </VStack>
                <NumberInput
                  label={t('payment.admin.originalPrice')}
                  width="100%"
                  value={form.originalPrice}
                  hasClear
                  min={0}
                  step={PRICE_STEP}
                  isWheelEnabled={false}
                  isDisabled={isSaving}
                  onChange={(originalPrice) => edit({ originalPrice })}
                  onEntryErrorChange={noteEntryError('originalPrice')}
                  onEnter={saveOnEnter}
                  status={entryErrorStatus(entryErrors.originalPrice)}
                />
              </Grid>

              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                <NumberInput
                  label={t('payment.admin.validity')}
                  width="100%"
                  value={form.validityDays}
                  hasClear
                  min={0}
                  isIntegerOnly
                  isRequired
                  isWheelEnabled={false}
                  isDisabled={isSaving}
                  onChange={(validityDays) => edit({ validityDays })}
                  onEntryErrorChange={noteEntryError('validityDays')}
                  onEnter={saveOnEnter}
                  status={numberStatus('validityDays', problems.validity, t('payment.admin.validityRequired'))}
                />
                <Selector
                  label={t('payment.admin.validityUnit')}
                  width="100%"
                  isRequired
                  options={unitOptions}
                  value={form.validityUnit}
                  onChange={(unit) => edit({ validityUnit: unit as ValidityUnit })}
                  isDisabled={isSaving}
                />
              </Grid>

              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                <NumberInput
                  label={t('payment.admin.sortOrder')}
                  width="100%"
                  value={form.sortOrder}
                  hasClear
                  min={0}
                  isIntegerOnly
                  isWheelEnabled={false}
                  isDisabled={isSaving}
                  onChange={(sortOrder) => edit({ sortOrder })}
                  onEntryErrorChange={noteEntryError('sortOrder')}
                  onEnter={saveOnEnter}
                  status={entryErrorStatus(entryErrors.sortOrder)}
                />
                <VStack gap={1} hAlign="stretch">
                  <TextInput
                    label={t('payment.admin.currency')}
                    placeholder={t('payment.admin.currencyPlaceholder')}
                    aria-describedby={currencyHintId}
                    width="100%"
                    value={form.currency}
                    onChange={(currency) => edit({ currency: currencyEntry(currency) })}
                    onEnter={saveOnEnter}
                    isDisabled={isSaving}
                    status={
                      wasSaveTried && problems.currency
                        ? { type: 'error', message: t('payment.admin.currencyPlaceholder') }
                        : undefined
                    }
                  />
                  <Text id={currencyHintId} type="supporting" color="secondary">
                    {t('payment.admin.currencyHint')}
                  </Text>
                </VStack>
              </Grid>

              <TextArea
                label={t('payment.admin.features')}
                placeholder={t('payment.admin.featuresPlaceholder')}
                description={t('payment.admin.featuresHint')}
                rows={3}
                width="100%"
                value={form.features}
                onChange={(features) => edit({ features })}
                isDisabled={isSaving}
              />

              <Switch
                label={t('payment.admin.forSale')}
                value={form.forSale}
                onChange={(forSale) => edit({ forSale })}
                labelPosition="start"
                labelSpacing="spread"
                width="100%"
                isDisabled={isSaving}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isSaving} onClick={close} />
              <Button
                label={isSaving ? t('common.saving') : t('common.save')}
                variant="primary"
                isLoading={isSaving}
                onClick={() => void save()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
