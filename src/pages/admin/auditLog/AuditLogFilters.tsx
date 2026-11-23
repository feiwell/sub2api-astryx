import { useId, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { CalendarDaysIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import {
  AUDIT_PRESET_RANGES,
  formatCustomRange,
  isPresetRange,
  toLocalDateTime,
  type AuditCustomRange,
  type AuditFilters,
} from './auditQuery'
import { AUTH_METHODS, HTTP_METHODS } from './auditText'
import type { AuditLogs } from './useAuditLogs'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'
const CUSTOM = 'custom'
const HOUR_MS = 60 * 60 * 1000

type TextFilter = 'q' | 'actor_email' | 'action' | 'client_ip'
type ChoiceFilter = 'method' | 'auth_method' | 'success'

const asDateTime = (value: string) => (value || undefined) as ISODateTimeString | undefined

/**
 * The filters of the operation log. A text field waits for Enter or the search button; a choice
 * from a list applies at once.
 */
export function AuditLogFilters({ list }: { list: AuditLogs }) {
  const { t } = useI18n()
  const [isCustomOpen, setCustomOpen] = useState(false)
  const { draft } = list

  const textField = (field: TextFilter, label: string, isSearch = false) => (
    <TextInput
      label={label}
      width="100%"
      placeholder={isSearch ? t('admin.audit.filters.qPlaceholder') : undefined}
      startIcon={isSearch ? MagnifyingGlassIcon : undefined}
      value={draft[field]}
      onChange={(value) => list.edit({ [field]: value } as Partial<AuditFilters>)}
      onEnter={list.search}
    />
  )

  const choiceField = (field: ChoiceFilter, label: string, choices: Array<{ value: string; label: string }>) => (
    <Selector
      label={label}
      width="100%"
      value={draft[field] || ALL}
      onChange={(value) => list.pick({ [field]: value === ALL ? '' : value } as Partial<AuditFilters>)}
      options={[{ value: ALL, label: t('admin.audit.filters.all') }, ...choices]}
    />
  )

  const isCustom = draft.timeRange === CUSTOM
  const timeRangeOptions = [
    { value: ALL, label: t('admin.audit.filters.all') },
    ...AUDIT_PRESET_RANGES.map((range) => ({ value: range as string, label: t(`admin.ops.timeRange.${range}`) })),
    {
      value: CUSTOM,
      label:
        isCustom && draft.customRange
          ? `${t('admin.ops.timeRange.custom')} (${formatCustomRange(draft.customRange)})`
          : t('admin.ops.timeRange.custom'),
    },
  ]

  const changeTimeRange = (value: string) => {
    // "Custom" is only taken once its window is confirmed; until then the list keeps its range.
    if (value === CUSTOM) setCustomOpen(true)
    else if (value === ALL) list.pick({ timeRange: '' })
    else if (isPresetRange(value)) list.pick({ timeRange: value })
  }

  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 190 }} gap={3}>
        {textField('q', t('admin.audit.filters.q'), true)}
        {textField('actor_email', t('admin.audit.filters.actorEmail'))}
        {textField('action', t('admin.audit.filters.action'))}
        {textField('client_ip', t('admin.audit.filters.clientIp'))}
        {choiceField(
          'method',
          t('admin.audit.filters.method'),
          HTTP_METHODS.map((method) => ({ value: method, label: method })),
        )}
        {choiceField('auth_method', t('admin.audit.filters.authMethod'), [...AUTH_METHODS])}
        {choiceField('success', t('admin.audit.filters.result'), [
          { value: 'true', label: t('admin.audit.filters.resultSuccess') },
          { value: 'false', label: t('admin.audit.filters.resultFailure') },
        ])}
        <HStack gap={1} vAlign="end">
          <StackItem size="fill">
            <Selector
              label={t('admin.dashboard.timeRange')}
              width="100%"
              value={draft.timeRange || ALL}
              onChange={changeTimeRange}
              options={timeRangeOptions}
            />
          </StackItem>
          {/* Picking "custom" again while it is picked changes nothing, so its window gets a button. */}
          {isCustom && (
            <IconButton
              label={t('admin.ops.timeRange.custom')}
              tooltip={t('admin.ops.timeRange.custom')}
              icon={<Icon icon={CalendarDaysIcon} />}
              onClick={() => setCustomOpen(true)}
            />
          )}
        </HStack>
      </Grid>

      <HStack gap={2}>
        <Button
          label={t('common.search')}
          variant="primary"
          icon={<Icon icon={MagnifyingGlassIcon} />}
          isLoading={list.isLoading}
          onClick={list.search}
        />
        <Button label={t('common.reset')} variant="secondary" isDisabled={list.isLoading} onClick={list.reset} />
      </HStack>

      {isCustomOpen && (
        <CustomRangeDialog
          initial={draft.customRange}
          onClose={() => setCustomOpen(false)}
          onConfirm={(range) => {
            setCustomOpen(false)
            list.pick({ timeRange: CUSTOM, customRange: range })
          }}
        />
      )}
    </VStack>
  )
}

/**
 * Start and end of a custom window. Mounted only while open: each opening starts from the window
 * confirmed last, or from the last hour.
 */
function CustomRangeDialog({
  initial,
  onClose,
  onConfirm,
}: {
  initial: AuditCustomRange | null
  onClose: () => void
  onConfirm: (range: AuditCustomRange) => void
}) {
  const { t } = useI18n()
  const fieldsId = useId()
  const [start, setStart] = useState(() => initial?.start || toLocalDateTime(new Date(Date.now() - HOUR_MS)))
  const [end, setEnd] = useState(() => initial?.end || toLocalDateTime(new Date()))

  // A window that ends before it starts holds nothing.
  const isValid = !!start && !!end && new Date(start).getTime() < new Date(end).getTime()
  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const confirm = () => {
    if (!isValid) return
    // The time half of the input marks text it cannot read as invalid and keeps the time it held
    // before, which is not the time on screen: such a window is not taken.
    const unreadable = document.getElementById(fieldsId)?.querySelector<HTMLElement>('input[aria-invalid="true"]')
    if (unreadable) {
      unreadable.focus()
      return
    }
    onConfirm({ start, end })
  }

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={420} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.ops.timeRange.custom')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack id={fieldsId} gap={4} hAlign="stretch">
              <DateTimeInput
                label={t('admin.ops.customTimeRange.startTime')}
                value={asDateTime(start)}
                max={asDateTime(end)}
                onChange={(value) => setStart(value ?? '')}
              />
              <DateTimeInput
                label={t('admin.ops.customTimeRange.endTime')}
                value={asDateTime(end)}
                min={asDateTime(start)}
                onChange={(value) => setEnd(value ?? '')}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button label={t('common.confirm')} variant="primary" isDisabled={!isValid} onClick={confirm} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
