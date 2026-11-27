import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { getPlatformMark } from '~/components/common/PlatformMarkIcon'
import { providerInitials } from '~/lib/providerInitials'

/** The monitor card displays the full provider name beside this decorative tile. */
export function ProviderMark({ provider }: { provider: string }) {
  const mark = getPlatformMark(provider)
  return (
    <Card variant="muted" padding={0} aria-hidden data-provider-mark={provider}>
      <Center width={40} height={40}>
        {mark ? (
          <Icon icon={mark} size="md" color="primary" />
        ) : (
          <Text weight="semibold" color="secondary">{providerInitials(provider)}</Text>
        )}
      </Center>
    </Card>
  )
}
