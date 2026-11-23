import type { MonitorDimensions, MonitorFilter } from '@/api/channelMonitorV2'

export interface FilterOption {
  value: string
  label: string
}

/** One option for each value; a value the server lists twice keeps its first label. */
function unique(options: FilterOption[]): FilterOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

/** Whether an entry belongs under the chosen platforms. One without a platform belongs under all of them. */
function isOffered(platform: string | undefined, platforms: readonly string[]): boolean {
  return platforms.length === 0 || !platform || platforms.includes(platform)
}

/** Every platform with traffic in the range. Choosing platforms never shortens this list. */
export function platformOptions(dimensions: MonitorDimensions): FilterOption[] {
  return unique((dimensions.platforms || []).map((item) => ({ value: item.value, label: item.label })))
}

/** The groups of the chosen platforms, or of all platforms when none is chosen. */
export function groupOptions(dimensions: MonitorDimensions, platforms: readonly string[]): FilterOption[] {
  return unique(
    (dimensions.groups || [])
      .filter((item) => isOffered(item.platform, platforms))
      .map((item) => {
        const name = item.name || `#${item.id}`
        return { value: String(item.id), label: item.platform ? `${item.platform} / ${name}` : name }
      }),
  )
}

/** The models of the chosen platforms, or of all platforms when none is chosen. */
export function modelOptions(dimensions: MonitorDimensions, platforms: readonly string[]): FilterOption[] {
  return unique(
    (dimensions.models || [])
      .filter((item) => isOffered(item.platform, platforms))
      .map((item) => ({
        value: item.value,
        label: item.platform && !item.label.includes(item.platform) ? `${item.platform} / ${item.label}` : item.label,
      })),
  )
}

/**
 * Drops the chosen groups and models that the chosen platforms no longer offer. An empty list of options is
 * one that has not loaded yet, so nothing is dropped on its account. Returns the filter itself when nothing
 * was dropped.
 */
export function pruneFilter(filter: MonitorFilter, groups: FilterOption[], models: FilterOption[]): MonitorFilter {
  let next = filter
  if (groups.length > 0) {
    const offered = new Set(groups.map((option) => option.value))
    const groupIds = filter.groupIds.filter((id) => offered.has(String(id)))
    if (groupIds.length !== filter.groupIds.length) next = { ...next, groupIds }
  }
  if (models.length > 0) {
    const offered = new Set(models.map((option) => option.value))
    const kept = filter.models.filter((model) => offered.has(model))
    if (kept.length !== filter.models.length) next = { ...next, models: kept }
  }
  return next
}
