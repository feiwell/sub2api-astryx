import type { ComponentProps, ReactNode } from 'react'
import { Divider } from '@astryxdesign/core/Divider'
import { HoverCard } from '@astryxdesign/core/HoverCard'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { PhotoIcon } from '@heroicons/react/24/outline'
import type { UsageLog, UsageRequestType } from '@/types'
import { getBillingModeLabel, getDisplayBillingMode, isImageUsage } from '@/utils/billingMode'
import { requestTypeLabelKey } from '@/utils/errorBadges'
import { formatCacheTokens } from '@/utils/formatters'
import { formatImageBillingSize, hasImageInputTokens, hasImageOutputTokens } from '@/utils/imageUsage'
import {
  durationSeverity,
  firstTokenSeverity,
  formatUsageOutputRate,
  type LatencySeverity,
} from '@/utils/latencyHealth'
import { resolveUsageRequestType } from '@/utils/usageRequestType'
import { useI18n } from '~/i18n'
import { costDetails, formatLatency, tokenDetails, type DetailLine } from './usageFormat'

type TokenColor = NonNullable<ComponentProps<typeof Token>['color']>

const REQUEST_TYPE_COLOR: Record<UsageRequestType, TokenColor> = {
  cyber: 'red',
  live: 'green',
  ws_v2: 'purple',
  stream: 'blue',
  sync: 'gray',
  unknown: 'yellow',
}

const BILLING_MODE_COLOR: Record<string, TokenColor> = {
  per_request: 'purple',
  image: 'pink',
  video: 'yellow',
}

// A time within its normal range is plain text; the three slower bands are marked, mildest to worst.
const SLOW_COLOR: Record<Exclude<LatencySeverity, 'good'>, TokenColor> = {
  warn: 'yellow',
  slow: 'orange',
  critical: 'red',
}

const count = (value: number | null | undefined) => (value ?? 0).toLocaleString()

function Figure({ children }: { children: ReactNode }) {
  return (
    <Text type="supporting" color="primary" weight="medium" hasTabularNumbers textWrap="nowrap">
      {children}
    </Text>
  )
}

function DetailLines({ lines }: { lines: DetailLine[] }) {
  return lines.map((line, index) => (
    <HStack key={index} gap={4} hAlign="between" vAlign="center">
      <HStack gap={1} vAlign="center">
        <Text type="supporting">{line.label}</Text>
        {line.tag && <Token size="sm" color="orange" label={line.tag} />}
      </HStack>
      <Figure>{line.value}</Figure>
    </HStack>
  ))
}

function TokenDetails({ row }: { row: UsageLog }) {
  const { t } = useI18n()
  const { lines, total } = tokenDetails(row, t)
  return (
    <VStack gap={1.5} hAlign="stretch">
      <Text type="label">{t('usage.tokenDetails')}</Text>
      <DetailLines lines={lines} />
      <Divider />
      <DetailLines lines={[{ label: t('usage.totalTokens'), value: total.toLocaleString() }]} />
    </VStack>
  )
}

function CostDetails({ row, extraDetails = [] }: { row: UsageLog; extraDetails?: DetailLine[] }) {
  const { t } = useI18n()
  const { breakdown, summary } = costDetails(row, t)
  return (
    <VStack gap={1.5} hAlign="stretch">
      <Text type="label">{t('usage.costDetails')}</Text>
      <DetailLines lines={breakdown} />
      <Divider />
      <DetailLines lines={summary} />
      {extraDetails.length > 0 && <Divider />}
      <DetailLines lines={extraDetails} />
    </VStack>
  )
}

