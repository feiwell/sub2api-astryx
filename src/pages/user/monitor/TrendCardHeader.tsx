import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useI18n } from '~/i18n'
import { bucketSize } from './pulseAxis'

/**
 * The head of a trend card: what it shows, how long one interval on its axis is, and the way back from a zoom.
 * `hint` tells how to zoom where that is not obvious.
 */
export function TrendCardHeader({
  title,
  description,
  bucketSeconds,
  hint,
  resetLabel,
  isZoomed,
  onResetZoom,
}: {
  title: string
  description: string
  bucketSeconds: number | null | undefined
  hint?: string
  resetLabel: string
  isZoomed: boolean
  onResetZoom: () => void
}) {
  const { t } = useI18n()
  const size = bucketSize(bucketSeconds)

  return (
    <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap">
      <VStack gap={1}>
        <Heading level={4}>{title}</Heading>
        <Text type="supporting">{description}</Text>
      </VStack>
      <HStack gap={2} vAlign="center" wrap="wrap">
        {size && <Token size="sm" color="gray" label={t(size.key, { count: size.count })} />}
        {hint && <Text type="supporting">{hint}</Text>}
        <Button size="sm" variant="secondary" label={resetLabel} isDisabled={!isZoomed} onClick={onResetZoom} />
      </HStack>
    </HStack>
  )
}
