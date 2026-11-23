/**
 * Form model, platform/type capability checks and request payload for the
 * bulk account editor (port of the script half of BulkEditAccountModal.vue).
 * Kept free of React so the payload rules stay identical to the Vue modal.
 */
import type {
  AccountPlatform,
  AccountType,
  OpenAICompactMode,
  OpenAIEndpointCapability,
  OpenAIResponsesMode,
} from '@/types'
import { buildModelMappingObject } from '@/composables/useModelWhitelist'
import {
  buildHeaderOverridesObject,
  isHeaderOverrideCapable,
  HEADER_OVERRIDE_ENABLED_CREDENTIAL_KEY,
  HEADER_OVERRIDES_CREDENTIAL_KEY,
} from '@/components/account/credentialsBuilder'
import {
  OPENAI_IMAGE_SIZE_TIERS,
  OPENAI_IMAGE_SIZE_TIERS_EXTRA_KEY,
  openAIImageSizeTiersPayload,
  type OpenAIImageSizeTier,
} from '@/components/account/openaiImageSizeTiers'
import { OPENAI_WS_MODE_OFF, isOpenAIWSModeEnabled, type OpenAIWSMode } from '@/utils/openaiWsMode'

/** Which accounts a bulk edit applies to: an explicit id list or the current list filters. */
export type BulkEditTarget =
  | {
      mode: 'selected'
      accountIds: number[]
      selectedPlatforms: AccountPlatform[]
      selectedTypes: AccountType[]
    }
  | {
      mode: 'filtered'
      filters: Record<string, unknown>
      previewCount: number
      selectedPlatforms: AccountPlatform[]
      selectedTypes: AccountType[]
    }

// Editable rows carry a stable key so inputs keep focus while rows are added or removed
export interface KeyedModelMapping {
  key: number
  from: string
  to: string
}

export interface KeyedHeaderRow {
  key: number
  name: string
  value: string
}

let rowKeySeed = 0
export const nextRowKey = () => ++rowKeySeed

export type CodexFingerprintMode = 'off' | 'device' | 'session' | 'full'
export type RpmStrategy = 'tiered' | 'sticky_exempt'

/** Per-field "apply this field" switches; only enabled fields are sent. */
export const BULK_FIELD_KEYS = [
  'baseUrl',
  'modelRestriction',
  'customErrorCodes',
  'interceptWarmup',
  'headerOverride',
  'proxy',
  'concurrency',
  'loadFactor',
  'priority',
  'rateMultiplier',
  'status',
  'groups',
  'openaiPassthrough',
  'openaiFlattenNamespaces',
  'openaiLongContextBilling',
  'openaiImageSizeTiers',
  'openaiEndpointCapabilities',
  'openaiResponsesMode',
  'openaiWSMode',
  'openaiAPIKeyWSMode',
  'upstreamBillingAutoProbe',
  'codexCLIOnly',
  'codexCLIOnlyAppServer',
  'codexFingerprintMode',
  'openaiCompactMode',
  'openaiCompactModelMapping',
  'rpmLimit',
] as const

export type BulkFieldKey = (typeof BULK_FIELD_KEYS)[number]
export type BulkEnabledFields = Record<BulkFieldKey, boolean>

export const createEnabledFields = (): BulkEnabledFields =>
  Object.fromEntries(BULK_FIELD_KEYS.map((key) => [key, false])) as BulkEnabledFields