/** The tokens of a request: in and out, then what was read from and written to the cache. Hover for every part. */
export function TokensCell({ row }: { row: UsageLog }) {
  const { t } = useI18n()

  // A request billed per image has no token counts worth showing; it shows how many images, and at what size.
  if (isImageUsage(row)) {
    return (
      <HStack gap={1} vAlign="center">
        <Icon icon={PhotoIcon} size="sm" color="secondary" />
        <Figure>{`${row.image_count}${t('usage.imageUnit')}`}</Figure>
        <Text type="supporting">{`(${formatImageBillingSize(row, t)})`}</Text>
      </HStack>
    )
  }

  const hasCacheRead = row.cache_read_tokens > 0
  const hasCacheWrite = row.cache_creation_tokens > 0
  return (
    <VStack gap={0.5}>
      <Figure>
        <HoverCard content={<TokenDetails row={row} />} label={t('usage.tokenDetails')}>
          {`↓ ${count(row.input_tokens)} ↑ ${count(row.output_tokens)}`}
        </HoverCard>
      </Figure>
      {(hasCacheRead || hasCacheWrite) && (
        <HStack gap={1} vAlign="center" wrap="wrap">
          {hasCacheRead && (
            <Text type="supporting" hasTabularNumbers textWrap="nowrap">
              {`${t('usage.cacheRead')} ${formatCacheTokens(row.cache_read_tokens)}`}
            </Text>
          )}
          {hasCacheWrite && (
            <Text type="supporting" hasTabularNumbers textWrap="nowrap">
              {`${t('usage.cacheWrite')} ${formatCacheTokens(row.cache_creation_tokens)}`}
            </Text>
          )}
          {row.cache_creation_1h_tokens > 0 && <Token size="sm" color="orange" label="1h" />}
          {(row.cache_creation_12h_tokens ?? 0) > 0 && <Token size="sm" color="orange" label="12h" />}
          {row.cache_ttl_overridden && (
            <Tooltip content={t('usage.cacheTtlOverriddenHint')}>
              <Token size="sm" color="red" label="R" />
            </Tooltip>
          )}
        </HStack>
      )}
      {hasImageInputTokens(row) && (
        <Text type="supporting" hasTabularNumbers>
          {`${t('usage.imageInputTokens')} ${count(row.image_input_tokens)}`}
        </Text>
      )}
      {hasImageOutputTokens(row) && (
        <Text type="supporting" hasTabularNumbers>
          {`${t('usage.imageOutputTokens')} ${count(row.image_output_tokens)}`}
        </Text>
      )}
    </VStack>
  )
}

/**
 * What the request was charged. Hover for how the price came about. A list that knows more about the charge
 * adds it: `extraDetails` set apart at the end of the hover card, `footnote` under the figure.
 */
export function CostCell({
  row,
  extraDetails,
  footnote,
}: {
  row: UsageLog
  extraDetails?: DetailLine[]
  footnote?: ReactNode
}) {
  const { t } = useI18n()
  const charged = (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <Figure>
        <HoverCard content={<CostDetails row={row} extraDetails={extraDetails} />} label={t('usage.costDetails')}>
          {`$${(row.actual_cost ?? 0).toFixed(6)}`}
        </HoverCard>
      </Figure>
      {row.long_context_billing_applied && (
        <Tooltip content={t('admin.usage.longContextPricingTooltip')}>
          <Token size="sm" color="yellow" label={t('admin.usage.longContext')} />
        </Tooltip>
      )}
    </HStack>
  )
  if (!footnote) return charged
  return (
    <VStack gap={0.5}>
      {charged}
      {footnote}
    </VStack>
  )
}

function LatencyFigure({ value, severity }: { value: string; severity: LatencySeverity }) {
  if (severity === 'good') return <Figure>{value}</Figure>
  return <Token size="sm" color={SLOW_COLOR[severity]} label={value} />
}

/** Time to the first token, total time, and output speed. A time in a slow band stands out by its colour. */
export function LatencyCell({ row }: { row: UsageLog }) {
  const { t } = useI18n()
  const line = (label: ReactNode, figure: ReactNode) => (
    <HStack gap={2} hAlign="between" vAlign="center">
      <Text type="supporting" textWrap="nowrap">
        {label}
      </Text>
      {figure}
    </HStack>
  )
  return (
    <VStack gap={0.5} hAlign="stretch">
      {line(
        t('usage.latencyFirstToken'),
        row.first_token_ms != null ? (
          <LatencyFigure value={formatLatency(row.first_token_ms)} severity={firstTokenSeverity(row.first_token_ms)} />
        ) : (
          <Text type="supporting">-</Text>
        ),
      )}
      {line(
        t('usage.latencyDuration'),
        <LatencyFigure value={formatLatency(row.duration_ms)} severity={durationSeverity(row.duration_ms ?? 0)} />,
      )}
      {line(
        <Tooltip content={t('usage.outputTpsHint')}>{t('usage.outputTps')}</Tooltip>,
        <Figure>{formatUsageOutputRate(row)}</Figure>,
      )}
    </VStack>
  )
}

/** How a request was made (sync, stream, WebSocket…), in the colour that kind has everywhere. */
export function RequestTypeToken({ requestType }: { requestType: UsageRequestType }) {
  const { t } = useI18n()
  return <Token size="sm" color={REQUEST_TYPE_COLOR[requestType]} label={t(requestTypeLabelKey(requestType))} />
}

export function RequestTypeCell({ row }: { row: UsageLog }) {
  const { t } = useI18n()
  return (
    <HStack gap={1} wrap="wrap">
      <RequestTypeToken requestType={resolveUsageRequestType(row)} />
      {row.native_compaction_v2 && <Token size="sm" color="teal" label={t('usage.nativeCompactionV2')} />}
    </HStack>
  )
}

export function BillingModeCell({ row }: { row: UsageLog }) {
  const { t } = useI18n()
  const mode = getDisplayBillingMode(row)
  return <Token size="sm" color={BILLING_MODE_COLOR[mode ?? ''] ?? 'blue'} label={getBillingModeLabel(mode, t)} />
}
