import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ExclamationCircleIcon } from '@heroicons/react/24/outline'

/** A caution about the block next to it. Quieter than a banner: a guide can show several at once. */
export function SetupHint({ text }: { text: string }) {
  return (
    <HStack gap={1.5} vAlign="start">
      <Icon icon={ExclamationCircleIcon} size="sm" color="warning" />
      <Text type="supporting">{text}</Text>
    </HStack>
  )
}
