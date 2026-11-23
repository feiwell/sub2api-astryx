import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Icon } from '@astryxdesign/core/Icon'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Thumbnail } from '@astryxdesign/core/Thumbnail'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import type { ContentModerationTestAuditResult } from '~/lib/api/admin/riskControl'
import { clampPercent, formatScore } from './riskFormat'
import { auditScoreRows } from './riskKeys'
import { engineLabel } from './riskModel'
import { SettingsHeading } from './RiskSettingsParts'
import type { RiskSettings } from './useRiskSettings'

/** A score between 0 and 1 as a length on a bar that ends at 100. */
const barValue = (score: number) => clampPercent(score * 100)

/**
 * What a trial run is asked with: a prompt, an image, or both. With neither, a test only tells
 * whether the keys work. Nothing here is saved with the settings.
 */
export function RiskAuditTestInput({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const { testPrompt, testImages, testResult } = settings
  const hasAnything = testPrompt !== '' || testImages.length > 0 || testResult != null

  return (
    <VStack gap={3}>
      <SettingsHeading
        level={5}
        title={t('admin.riskControl.auditTestInput')}
        hint={t('admin.riskControl.auditTestInputHint')}
        actions={
          hasAnything && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon icon={XMarkIcon} />}
              label={t('admin.riskControl.clearAuditTest')}
              onClick={settings.clearTest}
            />
          )
        }
      />
      <TextArea
        label={t('admin.riskControl.auditTestInput')}
        isLabelHidden
        width="100%"
        rows={4}
        value={testPrompt}
        onChange={settings.setTestPrompt}
        placeholder={t('admin.riskControl.auditTestPromptPlaceholder')}
        onPaste={(event) => {
          const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
          if (images.length === 0) return
          // An image on the clipboard is the trial's image, not text for the prompt.
          event.preventDefault()
          void settings.addTestImages(images)
        }}
      />
      {/* The field holds nothing itself: what is picked goes to the list under it. */}
      <FileInput
        label={t('admin.riskControl.auditTestImages')}
        description={t('admin.riskControl.auditTestImagesHint')}
        placeholder={t('admin.riskControl.addAuditTestImage')}
        width="100%"
        accept="image/*"
        mode="dropzone"
        value={null}
        onChange={(picked) => {
          const files = picked == null ? [] : Array.isArray(picked) ? picked : [picked]
          void settings.addTestImages(files)
        }}
      />
      {testImages.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {testImages.map((image, index) => (
            <Thumbnail
              // A data URL starts the same for every image of a kind; its place tells them apart.
              key={index}
              src={image}
              alt={t('admin.riskControl.auditTestImages')}
              showRemoveOn="always"
              onRemove={() => settings.removeTestImage(index)}
            />
          ))}
        </HStack>
      )}
    </VStack>
  )
}

/**
 * What the engine made of the trial's content: the verdict, then every category's score against
 * its threshold, the highest first. The mark on a bar is where that category's threshold lies.
 */
export function RiskAuditTestResult({ result }: { result: ContentModerationTestAuditResult }) {
  const { t } = useI18n()
  const meta = result.engine_meta
  const source = meta
    ? [
        engineLabel(meta.engine),
        meta.model,
        meta.rules_version,
        meta.skipped_images ? t('admin.riskControl.skippedImages', { count: meta.skipped_images }) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <VStack gap={3}>
      <SettingsHeading
        level={5}
        title={t('admin.riskControl.auditTestResult')}
        hint={t('admin.riskControl.auditTestHighest', {
          category: result.highest_category || '-',
          score: formatScore(result.highest_score),
        })}
        actions={
          <Badge
            variant={result.flagged ? 'error' : 'success'}
            label={result.flagged ? t('admin.riskControl.auditTestFlagged') : t('admin.riskControl.auditTestPassed')}
          />
        }
      />
      {source && (
        <Text type="supporting" color="secondary" wordBreak="break-word">
          {source}
        </Text>
      )}
      <ProgressBar
        label={t('admin.riskControl.auditTestComposite')}
        value={barValue(result.composite_score)}
        variant={result.flagged ? 'error' : 'success'}
        hasValueLabel
        formatValueLabel={() => formatScore(result.composite_score)}
      />
      <VStack gap={2}>
        {auditScoreRows(result).map((row) => (
          <ProgressBar
            key={row.category}
            label={row.category}
            value={barValue(row.score)}
            variant={row.isHit ? 'error' : 'accent'}
            hasValueLabel
            formatValueLabel={() => `${formatScore(row.score)} / ${formatScore(row.threshold)}`}
            marks={[
              {
                value: barValue(row.threshold),
                label: `${t('admin.riskControl.riskThresholds')} ${formatScore(row.threshold)}`,
              },
            ]}
          />
        ))}
      </VStack>
    </VStack>
  )
}
