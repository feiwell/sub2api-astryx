import {
  DEFAULT_DEEPSEEK_ENDPOINT,
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_KIMI_ENDPOINT,
  DEFAULT_MINIMAX_ENDPOINT,
  DEFAULT_OPENCODE_GO_ENDPOINT,
  DEFAULT_ZHIPU_ENDPOINT,
  QUOTA_ONLY_PROVIDERS,
} from '@/constants/channelMonitor'
import { QUOTA_ONLY_MODEL } from '~/components/monitor/monitorText'
import type {
  APIMode,
  ChannelMonitor,
  CheckMode,
  CreateParams,
  Provider,
  UpdateParams,
} from '~/lib/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import {
  emptyRequestDraft,
  requestDraftOf,
  requestProblems,
  requestSnapshotOf,
  type BodyProblem,
  type RequestDraft,
} from './monitorRequest'

/** The server checks no more often than this, and no less often than once an hour. */
export const MIN_INTERVAL_SECONDS = 15
export const MAX_INTERVAL_SECONDS = 3600

/** The providers in the order the form offers them. */
export const FORM_PROVIDERS: readonly Provider[] = [
  'anthropic',
  'openai',
  'gemini',
  'grok',
  'antigravity',
  'kimi',
  'zhipu',
  'deepseek',
  'minimax',
  'opencode_go',
]

// What the form fills in for a provider whose address, or model, is nearly always the same.
const DEFAULT_ENDPOINTS: Partial<Record<Provider, string>> = {
  grok: DEFAULT_GROK_ENDPOINT,
  kimi: DEFAULT_KIMI_ENDPOINT,
  zhipu: DEFAULT_ZHIPU_ENDPOINT,
  deepseek: DEFAULT_DEEPSEEK_ENDPOINT,
  minimax: DEFAULT_MINIMAX_ENDPOINT,
  opencode_go: DEFAULT_OPENCODE_GO_ENDPOINT,
}
const DEFAULT_MODELS: Partial<Record<Provider, string>> = { grok: DEFAULT_GROK_MODEL }

/** A monitor while it is filled in. */
export interface MonitorForm {
  name: string
  provider: Provider
  apiMode: APIMode
  checkMode: CheckMode
  /** The account whose quota is read; only a monitor that reads a quota has one. */
  accountId: number | null
  endpoint: string
  /** Empty for a monitor being edited until a new key is typed: the stored key never reaches the browser. */
  apiKey: string
  primaryModel: string
  extraModels: string[]
  groupName: string
  intervalSeconds: number
  jitterSeconds: number
  enabled: boolean
  /** The template the custom request was copied from, if any. */
  templateId: number | null
  request: RequestDraft
}

export interface MonitorFormProblems {
  name?: true
  account?: true
  endpoint?: true
  apiKey?: true
  primaryModel?: true
  /** The first header name that cannot be one. */
  headerName?: string
  body?: BodyProblem
}

/** The kind of request something was stored with; one stored without any sends chat completions. */
export const normalApiMode = (mode: APIMode | null | undefined): APIMode =>
  mode === 'responses' ? 'responses' : 'chat_completions'

/** Whether the monitor reads the quota of an account. */
export const readsQuota = (form: Pick<MonitorForm, 'checkMode'>) => form.checkMode !== 'probe'
/** Whether the monitor sends requests to a model. */
export const probes = (form: Pick<MonitorForm, 'checkMode'>) => form.checkMode !== 'quota'
/** Whether a provider can only have its quota read: the server has no way to probe it. */
export const canOnlyReadQuota = (provider: Provider) => QUOTA_ONLY_PROVIDERS.includes(provider)

/** How often a new monitor checks: what the site sets, when it sets anything. */
export function defaultIntervalSeconds(configured: number | null | undefined): number {
  return configured && configured > 0 ? configured : DEFAULT_INTERVAL_SECONDS
}

