import { PROVIDERS } from '@/constants/channelMonitor'
import type { ChannelMonitor, ExtraModelStatus, ListParams, Provider } from '~/lib/api/admin/channelMonitor'

export type EnabledFilter = '' | 'true' | 'false'

/** What the list of monitors is narrowed to; an empty value narrows nothing. */
export interface MonitorFilters {
  search: string
  provider: Provider | ''
  enabled: EnabledFilter
}

export const emptyMonitorFilters = (): MonitorFilters => ({ search: '', provider: '', enabled: '' })

/** The provider of that name, or none: what a list hands back when a value is picked is any string. */
export function toProvider(value: string): Provider | '' {
  return PROVIDERS.find((provider) => provider === value) ?? ''
}

export function toEnabledFilter(value: string): EnabledFilter {
  return value === 'true' || value === 'false' ? value : ''
}

/** What to ask the server for: the page, and only the filters that are set. */
export function buildMonitorListParams(filters: MonitorFilters, page: number, pageSize: number): ListParams {
  const params: ListParams = { page, page_size: pageSize }
  if (filters.provider) params.provider = filters.provider
  if (filters.enabled) params.enabled = filters.enabled === 'true'
  const search = filters.search.trim()
  if (search) params.search = search
  return params
}

/**
 * The extra models of a monitor with the result of their last check. A model added since the last check has
 * no result yet; it is listed all the same, after the ones that have.
 */
export function extraModelsOf(
  monitor: Pick<ChannelMonitor, 'extra_models' | 'extra_models_status'>,
): ExtraModelStatus[] {
  const checked = monitor.extra_models_status || []
  const seen = new Set(checked.map((entry) => entry.model))
  const unchecked: ExtraModelStatus[] = []
  for (const model of monitor.extra_models || []) {
    if (seen.has(model)) continue
    seen.add(model)
    unchecked.push({ model, status: '', latency_ms: null })
  }
  return [...checked, ...unchecked]
}
