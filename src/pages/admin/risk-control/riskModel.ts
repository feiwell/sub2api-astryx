import type {
  ContentModerationAPIKeyStatus,
  ContentModerationModelFilter,
  ContentModerationModelFilterType,
  ModerationEngine,
  ModerationMode,
} from '~/lib/api/admin/riskControl'

export type APIKeyStatusValue = ContentModerationAPIKeyStatus['status']

/** How often the running state is asked for again while the page is open. */
export const STATUS_REFRESH_MS = 15_000

/** Brand names, the same in every language. A config saved before engines existed runs OpenAI. */
export const engineLabel = (engine: ModerationEngine | undefined): string =>
  engine === 'typesafe' ? 'TypeSafe AI' : 'OpenAI'

/** The name of a mode; a mode this page does not know is shown as the server spells it. */
export function modeLabel(mode: ModerationMode | (string & {}), t: (key: string) => string): string {
  switch (mode) {
    case 'pre_block':
      return t('admin.riskControl.modePreBlock')
    case 'observe':
      return t('admin.riskControl.modeObserve')
    case 'off':
      return t('admin.riskControl.modeOff')
    default:
      return mode
  }
}

export const normalizeModelFilterType = (value: unknown): ContentModerationModelFilterType =>
  value === 'include' || value === 'exclude' || value === 'all' ? value : 'all'

/** Model names trimmed, without blanks, each once whatever its letter case; the first spelling is kept. */
export function normalizeModelNames(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of models) {
    const name = String(item ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/** The model filter as the page works with it. "All models" carries no list; a missing filter is "all". */
export function normalizeModelFilter(value: unknown): ContentModerationModelFilter {
  if (!value || typeof value !== 'object') return { type: 'all', models: [] }
  const raw = value as Partial<ContentModerationModelFilter>
  const type = normalizeModelFilterType(raw.type)
  return { type, models: type === 'all' ? [] : normalizeModelNames(raw.models) }
}

/** One line telling which models a filter lets the audit see. */
export function modelFilterSummary(
  filter: ContentModerationModelFilter,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (filter.type === 'include') return t('admin.riskControl.modelFilterIncludeSummary', { count: filter.models.length })
  if (filter.type === 'exclude') return t('admin.riskControl.modelFilterExcludeSummary', { count: filter.models.length })
  return t('admin.riskControl.modelFilterAllSummary')
}

/** The order key states are told in: usable first, then the ones that need attention. */
export const API_KEY_STATUS_ORDER: readonly APIKeyStatusValue[] = ['ok', 'frozen', 'error', 'unknown']

/** The i18n key naming a key state. A state this page does not know reads as "not tested". */
export function apiKeyStatusLabelKey(status: APIKeyStatusValue | (string & {})): string {
  switch (status) {
    case 'ok':
      return 'admin.riskControl.apiKeyStatusOk'
    case 'error':
      return 'admin.riskControl.apiKeyStatusError'
    case 'frozen':
      return 'admin.riskControl.apiKeyStatusFrozen'
    default:
      return 'admin.riskControl.apiKeyStatusUnknown'
  }
}

/**
 * The colour of a key state's label. A frozen key is out of rotation, so it is the red one; a key
 * whose last call failed is still tried, so it only warns.
 */
export const apiKeyStatusColor = (status: string): 'green' | 'orange' | 'red' | 'gray' =>
  status === 'ok' ? 'green' : status === 'error' ? 'orange' : status === 'frozen' ? 'red' : 'gray'
