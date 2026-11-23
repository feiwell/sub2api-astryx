import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Code } from '@astryxdesign/core/Code'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Field } from '@astryxdesign/core/Field'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { OpenAIFastPolicyUserSelector } from './gateway/OpenAIFastPolicyUserSelector'
import { WebSearchEmulationCard } from './gateway/WebSearchEmulationCard'

interface OverloadCooldownSettings {
  enabled: boolean
  cooldown_minutes: number
}

interface RateLimitCooldownSettings {
  enabled: boolean
  cooldown_seconds: number
}

interface StreamTimeoutSettings {
  enabled: boolean
  action: 'temp_unsched' | 'error' | 'none'
  temp_unsched_minutes: number
  threshold_count: number
  threshold_window_minutes: number
}

interface RectifierSettings {
  enabled: boolean
  thinking_signature_enabled: boolean
  thinking_budget_enabled: boolean
  apikey_signature_enabled: boolean
  apikey_signature_patterns: string[]
}

interface BetaPolicyRule {
  beta_token: string
  action: 'pass' | 'filter' | 'block'
  scope: 'all' | 'oauth' | 'apikey' | 'bedrock'
  error_message?: string
  model_whitelist?: string[]
  fallback_action?: 'pass' | 'filter' | 'block'
  fallback_error_message?: string
}

interface BetaPolicySettings {
  rules: BetaPolicyRule[]
}

interface OpenAIFastPolicyRule {
  service_tier: 'all' | 'priority' | 'flex' | 'missing'
  action: 'pass' | 'filter' | 'block' | 'force_priority'
  scope: 'all' | 'oauth' | 'apikey' | 'bedrock'
  user_ids?: number[]
  error_message?: string
  model_whitelist?: string[]
  fallback_action?: 'pass' | 'filter' | 'block' | 'force_priority'
  fallback_error_message?: string
}

interface OpenAIFastPolicySettings {
  rules: OpenAIFastPolicyRule[]
}

interface UpstreamBillingProbeSettings {
  enabled: boolean
  interval_minutes: number
}

interface OllamaCloudUsageSettings {
  enabled: boolean
  interval_minutes: number
  debounce_minutes: number
}

interface OpencodeGoUsageSettings {
  enabled: boolean
  interval_minutes: number
  debounce_minutes: number
}

// Older backends may return null for the pattern list.
function withPatternList(settings: RectifierSettings): RectifierSettings {
  return {
    ...settings,
    apikey_signature_patterns: Array.isArray(settings.apikey_signature_patterns)
      ? settings.apikey_signature_patterns
      : [],
  }
}

const BETA_TOKENS = [
  'computer-use-2024-10-22',
  'pdfs-2024-09-25',
  'prompt-caching-2024-07-31',
  'max-tokens-3-5-sonnet-2024-07-15',
  'message-batches-2024-09-24',
  'token-counting-2024-11-01'
]

const BETA_DISPLAY_NAMES: Record<string, string> = {
  'computer-use-2024-10-22': 'Computer Use',
  'pdfs-2024-09-25': 'PDF Support',
  'prompt-caching-2024-07-31': 'Prompt Caching',
  'max-tokens-3-5-sonnet-2024-07-15': 'Extended Context',
  'message-batches-2024-09-24': 'Message Batches',
  'token-counting-2024-11-01': 'Token Counting'
}

const COMMON_MODEL_PATTERNS = [
  'claude-*',
  'gpt-*',
  'o1-*',
  '*-4o-*',
  '*-sonnet-*',
  '*-opus-*',
  '*-haiku-*'
]

const SECTION_COLUMNS = { minWidth: 320, max: 2 }
const RULE_PAIR_COLUMNS = { minWidth: 180, max: 2 }
const RULE_TRIPLE_COLUMNS = { minWidth: 180, max: 3 }

function hasTargetModels(patterns?: string[]): boolean {
  return (patterns ?? []).some((pattern) => pattern.trim() !== '')
}

function SettingsSection({
  title,
  description,
  isLoading = false,
  children,
}: {
  title: string
  description?: string
  isLoading?: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Grid columns={SECTION_COLUMNS} gap={10}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && (
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        )}
      </VStack>
      {isLoading ? (
        <HStack gap={2} vAlign="center">
          <Spinner size="sm" />
          <Text color="secondary">{t('common.loading')}</Text>
        </HStack>
      ) : (
        <VStack gap={4} hAlign="stretch">
          {children}
        </VStack>
      )}
    </Grid>
  )
}

function SaveButton({ isSaving, onClick }: { isSaving: boolean; onClick: () => void | Promise<void> }) {
  const { t } = useI18n()
  return (
    <HStack>
      <Button
        variant="primary"
        label={isSaving ? t('common.saving') : t('common.save')}
        isLoading={isSaving}
        onClick={() => void onClick()}
      />
    </HStack>
  )
}

function ModelPatternList({
  label,
  description,
  placeholder,
  addLabel,
  removeLabel,
  patterns,
  onChange,
  suggestionsLabel,
  suggestions,
}: {
  label: string
  description: string
  placeholder: string
  addLabel: string
  removeLabel: string
  patterns: string[]
  onChange: (patterns: string[]) => void
  suggestionsLabel?: string
  suggestions?: string[]
}) {
  const groupID = useId()
  return (
    <Field label={label} description={description} inputID={groupID} isGroupLabel>
      <VStack gap={2} hAlign="stretch">
        {patterns.map((pattern, index) => (
          <HStack key={index} gap={2} vAlign="center">
            <StackItem size="fill">
              <TextInput
                isLabelHidden
                label={`${label} ${index + 1}`}
                value={pattern}
                placeholder={placeholder}
                onChange={(value) => onChange(patterns.map((item, i) => (i === index ? value : item)))}
              />
            </StackItem>
            <IconButton
              variant="ghost"
              label={removeLabel}
              tooltip={removeLabel}
              icon={<Icon icon={XMarkIcon} />}
              onClick={() => onChange(patterns.filter((_, i) => i !== index))}
            />
          </HStack>
        ))}
        <HStack>
          <Button
            size="sm"
            icon={<Icon icon={PlusIcon} />}
            label={addLabel}
            onClick={() => onChange([...patterns, ''])}
          />
        </HStack>
        {suggestions && (
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="supporting" color="secondary">
              {suggestionsLabel}
            </Text>
            {suggestions.map((pattern) => (
              <Token
                key={pattern}
                size="sm"
                label={pattern}
                onClick={() => {
                  if (!patterns.includes(pattern)) onChange([...patterns, pattern])
                }}
              />
            ))}
          </HStack>
        )}
      </VStack>
    </Field>
  )
}

