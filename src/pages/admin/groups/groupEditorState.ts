/**
 * Form state shared by the create and edit group dialogs for the model
 * pricing, model allowlist and routing sections. Ports the matching script
 * logic of views/admin/GroupsView.vue; the framework-agnostic pieces (pricing
 * unit conversion, allowlist state, candidate tracking) are reused as-is.
 */
import { useCallback, useRef, useState } from 'react'
import type { AdminGroup, CreateGroupRequest, GroupPlatform } from '@/types'
import type { ChannelModelPricing } from '@/api/admin/channels'
import type { PricingFormEntry } from '@/components/admin/channel/types'
import {
  apiIntervalsToForm,
  createDefaultTimePricingForm,
  formIntervalsToAPI,
  formReasoningEffortMultipliersToAPI,
  mTokToPerToken,
  perTokenToMTok,
  toNullableNumber,
  validateReasoningEffortMultipliers,
} from '@/components/admin/channel/types'
import {
  buildModelAllowlistConfig,
  createModelAllowlistState,
  setModelAllowlistCandidates,
  type ModelAllowlistState,
} from '@/views/admin/groupModelAllowlist'
import { createModelAllowlistCandidatesTracker } from '@/views/admin/modelAllowlistCandidates'
import { normalizeSupportedModelScopesForPlatform } from '@/views/admin/groupsSupportedModelScopes'
import { adminAPI } from '~/lib/api/admin'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export type GroupEditorMode = 'create' | 'edit'

/** Account picked for a model routing rule. */
export interface RoutingAccount {
  id: number
  name: string
}

/** One "model pattern → priority accounts" row of the routing editor. */
export interface ModelRoutingRuleForm {
  uiKey: string
  pattern: string
  accounts: RoutingAccount[]
}

/** Pricing form entry plus a stable render key (the Vue view keys by index). */
export type GroupPricingEntry = PricingFormEntry & { uiKey: string }

export interface GroupEditorState {
  long_context_pricing_enabled: boolean
  model_pricing: GroupPricingEntry[]
  model_allowlist: ModelAllowlistState
  supported_model_scopes: string[]
  claude_code_only: boolean
  fallback_group_id: number | null
  fallback_group_id_on_invalid_request: number | null
  model_routing_enabled: boolean
  model_routing_rules: ModelRoutingRuleForm[]
}

export interface FallbackGroupOption {
  value: number | null
  label: string
}

export const DEFAULT_SUPPORTED_MODEL_SCOPES = ['claude', 'gemini_text', 'gemini_image']

/** Platforms whose groups may set an invalid-request fallback group. */
export const INVALID_REQUEST_FALLBACK_PLATFORMS: string[] = ['anthropic', 'antigravity']

let uiKeySeq = 0
export const nextUiKey = (prefix: string) => `${prefix}-${++uiKeySeq}`

export const createGroupEditorState = (): GroupEditorState => ({
  long_context_pricing_enabled: true,
  model_pricing: [],
  model_allowlist: createModelAllowlistState(),
  supported_model_scopes: [...DEFAULT_SUPPORTED_MODEL_SCOPES],
  claude_code_only: false,
  fallback_group_id: null,
  fallback_group_id_on_invalid_request: null,
  model_routing_enabled: false,
  model_routing_rules: [],
})

export const emptyGroupPricing = (): GroupPricingEntry => ({
  uiKey: nextUiKey('pricing'),
  models: [],
  billing_mode: 'token',
  input_price: null,
  output_price: null,
  cache_write_price: null,
  cache_write_1h_price: null,
  cache_write_12h_price: null,
  cache_read_price: null,
  reasoning_effort_multipliers: null,
  image_input_price: null,
  image_output_price: null,
  per_request_price: null,
  intervals: [],
  time_pricing: createDefaultTimePricingForm(),
})

export const groupPricingFromAPI = (pricing: ChannelModelPricing[] | undefined): GroupPricingEntry[] =>
  (pricing || []).map((entry) => ({
    uiKey: nextUiKey('pricing'),
    models: entry.models || [],
    billing_mode: entry.billing_mode || 'token',
    input_price: perTokenToMTok(entry.input_price),
    output_price: perTokenToMTok(entry.output_price),
    cache_write_price: perTokenToMTok(entry.cache_write_price),
    cache_write_1h_price: perTokenToMTok(entry.cache_write_1h_price),
    cache_write_12h_price: perTokenToMTok(entry.cache_write_12h_price),
    cache_read_price: perTokenToMTok(entry.cache_read_price),
    reasoning_effort_multipliers: entry.reasoning_effort_multipliers
      ? { ...entry.reasoning_effort_multipliers }
      : null,
    image_input_price: perTokenToMTok(entry.image_input_price),
    image_output_price: perTokenToMTok(entry.image_output_price),
    per_request_price: entry.per_request_price,
    intervals: apiIntervalsToForm(entry.intervals || []),
    time_pricing: createDefaultTimePricingForm(),
  }))

