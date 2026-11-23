import { useEffect, type ComponentType, type SVGProps } from 'react'
import { useNavigate } from 'react-router'
import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ChartBarIcon, ChevronRightIcon, GiftIcon, KeyIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { useBatchImageAccess } from '~/stores/batchImageAccess'

interface QuickAction {
  path: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  iconColor: 'blue' | 'green' | 'cyan' | 'orange'
  title: string
  description: string
}

/** The pages a user most often goes to from here. */
export function QuickActionsCard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const canUseBatchImage = useBatchImageAccess((s) => s.canUseBatchImage)
  const refreshBatchImageAccess = useBatchImageAccess((s) => s.refresh)

  // Answered from what the app already knows when it has asked before.
  useEffect(() => {
    void refreshBatchImageAccess()
  }, [refreshBatchImageAccess])

  const actions: QuickAction[] = [
    {
      path: '/keys',
      icon: KeyIcon,
      iconColor: 'blue',
      title: t('dashboard.createApiKey'),
      description: t('dashboard.generateNewKey'),
    },
    {
      path: '/usage',
      icon: ChartBarIcon,
      iconColor: 'green',
      title: t('dashboard.viewUsage'),
      description: t('dashboard.checkDetailedLogs'),
    },
    // Only for a user with a key that may generate images in batches.
    ...(canUseBatchImage
      ? [
          {
            path: '/batch-image',
            icon: SparklesIcon,
            iconColor: 'cyan' as const,
            title: t('dashboard.batchImageAgent'),
            description: t('dashboard.batchImageAgentDesc'),
          },
        ]
      : []),
    {
      path: '/redeem',
      icon: GiftIcon,
      iconColor: 'orange',
      title: t('dashboard.redeemCode'),
      description: t('dashboard.addBalanceWithCode'),
    },
  ]

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={4}>{t('dashboard.quickActions')}</Heading>
        {actions.map((action) => (
          <ClickableCard
            key={action.path}
            label={action.title}
            variant="muted"
            padding={3}
            onClick={() => navigate(action.path)}
          >
            <HStack gap={3} vAlign="center">
              <Icon icon={action.icon} color={action.iconColor} />
              <StackItem size="fill">
                <VStack gap={0}>
                  <Text type="body" weight="medium">
                    {action.title}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {action.description}
                  </Text>
                </VStack>
              </StackItem>
              <Icon icon={ChevronRightIcon} size="sm" color="tertiary" />
            </HStack>
          </ClickableCard>
        ))}
      </VStack>
    </Card>
  )
}
