import { useState } from 'react'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { keysAPI } from '@/api'
import type { ApiKey, Group } from '@/types'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useGroupOptions } from './groupOptions'

/**
 * Inline, searchable group picker for one API key row (port of the KeysView.vue
 * group dropdown): choosing a group reassigns the key immediately.
 */
export function KeyGroupSelector({
  apiKey,
  groups,
  userGroupRates,
  onChanged,
}: {
  apiKey: ApiKey
  groups: Group[]
  userGroupRates: Record<number, number>
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const { options, peakWindow, renderOption, renderValue } = useGroupOptions(groups, userGroupRates, apiKey.group)
  const peak = apiKey.group ? peakWindow(apiKey.group) : ''

  const handleChange = async (value: string) => {
    const newGroupId = Number(value)
    if (!newGroupId || apiKey.group_id === newGroupId) return
    setSaving(true)
    try {
      await keysAPI.update(apiKey.id, { group_id: newGroupId })
      toast.success(t('keys.groupChangedSuccess'))
      onChanged()
    } catch {
      toast.error(t('keys.failedToChangeGroup'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <VStack gap={0.5} hAlign="stretch">
      <Selector
        label={t('keys.clickToChangeGroup')}
        isLabelHidden
        variant="ghost"
        size="sm"
        width="100%"
        hasSearch
        searchPlaceholder={t('keys.searchGroup')}
        emptyText={t('common.noGroupsAvailable')}
        emptySearchText={t('keys.noGroupFound')}
        placeholder={t('keys.noGroup')}
        options={options}
        value={apiKey.group_id ? String(apiKey.group_id) : ''}
        onChange={(value) => void handleChange(value)}
        isLoading={saving}
        renderOption={renderOption}
        renderValue={renderValue}
      />
      {peak && (
        <HStack paddingInlineStart={3}>
          <Text type="supporting">{t('common.peakRateTooltip', { window: peak })}</Text>
        </HStack>
      )}
    </VStack>
  )
}
