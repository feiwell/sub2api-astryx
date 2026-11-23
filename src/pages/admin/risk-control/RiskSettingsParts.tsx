import type { ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { entryErrorStatus } from '../promptAudit/configText'
import type { RiskSettings } from './useRiskSettings'

/** Fields side by side where two fit, one under the other where they do not. */
export const FIELD_COLUMNS = { minWidth: 280, max: 2 } as const

/** A title with what it says about the fields under it; `actions` sit at its end. */
export function SettingsHeading({
  title,
  hint,
  level = 4,
  actions,
}: {
  title: string
  hint?: string
  /** 4 for a section, 5 for a part of one. */
  level?: 4 | 5
  actions?: ReactNode
}) {
  return (
    <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
      <VStack gap={0.5}>
        <Heading level={level}>{title}</Heading>
        {hint && (
          <Text type="supporting" color="secondary">
            {hint}
          </Text>
        )}
      </VStack>
      {actions}
    </HStack>
  )
}

/** A group of settings that belong together, set apart from the fields around it. */
export function SettingsSection({
  title,
  hint,
  actions,
  children,
}: {
  title: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Card variant="muted" padding={4}>
      <VStack gap={4}>
        <SettingsHeading title={title} hint={hint} actions={actions} />
        {children}
      </VStack>
    </Card>
  )
}

/** A switch that fills its row, label first, as every on/off setting of the dialog is laid out. */
export function SettingToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <Switch
      label={label}
      description={hint}
      value={value}
      onChange={onChange}
      labelPosition="start"
      labelSpacing="spread"
      width="100%"
    />
  )
}

/**
 * A number setting. The field keeps to its range by itself; text it cannot read stays in it,
 * marked, and is reported to the dialog so a save does not go out with something else on screen.
 */
export function SettingNumber({
  settings,
  field,
  label,
  description,
  value,
  min,
  max,
  step,
  units,
  isIntegerOnly = true,
  onChange,
}: {
  settings: RiskSettings
  /** Names the field among the dialog's number fields. */
  field: string
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  units?: string
  isIntegerOnly?: boolean
  onChange: (value: number) => void
}) {
  return (
    <NumberInput
      label={label}
      description={description}
      width="100%"
      value={value}
      min={min}
      max={max}
      step={step}
      units={units}
      isIntegerOnly={isIntegerOnly}
      // The dialog scrolls with the wheel: a field that passes under the pointer must not change with it.
      isWheelEnabled={false}
      onChange={onChange}
      onEntryErrorChange={(error) => settings.reportNumberError(field, error)}
      status={entryErrorStatus(settings.numberErrors[field])}
    />
  )
}
