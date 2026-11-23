import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { MonitorConfig } from '@/api/channelMonitorV2'
import { useI18n } from '~/i18n'
import { percentOf, rateOf, withThreshold, type RateThreshold } from './monitorV2Settings'

/** The thresholds edited as whole numbers: a count of requests, or milliseconds. */
type WholeThreshold = 'minimum_sample' | 'target_ttft_ms' | 'warning_ttft_ms' | 'critical_ttft_ms'
export type ThresholdField = WholeThreshold | RateThreshold

/** By field: what was typed into it and refused. The draft still holds the number from before. */
export type ThresholdEntryErrors = Partial<Record<ThresholdField, NumberInputEntryError>>

// The most the server takes for the sample size.
const MAX_SAMPLE = 10000
const TTFT_STEP_MS = 100

/**
 * Where the monitor draws its lines: how many requests it needs before it judges, and from which error
 * rate, time to first token and cache rate on a channel counts as worth watching or as failing. Shares are
 * stored as 0 to 1 and edited as percentages. Changes the draft only.
 */
export function MonitorV2ThresholdsCard({
  config,
  revision,
  entryErrors,
  onChange,
  onEntryError,
  isDisabled,
}: {
  config: MonitorConfig
  /** Changes when the draft is replaced as a whole: the fields start over from it. */
  revision: number
  entryErrors: ThresholdEntryErrors
  onChange: (edit: (config: MonitorConfig) => MonitorConfig) => void
  /** A field refused what was typed into it, or (null) no longer holds such text. */
  onEntryError: (field: ThresholdField, error: NumberInputEntryError | null) => void
  isDisabled: boolean
}) {
  const { t } = useI18n()
  const thresholds = config.health_thresholds

  // The field words its refusal in English only, so it is worded here, with the texts the settings pages
  // use for the same.
  const statusOf = (field: ThresholdField) => {
    const error = entryErrors[field]
    if (!error) return undefined
    const message =
      error.kind === 'fractional'
        ? t('admin.settings.features.affiliate.wholeNumber')
        : t('admin.settings.features.affiliate.invalidNumber')
    return { type: 'error' as const, message }
  }

  const whole = (field: WholeThreshold, label: string, limits: { max?: number; step?: number } = {}) => (
    <NumberInput
      label={label}
      isIntegerOnly
      isWheelEnabled={false}
      width="100%"
      min={1}
      max={limits.max}
      step={limits.step}
      value={thresholds[field]}
      onChange={(value) => onChange((current) => withThreshold(current, field, value))}
      onEntryErrorChange={(error) => onEntryError(field, error)}
      status={statusOf(field)}
      isDisabled={isDisabled}
    />
  )

  const percent = (field: RateThreshold, label: string) => (
    <NumberInput
      label={label}
      isWheelEnabled={false}
      width="100%"
      min={0}
      max={100}
      step={0.1}
      value={percentOf(thresholds[field])}
      onChange={(value) => onChange((current) => withThreshold(current, field, rateOf(value)))}
      onEntryErrorChange={(error) => onEntryError(field, error)}
      status={statusOf(field)}
      isDisabled={isDisabled}
    />
  )

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={0.5}>
          <Heading level={4}>{t('channelMonitorV2.settings.healthTitle')}</Heading>
          <Text type="supporting" color="secondary">
            {t('channelMonitorV2.settings.healthHint')}
          </Text>
        </VStack>

        {/* Keyed by the draft's revision: text a field refused does not outlive the draft it was typed over. */}
        <Grid key={revision} columns={{ minWidth: 180, max: 4 }} gap={4}>
          {whole('minimum_sample', t('channelMonitorV2.settings.fields.minimumSample'), { max: MAX_SAMPLE })}
          {percent('warning_error_rate', t('channelMonitorV2.settings.fields.warningError'))}
          {percent('critical_error_rate', t('channelMonitorV2.settings.fields.criticalError'))}
          {whole('target_ttft_ms', t('channelMonitorV2.settings.fields.targetTtft'), { step: TTFT_STEP_MS })}
          {whole('warning_ttft_ms', t('channelMonitorV2.settings.fields.warningTtft'), { step: TTFT_STEP_MS })}
          {whole('critical_ttft_ms', t('channelMonitorV2.settings.fields.criticalTtft'), { step: TTFT_STEP_MS })}
          {percent('warning_cache_rate', t('channelMonitorV2.settings.fields.warningCache'))}
          {percent('critical_cache_rate', t('channelMonitorV2.settings.fields.criticalCache'))}
        </Grid>
      </VStack>
    </Card>
  )
}
