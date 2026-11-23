import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export type MetricIcon = ComponentType<SVGProps<SVGSVGElement>>
type MetricIconColor = 'blue' | 'purple' | 'green' | 'teal' | 'orange' | 'cyan' | 'pink' | 'yellow'

export interface MetricFact {
  label: string
  value: string
  /** Marks a figure that needs attention (failing accounts). */
  tone?: 'error'
}

export function MetricCard({
  icon,
  iconColor,
  label,
  value,
  unit,
  facts,
}: {
  icon: MetricIcon
  iconColor: MetricIconColor
  label: string
  value: string
  /** Unit shown beside the value (RPM). */
  unit?: string
  /** Secondary figures under the value, as label + number pairs. */
  facts: MetricFact[]
}) {
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <Icon icon={icon} color={iconColor} />
          <Heading level={4}>{label}</Heading>
        </HStack>
        <HStack gap={2} vAlign="end">
          <Heading level={2}>{value}</Heading>
          {unit && (
            <Text type="supporting" color="secondary">
              {unit}
            </Text>
          )}
        </HStack>
        <HStack gap={3} wrap="wrap">
          {facts.map((fact) => (
            <HStack key={fact.label} gap={1} vAlign="center">
              {fact.tone === 'error' && <Icon icon={ExclamationTriangleIcon} size="xsm" color="error" />}
              <Text type="supporting" color="secondary">
                {fact.label}
              </Text>
              <Text type="supporting" weight="medium" hasTabularNumbers>
                {fact.value}
              </Text>
            </HStack>
          ))}
        </HStack>
      </VStack>
    </Card>
  )
}

/**
 * A row of four cards that reflows 4 → 2 + 2 → 1 per row. The cards sit in two
 * pairs so a narrow window never leaves a single card alone on its row.
 */
export function MetricRow({ children }: { children: [ReactNode, ReactNode, ReactNode, ReactNode] }) {
  return (
    <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
      {[0, 2].map((start) => (
        <Grid key={start} columns={{ minWidth: 240, repeat: 'fit' }} gap={4}>
          {children[start]}
          {children[start + 1]}
        </Grid>
      ))}
    </Grid>
  )
}