export const groupPricingToAPI = (pricing: PricingFormEntry[], platform: string): ChannelModelPricing[] =>
  pricing
    .filter((entry) => entry.models.length > 0)
    .map((entry) => ({
      platform,
      models: entry.models,
      billing_mode: entry.billing_mode,
      input_price: mTokToPerToken(entry.input_price),
      output_price: mTokToPerToken(entry.output_price),
      cache_write_price: mTokToPerToken(entry.cache_write_price),
      cache_write_1h_price: mTokToPerToken(entry.cache_write_1h_price),
      cache_write_12h_price: mTokToPerToken(entry.cache_write_12h_price),
      cache_read_price: mTokToPerToken(entry.cache_read_price),
      reasoning_effort_multipliers: formReasoningEffortMultipliersToAPI(entry.reasoning_effort_multipliers),
      image_input_price: mTokToPerToken(entry.image_input_price),
      image_output_price: mTokToPerToken(entry.image_output_price),
      per_request_price: toNullableNumber(entry.per_request_price),
      intervals: entry.billing_mode === 'token' ? [] : formIntervalsToAPI(entry.intervals || []),
      time_pricing: null,
    }))

/** Copy of an allowlist state that the mutating groupModelAllowlist helpers can work on. */
export const cloneModelAllowlistState = (state: ModelAllowlistState): ModelAllowlistState => ({
  enabled: state.enabled,
  savedModels: [...state.savedModels],
  items: state.items.map((item) => ({ ...item })),
})

/** Applies `mutate` (one of the groupModelAllowlist helpers) to a copy of `state`. */
export const updateModelAllowlist = (
  state: ModelAllowlistState,
  mutate: (draft: ModelAllowlistState) => void,
): ModelAllowlistState => {
  const draft = cloneModelAllowlistState(state)
  mutate(draft)
  return draft
}

/** UI routing rules → API `model_routing` map (rules without a pattern or accounts are dropped). */
export const convertRoutingRulesToApiFormat = (rules: ModelRoutingRuleForm[]): Record<string, number[]> | null => {
  const result: Record<string, number[]> = {}
  let hasValidRules = false

  for (const rule of rules) {
    const pattern = rule.pattern.trim()
    if (!pattern) continue

    const accountIds = rule.accounts.map((a) => a.id).filter((id) => id > 0)
    if (accountIds.length > 0) {
      result[pattern] = accountIds
      hasValidRules = true
    }
  }

  return hasValidRules ? result : null
}

/** API `model_routing` map → UI rules, resolving account names (missing accounts show as #id). */
export const convertApiFormatToRoutingRules = async (
  apiFormat: Record<string, number[]> | null | undefined,
): Promise<ModelRoutingRuleForm[]> => {
  if (!apiFormat) return []

  return Promise.all(
    Object.entries(apiFormat).map(async ([pattern, accountIds]) => {
      const accounts = await Promise.all(
        accountIds.map(async (id): Promise<RoutingAccount> => {
          try {
            const account = await adminAPI.accounts.getById(id)
            return { id: account.id, name: account.name }
          } catch {
            return { id, name: `#${id}` }
          }
        }),
      )
      return { uiKey: nextUiKey('routing-rule'), pattern, accounts }
    }),
  )
}

/** Editor state for an existing group (the edit dialog's population step). */
export const groupEditorStateFromGroup = (
  group: AdminGroup,
  routingRules: ModelRoutingRuleForm[],
): GroupEditorState => ({
  long_context_pricing_enabled: group.long_context_pricing_enabled ?? true,
  model_pricing: groupPricingFromAPI(group.model_pricing),
  model_allowlist: createModelAllowlistState(group.model_allowlist),
  supported_model_scopes: group.supported_model_scopes || [...DEFAULT_SUPPORTED_MODEL_SCOPES],
  claude_code_only: group.claude_code_only || false,
  fallback_group_id: group.fallback_group_id,
  fallback_group_id_on_invalid_request: group.fallback_group_id_on_invalid_request,
  model_routing_enabled: group.model_routing_enabled || false,
  model_routing_rules: routingRules,
})

/** Create dialog platform switch: same resets as the Vue createForm.platform watcher. */
export const groupEditorStateForPlatform = (state: GroupEditorState, platform: string): GroupEditorState => ({
  ...state,
  fallback_group_id_on_invalid_request: INVALID_REQUEST_FALLBACK_PLATFORMS.includes(platform)
    ? state.fallback_group_id_on_invalid_request
    : null,
  model_allowlist: createModelAllowlistState(),
})

