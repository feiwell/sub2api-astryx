import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { InputStatus } from '@astryxdesign/core/Field'
import { useI18n } from '~/i18n'
import { DECISIONS, RISK_LEVELS, decisionLabel, riskLabel } from './eventText'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'

const asDateTime = (value: string) => (value || undefined) as ISODateTimeString | undefined

function ChoiceField({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  /** '' stands for "all". */
  value: string
  choices: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <Selector
      label={label}
      width="100%"
      value={value || ALL}
      onChange={(next) => onChange(next === ALL ? '' : next)}
      options={[{ value: ALL, label: t('common.all') }, ...choices]}
    />
  )
}

type ChoiceProps = { value: string; onChange: (value: string) => void }

export function DecisionField(props: ChoiceProps) {
  const { t } = useI18n()
  return (
    <ChoiceField
      label={t('admin.promptAudit.events.decision')}
      choices={DECISIONS.map((decision) => ({ value: decision, label: decisionLabel(decision) }))}
      {...props}
    />
  )
}

export function RiskField(props: ChoiceProps) {
  const { t } = useI18n()
  return (
    <ChoiceField
      label={t('admin.promptAudit.events.risk')}
      choices={RISK_LEVELS.map((risk) => ({ value: risk, label: riskLabel(risk) }))}
      {...props}
    />
  )
}

/** An id typed by hand. Only digits are taken: anything else would be no filter at all. */
export function IdField({
  label,
  value,
  onChange,
  onEnter,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
}) {
  return (
    <TextInput
      label={label}
      width="100%"
      value={value}
      onChange={(next) => onChange(next.replace(/\D/g, ''))}
      onEnter={onEnter}
    />
  )
}

/** A local date and time (`2026-11-20T09:30`), '' when not set. */
export function TimeField({
  label,
  value,
  min,
  max,
  status,
  onChange,
}: {
  label: string
  value: string
  min?: string
  max?: string
  status?: InputStatus
  onChange: (value: string) => void
}) {
  return (
    <DateTimeInput
      label={label}
      hasClear
      width="100%"
      value={asDateTime(value)}
      min={min ? asDateTime(min) : undefined}
      max={max ? asDateTime(max) : undefined}
      status={status}
      onChange={(next) => onChange(next ?? '')}
    />
  )
}
