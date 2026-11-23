import type { ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { InfoTip } from '@astryxdesign/core/InfoTip'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import type { OpsTone } from './health'

export interface OpsFact {
  label: string
  value: string
}

/** Label + figure pairs under a card's headline value. */
export function OpsFacts({ facts }: { facts: OpsFact[] }) {
  return (
    <HStack gap={3} wrap="wrap">
      {facts.map((fact) => (
        <HStack key={fact.label} gap={1} vAlign="center">
          <Text type="supporting" color="secondary">
            {fact.label}
          </Text>
          <Text type="supporting" weight="medium" hasTabularNumbers>
            {fact.value}
          </Text>
        </HStack>
      ))}
    </HStack>
  )
}

/** Card title with its help tip, and an optional control at the end of the row. */
export function OpsCardHeader({ title, help, action }: { title: string; help?: string; action?: ReactNode }) {
  return (
    <HStack gap={2} hAlign="between" vAlign="center">
      <HStack gap={1} vAlign="center">
        <Heading level={4}>{title}</Heading>
        {help && <InfoTip content={help} />}
      </HStack>
      {action}
    </HStack>
  )
}

/**
 * One figure of the ops overview: a headline value, a status mark when the figure is judged
 * against a threshold, and the supporting figures beneath it.
 */
export function OpsStatCard({
  title,
  help,
  action,
  value,
  unit,
  status,
  bar,
  facts,
  note,
}: {
  title: string
  help?: string
  /** Control at the end of the title row (a "details" button). */
  action?: ReactNode
  value: string
  unit?: string
  /** Shown as a coloured dot before the value; `label` is what the colour means. */
  status?: { tone: OpsTone; label: string }
  /** Percent filled; clamped to 0..100. */
  bar?: number
  facts?: OpsFact[]
  note?: string
}) {
  return (
    <Card>
      <VStack gap={2}>
        <OpsCardHeader title={title} help={help} action={action} />
        <HStack gap={2} vAlign="center">
          {status && <StatusDot variant={status.tone} label={status.label} tooltip={status.label} />}
          <Heading level={2}>{value}</Heading>
          {unit && (
            <Text type="supporting" color="secondary">
              {unit}
            </Text>
          )}
        </HStack>
        {bar != null && (
          <ProgressBar
            label={title}
            isLabelHidden
            value={Math.min(100, Math.max(0, Math.round(bar * 10) / 10))}
            variant={status?.tone ?? 'accent'}
          />
        )}
        {facts && facts.length > 0 && <OpsFacts facts={facts} />}
        {note && (
          <Text type="supporting" color="secondary">
            {note}
          </Text>
        )}
      </VStack>
    </Card>
  )
}