/** The most the interval can sway by: a check never comes sooner than the shortest interval. */
export function maxJitterSeconds(intervalSeconds: number): number {
  return Math.max(0, (intervalSeconds || 0) - MIN_INTERVAL_SECONDS)
}

export function newMonitorForm(intervalSeconds: number): MonitorForm {
  return {
    name: '',
    provider: 'anthropic',
    apiMode: 'chat_completions',
    checkMode: 'probe',
    accountId: null,
    endpoint: '',
    apiKey: '',
    primaryModel: '',
    extraModels: [],
    groupName: '',
    intervalSeconds,
    jitterSeconds: 0,
    enabled: true,
    templateId: null,
    request: emptyRequestDraft(),
  }
}

/** A stored monitor laid out for editing. `fallbackInterval` stands in for a monitor saved without one. */
export function monitorFormOf(monitor: ChannelMonitor, fallbackInterval: number): MonitorForm {
  const checkMode = monitor.check_mode || 'probe'
  return {
    name: monitor.name,
    provider: monitor.provider,
    apiMode: normalApiMode(monitor.api_mode),
    checkMode,
    accountId: monitor.account_id ?? null,
    endpoint: monitor.endpoint || '',
    apiKey: '',
    // A monitor that probes nothing has a stand-in stored where its model would be; that is no model to probe.
    primaryModel:
      checkMode === 'quota' && monitor.primary_model === QUOTA_ONLY_MODEL ? '' : monitor.primary_model || '',
    extraModels: [...(monitor.extra_models || [])],
    groupName: monitor.group_name || '',
    intervalSeconds: monitor.interval_seconds || fallbackInterval,
    jitterSeconds: monitor.jitter_seconds || 0,
    enabled: monitor.enabled,
    templateId: monitor.template_id ?? null,
    request: requestDraftOf(monitor),
  }
}

/**
 * The form after another provider is picked. What belonged to the provider left goes: the account, the key
 * typed, the template and the custom request. An address or a model the form itself filled in gives way to
 * that of the new provider; one the user typed stays.
 */
export function withProvider(form: MonitorForm, provider: Provider): MonitorForm {
  if (provider === form.provider) return form
  const left = form.provider

  let checkMode = form.checkMode
  if (canOnlyReadQuota(provider)) checkMode = 'quota'
  // Reading the quota alone was all the provider left could do, not a choice.
  else if (canOnlyReadQuota(left) && checkMode === 'quota') checkMode = 'probe'

  let endpoint = form.endpoint
  let primaryModel = form.primaryModel
  if (endpoint && endpoint === DEFAULT_ENDPOINTS[left]) endpoint = ''
  if (primaryModel && primaryModel === DEFAULT_MODELS[left]) primaryModel = ''
  if (!endpoint.trim()) endpoint = DEFAULT_ENDPOINTS[provider] ?? endpoint
  if (!primaryModel.trim()) primaryModel = DEFAULT_MODELS[provider] ?? primaryModel

  return {
    ...form,
    provider,
    checkMode,
    // Only OpenAI has two kinds of request to choose from.
    apiMode: provider === 'openai' ? form.apiMode : 'chat_completions',
    accountId: null,
    endpoint,
    apiKey: '',
    primaryModel,
    templateId: null,
    request: emptyRequestDraft(),
  }
}

/** The form after another way of checking is picked; one the provider cannot do changes nothing. */
export function withCheckMode(form: MonitorForm, checkMode: CheckMode): MonitorForm {
  if (canOnlyReadQuota(form.provider) && checkMode !== 'quota') return form
  return { ...form, checkMode, accountId: checkMode === 'probe' ? null : form.accountId }
}

/** The form after the other kind of request is picked. A custom request is written for one kind, so it goes. */
export function withApiMode(form: MonitorForm, apiMode: APIMode): MonitorForm {
  if (apiMode === form.apiMode) return form
  if (form.provider !== 'openai') return { ...form, apiMode }
  return { ...form, apiMode, templateId: null, request: emptyRequestDraft() }
}