export interface BulkEditForm {
  baseUrl: string
  modelRestrictionMode: 'whitelist' | 'mapping'
  allowedModels: string[]
  modelMappings: KeyedModelMapping[]
  selectedErrorCodes: number[]
  customErrorCodeInput: string
  interceptWarmupRequests: boolean
  headerOverrideEnabled: boolean
  headerOverrideRows: KeyedHeaderRow[]
  proxyId: number | null
  concurrency: number
  loadFactor: number | null
  priority: number
  rateMultiplier: number
  status: 'active' | 'inactive'
  groupIds: number[]
  openaiPassthroughEnabled: boolean
  // Codex namespace tool flattening (OAuth only); off keeps tools as sent
  openaiFlattenNamespacesEnabled: boolean
  openAILongContextBillingEnabled: boolean
  openAIImageSizeTiers: OpenAIImageSizeTier[]
  openAIEndpointCapabilities: OpenAIEndpointCapability[]
  openAIResponsesMode: OpenAIResponsesMode
  openaiOAuthWSMode: OpenAIWSMode
  openaiAPIKeyWSMode: OpenAIWSMode
  upstreamBillingAutoProbeMode: 'enabled' | 'disabled'
  codexCLIOnlyEnabled: boolean
  codexCLIOnlyAppServerEnabled: boolean
  codexFingerprintMode: CodexFingerprintMode
  openAICompactMode: OpenAICompactMode
  openAICompactModelMappings: KeyedModelMapping[]
  rpmLimitEnabled: boolean
  baseRpm: number | null
  rpmStrategy: RpmStrategy
  rpmStickyBuffer: number | null
  // null = leave untouched; '' clears the account-level override
  userMsgQueueMode: string | null
}

export const createBulkEditForm = (): BulkEditForm => ({
  baseUrl: '',
  modelRestrictionMode: 'whitelist',
  allowedModels: [],
  modelMappings: [],
  selectedErrorCodes: [],
  customErrorCodeInput: '',
  interceptWarmupRequests: false,
  headerOverrideEnabled: false,
  headerOverrideRows: [],
  proxyId: null,
  concurrency: 1,
  loadFactor: null,
  priority: 1,
  rateMultiplier: 1,
  status: 'active',
  groupIds: [],
  openaiPassthroughEnabled: false,
  openaiFlattenNamespacesEnabled: false,
  openAILongContextBillingEnabled: false,
  openAIImageSizeTiers: [...OPENAI_IMAGE_SIZE_TIERS],
  openAIEndpointCapabilities: ['chat_completions', 'embeddings'],
  openAIResponsesMode: 'auto',
  openaiOAuthWSMode: OPENAI_WS_MODE_OFF,
  openaiAPIKeyWSMode: OPENAI_WS_MODE_OFF,
  upstreamBillingAutoProbeMode: 'enabled',
  codexCLIOnlyEnabled: false,
  codexCLIOnlyAppServerEnabled: false,
  codexFingerprintMode: 'off',
  openAICompactMode: 'auto',
  openAICompactModelMappings: [],
  rpmLimitEnabled: false,
  baseRpm: null,
  rpmStrategy: 'tiered',
  rpmStickyBuffer: null,
  userMsgQueueMode: null,
})

/** Which platform/type-specific sections apply to the current targets. */
export interface BulkEditCapabilities {
  allTargetsGrok: boolean
  isMixedPlatform: boolean
  allOpenAIPassthroughCapable: boolean
  allOpenAIOAuth: boolean
  allOpenAIOAuthOnly: boolean
  allOpenAIAPIKey: boolean
  allBillingProbeCapable: boolean
  allHeaderOverrideCapable: boolean
  allAnthropicOAuthOrSetupToken: boolean
}

