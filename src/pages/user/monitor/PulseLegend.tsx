import { HStack, StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { BAND_FILLS, LEGEND_ENTRIES } from './pulseScale'

/**
 * A dot in one of the fills of the matrix. With a `label` it stands on its own; without one the text next to
 * it says what it means.
 */
export function HealthSwatch({ fill, label }: { fill: string; label?: string }) {
  return (
    <StackItem
      size="static"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-swatch
      style={{ width: 'var(--spacing-2)', height: 'var(--spacing-2)', borderRadius: 'var(--radius-full)', background: fill }}
    />
  )
}

/** What the fills of the matrix mean: the whole scale from bad to good, and the ranges of scores it covers. */
export function PulseLegend() {
  const { t } = useI18n()

  return (
    <HStack gap={4} vAlign="center" wrap="wrap" role="group" aria-label={t('channelMonitorV2.matrix.legendAria')}>
      <HStack gap={2} vAlign="center">
        <Text type="supporting">{t('channelMonitorV2.matrix.bad')}</Text>
        <HStack gap={0} aria-hidden data-pulse-scale style={{ borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          {BAND_FILLS.map((fill) => (
            <StackItem key={fill} size="static" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-2)', background: fill }} />
          ))}
        </HStack>
        <Text type="supporting">{t('channelMonitorV2.matrix.good')}</Text>
      </HStack>
      {LEGEND_ENTRIES.map((entry) => (
        <HStack key={entry.key} gap={1.5} vAlign="center">
          <HealthSwatch fill={entry.fill} />
          <Text type="supporting">{t(entry.key)}</Text>
        </HStack>
      ))}
    </HStack>
  )
}
