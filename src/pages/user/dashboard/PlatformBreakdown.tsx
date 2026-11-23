import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { useI18n } from '~/i18n'
import {
  countPlatforms,
  formatCost,
  formatResetTime,
  formatTokens,
  formatUsd,
  platformLabel,
  quotaWindows,
  type PlatformCard,
  type QuotaWindow,
} from './dashboardModel'

/** One window of a platform's limit: how much of it is used and when it starts over. */
function QuotaBar({ quota }: { quota: QuotaWindow }) {
  const { t, locale } = useI18n()
  const name = t(`dashboard.platformQuota.${quota.name}`)
  const figures = quota.isDisabled
    ? t('dashboard.platformQuota.disabled')
    : `$${formatUsd(quota.usage)} / $${formatUsd(quota.limit)}`
  return (
    <VStack gap={1}>
      {/* Written here and not by the bar: in a narrow card the name wraps and the amounts stay on one line. */}
      <HStack gap={2} hAlign="between" vAlign="end">
        <StackItem size="fill">
          <Text weight="medium">{name}</Text>
        </StackItem>
        <StackItem size="static">
          <Text color="secondary" hasTabularNumbers>
            {figures}
          </Text>
        </StackItem>
      </HStack>
      {/* The bar shows no text of its own; a screen reader is told the amounts rather than a bare percentage. */}
      <ProgressBar
        label={name}
        isLabelHidden
        value={quota.percent}
        variant={quota.tone}
        formatValueLabel={() => figures}
      />
      {quota.resetsAt && (
        <Text type="supporting" color="secondary">
          {t('dashboard.platformQuota.resetsAt', { time: formatResetTime(quota.resetsAt, locale) })}
        </Text>
      )}
    </VStack>
  )
}

function PlatformCardView({ card }: { card: PlatformCard }) {
  const { t, locale } = useI18n()
  // The rest that no platform accounts for has spend alone: no requests, no tokens, no limits.
  const quotas = card.isOther ? [] : quotaWindows(card.quota)
  const rows = [
    { label: t('dashboard.todayCost'), value: `$${formatCost(card.todayCost)}` },
    { label: t('dashboard.requests'), value: card.requests > 0 ? card.requests.toLocaleString(locale) : '-' },
    { label: t('dashboard.tokens'), value: card.tokens > 0 ? formatTokens(card.tokens) : '-' },
  ]
  return (
    <Card variant={card.isOther ? 'muted' : 'default'}>
      <VStack gap={3}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <StackItem size="fill">
            <Heading level={4}>{card.isOther ? t('dashboard.platformOther') : platformLabel(card.platform)}</Heading>
          </StackItem>
          <Tooltip content={t('dashboard.actual')}>
            <Text weight="semibold" hasTabularNumbers>
              {`$${formatCost(card.totalCost)}`}
            </Text>
          </Tooltip>
        </HStack>
        <VStack gap={1}>
          {rows.map((row) => (
            <HStack key={row.label} gap={2} hAlign="between" vAlign="center">
              <Text type="supporting" color="secondary">
                {row.label}
              </Text>
              <Text type="supporting" hasTabularNumbers>
                {row.value}
              </Text>
            </HStack>
          ))}
        </VStack>
        {quotas.length > 0 && (
          <>
            <Divider />
            <VStack gap={2}>
              <Text type="supporting" color="secondary">
                {t('dashboard.platformQuota.title')}
              </Text>
              {quotas.map((quota) => (
                <QuotaBar key={quota.name} quota={quota} />
              ))}
            </VStack>
          </>
        )}
      </VStack>
    </Card>
  )
}

/**
 * What each platform was used for, and how full its limits are. Shown only when there is a card to show:
 * a platform that was used or has a limit, or spend that no platform accounts for.
 */
export function PlatformBreakdown({ cards }: { cards: PlatformCard[] }) {
  const { t } = useI18n()
  if (cards.length === 0) return null
  return (
    <VStack gap={3}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <Heading level={3}>{t('dashboard.platformBreakdown')}</Heading>
        <Text type="supporting" color="secondary">
          {t('dashboard.platformCount', { count: countPlatforms(cards) })}
        </Text>
      </HStack>
      {/* Four to a row at most; a lone card keeps the width of one of four. */}
      <Grid columns={{ minWidth: 240, max: 4 }} gap={4}>
        {cards.map((card) => (
          <PlatformCardView key={card.platform} card={card} />
        ))}
      </Grid>
    </VStack>
  )
}
