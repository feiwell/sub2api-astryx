import type { ComponentType, SVGProps } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { BanknotesIcon, BoltIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { formatMoney } from './redeemModel'

// Same build as the cards of the dashboards.
function FigureCard({
  icon,
  iconColor,
  label,
  value,
  unit,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  iconColor: 'green' | 'blue'
  label: string
  value: string
  unit?: string
}) {
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <Icon icon={icon} color={iconColor} />
          <Heading level={4}>{label}</Heading>
        </HStack>
        <HStack gap={2} vAlign="end" wrap="wrap">
          <Heading level={2}>{value}</Heading>
          {unit && (
            <Text type="supporting" color="secondary">
              {unit}
            </Text>
          )}
        </HStack>
      </VStack>
    </Card>
  )
}

/** What the account has now: the two figures a code can add to. */
export function BalanceCards({ balance, concurrency }: { balance: number; concurrency: number }) {
  const { t } = useI18n()
  return (
    // Narrow enough for the two to stay side by side on a phone 360 wide.
    <Grid columns={{ minWidth: 140, repeat: 'fit' }} gap={4}>
      <FigureCard
        icon={BanknotesIcon}
        iconColor="green"
        label={t('redeem.currentBalance')}
        value={formatMoney(balance)}
      />
      <FigureCard
        icon={BoltIcon}
        iconColor="blue"
        label={t('redeem.concurrency')}
        value={String(concurrency)}
        unit={t('redeem.requests')}
      />
    </Grid>
  )
}
