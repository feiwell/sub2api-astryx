import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Text } from '@astryxdesign/core/Text'
import { providerInitials } from '~/lib/providerInitials'

/** The monitor card displays the full provider name beside this decorative tile. */
export function ProviderMark({ provider }: { provider: string }) {
  return (
    <Card variant="muted" padding={0} aria-hidden data-provider-mark={provider}>
      <Center width={40} height={40}>
        <Text weight="semibold" color="secondary">{providerInitials(provider)}</Text>
      </Center>
    </Card>
  )
}
