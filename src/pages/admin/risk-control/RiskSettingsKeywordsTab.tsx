import { Banner } from '@astryxdesign/core/Banner'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { useI18n } from '~/i18n'
import { normalizeKeywordBlockingMode } from './riskForm'
import { modeLabel } from './riskModel'
import { BLOCKED_KEYWORD_MAX, parseBlockedKeywords } from './riskPayload'
import type { RiskSettings } from './useRiskSettings'

/**
 * Keywords that block a request by themselves, and how they work with the engine. Keywords only
 * block in the pre-block mode, so the notice on top tells what the draft as a whole comes to.
 */
export function RiskSettingsKeywordsTab({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const { draft } = settings
  const strategy = draft.keyword_blocking_mode

  const notice =
    strategy === 'api_only'
      ? {
          status: 'info' as const,
          title: t('admin.riskControl.keywordModeApiOnlyNotice'),
          description: t('admin.riskControl.keywordModeApiOnlyDesc'),
        }
      : draft.mode !== 'pre_block'
        ? {
            status: 'warning' as const,
            title: t('admin.riskControl.blockedKeywordsModeWarning', { mode: modeLabel(draft.mode, t) }),
            description: t('admin.riskControl.blockedKeywordsDescription'),
          }
        : strategy === 'keyword_only'
          ? {
              status: 'info' as const,
              title: t('admin.riskControl.keywordModeKeywordOnlyNotice'),
              description: t('admin.riskControl.keywordModeKeywordOnlyDesc'),
            }
          : {
              status: 'info' as const,
              title: t('admin.riskControl.blockedKeywordsPreBlockHint'),
              description: t('admin.riskControl.blockedKeywordsDescription'),
            }

  return (
    <VStack gap={4}>
      <Banner status={notice.status} title={notice.title} description={notice.description} />
      <RadioList
        label={t('admin.riskControl.keywordBlockingMode')}
        value={strategy}
        onChange={(mode) => settings.edit({ keyword_blocking_mode: normalizeKeywordBlockingMode(mode) })}
      >
        <RadioListItem
          value="keyword_and_api"
          label={t('admin.riskControl.keywordModeKeywordAndApi')}
          description={t('admin.riskControl.keywordModeKeywordAndApiDesc')}
        />
        <RadioListItem
          value="keyword_only"
          label={t('admin.riskControl.keywordModeKeywordOnly')}
          description={t('admin.riskControl.keywordModeKeywordOnlyDesc')}
        />
        <RadioListItem
          value="api_only"
          label={t('admin.riskControl.keywordModeApiOnly')}
          description={t('admin.riskControl.keywordModeApiOnlyDesc')}
        />
      </RadioList>
      <VStack gap={2}>
        <TextArea
          label={t('admin.riskControl.blockedKeywords')}
          description={t('admin.riskControl.blockedKeywordsLimit', { max: BLOCKED_KEYWORD_MAX })}
          width="100%"
          rows={9}
          value={draft.blocked_keywords_text}
          onChange={(blocked_keywords_text) => settings.edit({ blocked_keywords_text })}
          placeholder={t('admin.riskControl.blockedKeywordsPlaceholder')}
          // The list is kept while the engine alone decides; it only cannot be edited meanwhile.
          isDisabled={strategy === 'api_only'}
          hasSpellCheck={false}
        />
        <Text type="supporting" color="secondary">
          {t('admin.riskControl.blockedKeywordCount', {
            count: parseBlockedKeywords(draft.blocked_keywords_text).length,
          })}
        </Text>
      </VStack>
    </VStack>
  )
}
