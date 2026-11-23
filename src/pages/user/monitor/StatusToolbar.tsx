import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { MonitorFilter, MonitorMatrixGroupBy, MonitorRange } from '@/api/channelMonitorV2'
import type { HealthDisplayMode } from '@/features/channel-monitor-v2/monitorFormat'
import { useI18n } from '~/i18n'
import type { FilterOption } from './statusOptions'
import { GROUP_BYS, HEALTH_MODES, RANGES, hasDimensionFilter, type StatusView, type TrendView } from './statusQuery'

const GROUP_BY_KEYS: Record<MonitorMatrixGroupBy, string> = {
  platform: 'channelMonitorV2.groupBy.platform',
  platform_group: 'channelMonitorV2.groupBy.platformGroup',
  platform_model: 'channelMonitorV2.groupBy.platformModel',
  platform_group_model: 'channelMonitorV2.groupBy.platformGroupModel',
}

/** The controls of the page: which traffic is counted (first row) and how the trend is drawn (second row). */
export function StatusToolbar({
  view,
  platforms,
  groups,
  models,
  onFilterChange,
  onViewChange,
}: {
  view: StatusView
  platforms: FilterOption[]
  groups: FilterOption[]
  models: FilterOption[]
  onFilterChange: (patch: Partial<MonitorFilter>) => void
  onViewChange: (patch: Partial<Omit<StatusView, 'filter'>>) => void
}) {
  const { t } = useI18n()
  const { filter } = view

  return (
    <Card padding={4}>
      <VStack gap={3} hAlign="stretch">
        <HStack gap={3} vAlign="end" wrap="wrap">
          <SegmentedControl
            label={t('channelMonitorV2.timeRange')}
            size="sm"
            value={filter.range}
            onChange={(value) => onFilterChange({ range: value as MonitorRange })}
          >
            {RANGES.map((range) => (
              <SegmentedControlItem key={range} value={range} label={t(`channelMonitorV2.ranges.${range}`)} />
            ))}
          </SegmentedControl>
          <MultiSelector
            label={t('channelMonitorV2.filters.platform')}
            size="sm"
            triggerDisplay="labels"
            placeholder={t('channelMonitorV2.filters.allPlatforms')}
            emptyText={t('common.noData')}
            options={platforms}
            value={filter.platforms}
            onChange={(value) => onFilterChange({ platforms: value })}
            width={180}
          />
          <MultiSelector
            label={t('channelMonitorV2.filters.group')}
            size="sm"
            hasSearch
            triggerDisplay="labels"
            placeholder={t('channelMonitorV2.filters.allGroups')}
            searchPlaceholder={t('common.searchPlaceholder')}
            emptyText={t('common.noData')}
            emptySearchText={t('common.noOptionsFound')}
            options={groups}
            value={filter.groupIds.map(String)}
            onChange={(value) =>
              onFilterChange({ groupIds: value.map(Number).filter((id) => Number.isInteger(id) && id > 0) })
            }
            width={200}
          />
          <MultiSelector
            label={t('channelMonitorV2.filters.model')}
            size="sm"
            hasSearch
            triggerDisplay="labels"
            placeholder={t('channelMonitorV2.filters.allModels')}
            searchPlaceholder={t('common.searchPlaceholder')}
            emptyText={t('common.noData')}
            emptySearchText={t('common.noOptionsFound')}
            options={models}
            value={filter.models}
            onChange={(value) => onFilterChange({ models: value })}
            width={220}
          />
          <Button
            size="sm"
            variant="ghost"
            label={t('channelMonitorV2.clearFilters')}
            isDisabled={!hasDimensionFilter(filter)}
            onClick={() => onFilterChange({ platforms: [], groupIds: [], models: [] })}
          />
        </HStack>

        <HStack gap={3} vAlign="end" wrap="wrap">
          <Selector
            label={t('channelMonitorV2.groupBy.label')}
            size="sm"
            options={GROUP_BYS.map((value) => ({ value, label: t(GROUP_BY_KEYS[value]) }))}
            value={view.groupBy}
            onChange={(value) => onViewChange({ groupBy: value as MonitorMatrixGroupBy })}
            width={180}
          />
          <SegmentedControl
            label={t('channelMonitorV2.trendView.label')}
            size="sm"
            value={view.trendView}
            onChange={(value) => onViewChange({ trendView: value as TrendView })}
          >
            <SegmentedControlItem value="pulse" label={t('channelMonitorV2.trendView.pulse')} />
            <SegmentedControlItem value="line" label={t('channelMonitorV2.trendView.line')} />
          </SegmentedControl>
          {view.trendView === 'pulse' && (
            <SegmentedControl
              label={t('channelMonitorV2.healthMode.label')}
              size="sm"
              value={view.healthMode}
              onChange={(value) => onViewChange({ healthMode: value as HealthDisplayMode })}
            >
              {HEALTH_MODES.map((mode) => (
                <SegmentedControlItem key={mode} value={mode} label={t(`channelMonitorV2.healthMode.${mode}`)} />
              ))}
            </SegmentedControl>
          )}
        </HStack>
      </VStack>
    </Card>
  )
}
