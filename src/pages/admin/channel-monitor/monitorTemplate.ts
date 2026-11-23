import type { APIMode, BodyOverrideMode, Provider } from '~/lib/api/admin/channelMonitor'
import type {
  AssociatedMonitorBrief,
  ChannelMonitorTemplate,
  CreateParams,
  UpdateParams,
} from '~/lib/api/admin/channelMonitorTemplate'
import { FORM_PROVIDERS, normalApiMode } from './monitorForm'
import {
  emptyRequestDraft,
  requestDraftOf,
  requestProblems,
  requestSnapshotOf,
  type RequestDraft,
  type RequestProblems,
} from './monitorRequest'

/** A request template while it is filled in. */
export interface TemplateForm {
  name: string
  provider: Provider
  apiMode: APIMode
  description: string
  request: RequestDraft
}

export interface TemplateFormProblems extends RequestProblems {
  name?: true
}

// Only OpenAI has two kinds of request to choose from; every other provider is sent chat completions.
const apiModeFor = (provider: Provider, apiMode: APIMode | null | undefined): APIMode =>
  provider === 'openai' ? normalApiMode(apiMode) : 'chat_completions'

export function newTemplateForm(provider: Provider): TemplateForm {
  return { name: '', provider, apiMode: 'chat_completions', description: '', request: emptyRequestDraft() }
}

/** A stored template laid out for editing. */
export function templateFormOf(template: ChannelMonitorTemplate): TemplateForm {
  return {
    name: template.name,
    provider: template.provider,
    apiMode: apiModeFor(template.provider, template.api_mode),
    description: template.description || '',
    request: requestDraftOf(template),
  }
}

/** The form after another provider is picked. What was typed stays: a template is not tied to an account. */
export function withTemplateProvider(form: TemplateForm, provider: Provider): TemplateForm {
  if (provider === form.provider) return form
  return { ...form, provider, apiMode: apiModeFor(provider, form.apiMode) }
}

/** What stands in the way of saving. */
export function templateFormProblems(form: TemplateForm): TemplateFormProblems {
  const problems: TemplateFormProblems = requestProblems(form.request)
  if (!form.name.trim()) problems.name = true
  return problems
}

const editableRequest = (form: TemplateForm) => ({
  name: form.name.trim(),
  api_mode: apiModeFor(form.provider, form.apiMode),
  description: form.description.trim(),
  ...requestSnapshotOf(form.request),
})

/** What is sent to create the template. */
export function createTemplateRequest(form: TemplateForm): CreateParams {
  return { ...editableRequest(form), provider: form.provider }
}

/** What is sent to save an edited template: all of it but its provider, which a template keeps. */
export function updateTemplateRequest(form: TemplateForm): UpdateParams {
  return editableRequest(form)
}

/** What a template does to the body of a request; one stored without a word for it leaves the body alone. */
export function templateBodyMode(template: Pick<ChannelMonitorTemplate, 'body_override_mode'>): BodyOverrideMode {
  return template.body_override_mode || 'off'
}

/** How many headers a template sends on top of the usual ones. */
export function templateHeaderCount(template: Pick<ChannelMonitorTemplate, 'extra_headers'>): number {
  return Object.keys(template.extra_headers || {}).length
}

/**
 * The providers templates are listed under: those a template can be created for, then any other a stored
 * template has, so that no template is out of reach.
 */
export function templateProviders(templates: ChannelMonitorTemplate[]): string[] {
  const providers: string[] = [...FORM_PROVIDERS]
  for (const template of templates) {
    if (!providers.includes(template.provider)) providers.push(template.provider)
  }
  return providers
}

/** The templates of one provider, in the order the server lists them. */
export function templatesOf(templates: ChannelMonitorTemplate[], provider: string): ChannelMonitorTemplate[] {
  return templates.filter((template) => template.provider === provider)
}

/** The provider a new template starts with: the one being looked at, when a template can be created for it. */
export function providerForNewTemplate(listed: string): Provider {
  return FORM_PROVIDERS.find((provider) => provider === listed) ?? FORM_PROVIDERS[0]
}

/** The monitors picked, as the ids to send: those still among the monitors of the template. */
export function pickedMonitorIds(monitors: AssociatedMonitorBrief[], picked: readonly string[]): number[] {
  return monitors.filter((monitor) => picked.includes(String(monitor.id))).map((monitor) => monitor.id)
}
