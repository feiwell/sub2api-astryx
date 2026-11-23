import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import type { TopUserPaymentStats } from '@/types/payment'
import { formatPaymentAmount } from '@/components/payment/currency'
import { useI18n } from '~/i18n'

export function TopUsersCard({ usersByCurrency }: { usersByCurrency: Record<string, TopUserPaymentStats[]> }) {
  const { t, locale } = useI18n()
  const groups = Object.entries(usersByCurrency)
    .filter(([, users]) => users.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
  return (
    <Card>
      <VStack gap={4}>
        <Heading level={3}>{t('payment.admin.topUsers')}</Heading>
        {groups.length === 0 ? (
          <EmptyState isCompact headingLevel={4} title={t('payment.admin.noData')} />
        ) : (
          <VStack gap={4}>
            {groups.map(([currency, users]) => (
              <VStack key={currency} gap={2}>
                <Text type="label" color="secondary">{currency}</Text>
                {users.map((user, index) => {
                  const name = user.email.trim() || `#${user.user_id}`
                  return (
                    <HStack key={`${currency}-${user.user_id}`} gap={3} vAlign="center" width="100%">
                      <Badge
                        variant={index === 0 ? 'yellow' : index === 1 ? 'neutral' : index === 2 ? 'orange' : 'neutral'}
                        label={String(index + 1)}
                      />
                      <StackItem size="fill">
                        <Text type="body" maxLines={1} hasTruncateTooltip>{name}</Text>
                      </StackItem>
                      <Text type="supporting" weight={index < 3 ? 'semibold' : 'normal'} hasTabularNumbers textWrap="nowrap">
                        {formatPaymentAmount(user.amount, currency, locale)}
                      </Text>
                    </HStack>
                  )
                })}
              </VStack>
            ))}
          </VStack>
        )}
      </VStack>
    </Card>
  )
}
