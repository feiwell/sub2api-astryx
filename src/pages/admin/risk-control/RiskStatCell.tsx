import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

/** One running figure inside a card: what it counts, the figure, and what the count takes in. */
export function RiskStatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      <Text size="xl" weight="semibold" hasTabularNumbers>
        {value}
      </Text>
      {hint && <Text type="supporting">{hint}</Text>}
    </VStack>
  )
}
