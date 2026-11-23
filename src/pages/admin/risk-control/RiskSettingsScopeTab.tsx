import { Badge } from '@astryxdesign/core/Badge'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { ModelWhitelistField } from '../accounts/ModelWhitelistField'
import { modelFilterSummary } from './riskModel'
import { SettingsSection } from './RiskSettingsParts'
import type { RiskControl } from './useRiskControl'
import type { RiskSettings } from './useRiskSettings'

/** Which requests the audit looks at: by the group a request comes through, and by the model it asks for. */
export function RiskSettingsScopeTab({ settings, control }: { settings: RiskSettings; control: RiskControl }) {
  const { t } = useI18n()
  const { draft } = settings

  // Ids the draft names that the list does not have. They stay selected, and can be taken out.
  const unlisted = draft.group_ids.filter((id) => !control.groups.some((group) => group.id === id))
  const groupOptions = [
    // Kept as options so they can be unticked.
    ...unlisted.map((id) => ({ value: String(id), label: `#${id}` })),
    ...control.groups.map((group) => ({
      value: String(group.id),
      // The search goes by the label: the platform is in it so groups can be found by platform too.
      label: `${group.name} · ${group.platform}`,
    })),
  ]

  return (
    <VStack gap={4}>
      <SettingsSection
        title={t('admin.riskControl.groupScope')}
        hint={draft.all_groups ? t('admin.riskControl.allGroupsHint') : t('admin.riskControl.selectedGroupsHint')}
        actions={
          // Going back to "all groups" keeps the ticked ones in the draft: a save sends none of them then.
          <SegmentedControl
            label={t('admin.riskControl.groupScope')}
            value={draft.all_groups ? 'all' : 'selected'}
            onChange={(value) => settings.edit({ all_groups: value === 'all' })}
          >
            <SegmentedControlItem value="all" label={t('admin.riskControl.allGroups')} />
            <SegmentedControlItem value="selected" label={t('admin.riskControl.selectedGroups')} />
          </SegmentedControl>
        }
      >
        {!draft.all_groups && (
          // The label would repeat the choice made right above it.
          <MultiSelector
            label={t('admin.riskControl.selectedGroups')}
            isLabelHidden
            width="100%"
            options={groupOptions}
            value={draft.group_ids.map(String)}
            onChange={(values) => settings.edit({ group_ids: values.map(Number).sort((a, b) => a - b) })}
            triggerDisplay="badges"
            hasSearch
            searchPlaceholder={t('admin.riskControl.searchGroups')}
            emptyText={t('admin.riskControl.noGroups')}
            emptySearchText={t('admin.riskControl.noGroups')}
          />
        )}
      </SettingsSection>

      <SettingsSection
        title={t('admin.riskControl.modelFilter')}
        hint={t('admin.riskControl.modelFilterHint')}
        actions={
          <Badge label={modelFilterSummary({ type: draft.model_filter_type, models: draft.model_filter_models }, t)} />
        }
      >
        <RadioList
          label={t('admin.riskControl.modelFilter')}
          isLabelHidden
          value={draft.model_filter_type}
          onChange={settings.setModelFilterType}
        >
          <RadioListItem
            value="all"
            label={t('admin.riskControl.modelFilterAll')}
            description={t('admin.riskControl.modelFilterAllDesc')}
          />
          <RadioListItem
            value="include"
            label={t('admin.riskControl.modelFilterInclude')}
            description={t('admin.riskControl.modelFilterIncludeDesc')}
          />
          <RadioListItem
            value="exclude"
            label={t('admin.riskControl.modelFilterExclude')}
            description={t('admin.riskControl.modelFilterExcludeDesc')}
          />
        </RadioList>
        {draft.model_filter_type !== 'all' && (
          <VStack gap={2}>
            <Text type="label">{t('admin.riskControl.modelFilterModels')}</Text>
            <ModelWhitelistField
              value={draft.model_filter_models}
              onChange={(models) => settings.edit({ model_filter_models: models })}
              modelMappings={[]}
              platforms={[]}
            />
          </VStack>
        )}
      </SettingsSection>
    </VStack>
  )
}
