import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { MONITOR_ERROR_CATEGORIES, type MonitorConfig } from '@/api/channelMonitorV2'
import { useI18n } from '~/i18n'
import { countedCategoryCount, ignoredCategories, withIgnoredCategories } from './monitorV2Settings'

/**
 * The kinds of error the monitor tells apart. A ticked one is ignored: it stays in the list of error causes
 * but no longer counts toward the error rate or the health score. Changes the draft only.
 */
export function MonitorV2ErrorsCard({
  config,
  onChange,
  isDisabled,
}: {
  config: MonitorConfig
  onChange: (edit: (config: MonitorConfig) => MonitorConfig) => void
  isDisabled: boolean
}) {
  const { t, te } = useI18n()
  const ignored = ignoredCategories(config)

  /** A category by its name in this app; one the app has no name for goes by its code. */
  const nameOf = (category: string) => {
    const key = `channelMonitorV2.errorCategories.${category}`
    return te(key) ? t(key) : category
  }

  return (
    <Card>
      <VStack gap={3}>
        <VStack gap={0.5}>
          <Heading level={4}>{t('channelMonitorV2.settings.errorsTitle')}</Heading>
          <Text type="supporting" color="secondary">
            {t('channelMonitorV2.settings.errorsHint')}
          </Text>
        </VStack>

        {/* Shown in full: which kinds are ignored should be plain at a glance. */}
        <CheckboxList
          label={t('channelMonitorV2.settings.errorsTitle')}
          isLabelHidden
          density="compact"
          value={ignored}
          onChange={(values) => onChange((current) => withIgnoredCategories(current, values))}
          isDisabled={isDisabled}
        >
          {MONITOR_ERROR_CATEGORIES.map((category) => (
            <CheckboxListItem
              key={category}
              value={category}
              label={nameOf(category)}
              endContent={
                <Text type="code" color="secondary">
                  {category}
                </Text>
              }
            />
          ))}
        </CheckboxList>

        <Text type="supporting" color="secondary" hasTabularNumbers>
          {t('channelMonitorV2.settings.ignoredSummary', {
            ignored: ignored.length,
            counted: countedCategoryCount(config),
          })}
        </Text>
      </VStack>
    </Card>
  )
}