export function resolveBulkEditCapabilities(platforms: string[], types: string[]): BulkEditCapabilities {
  const singleOpenAI = platforms.length === 1 && platforms[0] === 'openai' && types.length > 0
  return {
    // Grok endpoint presets only when every target is a grok account
    allTargetsGrok: platforms.length > 0 && platforms.every((p) => p === 'grok'),
    isMixedPlatform: platforms.length > 1,
    allOpenAIPassthroughCapable:
      singleOpenAI && types.every((ty) => ty === 'oauth' || ty === 'setup-token' || ty === 'apikey'),
    allOpenAIOAuth: singleOpenAI && types.every((ty) => ty === 'oauth' || ty === 'setup-token'),
    // Strict OAuth (no setup-token): namespace flattening only affects OAuth accounts
    allOpenAIOAuthOnly: singleOpenAI && types.every((ty) => ty === 'oauth'),
    allOpenAIAPIKey: singleOpenAI && types.every((ty) => ty === 'apikey'),
    // Upstream rate auto-probe works on any API-key platform
    allBillingProbeCapable: types.length > 0 && types.every((ty) => ty === 'apikey'),
    // Every platform x type combination must be eligible (conservative, never admits an ineligible account)
    allHeaderOverrideCapable:
      platforms.length > 0 &&
      types.length > 0 &&
      platforms.every((p) => types.every((ty) => isHeaderOverrideCapable(p, ty))),
    allAnthropicOAuthOrSetupToken:
      platforms.length === 1 &&
      platforms[0] === 'anthropic' &&
      types.every((ty) => ty === 'oauth' || ty === 'setup-token'),
  }
}

export const isOpenAITextGenerationEnabled = (form: BulkEditForm) =>
  form.openAIEndpointCapabilities.includes('chat_completions')

export const isOpenAIResponsesModeApplicable = (form: BulkEditForm, enabled: BulkEnabledFields) =>
  !enabled.openaiEndpointCapabilities || isOpenAITextGenerationEnabled(form)

export const isOpenAIModelRestrictionDisabled = (
  form: BulkEditForm,
  enabled: BulkEnabledFields,
  caps: BulkEditCapabilities,
) => caps.allOpenAIPassthroughCapable && enabled.openaiPassthrough && form.openaiPassthroughEnabled

export function normalizeOpenAIEndpointCapabilities(values: OpenAIEndpointCapability[]): OpenAIEndpointCapability[] {
  const allowed: OpenAIEndpointCapability[] = ['chat_completions', 'embeddings', 'seedance']
  const selected = allowed.filter((value) => values.includes(value))
  return selected.length > 0 ? selected : ['chat_completions', 'embeddings']
}

export function hasAnyBulkFieldEnabled(form: BulkEditForm, enabled: BulkEnabledFields, caps: BulkEditCapabilities) {
  return (
    enabled.baseUrl ||
    enabled.openaiPassthrough ||
    enabled.openaiFlattenNamespaces ||
    (enabled.openaiLongContextBilling && caps.allOpenAIPassthroughCapable) ||
    (enabled.openaiImageSizeTiers && caps.allOpenAIPassthroughCapable) ||
    (enabled.openaiEndpointCapabilities && caps.allOpenAIAPIKey) ||
    (enabled.openaiResponsesMode && caps.allOpenAIAPIKey) ||
    enabled.modelRestriction ||
    enabled.customErrorCodes ||
    enabled.interceptWarmup ||
    enabled.headerOverride ||
    enabled.proxy ||
    enabled.concurrency ||
    enabled.loadFactor ||
    enabled.priority ||
    enabled.rateMultiplier ||
    enabled.status ||
    enabled.groups ||
    enabled.openaiWSMode ||
    enabled.openaiAPIKeyWSMode ||
    enabled.upstreamBillingAutoProbe ||
    enabled.codexCLIOnly ||
    enabled.codexCLIOnlyAppServer ||
    enabled.codexFingerprintMode ||
    enabled.openaiCompactMode ||
    enabled.openaiCompactModelMapping ||
    enabled.rpmLimit ||
    form.userMsgQueueMode !== null
  )
}

/**
 * Builds the bulk-update body from the enabled fields. Mirrors the Vue modal:
 * the backend merges `extra`/`credentials` with JSONB `||`, so "off/clear"
 * values are always sent as explicit sentinels (false, 0, '' or {}) rather
 * than omitted keys. Returns null when nothing would be updated.
 */