/**
 * Request fields owned by the pricing / allowlist / routing sections. The edit
 * payload sends 0 instead of null for the fallback groups: the backend treats
 * 0 as "clear" while null means "unchanged".
 */
export const buildGroupEditorPayload = (
  state: GroupEditorState,
  platform: string,
  mode: GroupEditorMode,
): Pick<
  CreateGroupRequest,
  | 'long_context_pricing_enabled'
  | 'model_pricing'
  | 'model_allowlist'
  | 'supported_model_scopes'
  | 'claude_code_only'
  | 'fallback_group_id'
  | 'fallback_group_id_on_invalid_request'
  | 'model_routing'
  | 'model_routing_enabled'
> => ({
  long_context_pricing_enabled: state.long_context_pricing_enabled,
  model_pricing: groupPricingToAPI(state.model_pricing, platform),
  model_allowlist: buildModelAllowlistConfig(state.model_allowlist),
  supported_model_scopes: normalizeSupportedModelScopesForPlatform(platform, state.supported_model_scopes),
  claude_code_only: state.claude_code_only,
  fallback_group_id: mode === 'edit' && state.fallback_group_id === null ? 0 : state.fallback_group_id,
  fallback_group_id_on_invalid_request:
    mode === 'edit' && state.fallback_group_id_on_invalid_request === null
      ? 0
      : state.fallback_group_id_on_invalid_request,
  model_routing: convertRoutingRulesToApiFormat(state.model_routing_rules),
  model_routing_enabled: state.model_routing_enabled,
})

/** Submit-time validation shared by both dialogs; returns the message to show, or null. */
export const validateGroupEditorState = (state: GroupEditorState, t: TranslateFn): string | null => {
  for (const entry of state.model_pricing) {
    const error = validateReasoningEffortMultipliers(entry.reasoning_effort_multipliers, t)
    if (error) {
      return `${entry.models.join(', ') || t('admin.channels.form.unnamed')}: ${error}`
    }
  }
  // An enabled allowlist without any entry is rejected by the backend (400).
  if (state.model_allowlist.enabled && !state.model_allowlist.items.some((item) => item.selected)) {
    return t('admin.groups.modelAllowlist.emptySelectionError')
  }
  return null
}

/** Claude Code fallback targets: active anthropic groups without the client restriction. */
export const buildFallbackGroupOptions = (
  groups: AdminGroup[],
  noFallbackLabel: string,
  currentId?: number,
): FallbackGroupOption[] => [
  { value: null, label: noFallbackLabel },
  ...groups
    .filter((g) => g.platform === 'anthropic' && !g.claude_code_only && g.status === 'active' && g.id !== currentId)
    .map((g) => ({ value: g.id, label: g.name })),
]

/** Invalid-request fallback targets: active, non-subscription anthropic groups without their own fallback. */
export const buildInvalidRequestFallbackOptions = (
  groups: AdminGroup[],
  noFallbackLabel: string,
  currentId?: number,
): FallbackGroupOption[] => [
  { value: null, label: noFallbackLabel },
  ...groups
    .filter(
      (g) =>
        g.platform === 'anthropic' &&
        g.status === 'active' &&
        g.subscription_type !== 'subscription' &&
        g.fallback_group_id_on_invalid_request === null &&
        g.id !== currentId,
    )
    .map((g) => ({ value: g.id, label: g.name })),
]

/**
 * State of one dialog's editor sections plus the model allowlist candidate
 * loader. Stale candidate responses (another platform or group requested in
 * the meantime) are dropped, like the Vue tracker-guarded loader.
 */
export function useGroupEditorState(mode: GroupEditorMode) {
  const [state, setState] = useState<GroupEditorState>(createGroupEditorState)
  const [allowlistLoading, setAllowlistLoading] = useState(false)
  const trackerRef = useRef(createModelAllowlistCandidatesTracker())

  const loadAllowlistCandidates = useCallback(
    async (groupID: number, platform: GroupPlatform) => {
      const request = { mode, groupID, platform }
      const tracker = trackerRef.current
      const requestID = tracker.next(request)
      setAllowlistLoading(true)
      try {
        const models = await adminAPI.groups.getModelAllowlistCandidates(groupID, platform)
        if (!tracker.isCurrent(requestID, request)) return
        setState((prev) => ({
          ...prev,
          model_allowlist: updateModelAllowlist(prev.model_allowlist, (draft) =>
            setModelAllowlistCandidates(draft, models),
          ),
        }))
      } catch (error) {
        if (!tracker.isCurrent(requestID, request)) return
        console.error('Error loading group models list candidates:', error)
      } finally {
        if (tracker.isCurrent(requestID, request)) setAllowlistLoading(false)
      }
    },
    [mode],
  )

  const reset = useCallback(() => setState(createGroupEditorState()), [])

  return { state, setState, allowlistLoading, loadAllowlistCandidates, reset }
}
