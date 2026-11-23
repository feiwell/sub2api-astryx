import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { PaymentMethodStats } from '@/types/payment'
import { formatPaymentAmount } from '@/components/payment/currency'
import { useI18n } from '~/i18n'
import { sortedAmounts } from './dashboardModel'

function methodColor(type: string): 'blue' | 'green' | 'purple' | 'gray' {
  if (type === 'alipay' || type === 'alipay_direct') return 'blue'
  if (type === 'wxpay' || type === 'wxpay_direct') return 'green'
  if (type === 'stripe') return 'purple'
  return 'gray'
}

export function PaymentMethodsCard({ methods }: { methods: PaymentMethodStats[] }) {
  const { t, te, locale } = useI18n()
  return (
    <Card>
      <VStack gap={4}>
        <Heading level={3}>{t('payment.admin.paymentDistribution')}</Heading>
        {methods.length === 0 ? (
          <EmptyState isCompact headingLevel={4} title={t('payment.admin.noData')} />
        ) : (
          <VStack gap={3}>
            {methods.map((method) => {
              const key = `payment.methods.${method.type}`
              const label = te(key) ? t(key) : method.type
              const amounts = sortedAmounts(method.amount)
              return (
                <HStack key={method.type} gap={3} vAlign="center" justify="between" wrap="wrap">
                  <Token label={label} color={methodColor(method.type)} />
                  <VStack gap={0.5} hAlign="end">
                    {amounts.map(([currency, amount]) => (
                      <Text key={currency} type="supporting" weight="medium" hasTabularNumbers>
                        {formatPaymentAmount(amount, currency, locale)}
                      </Text>
                    ))}
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {`(${method.count})`}
                    </Text>
                  </VStack>
                </HStack>
              )
            })}
          </VStack>
        )}
      </VStack>
    </Card>
  )
}