export function buildBulkUpdatePayload(
  form: BulkEditForm,
  enabled: BulkEnabledFields,
  caps: BulkEditCapabilities,
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {}
  const credentials: Record<string, unknown> = {}
  let credentialsChanged = false
  const textGenerationEnabled = isOpenAITextGenerationEnabled(form)
  const responsesModeApplicable = isOpenAIResponsesModeApplicable(form, enabled)
  const applyOpenAILongContextBilling = enabled.openaiLongContextBilling && caps.allOpenAIPassthroughCapable
  const applyOpenAIEndpointCapabilities = enabled.openaiEndpointCapabilities && caps.allOpenAIAPIKey
  const applyOpenAIResponsesMode = enabled.openaiResponsesMode && caps.allOpenAIAPIKey
  const ensureExtra = (): Record<string, unknown> => {
    if (!updates.extra) updates.extra = {}
    return updates.extra as Record<string, unknown>
  }

  if (enabled.proxy) {
    // The backend expects proxy_id: 0 (not null) to clear the proxy
    updates.proxy_id = form.proxyId === null ? 0 : form.proxyId
  }
  if (enabled.concurrency) updates.concurrency = form.concurrency
  if (enabled.loadFactor) {
    // Empty/NaN/0 is sent as 0, which the backend treats as "clear"
    const lf = form.loadFactor
    updates.load_factor = lf != null && !Number.isNaN(lf) && lf > 0 ? lf : 0
  }
  if (enabled.priority) updates.priority = form.priority
  if (enabled.rateMultiplier) updates.rate_multiplier = form.rateMultiplier
  if (enabled.status) updates.status = form.status
  if (enabled.groups) updates.group_ids = form.groupIds

  if (enabled.baseUrl) {
    const baseUrl = form.baseUrl.trim()
    if (baseUrl) {
      credentials.base_url = baseUrl
      credentialsChanged = true
    }
  }

  if (enabled.openaiPassthrough) {
    const extra = ensureExtra()
    extra.openai_passthrough = form.openaiPassthroughEnabled
    if (!form.openaiPassthroughEnabled) extra.openai_oauth_passthrough = false
  }

  // Re-check visibility: a field ticked before the targets changed must not reach non-OAuth accounts
  if (enabled.openaiFlattenNamespaces && caps.allOpenAIOAuthOnly) {
    ensureExtra().openai_responses_flatten_namespaces = form.openaiFlattenNamespacesEnabled
  }

  if (applyOpenAILongContextBilling) {
    ensureExtra().openai_long_context_billing_enabled = form.openAILongContextBillingEnabled
  }

  if (enabled.openaiImageSizeTiers && caps.allOpenAIPassthroughCapable) {
    // extra is merged as JSONB; "all tiers" overwrites any old value with an empty list
    ensureExtra()[OPENAI_IMAGE_SIZE_TIERS_EXTRA_KEY] = openAIImageSizeTiersPayload(form.openAIImageSizeTiers) ?? []
  }

  if (applyOpenAIEndpointCapabilities) {
    credentials.openai_capabilities =
      form.openAIEndpointCapabilities.length === 2 && !form.openAIEndpointCapabilities.includes('seedance')
        ? null
        : [...form.openAIEndpointCapabilities]
    credentialsChanged = true
  }

  if (applyOpenAIResponsesMode || (applyOpenAIEndpointCapabilities && !textGenerationEnabled)) {
    ensureExtra().openai_responses_mode =
      !responsesModeApplicable || form.openAIResponsesMode === 'auto' ? null : form.openAIResponsesMode
  }

  if (enabled.modelRestriction && !isOpenAIModelRestrictionDisabled(form, enabled, caps)) {
    if (form.modelRestrictionMode === 'whitelist') {
      // Whitelist becomes an identity model_mapping; an empty list ("all models")
      // is sent as {} so it overrides any existing restriction.
      const mapping: Record<string, string> = {}
      for (const model of form.allowedModels) mapping[model] = model
      credentials.model_mapping = mapping
    } else {
      // An empty mapping also means "all models"
      credentials.model_mapping = buildModelMappingObject('mapping', [], form.modelMappings) ?? {}
    }
    credentialsChanged = true
  }

  if (enabled.customErrorCodes) {
    credentials.custom_error_codes_enabled = true
    credentials.custom_error_codes = [...form.selectedErrorCodes]
    credentialsChanged = true
  }

  if (enabled.interceptWarmup) {
    credentials.intercept_warmup_requests = form.interceptWarmupRequests
    credentialsChanged = true
  }

  if (enabled.headerOverride) {
    // JSONB merge: turning it off writes false + {} to clear the old overrides
    credentials[HEADER_OVERRIDE_ENABLED_CREDENTIAL_KEY] = form.headerOverrideEnabled
    credentials[HEADER_OVERRIDES_CREDENTIAL_KEY] = form.headerOverrideEnabled
      ? buildHeaderOverridesObject(form.headerOverrideRows)
      : {}
    credentialsChanged = true
  }

  if (enabled.openaiWSMode) {
    const extra = ensureExtra()
    extra.openai_oauth_responses_websockets_v2_mode = form.openaiOAuthWSMode
    extra.openai_oauth_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(form.openaiOAuthWSMode)
  }

  if (enabled.openaiAPIKeyWSMode) {
    const extra = ensureExtra()
    extra.openai_apikey_responses_websockets_v2_mode = form.openaiAPIKeyWSMode
    extra.openai_apikey_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(form.openaiAPIKeyWSMode)
  }

  if (enabled.upstreamBillingAutoProbe) {
    updates.upstream_billing_probe_enabled = form.upstreamBillingAutoProbeMode === 'enabled'
  }

  if (enabled.codexCLIOnly) ensureExtra().codex_cli_only = form.codexCLIOnlyEnabled

  // The app-server switch belongs to codex_cli_only: only written when this
  // same edit also turns the parent on, so no orphan key lands on accounts.
  if (enabled.codexCLIOnlyAppServer && enabled.codexCLIOnly && form.codexCLIOnlyEnabled) {
    ensureExtra().codex_cli_only_allow_app_server = form.codexCLIOnlyAppServerEnabled
  }

  if (enabled.codexFingerprintMode) {
    // "off" must be written explicitly: the bulk endpoint merges top-level
    // extra keys, so omitting it would neither clear device/session/full nor
    // leave a non-empty payload (an empty {extra:{}} is rejected as no updates).
    ensureExtra().codex_fingerprint_mode = form.codexFingerprintMode
  }

  if (enabled.openaiCompactMode) ensureExtra().openai_compact_mode = form.openAICompactMode

  if (enabled.openaiCompactModelMapping) {
    credentials.compact_model_mapping = buildModelMappingObject('mapping', [], form.openAICompactModelMappings) ?? {}
    credentialsChanged = true
  }

  if (enabled.rpmLimit) {
    const extra = ensureExtra()
    if (form.rpmLimitEnabled && form.baseRpm != null && form.baseRpm > 0) {
      extra.base_rpm = form.baseRpm
      extra.rpm_strategy = form.rpmStrategy
      if (form.rpmStickyBuffer != null && form.rpmStickyBuffer > 0) {
        extra.rpm_sticky_buffer = form.rpmStickyBuffer
      }
    } else {
      // Disable: JSONB merge never deletes keys, so reset the related fields explicitly
      extra.base_rpm = 0
      extra.rpm_strategy = ''
      extra.rpm_sticky_buffer = 0
    }
  }

  // User message queue mode is saved independently of the RPM switch
  if (form.userMsgQueueMode !== null) {
    const extra = ensureExtra()
    extra.user_msg_queue_mode = form.userMsgQueueMode
    extra.user_msg_queue_enabled = false // clear the legacy flag (JSONB merge)
  }

  if (credentialsChanged) updates.credentials = credentials

  return Object.keys(updates).length > 0 ? updates : null
}