/** The form with a template's request copied in. The copy is the monitor's own from then on. */
export function withTemplate(form: MonitorForm, template: ChannelMonitorTemplate): MonitorForm {
  return {
    ...form,
    apiMode: form.provider === 'openai' ? normalApiMode(template.api_mode) : form.apiMode,
    templateId: template.id,
    request: requestDraftOf(template),
  }
}

/** The form after its interval is set: the sway is held to what the new interval leaves room for. */
export function withInterval(form: MonitorForm, intervalSeconds: number): MonitorForm {
  return {
    ...form,
    intervalSeconds,
    jitterSeconds: Math.min(form.jitterSeconds, maxJitterSeconds(intervalSeconds)),
  }
}

/**
 * The form with the models an entry names added to its other models. One entry can name several, such as a
 * pasted list; a model already listed is not listed twice.
 */
export function withExtraModels(form: MonitorForm, entry: string): MonitorForm {
  const extraModels = [...form.extraModels]
  for (const model of entry.split(/[,;\s]+/)) {
    if (model && !extraModels.includes(model)) extraModels.push(model)
  }
  return extraModels.length > form.extraModels.length ? { ...form, extraModels } : form
}

/** The templates the form can take: those of its provider, and for OpenAI of its kind of request. */
export function templatesFor(
  templates: ChannelMonitorTemplate[],
  form: Pick<MonitorForm, 'provider' | 'apiMode'>,
): ChannelMonitorTemplate[] {
  return templates.filter(
    (template) =>
      template.provider === form.provider &&
      (form.provider !== 'openai' || normalApiMode(template.api_mode) === form.apiMode),
  )
}

/** What stands in the way of saving. A key is only asked of a new monitor: an edited one keeps its own. */
export function monitorFormProblems(form: MonitorForm, isEditing: boolean): MonitorFormProblems {
  const problems: MonitorFormProblems = {}
  if (!form.name.trim()) problems.name = true
  if (readsQuota(form) && form.accountId == null) problems.account = true
  if (probes(form)) {
    if (!form.endpoint.trim()) problems.endpoint = true
    if (!isEditing && !form.apiKey.trim()) problems.apiKey = true
    if (!form.primaryModel.trim()) problems.primaryModel = true
    Object.assign(problems, requestProblems(form.request))
  }
  return problems
}

/** What is sent to create the monitor. What only a probing monitor has is left empty for one that does not probe. */
export function createMonitorRequest(form: MonitorForm): CreateParams {
  const probing = probes(form)
  return {
    name: form.name.trim(),
    provider: form.provider,
    api_mode: form.provider === 'openai' ? form.apiMode : 'chat_completions',
    check_mode: form.checkMode,
    account_id: readsQuota(form) ? form.accountId : null,
    endpoint: probing ? form.endpoint.trim() : '',
    api_key: probing ? form.apiKey.trim() : '',
    primary_model: probing ? form.primaryModel.trim() : QUOTA_ONLY_MODEL,
    extra_models: probing ? form.extraModels : [],
    group_name: form.groupName.trim(),
    enabled: form.enabled,
    interval_seconds: form.intervalSeconds,
    jitter_seconds: form.jitterSeconds || 0,
    template_id: probing ? form.templateId : null,
    ...requestSnapshotOf(form.request),
  }
}

/**
 * What is sent to save an edited monitor. The server reads "nothing" as "leave as it is", so what must be
 * emptied is said in its own way: no template by a flag, no account by a zero.
 */
export function updateMonitorRequest(form: MonitorForm): UpdateParams {
  const { api_key, ...rest } = createMonitorRequest(form)
  const request: UpdateParams = rest
  // No key typed: the stored one stays.
  if (api_key) request.api_key = api_key
  if (probes(form) && form.templateId == null) {
    request.clear_template = true
    delete request.template_id
  }
  if (!readsQuota(form)) request.account_id = 0
  return request
}
