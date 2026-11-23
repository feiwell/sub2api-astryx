import type { MonitorFilter, MonitorMatrixGroupBy, MonitorRange } from '@/api/channelMonitorV2'
import type { HealthDisplayMode } from '@/features/channel-monitor-v2/monitorFormat'

export type StatusTab = 'models' | 'errors' | 'users'
export type TrendView = 'pulse' | 'line'

/** What the page shows, all of it kept in the address so a view can be shared or reloaded. */
export interface StatusView {
  filter: MonitorFilter
  tab: StatusTab
  groupBy: MonitorMatrixGroupBy
  healthMode: HealthDisplayMode
  trendView: TrendView
}

export const RANGES: readonly MonitorRange[] = ['90m', '24h', '7d', '30d']
export const GROUP_BYS: readonly MonitorMatrixGroupBy[] = [
  'platform',
  'platform_group',
  'platform_model',
  'platform_group_model',
]
export const HEALTH_MODES: readonly HealthDisplayMode[] = ['overall', 'success', 'ttft', 'cache']

const TABS: readonly StatusTab[] = ['models', 'errors', 'users']

function list(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** The tab to show: a viewer who may not see the user ranking gets the models instead. */
export function allowedTab(tab: StatusTab, canSeeUsers: boolean): StatusTab {
  return tab === 'users' && !canSeeUsers ? 'models' : tab
}

/** Reads a view out of the address. Anything missing or not understood falls back to the default. */
export function parseStatusQuery(params: URLSearchParams, canSeeUsers: boolean): StatusView {
  return {
    filter: {
      range: oneOf(RANGES, params.get('range'), '90m'),
      platforms: list(params.get('platform')),
      groupIds: list(params.get('group'))
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
      models: list(params.get('model')),
    },
    tab: allowedTab(oneOf(TABS, params.get('tab'), 'models'), canSeeUsers),
    groupBy: oneOf(GROUP_BYS, params.get('group_by'), 'platform_group'),
    healthMode: oneOf(HEALTH_MODES, params.get('health_mode'), 'overall'),
    trendView: params.get('trend_view') === 'line' ? 'line' : 'pulse',
  }
}

/** The address parameters of a view. Empty filters and the default trend view are left out. */
export function statusQueryParams(view: StatusView): Record<string, string> {
  const { filter } = view
  const query: Record<string, string> = { range: filter.range }
  if (filter.platforms.length) query.platform = filter.platforms.join(',')
  if (filter.groupIds.length) query.group = filter.groupIds.join(',')
  if (filter.models.length) query.model = filter.models.join(',')
  query.group_by = view.groupBy
  query.health_mode = view.healthMode
  if (view.trendView === 'line') query.trend_view = 'line'
  query.tab = view.tab
  return query
}

export function hasDimensionFilter(filter: MonitorFilter): boolean {
  return filter.platforms.length + filter.groupIds.length + filter.models.length > 0
}
