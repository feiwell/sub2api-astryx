import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { TimeField } from '../promptAudit/filterFields'
import { LOG_ENDPOINTS, type RiskLogFilters as Filters } from './riskLogs'
import type { RiskControl } from './useRiskControl'
import type { RiskLogs } from './useRiskLogs'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'

type ChoiceFilter = 'result' | 'group_id' | 'endpoint'

/**
 * The filters of the audit records. A choice from a list or a calendar applies at once, as in
 * RiskControlView.vue; the search text waits for Enter or the search button.
 */
export function RiskLogFilters({ list, groups }: { list: RiskLogs; groups: RiskControl['groups'] }) {
  const { t } = useI18n()
  const { draft } = list

  const choiceField = (
    field: ChoiceFilter,
    label: string,
    allLabel: string,
    choices: Array<{ value: string; label: string }>,
    hasSearch = false,
  ) => (
    <Selector
      label={label}
      width="100%"
      hasSearch={hasSearch}
      value={draft[field] || ALL}
      onChange={(value) => list.pick({ [field]: value === ALL ? '' : value } as Partial<Filters>)}
      options={[{ value: ALL, label: allLabel }, ...choices]}
    />
  )

  return (
    <VStack gap={3}>
      <Grid columns={{ minWidth: 190, max: 4 }} gap={3}>
        {choiceField('result', t('admin.riskControl.table.result'), t('admin.riskControl.result.all'), [
          { value: 'hit', label: t('admin.riskControl.result.hit') },
          { value: 'blocked', label: t('admin.riskControl.result.blocked') },
          { value: 'pass', label: t('admin.riskControl.result.pass') },
          { value: 'error', label: t('admin.riskControl.result.error') },
        ])}
        {choiceField(
          'group_id',
          t('admin.riskControl.table.group'),
          t('admin.riskControl.filters.allGroups'),
          groups.map((group) => ({ value: String(group.id), label: `${group.name} (${group.platform})` })),
          true,
        )}
        {choiceField(
          'endpoint',
          t('admin.riskControl.table.endpoint'),
          t('admin.riskControl.filters.allEndpoints'),
          LOG_ENDPOINTS.map((endpoint) => ({ value: endpoint, label: endpoint })),
        )}
        <TextInput
          label={t('common.search')}
          width="100%"
          placeholder={t('admin.riskControl.filters.search')}
          startIcon={MagnifyingGlassIcon}
          value={draft.search}
          onChange={(value) => list.edit({ search: value })}
          onEnter={list.search}
        />
      </Grid>

      {/* Each of the two is a date box and a time box, hence the wider cells. */}
      <Grid columns={{ minWidth: 300, max: 2 }} gap={3}>
        <TimeField
          label={t('admin.riskControl.filters.from')}
          value={draft.from}
          max={draft.to}
          onChange={(value) => value !== draft.from && list.pick({ from: value })}
        />
        <TimeField
          label={t('admin.riskControl.filters.to')}
          value={draft.to}
          min={draft.from}
          onChange={(value) => value !== draft.to && list.pick({ to: value })}
        />
      </Grid>

      <HStack gap={2}>
        <Button
          label={t('common.search')}
          variant="primary"
          icon={<Icon icon={MagnifyingGlassIcon} />}
          isLoading={list.isLoading}
          onClick={list.search}
        />
        <Button label={t('common.reset')} variant="secondary" isDisabled={list.isLoading} onClick={list.reset} />
      </HStack>
    </VStack>
  )
}