export function GatewaySettingsTab() {
  const { t } = useI18n()

  // Gateway form state
  const [gatewaySaving, setGatewaySaving] = useState(false)
  const [gatewayForm, setGatewayForm] = useState({
    min_claude_code_version: '',
    max_claude_code_version: '',
    claude_code_client_version: '',
    openai_codex_client_version: '',
    min_codex_version: '',
    max_codex_version: '',
    codex_cli_only_allow_app_server_clients: false,
    allow_ungrouped_key_scheduling: false,
    openai_low_upstream_rate_priority_enabled: false,
    openai_oauth_scheduling_rate_multiplier: 1.0,
    openai_advanced_scheduler_enabled: false,
    openai_advanced_scheduler_sticky_weighted_enabled: false,
    enable_fingerprint_unification: false,
    enable_metadata_passthrough: false,
    enable_cch_signing: false,
    enable_claude_oauth_system_prompt_injection: false,
    enable_anthropic_cache_ttl_1h_injection: false,
    rewrite_message_cache_control: false,
    enable_client_dateline_normalization: false,
    antigravity_user_agent_version: '',
    openai_codex_user_agent: '',
    openai_codex_version_auto_sync_enabled: false,
    claude_code_version_auto_sync_enabled: false,
  })

  // Read-only versions reported by the auto-sync jobs; not part of the gateway save payload.
  const [syncedVersions, setSyncedVersions] = useState({ codex: '', claude: '' })
  const codexSyncedVersionLabel = syncedVersions.codex
    ? t('admin.settings.gatewayForwarding.openaiCodexVersionSyncedValue', { version: syncedVersions.codex })
    : ''
  const claudeSyncedVersionLabel = syncedVersions.claude
    ? t('admin.settings.gatewayForwarding.claudeCodeVersionSyncedValue', { version: syncedVersions.claude })
    : ''

  // Overload Cooldown (529)
  const [overloadLoading, setOverloadLoading] = useState(false)
  const [overloadSaving, setOverloadSaving] = useState(false)
  const [overloadForm, setOverloadForm] = useState<OverloadCooldownSettings>({
    enabled: false,
    cooldown_minutes: 30,
  })

  // Rate Limit Cooldown (429)
  const [rateLimitLoading, setRateLimitLoading] = useState(false)
  const [rateLimitSaving, setRateLimitSaving] = useState(false)
  const [rateLimitForm, setRateLimitForm] = useState<RateLimitCooldownSettings>({
    enabled: false,
    cooldown_seconds: 300,
  })

  // Stream Timeout
  const [streamLoading, setStreamLoading] = useState(false)
  const [streamSaving, setStreamSaving] = useState(false)
  const [streamForm, setStreamForm] = useState<StreamTimeoutSettings>({
    enabled: false,
    action: 'temp_unsched',
    temp_unsched_minutes: 30,
    threshold_count: 3,
    threshold_window_minutes: 10,
  })

  // Rectifier
  const [rectifierLoading, setRectifierLoading] = useState(false)
  const [rectifierSaving, setRectifierSaving] = useState(false)
  const [rectifierForm, setRectifierForm] = useState<RectifierSettings>({
    enabled: false,
    thinking_signature_enabled: false,
    thinking_budget_enabled: false,
    apikey_signature_enabled: false,
    apikey_signature_patterns: [],
  })

  // Beta Policy
  const [betaPolicyLoading, setBetaPolicyLoading] = useState(false)
  const [betaPolicySaving, setBetaPolicySaving] = useState(false)
  const [betaPolicyForm, setBetaPolicyForm] = useState<BetaPolicySettings>({
    rules: [],
  })

  // OpenAI Fast/Flex Policy
  const [openAIFastPolicyForm, setOpenAIFastPolicyForm] = useState<OpenAIFastPolicySettings>({
    rules: [],
  })
  const [openAIFastPolicySaving, setOpenAIFastPolicySaving] = useState(false)

  // Upstream Billing Probe
  const [upstreamBillingProbeLoading, setUpstreamBillingProbeLoading] = useState(false)
  const [upstreamBillingProbeSaving, setUpstreamBillingProbeSaving] = useState(false)
  const [upstreamBillingProbeForm, setUpstreamBillingProbeForm] = useState<UpstreamBillingProbeSettings>({
    enabled: true,
    interval_minutes: 30,
  })

  // Ollama Cloud Usage
  const [ollamaCloudUsageLoading, setOllamaCloudUsageLoading] = useState(false)
  const [ollamaCloudUsageSaving, setOllamaCloudUsageSaving] = useState(false)
  const [ollamaCloudUsageForm, setOllamaCloudUsageForm] = useState<OllamaCloudUsageSettings>({
    enabled: false,
    interval_minutes: 60,
    debounce_minutes: 1,
  })

  // OpenCode Go Usage
  const [opencodeGoUsageLoading, setOpencodeGoUsageLoading] = useState(false)
  const [opencodeGoUsageSaving, setOpencodeGoUsageSaving] = useState(false)
  const [opencodeGoUsageForm, setOpencodeGoUsageForm] = useState<OpencodeGoUsageSettings>({
    enabled: false,
    interval_minutes: 15,
    debounce_minutes: 1,
  })

  // Load settings on mount
  useEffect(() => {
    const loadGatewaySettings = async () => {
      try {
        const settings = await adminAPI.settings.getSettings()
        setGatewayForm({
          min_claude_code_version: settings.min_claude_code_version || '',
          max_claude_code_version: settings.max_claude_code_version || '',
          claude_code_client_version: settings.claude_code_client_version || '',
          openai_codex_client_version: settings.openai_codex_client_version || '',
          min_codex_version: settings.min_codex_version || '',
          max_codex_version: settings.max_codex_version || '',
          codex_cli_only_allow_app_server_clients: settings.codex_cli_only_allow_app_server_clients ?? false,
          allow_ungrouped_key_scheduling: settings.allow_ungrouped_key_scheduling ?? false,
          openai_low_upstream_rate_priority_enabled: settings.openai_low_upstream_rate_priority_enabled ?? false,
          openai_oauth_scheduling_rate_multiplier: settings.openai_oauth_scheduling_rate_multiplier ?? 1.0,
          openai_advanced_scheduler_enabled: settings.openai_advanced_scheduler_enabled ?? false,
          openai_advanced_scheduler_sticky_weighted_enabled: settings.openai_advanced_scheduler_sticky_weighted_enabled ?? false,
          enable_fingerprint_unification: settings.enable_fingerprint_unification ?? false,
          enable_metadata_passthrough: settings.enable_metadata_passthrough ?? false,
          enable_cch_signing: settings.enable_cch_signing ?? false,
          enable_claude_oauth_system_prompt_injection: settings.enable_claude_oauth_system_prompt_injection ?? false,
          enable_anthropic_cache_ttl_1h_injection: settings.enable_anthropic_cache_ttl_1h_injection ?? false,
          rewrite_message_cache_control: settings.rewrite_message_cache_control ?? false,
          enable_client_dateline_normalization: settings.enable_client_dateline_normalization ?? false,
          antigravity_user_agent_version: settings.antigravity_user_agent_version || '',
          openai_codex_user_agent: settings.openai_codex_user_agent || '',
          openai_codex_version_auto_sync_enabled: settings.openai_codex_version_auto_sync_enabled ?? false,
          claude_code_version_auto_sync_enabled: settings.claude_code_version_auto_sync_enabled ?? false,
        })

        setSyncedVersions({
          codex: settings.openai_codex_client_version_synced?.trim() || '',
          claude: settings.claude_code_client_version_synced?.trim() || '',
        })

        // Load OpenAI Fast policy from main settings
        if (settings.openai_fast_policy_settings?.rules) {
          setOpenAIFastPolicyForm({
            rules: settings.openai_fast_policy_settings.rules.map((rule: any) => ({
              ...rule,
              user_ids: rule.user_ids ? [...rule.user_ids] : [],
              model_whitelist: rule.model_whitelist ? [...rule.model_whitelist] : [],
            }))
          })
        }
      } catch (error: any) {
        console.error('Failed to load gateway settings:', error)
      }

      try {
        setOverloadLoading(true)
        const overload = await adminAPI.settings.getOverloadCooldownSettings()
        if (overload) setOverloadForm(overload)
      } catch (error: any) {
        console.error('Failed to load overload cooldown:', error)
      } finally {
        setOverloadLoading(false)
      }

      try {
        setRateLimitLoading(true)
        const rateLimit = await adminAPI.settings.getRateLimit429CooldownSettings()
        if (rateLimit) setRateLimitForm(rateLimit)
      } catch (error: any) {
        console.error('Failed to load rate limit cooldown:', error)
      } finally {
        setRateLimitLoading(false)
      }

      try {
        setStreamLoading(true)
        const stream = await adminAPI.settings.getStreamTimeoutSettings()
        if (stream) setStreamForm(stream)
      } catch (error: any) {
        console.error('Failed to load stream timeout:', error)
      } finally {
        setStreamLoading(false)
      }

      try {
        setRectifierLoading(true)
        const rectifier = await adminAPI.settings.getRectifierSettings()
        if (rectifier) setRectifierForm(withPatternList(rectifier))
      } catch (error: any) {
        console.error('Failed to load rectifier:', error)
      } finally {
        setRectifierLoading(false)
      }

      try {
        setBetaPolicyLoading(true)
        const betaPolicy = await adminAPI.settings.getBetaPolicySettings()
        if (betaPolicy?.rules) {
          setBetaPolicyForm(betaPolicy)
        } else {
          // Initialize default rules for all beta tokens
          setBetaPolicyForm({
            rules: BETA_TOKENS.map(token => ({
              beta_token: token,
              action: 'pass' as const,
              scope: 'all' as const,
            }))
          })
        }
      } catch (error: any) {
        console.error('Failed to load beta policy:', error)
        setBetaPolicyForm({
          rules: BETA_TOKENS.map(token => ({
            beta_token: token,
            action: 'pass' as const,
            scope: 'all' as const,
          }))
        })
      } finally {
        setBetaPolicyLoading(false)
      }

      try {
        setUpstreamBillingProbeLoading(true)
        const probe = await adminAPI.accounts.getUpstreamBillingProbeSettings()
        if (probe) setUpstreamBillingProbeForm(probe)
      } catch (error: any) {
        console.error('Failed to load upstream billing probe:', error)
      } finally {
        setUpstreamBillingProbeLoading(false)
      }

      try {
        setOllamaCloudUsageLoading(true)
        const ollama = await adminAPI.accounts.getOllamaCloudUsageSettings()
        if (ollama) setOllamaCloudUsageForm(ollama)
      } catch (error: any) {
        console.error('Failed to load Ollama cloud usage:', error)
      } finally {
        setOllamaCloudUsageLoading(false)
      }

      try {
        setOpencodeGoUsageLoading(true)
        const opencode = await adminAPI.accounts.getOpenCodeGoUsageSettings()
        if (opencode) setOpencodeGoUsageForm(opencode)
      } catch (error: any) {
        console.error('Failed to load OpenCode Go usage:', error)
      } finally {
        setOpencodeGoUsageLoading(false)
      }
    }

    loadGatewaySettings()
  }, [])

  const saveGatewaySettings = useCallback(async () => {
    try {
      setGatewaySaving(true)
      await adminAPI.settings.updateSettings(gatewayForm)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setGatewaySaving(false)
    }
  }, [gatewayForm, t])

  const saveOpenAIFastPolicySettings = useCallback(async () => {
    try {
      setOpenAIFastPolicySaving(true)
      await adminAPI.settings.updateSettings({
        openai_fast_policy_settings: openAIFastPolicyForm
      })
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setOpenAIFastPolicySaving(false)
    }
  }, [openAIFastPolicyForm, t])

  const saveOverloadSettings = useCallback(async () => {
    try {
      setOverloadSaving(true)
      const updated = await adminAPI.settings.updateOverloadCooldownSettings(overloadForm)
      if (updated) setOverloadForm(updated)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setOverloadSaving(false)
    }
  }, [overloadForm, t])

  const saveRateLimitSettings = useCallback(async () => {
    try {
      setRateLimitSaving(true)
      const updated = await adminAPI.settings.updateRateLimit429CooldownSettings(rateLimitForm)
      if (updated) setRateLimitForm(updated)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setRateLimitSaving(false)
    }
  }, [rateLimitForm, t])

  const saveStreamSettings = useCallback(async () => {
    try {
      setStreamSaving(true)
      const updated = await adminAPI.settings.updateStreamTimeoutSettings(streamForm)
      if (updated) setStreamForm(updated)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setStreamSaving(false)
    }
  }, [streamForm, t])

  const saveRectifierSettings = useCallback(async () => {
    try {
      setRectifierSaving(true)
      const updated = await adminAPI.settings.updateRectifierSettings({
        ...rectifierForm,
        apikey_signature_patterns: rectifierForm.apikey_signature_patterns.filter((p) => p.trim() !== ''),
      })
      if (updated) setRectifierForm(withPatternList(updated))
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setRectifierSaving(false)
    }
  }, [rectifierForm, t])

  const saveBetaPolicySettings = useCallback(async () => {
    try {
      setBetaPolicySaving(true)
      await adminAPI.settings.updateBetaPolicySettings(betaPolicyForm)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setBetaPolicySaving(false)
    }
  }, [betaPolicyForm, t])

  const saveUpstreamBillingProbeSettings = useCallback(async () => {
    try {
      setUpstreamBillingProbeSaving(true)
      const updated = await adminAPI.accounts.updateUpstreamBillingProbeSettings(upstreamBillingProbeForm)
      if (updated) setUpstreamBillingProbeForm(updated)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setUpstreamBillingProbeSaving(false)
    }
  }, [upstreamBillingProbeForm, t])

  const saveOllamaCloudUsageSettings = useCallback(async () => {
    try {
      setOllamaCloudUsageSaving(true)
      const updated = await adminAPI.accounts.updateOllamaCloudUsageSettings(ollamaCloudUsageForm)
      if (updated) setOllamaCloudUsageForm(updated)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setOllamaCloudUsageSaving(false)
    }
  }, [ollamaCloudUsageForm, t])

  const saveOpencodeGoUsageSettings = useCallback(async () => {
    try {
      setOpencodeGoUsageSaving(true)
      const updated = await adminAPI.accounts.updateOpenCodeGoUsageSettings(opencodeGoUsageForm)
      if (updated) setOpencodeGoUsageForm(updated)
      toast.success(t('common.saveSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
    } finally {
      setOpencodeGoUsageSaving(false)
    }
  }, [opencodeGoUsageForm, t])

  const getBetaDisplayName = (token: string) => {
    return BETA_DISPLAY_NAMES[token] || token
  }

  const updateBetaPolicyRule = (index: number, patch: Partial<BetaPolicyRule>) => {
    setBetaPolicyForm(prev => ({
      rules: prev.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    }))
  }

  const addOpenAIFastPolicyRule = () => {
    setOpenAIFastPolicyForm(prev => ({
      rules: [
        ...prev.rules,
        {
          service_tier: 'all',
          action: 'pass',
          scope: 'all',
          user_ids: [],
          model_whitelist: []
        }
      ]
    }))
  }

  const removeOpenAIFastPolicyRule = (index: number) => {
    setOpenAIFastPolicyForm(prev => ({
      rules: prev.rules.filter((_, i) => i !== index)
    }))
  }

  const updateOpenAIFastPolicyRule = (index: number, patch: Partial<OpenAIFastPolicyRule>) => {
    setOpenAIFastPolicyForm(prev => ({
      rules: prev.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule))
    }))
  }

  const streamActionOptions = [
    { value: 'temp_unsched', label: t('admin.settings.streamTimeout.actionTempUnsched') },
    { value: 'error', label: t('admin.settings.streamTimeout.actionError') },
    { value: 'none', label: t('admin.settings.streamTimeout.actionNone') },
  ]

  const betaActionOptions = [
    { value: 'pass', label: t('admin.settings.betaPolicy.actionPass') },
    { value: 'filter', label: t('admin.settings.betaPolicy.actionFilter') },
    { value: 'block', label: t('admin.settings.betaPolicy.actionBlock') },
  ]

  const betaScopeOptions = [
    { value: 'all', label: t('admin.settings.betaPolicy.scopeAll') },
    { value: 'oauth', label: t('admin.settings.betaPolicy.scopeOAuth') },
    { value: 'apikey', label: t('admin.settings.betaPolicy.scopeApikey') },
    { value: 'bedrock', label: t('admin.settings.betaPolicy.scopeBedrock') },
  ]

  const fastTierOptions = [
    { value: 'all', label: t('admin.settings.openaiFastPolicy.tierAll') },
    { value: 'priority', label: t('admin.settings.openaiFastPolicy.tierPriority') },
    { value: 'flex', label: t('admin.settings.openaiFastPolicy.tierFlex') },
    { value: 'missing', label: t('admin.settings.openaiFastPolicy.tierMissing') },
  ]

  const fastActionOptions = [
    { value: 'pass', label: t('admin.settings.openaiFastPolicy.actionPass') },
    { value: 'filter', label: t('admin.settings.openaiFastPolicy.actionFilter') },
    { value: 'block', label: t('admin.settings.openaiFastPolicy.actionBlock') },
    { value: 'force_priority', label: t('admin.settings.openaiFastPolicy.actionForcePriority') },
  ]

  const fastScopeOptions = [
    { value: 'all', label: t('admin.settings.openaiFastPolicy.scopeAll') },
    { value: 'oauth', label: t('admin.settings.openaiFastPolicy.scopeOAuth') },
    { value: 'apikey', label: t('admin.settings.openaiFastPolicy.scopeApikey') },
    { value: 'bedrock', label: t('admin.settings.openaiFastPolicy.scopeBedrock') },
  ]

  const fastActionSummary = (action: string) => t(`admin.settings.openaiFastPolicy.summaryAction.${action}`)

  const addRuleButton = (
    <Button
      size="sm"
      icon={<Icon icon={PlusIcon} />}
      label={t('admin.settings.openaiFastPolicy.addRule')}
      onClick={addOpenAIFastPolicyRule}
    />
  )

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.overloadCooldown.title')}
        description={t('admin.settings.overloadCooldown.description')}
        isLoading={overloadLoading}
      >
        <CheckboxInput
          label={t('admin.settings.overloadCooldown.enabled')}
          description={t('admin.settings.overloadCooldown.enabledHint')}
          value={overloadForm.enabled}
          onChange={(enabled) => setOverloadForm({ ...overloadForm, enabled })}
        />
        {overloadForm.enabled && (
          <NumberInput
            label={t('admin.settings.overloadCooldown.cooldownMinutes')}
            description={t('admin.settings.overloadCooldown.cooldownMinutesHint')}
            value={overloadForm.cooldown_minutes}
            onChange={(cooldown_minutes) => setOverloadForm({ ...overloadForm, cooldown_minutes })}
            min={1}
            max={120}
            isIntegerOnly
          />
        )}
        <SaveButton isSaving={overloadSaving} onClick={saveOverloadSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.rateLimit429Cooldown.title')}
        description={t('admin.settings.rateLimit429Cooldown.description')}
        isLoading={rateLimitLoading}
      >
        <CheckboxInput
          label={t('admin.settings.rateLimit429Cooldown.enabled')}
          description={t('admin.settings.rateLimit429Cooldown.enabledHint')}
          value={rateLimitForm.enabled}
          onChange={(enabled) => setRateLimitForm({ ...rateLimitForm, enabled })}
        />
        {rateLimitForm.enabled && (
          <NumberInput
            label={t('admin.settings.rateLimit429Cooldown.cooldownSeconds')}
            description={t('admin.settings.rateLimit429Cooldown.cooldownSecondsHint')}
            value={rateLimitForm.cooldown_seconds}
            onChange={(cooldown_seconds) => setRateLimitForm({ ...rateLimitForm, cooldown_seconds })}
            min={1}
            max={7200}
            isIntegerOnly
          />
        )}
        <SaveButton isSaving={rateLimitSaving} onClick={saveRateLimitSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.streamTimeout.title')}
        description={t('admin.settings.streamTimeout.description')}
        isLoading={streamLoading}
      >
        <CheckboxInput
          label={t('admin.settings.streamTimeout.enabled')}
          description={t('admin.settings.streamTimeout.enabledHint')}
          value={streamForm.enabled}
          onChange={(enabled) => setStreamForm({ ...streamForm, enabled })}
        />
        {streamForm.enabled && (
          <>
            <Selector
              label={t('admin.settings.streamTimeout.action')}
              description={t('admin.settings.streamTimeout.actionHint')}
              options={streamActionOptions}
              value={streamForm.action}
              onChange={(action) =>
                setStreamForm({ ...streamForm, action: action as StreamTimeoutSettings['action'] })
              }
              width="100%"
            />
            {streamForm.action === 'temp_unsched' && (
              <NumberInput
                label={t('admin.settings.streamTimeout.tempUnschedMinutes')}
                description={t('admin.settings.streamTimeout.tempUnschedMinutesHint')}
                value={streamForm.temp_unsched_minutes}
                onChange={(temp_unsched_minutes) => setStreamForm({ ...streamForm, temp_unsched_minutes })}
                min={1}
                max={60}
                isIntegerOnly
              />
            )}
            <NumberInput
              label={t('admin.settings.streamTimeout.thresholdCount')}
              description={t('admin.settings.streamTimeout.thresholdCountHint')}
              value={streamForm.threshold_count}
              onChange={(threshold_count) => setStreamForm({ ...streamForm, threshold_count })}
              min={1}
              max={10}
              isIntegerOnly
            />
            <NumberInput
              label={t('admin.settings.streamTimeout.thresholdWindowMinutes')}
              description={t('admin.settings.streamTimeout.thresholdWindowMinutesHint')}
              value={streamForm.threshold_window_minutes}
              onChange={(threshold_window_minutes) => setStreamForm({ ...streamForm, threshold_window_minutes })}
              min={1}
              max={60}
              isIntegerOnly
            />
          </>
        )}
        <SaveButton isSaving={streamSaving} onClick={saveStreamSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.rectifier.title')}
        description={t('admin.settings.rectifier.description')}
        isLoading={rectifierLoading}
      >
        <CheckboxInput
          label={t('admin.settings.rectifier.enabled')}
          description={t('admin.settings.rectifier.enabledHint')}
          value={rectifierForm.enabled}
          onChange={(enabled) => setRectifierForm({ ...rectifierForm, enabled })}
        />
        {rectifierForm.enabled && (
          <>
            <CheckboxInput
              label={t('admin.settings.rectifier.thinkingSignature')}
              description={t('admin.settings.rectifier.thinkingSignatureHint')}
              value={rectifierForm.thinking_signature_enabled}
              onChange={(checked) => setRectifierForm({ ...rectifierForm, thinking_signature_enabled: checked })}
            />
            <CheckboxInput
              label={t('admin.settings.rectifier.thinkingBudget')}
              description={t('admin.settings.rectifier.thinkingBudgetHint')}
              value={rectifierForm.thinking_budget_enabled}
              onChange={(checked) => setRectifierForm({ ...rectifierForm, thinking_budget_enabled: checked })}
            />
            <CheckboxInput
              label={t('admin.settings.rectifier.apikeySignature')}
              description={t('admin.settings.rectifier.apikeySignatureHint')}
              value={rectifierForm.apikey_signature_enabled}
              onChange={(checked) => setRectifierForm({ ...rectifierForm, apikey_signature_enabled: checked })}
            />
          </>
        )}
        <SaveButton isSaving={rectifierSaving} onClick={saveRectifierSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.betaPolicy.title')}
        description={t('admin.settings.betaPolicy.description')}
        isLoading={betaPolicyLoading}
      >
        {betaPolicyForm.rules.map((rule, ruleIndex) => (
          <Card key={rule.beta_token} padding={4}>
            <VStack gap={4} hAlign="stretch">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Text weight="medium">{getBetaDisplayName(rule.beta_token)}</Text>
                <Text type="supporting" color="secondary">
                  <Code>{rule.beta_token}</Code>
                </Text>
              </HStack>
              <Grid columns={RULE_PAIR_COLUMNS} gap={4}>
                <Selector
                  label={t('admin.settings.betaPolicy.action')}
                  options={betaActionOptions}
                  value={rule.action}
                  onChange={(action) =>
                    updateBetaPolicyRule(ruleIndex, { action: action as BetaPolicyRule['action'] })
                  }
                  width="100%"
                />
                <Selector
                  label={t('admin.settings.betaPolicy.scope')}
                  options={betaScopeOptions}
                  value={rule.scope}
                  onChange={(scope) => updateBetaPolicyRule(ruleIndex, { scope: scope as BetaPolicyRule['scope'] })}
                  width="100%"
                />
              </Grid>
              {rule.action === 'block' && (
                <TextInput
                  label={t('admin.settings.betaPolicy.errorMessage')}
                  description={t('admin.settings.betaPolicy.errorMessageHint')}
                  value={rule.error_message || ''}
                  onChange={(error_message) => updateBetaPolicyRule(ruleIndex, { error_message })}
                  placeholder={t('admin.settings.betaPolicy.errorMessagePlaceholder')}
                />
              )}
              <ModelPatternList
                label={t('admin.settings.betaPolicy.modelWhitelist')}
                description={t('admin.settings.betaPolicy.modelWhitelistHint')}
                placeholder={t('admin.settings.betaPolicy.modelPatternPlaceholder')}
                addLabel={t('admin.settings.betaPolicy.addModelPattern')}
                removeLabel={t('common.remove')}
                patterns={rule.model_whitelist || []}
                onChange={(model_whitelist) => updateBetaPolicyRule(ruleIndex, { model_whitelist })}
                suggestionsLabel={`${t('admin.settings.betaPolicy.commonPatterns')}:`}
                suggestions={COMMON_MODEL_PATTERNS}
              />
              {hasTargetModels(rule.model_whitelist) && (
                <>
                  <Selector
                    label={t('admin.settings.betaPolicy.fallbackAction')}
                    description={t('admin.settings.betaPolicy.fallbackActionHint')}
                    options={betaActionOptions}
                    value={rule.fallback_action || 'pass'}
                    onChange={(action) =>
                      updateBetaPolicyRule(ruleIndex, {
                        fallback_action: action as BetaPolicyRule['fallback_action'],
                      })
                    }
                    width="100%"
                  />
                  {rule.fallback_action === 'block' && (
                    <TextInput
                      label={t('admin.settings.betaPolicy.errorMessage')}
                      description={t('admin.settings.betaPolicy.errorMessageHint')}
                      value={rule.fallback_error_message || ''}
                      onChange={(fallback_error_message) =>
                        updateBetaPolicyRule(ruleIndex, { fallback_error_message })
                      }
                      placeholder={t('admin.settings.betaPolicy.fallbackErrorMessagePlaceholder')}
                    />
                  )}
                </>
              )}
            </VStack>
          </Card>
        ))}
        <SaveButton isSaving={betaPolicySaving} onClick={saveBetaPolicySettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.openaiFastPolicy.title')}
        description={t('admin.settings.openaiFastPolicy.description')}
      >
        {openAIFastPolicyForm.rules.length === 0 ? (
          <EmptyState isCompact title={t('admin.settings.openaiFastPolicy.empty')} actions={addRuleButton} />
        ) : (
          <>
            {openAIFastPolicyForm.rules.map((rule, ruleIndex) => {
              const targetsModels = hasTargetModels(rule.model_whitelist)
              return (
                <Card key={ruleIndex} padding={4}>
                  <VStack gap={4} hAlign="stretch">
                    <HStack gap={2} vAlign="center">
                      <StackItem size="fill">
                        <Text weight="medium">
                          {t('admin.settings.openaiFastPolicy.ruleHeader', { index: ruleIndex + 1 })}
                        </Text>
                      </StackItem>
                      <IconButton
                        variant="ghost"
                        label={t('admin.settings.openaiFastPolicy.removeRule')}
                        tooltip={t('admin.settings.openaiFastPolicy.removeRule')}
                        icon={<Icon icon={TrashIcon} />}
                        onClick={() => removeOpenAIFastPolicyRule(ruleIndex)}
                      />
                    </HStack>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Text type="supporting">
                        {targetsModels
                          ? t('admin.settings.openaiFastPolicy.summaryTargetModels')
                          : t('admin.settings.openaiFastPolicy.summaryAllModels')}
                      </Text>
                      <Text type="supporting" color="secondary">
                        →
                      </Text>
                      <Token size="sm" color="blue" label={fastActionSummary(rule.action)} />
                      {targetsModels && (
                        <>
                          <Text type="supporting" color="secondary">
                            ·
                          </Text>
                          <Text type="supporting">{t('admin.settings.openaiFastPolicy.summaryOtherModels')}</Text>
                          <Text type="supporting" color="secondary">
                            →
                          </Text>
                          <Token size="sm" label={fastActionSummary(rule.fallback_action || 'pass')} />
                        </>
                      )}
                    </HStack>
                    <Grid columns={RULE_TRIPLE_COLUMNS} gap={4}>
                      <Selector
                        label={t('admin.settings.openaiFastPolicy.serviceTier')}
                        options={fastTierOptions}
                        value={rule.service_tier}
                        onChange={(tier) =>
                          updateOpenAIFastPolicyRule(ruleIndex, {
                            service_tier: tier as OpenAIFastPolicyRule['service_tier'],
                          })
                        }
                        width="100%"
                      />
                      <Selector
                        label={t('admin.settings.openaiFastPolicy.action')}
                        options={fastActionOptions}
                        value={rule.action}
                        onChange={(action) =>
                          updateOpenAIFastPolicyRule(ruleIndex, { action: action as OpenAIFastPolicyRule['action'] })
                        }
                        width="100%"
                      />
                      <Selector
                        label={t('admin.settings.openaiFastPolicy.scope')}
                        options={fastScopeOptions}
                        value={rule.scope}
                        onChange={(scope) =>
                          updateOpenAIFastPolicyRule(ruleIndex, { scope: scope as OpenAIFastPolicyRule['scope'] })
                        }
                        width="100%"
                      />
                    </Grid>
                    <OpenAIFastPolicyUserSelector
                      label={t('admin.settings.openaiFastPolicy.targetUsers')}
                      description={t('admin.settings.openaiFastPolicy.targetUsersHint')}
                      value={rule.user_ids || []}
                      onChange={(user_ids) => updateOpenAIFastPolicyRule(ruleIndex, { user_ids })}
                    />
                    {rule.action === 'block' && (
                      <TextInput
                        label={t('admin.settings.openaiFastPolicy.errorMessage')}
                        description={t('admin.settings.openaiFastPolicy.errorMessageHint')}
                        value={rule.error_message || ''}
                        onChange={(error_message) => updateOpenAIFastPolicyRule(ruleIndex, { error_message })}
                        placeholder={t('admin.settings.openaiFastPolicy.errorMessagePlaceholder')}
                      />
                    )}
                    <ModelPatternList
                      label={t('admin.settings.openaiFastPolicy.modelWhitelist')}
                      description={t('admin.settings.openaiFastPolicy.modelWhitelistHint')}
                      placeholder={t('admin.settings.openaiFastPolicy.modelPatternPlaceholder')}
                      addLabel={t('admin.settings.openaiFastPolicy.addModelPattern')}
                      removeLabel={t('common.remove')}
                      patterns={rule.model_whitelist || []}
                      onChange={(model_whitelist) => updateOpenAIFastPolicyRule(ruleIndex, { model_whitelist })}
                    />
                    {targetsModels && (
                      <>
                        <Selector
                          label={t('admin.settings.openaiFastPolicy.fallbackAction')}
                          description={t('admin.settings.openaiFastPolicy.fallbackActionHint')}
                          options={fastActionOptions}
                          value={rule.fallback_action || 'pass'}
                          onChange={(action) =>
                            updateOpenAIFastPolicyRule(ruleIndex, {
                              fallback_action: action as OpenAIFastPolicyRule['fallback_action'],
                            })
                          }
                          width="100%"
                        />
                        {rule.fallback_action === 'block' && (
                          <TextInput
                            label={t('admin.settings.openaiFastPolicy.errorMessage')}
                            value={rule.fallback_error_message || ''}
                            onChange={(fallback_error_message) =>
                              updateOpenAIFastPolicyRule(ruleIndex, { fallback_error_message })
                            }
                            placeholder={t('admin.settings.openaiFastPolicy.fallbackErrorMessagePlaceholder')}
                          />
                        )}
                      </>
                    )}
                  </VStack>
                </Card>
              )
            })}
            <HStack>{addRuleButton}</HStack>
          </>
        )}
        <Text type="supporting" color="secondary">
          {t('admin.settings.openaiFastPolicy.saveHint')}
        </Text>
        <SaveButton isSaving={openAIFastPolicySaving} onClick={saveOpenAIFastPolicySettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.claudeCode.title')}
        description={t('admin.settings.claudeCode.description')}
      >
        <TextInput
          label={t('admin.settings.claudeCode.minVersion')}
          description={t('admin.settings.claudeCode.minVersionHint')}
          value={gatewayForm.min_claude_code_version}
          onChange={(val) => setGatewayForm({ ...gatewayForm, min_claude_code_version: val })}
          placeholder={t('admin.settings.claudeCode.minVersionPlaceholder')}
        />
        <TextInput
          label={t('admin.settings.claudeCode.maxVersion')}
          description={t('admin.settings.claudeCode.maxVersionHint')}
          value={gatewayForm.max_claude_code_version}
          onChange={(val) => setGatewayForm({ ...gatewayForm, max_claude_code_version: val })}
          placeholder={t('admin.settings.claudeCode.maxVersionPlaceholder')}
        />
        <SaveButton isSaving={gatewaySaving} onClick={saveGatewaySettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection title={t('admin.settings.gatewayForwarding.codexHardeningTitle')}>
        <VStack gap={1}>
          <Heading level={3}>{t('admin.settings.gatewayForwarding.codexClientRestrictionTitle')}</Heading>
          <Text type="supporting" color="secondary">
            {t('admin.settings.gatewayForwarding.codexHardeningDesc')}
          </Text>
        </VStack>
        <Grid columns={RULE_PAIR_COLUMNS} gap={4}>
          <TextInput
            label={t('admin.settings.gatewayForwarding.minCodexVersion')}
            value={gatewayForm.min_codex_version}
            onChange={(val) => setGatewayForm({ ...gatewayForm, min_codex_version: val })}
            placeholder={t('admin.settings.gatewayForwarding.minCodexVersionPlaceholder')}
          />
          <TextInput
            label={t('admin.settings.gatewayForwarding.maxCodexVersion')}
            value={gatewayForm.max_codex_version}
            onChange={(val) => setGatewayForm({ ...gatewayForm, max_codex_version: val })}
            placeholder={t('admin.settings.gatewayForwarding.maxCodexVersionPlaceholder')}
          />
        </Grid>
        <Text type="supporting" color="secondary">
          {t('admin.settings.gatewayForwarding.codexVersionHint')}
        </Text>
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.codexAllowAppServer')}
          description={t('admin.settings.gatewayForwarding.codexAllowAppServerDesc')}
          value={gatewayForm.codex_cli_only_allow_app_server_clients}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, codex_cli_only_allow_app_server_clients: checked })}
        />
        <SaveButton isSaving={gatewaySaving} onClick={saveGatewaySettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.upstreamBillingProbe.title')}
        description={t('admin.settings.upstreamBillingProbe.description')}
        isLoading={upstreamBillingProbeLoading}
      >
        <CheckboxInput
          label={t('admin.settings.upstreamBillingProbe.enabled')}
          description={t('admin.settings.upstreamBillingProbe.enabledHint')}
          value={upstreamBillingProbeForm.enabled}
          onChange={(enabled) => setUpstreamBillingProbeForm({ ...upstreamBillingProbeForm, enabled })}
        />
        {upstreamBillingProbeForm.enabled && (
          <NumberInput
            label={t('admin.settings.upstreamBillingProbe.intervalMinutes')}
            description={t('admin.settings.upstreamBillingProbe.intervalHint')}
            value={upstreamBillingProbeForm.interval_minutes}
            onChange={(interval_minutes) =>
              setUpstreamBillingProbeForm({ ...upstreamBillingProbeForm, interval_minutes })
            }
            min={5}
            max={1440}
            isIntegerOnly
          />
        )}
        <SaveButton isSaving={upstreamBillingProbeSaving} onClick={saveUpstreamBillingProbeSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.ollamaCloudUsage.title')}
        description={t('admin.settings.ollamaCloudUsage.description')}
        isLoading={ollamaCloudUsageLoading}
      >
        <CheckboxInput
          label={t('admin.settings.ollamaCloudUsage.enabled')}
          description={t('admin.settings.ollamaCloudUsage.enabledHint')}
          value={ollamaCloudUsageForm.enabled}
          onChange={(enabled) => setOllamaCloudUsageForm({ ...ollamaCloudUsageForm, enabled })}
        />
        {ollamaCloudUsageForm.enabled && (
          <>
            <NumberInput
              label={t('admin.settings.ollamaCloudUsage.debounceMinutes')}
              description={t('admin.settings.ollamaCloudUsage.debounceHint')}
              value={ollamaCloudUsageForm.debounce_minutes}
              onChange={(debounce_minutes) => setOllamaCloudUsageForm({ ...ollamaCloudUsageForm, debounce_minutes })}
              min={1}
              max={60}
              isIntegerOnly
            />
            <NumberInput
              label={t('admin.settings.ollamaCloudUsage.intervalMinutes')}
              description={t('admin.settings.ollamaCloudUsage.intervalHint')}
              value={ollamaCloudUsageForm.interval_minutes}
              onChange={(interval_minutes) => setOllamaCloudUsageForm({ ...ollamaCloudUsageForm, interval_minutes })}
              min={15}
              max={1440}
              isIntegerOnly
            />
          </>
        )}
        <SaveButton isSaving={ollamaCloudUsageSaving} onClick={saveOllamaCloudUsageSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.opencodeGoUsage.title')}
        description={t('admin.settings.opencodeGoUsage.description')}
        isLoading={opencodeGoUsageLoading}
      >
        <CheckboxInput
          label={t('admin.settings.opencodeGoUsage.enabled')}
          description={t('admin.settings.opencodeGoUsage.enabledHint')}
          value={opencodeGoUsageForm.enabled}
          onChange={(enabled) => setOpencodeGoUsageForm({ ...opencodeGoUsageForm, enabled })}
        />
        {opencodeGoUsageForm.enabled && (
          <>
            <NumberInput
              label={t('admin.settings.opencodeGoUsage.debounceMinutes')}
              description={t('admin.settings.opencodeGoUsage.debounceHint')}
              value={opencodeGoUsageForm.debounce_minutes}
              onChange={(debounce_minutes) => setOpencodeGoUsageForm({ ...opencodeGoUsageForm, debounce_minutes })}
              min={1}
              max={60}
              isIntegerOnly
            />
            <NumberInput
              label={t('admin.settings.opencodeGoUsage.intervalMinutes')}
              description={t('admin.settings.opencodeGoUsage.intervalHint')}
              value={opencodeGoUsageForm.interval_minutes}
              onChange={(interval_minutes) => setOpencodeGoUsageForm({ ...opencodeGoUsageForm, interval_minutes })}
              min={5}
              max={1440}
              isIntegerOnly
            />
          </>
        )}
        <SaveButton isSaving={opencodeGoUsageSaving} onClick={saveOpencodeGoUsageSettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.scheduling.title')}
        description={t('admin.settings.scheduling.description')}
      >
        <CheckboxInput
          label={t('admin.settings.scheduling.allowUngroupedKey')}
          description={t('admin.settings.scheduling.allowUngroupedKeyHint')}
          value={gatewayForm.allow_ungrouped_key_scheduling}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, allow_ungrouped_key_scheduling: checked })}
        />
        {!gatewayForm.openai_advanced_scheduler_enabled && (
          <CheckboxInput
            label={t('admin.settings.openaiExperimentalScheduler.lowRatePriorityTitle')}
            description={t('admin.settings.openaiExperimentalScheduler.lowRatePriorityDescription')}
            value={gatewayForm.openai_low_upstream_rate_priority_enabled}
            onChange={(checked) =>
              setGatewayForm({ ...gatewayForm, openai_low_upstream_rate_priority_enabled: checked })
            }
          />
        )}
        {!gatewayForm.openai_advanced_scheduler_enabled && gatewayForm.openai_low_upstream_rate_priority_enabled && (
          <NumberInput
            label={t('admin.settings.openaiExperimentalScheduler.oauthRateTitle')}
            description={t('admin.settings.openaiExperimentalScheduler.oauthRatePriorityDescription')}
            value={gatewayForm.openai_oauth_scheduling_rate_multiplier}
            onChange={(value) => setGatewayForm({ ...gatewayForm, openai_oauth_scheduling_rate_multiplier: value })}
            min={0}
            step={0.01}
          />
        )}
        <CheckboxInput
          label={t('admin.settings.openaiExperimentalScheduler.title')}
          description={t('admin.settings.openaiExperimentalScheduler.description')}
          value={gatewayForm.openai_advanced_scheduler_enabled}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, openai_advanced_scheduler_enabled: checked })}
        />
        {gatewayForm.openai_advanced_scheduler_enabled && (
          <CheckboxInput
            label={t('admin.settings.openaiExperimentalScheduler.stickyWeightedTitle')}
            description={t('admin.settings.openaiExperimentalScheduler.stickyWeightedDescription')}
            value={gatewayForm.openai_advanced_scheduler_sticky_weighted_enabled}
            onChange={(checked) =>
              setGatewayForm({ ...gatewayForm, openai_advanced_scheduler_sticky_weighted_enabled: checked })
            }
          />
        )}
        <SaveButton isSaving={gatewaySaving} onClick={saveGatewaySettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.gatewayForwarding.title')}
        description={t('admin.settings.gatewayForwarding.description')}
      >
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.fingerprintUnification')}
          description={t('admin.settings.gatewayForwarding.fingerprintUnificationHint')}
          value={gatewayForm.enable_fingerprint_unification}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, enable_fingerprint_unification: checked })}
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.metadataPassthrough')}
          description={t('admin.settings.gatewayForwarding.metadataPassthroughHint')}
          value={gatewayForm.enable_metadata_passthrough}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, enable_metadata_passthrough: checked })}
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.cchSigning')}
          description={t('admin.settings.gatewayForwarding.cchSigningHint')}
          value={gatewayForm.enable_cch_signing}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, enable_cch_signing: checked })}
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.claudeOAuthSystemPromptInjection')}
          description={t('admin.settings.gatewayForwarding.claudeOAuthSystemPromptInjectionHint')}
          value={gatewayForm.enable_claude_oauth_system_prompt_injection}
          onChange={(checked) =>
            setGatewayForm({ ...gatewayForm, enable_claude_oauth_system_prompt_injection: checked })
          }
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.anthropicCacheTTL1hInjection')}
          description={t('admin.settings.gatewayForwarding.anthropicCacheTTL1hInjectionHint')}
          value={gatewayForm.enable_anthropic_cache_ttl_1h_injection}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, enable_anthropic_cache_ttl_1h_injection: checked })}
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.rewriteMessageCacheControl')}
          description={t('admin.settings.gatewayForwarding.rewriteMessageCacheControlHint')}
          value={gatewayForm.rewrite_message_cache_control}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, rewrite_message_cache_control: checked })}
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.clientDatelineNormalization')}
          description={t('admin.settings.gatewayForwarding.clientDatelineNormalizationHint')}
          value={gatewayForm.enable_client_dateline_normalization}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, enable_client_dateline_normalization: checked })}
        />
        <TextInput
          label={t('admin.settings.gatewayForwarding.claudeCodeClientVersion')}
          description={t('admin.settings.gatewayForwarding.claudeCodeClientVersionHint')}
          value={gatewayForm.claude_code_client_version}
          onChange={(val) => setGatewayForm({ ...gatewayForm, claude_code_client_version: val })}
          placeholder="2.1.280"
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.claudeCodeVersionAutoSync')}
          description={
            claudeSyncedVersionLabel
              ? `${t('admin.settings.gatewayForwarding.claudeCodeVersionAutoSyncHint')} ${claudeSyncedVersionLabel}`
              : t('admin.settings.gatewayForwarding.claudeCodeVersionAutoSyncHint')
          }
          value={gatewayForm.claude_code_version_auto_sync_enabled}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, claude_code_version_auto_sync_enabled: checked })}
        />
        <TextInput
          label={t('admin.settings.gatewayForwarding.openaiCodexUserAgent')}
          description={t('admin.settings.gatewayForwarding.openaiCodexUserAgentHint')}
          value={gatewayForm.openai_codex_user_agent}
          onChange={(val) => setGatewayForm({ ...gatewayForm, openai_codex_user_agent: val })}
          placeholder={t('admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder')}
        />
        <TextInput
          label={t('admin.settings.gatewayForwarding.openaiCodexClientVersion')}
          description={t('admin.settings.gatewayForwarding.openaiCodexClientVersionHint')}
          value={gatewayForm.openai_codex_client_version}
          onChange={(val) => setGatewayForm({ ...gatewayForm, openai_codex_client_version: val })}
          placeholder={t('admin.settings.gatewayForwarding.openaiCodexClientVersionPlaceholder')}
        />
        <CheckboxInput
          label={t('admin.settings.gatewayForwarding.openaiCodexVersionAutoSync')}
          description={
            codexSyncedVersionLabel
              ? `${t('admin.settings.gatewayForwarding.openaiCodexVersionAutoSyncHint')} ${codexSyncedVersionLabel}`
              : t('admin.settings.gatewayForwarding.openaiCodexVersionAutoSyncHint')
          }
          value={gatewayForm.openai_codex_version_auto_sync_enabled}
          onChange={(checked) => setGatewayForm({ ...gatewayForm, openai_codex_version_auto_sync_enabled: checked })}
        />
        <SaveButton isSaving={gatewaySaving} onClick={saveGatewaySettings} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.webSearchEmulation.title')}
        description={t('admin.settings.webSearchEmulation.description')}
      >
        <WebSearchEmulationCard />
      </SettingsSection>
    </VStack>
  )
}
