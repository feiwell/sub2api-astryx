import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { Token } from '@astryxdesign/core/Token'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { ArrowRightIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { AdminGroup, OpenAIEndpointCapability, Proxy } from '@/types'
import { getPresetMappingsByPlatform } from '@/composables/useModelWhitelist'
import { GROK_BASE_URL_PRESETS, validateHeaderOverrideRows } from '@/components/account/credentialsBuilder'
import { OPENAI_IMAGE_SIZE_TIERS, normalizeOpenAIImageSizeTiers, type OpenAIImageSizeTier } from '@/components/account/openaiImageSizeTiers'
import {
  OPENAI_WS_MODE_CTX_POOL,
  OPENAI_WS_MODE_HTTP_BRIDGE,
  OPENAI_WS_MODE_OFF,
  OPENAI_WS_MODE_PASSTHROUGH,
  resolveOpenAIWSModeHintKey,
  type OpenAIWSMode,
} from '@/utils/openaiWsMode'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { GroupPicker, ProxyPicker } from './AccountPickers'
import { HeaderOverrideRowsEditor } from './HeaderOverrideRowsEditor'
import { ModelWhitelistField } from './ModelWhitelistField'
import {
  buildBulkUpdatePayload,
  createBulkEditForm,
  createEnabledFields,
  hasAnyBulkFieldEnabled,
  isOpenAIModelRestrictionDisabled,
  isOpenAIResponsesModeApplicable,
  isOpenAITextGenerationEnabled,
  nextRowKey,
  normalizeOpenAIEndpointCapabilities,
  resolveBulkEditCapabilities,
  type BulkEditForm,
  type BulkEditTarget,
  type BulkEnabledFields,
  type BulkFieldKey,
  type CodexFingerprintMode,
  type KeyedModelMapping,
  type RpmStrategy,
} from './bulkEditPayload'

// Common HTTP error codes offered as one-click toggles
const COMMON_ERROR_CODES = [
  { value: 401, label: 'Unauthorized' },
  { value: 403, label: 'Forbidden' },
  { value: 429, label: 'Rate Limit' },
  { value: 500, label: 'Server Error' },
  { value: 502, label: 'Bad Gateway' },
  { value: 503, label: 'Unavailable' },
  { value: 529, label: 'Overloaded' },
]

interface FieldSectionProps {
  title: string
  description?: string
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  hasDivider?: boolean
  children?: ReactNode
}

/** One editable field: title/description, the "apply this field" checkbox, then its controls. */
function FieldSection({ title, description, enabled, onEnabledChange, hasDivider = true, children }: FieldSectionProps) {
  return (
    <VStack gap={3} hAlign="stretch">
      {hasDivider && <Divider />}
      <HStack gap={4} vAlign="start">
        <StackItem size="fill">
          <VStack gap={1}>
            <Text weight="medium">{title}</Text>
            {description && <Text type="supporting">{description}</Text>}
          </VStack>
        </StackItem>
        <CheckboxInput label={title} isLabelHidden value={enabled} onChange={onEnabledChange} />
      </HStack>
      {children}
    </VStack>
  )
}

interface MappingRowsProps {
  rows: KeyedModelMapping[]
  onChange: (rows: KeyedModelMapping[]) => void
  fromPlaceholder: string
  toPlaceholder: string
  isDisabled?: boolean
}

/** Editable "from → to" model mapping rows. */
function MappingRows({ rows, onChange, fromPlaceholder, toPlaceholder, isDisabled }: MappingRowsProps) {
  const { t } = useI18n()
  const updateRow = (key: number, patch: Partial<KeyedModelMapping>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  return (
    <VStack gap={2} hAlign="stretch">
      {rows.map((row) => (
        <HStack key={row.key} gap={2} vAlign="center">
          <StackItem size="fill">
            <TextInput
              label={fromPlaceholder}
              isLabelHidden
              placeholder={fromPlaceholder}
              value={row.from}
              onChange={(from) => updateRow(row.key, { from })}
              isDisabled={isDisabled}
            />
          </StackItem>
          <Icon icon={ArrowRightIcon} color="secondary" />
          <StackItem size="fill">
            <TextInput
              label={toPlaceholder}
              isLabelHidden
              placeholder={toPlaceholder}
              value={row.to}
              onChange={(to) => updateRow(row.key, { to })}
              isDisabled={isDisabled}
            />
          </StackItem>
          <IconButton
            icon={<Icon icon={TrashIcon} />}
            label={t('common.delete')}
            variant="ghost"
            isDisabled={isDisabled}
            onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
          />
        </HStack>
      ))}
      <Button
        label={t('admin.accounts.addMapping')}
        icon={<Icon icon={PlusIcon} />}
        width="100%"
        isDisabled={isDisabled}
        onClick={() => onChange([...rows, { key: nextRowKey(), from: '', to: '' }])}
      />
    </VStack>
  )
}

interface BulkEditAccountsDialogProps {
  isOpen: boolean
  target: BulkEditTarget | null
  onClose: () => void
  /** Called after at least one account was updated; the caller closes the dialog and reloads. */
  onUpdated: () => void
}

/**
 * Bulk edit accounts (port of BulkEditAccountModal.vue). Every field has its
 * own "apply" checkbox and only checked fields are sent; platform/type
 * specific sections appear only when all targets support them. Targets are
 * either the selected account ids or the current list filters.
 */
export function BulkEditAccountsDialog({ isOpen, target, onClose, onUpdated }: BulkEditAccountsDialogProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<BulkEditForm>(createBulkEditForm)
  const [enabled, setEnabled] = useState<BulkEnabledFields>(createEnabledFields)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [mixedChannel, setMixedChannel] = useState<{ message: string; pending: Record<string, unknown> } | null>(null)
  const [pendingErrorCode, setPendingErrorCode] = useState<{ code: number; fromInput: boolean } | null>(null)
  // Once the risk is confirmed, every retry in this session carries the flag
  const mixedChannelConfirmed = useRef(false)

  const platforms = useMemo(() => target?.selectedPlatforms ?? [], [target])
  const types = useMemo(() => target?.selectedTypes ?? [], [target])
  const caps = useMemo(() => resolveBulkEditCapabilities(platforms, types), [platforms, types])
  const targetCount = target ? (target.mode === 'filtered' ? target.previewCount : target.accountIds.length) : 0

  // Fresh form, plus the proxy/group choices, every time the dialog opens
  useEffect(() => {
    if (!isOpen) return
    setForm(createBulkEditForm())
    setEnabled(createEnabledFields())
    setMixedChannel(null)
    setPendingErrorCode(null)
    mixedChannelConfirmed.current = false
    let cancelled = false
    void Promise.allSettled([adminAPI.proxies.getAll(), adminAPI.groups.getAll()]).then(([proxiesResult, groupsResult]) => {
      if (cancelled) return
      if (proxiesResult.status === 'fulfilled') setProxies(proxiesResult.value)
      else console.error('Failed to load proxies:', proxiesResult.reason)
      if (groupsResult.status === 'fulfilled') setGroups(groupsResult.value)
      else console.error('Failed to load groups:', groupsResult.reason)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const patch = (next: Partial<BulkEditForm>) => setForm((prev) => ({ ...prev, ...next }))
  const toggle = (key: BulkFieldKey) => (value: boolean) => setEnabled((prev) => ({ ...prev, [key]: value }))

  // Model mapping presets of every target platform, de-duplicated
  const filteredPresets = useMemo(() => {
    const deduped = new Map<string, ReturnType<typeof getPresetMappingsByPlatform>[number]>()
    for (const platform of platforms) {
      for (const preset of getPresetMappingsByPlatform(platform)) {
        const key = `${preset.from}=>${preset.to}`
        if (!deduped.has(key)) deduped.set(key, preset)
      }
    }
    return Array.from(deduped.values())
  }, [platforms])

  const modelRestrictionDisabled = isOpenAIModelRestrictionDisabled(form, enabled, caps)
  const textGenerationEnabled = isOpenAITextGenerationEnabled(form)
  const responsesModeApplicable = isOpenAIResponsesModeApplicable(form, enabled)
  const oauthWSModeHintKey = resolveOpenAIWSModeHintKey(form.openaiOAuthWSMode)
  const apiKeyWSModeHintKey = resolveOpenAIWSModeHintKey(form.openaiAPIKeyWSMode)

  const statusOptions = [
    { value: 'active', label: t('common.active') },
    { value: 'inactive', label: t('common.inactive') },
  ]
  const probeOptions = [
    { value: 'enabled', label: t('common.enabled') },
    { value: 'disabled', label: t('common.disabled') },
  ]
  const wsModeOptions = [
    { value: OPENAI_WS_MODE_OFF, label: t('admin.accounts.openai.wsModeOff') },
    { value: OPENAI_WS_MODE_CTX_POOL, label: t('admin.accounts.openai.wsModeCtxPool') },
    { value: OPENAI_WS_MODE_PASSTHROUGH, label: t('admin.accounts.openai.wsModePassthrough') },
    { value: OPENAI_WS_MODE_HTTP_BRIDGE, label: t('admin.accounts.openai.wsModeHttpBridge') },
  ]
  const compactModeOptions = [
    { value: 'auto', label: t('admin.accounts.openai.compactModeAuto') },
    { value: 'force_on', label: t('admin.accounts.openai.compactModeForceOn') },
    { value: 'force_off', label: t('admin.accounts.openai.compactModeForceOff') },
  ]
  const responsesModeOptions = [
    { value: 'auto', label: t('admin.accounts.openai.responsesModeAuto') },
    { value: 'force_responses', label: t('admin.accounts.openai.responsesModeForceResponses') },
    { value: 'force_chat_completions', label: t('admin.accounts.openai.responsesModeForceChatCompletions') },
  ]
  const fingerprintModeOptions = [
    { value: 'off', label: t('admin.accounts.openai.codexFingerprintOff') },
    { value: 'device', label: t('admin.accounts.openai.codexFingerprintDevice') },
    { value: 'session', label: t('admin.accounts.openai.codexFingerprintSession') },
    { value: 'full', label: t('admin.accounts.openai.codexFingerprintFull') },
  ]
  const umqModeOptions = [
    { value: '', label: t('admin.accounts.quotaControl.rpmLimit.umqModeOff') },
    { value: 'throttle', label: t('admin.accounts.quotaControl.rpmLimit.umqModeThrottle') },
    { value: 'serialize', label: t('admin.accounts.quotaControl.rpmLimit.umqModeSerialize') },
  ]
  const textCapabilityLabel =
    form.openAIResponsesMode === 'force_responses'
      ? t('admin.accounts.openai.capabilityResponses')
      : form.openAIResponsesMode === 'force_chat_completions'
        ? t('admin.accounts.openai.capabilityChatCompletions')
        : t('admin.accounts.openai.capabilityTextAuto')
  const endpointCapabilityOptions: Array<{ value: OpenAIEndpointCapability; label: string }> = [
    { value: 'chat_completions', label: textCapabilityLabel },
    { value: 'embeddings', label: t('admin.accounts.openai.capabilityEmbeddings') },
    { value: 'seedance', label: 'Seedance (Ark)' },
  ]

  const toggleEndpointCapability = (capability: OpenAIEndpointCapability, checked: boolean) =>
    setForm((prev) => {
      const current = prev.openAIEndpointCapabilities
      if (current.includes(capability) && !checked) {
        // At least one capability stays selected
        if (current.length <= 1) return prev
        const next = current.filter((value) => value !== capability)
        return {
          ...prev,
          openAIEndpointCapabilities: next,
          openAIResponsesMode: next.includes('chat_completions') ? prev.openAIResponsesMode : 'auto',
        }
      }
      if (!current.includes(capability) && checked) {
        return { ...prev, openAIEndpointCapabilities: normalizeOpenAIEndpointCapabilities([...current, capability]) }
      }
      return prev
    })

  const toggleImageSizeTier = (tier: OpenAIImageSizeTier, checked: boolean) =>
    setForm((prev) => {
      const current = prev.openAIImageSizeTiers
      if (!checked && current.length === 1 && current[0] === tier) return prev
      const next = checked ? [...current, tier] : current.filter((item) => item !== tier)
      return { ...prev, openAIImageSizeTiers: normalizeOpenAIImageSizeTiers(next) }
    })

  const addPresetMapping = (from: string, to: string) => {
    if (form.modelMappings.some((mapping) => mapping.from === from)) {
      toast.warning(t('admin.accounts.mappingExists', { model: from }))
      return
    }
    patch({ modelMappings: [...form.modelMappings, { key: nextRowKey(), from, to }] })
  }

  const commitErrorCode = (code: number, fromInput: boolean) =>
    setForm((prev) => ({
      ...prev,
      selectedErrorCodes: prev.selectedErrorCodes.includes(code) ? prev.selectedErrorCodes : [...prev.selectedErrorCodes, code],
      ...(fromInput ? { customErrorCodeInput: '' } : {}),
    }))

  // 429 and 529 drive the scheduler's own back-off, so adding them needs an explicit confirmation
  const requestErrorCode = (code: number, fromInput: boolean) => {
    if (code === 429 || code === 529) {
      setPendingErrorCode({ code, fromInput })
      return
    }
    commitErrorCode(code, fromInput)
  }

  const toggleErrorCode = (code: number) => {
    if (form.selectedErrorCodes.includes(code)) {
      patch({ selectedErrorCodes: form.selectedErrorCodes.filter((item) => item !== code) })
      return
    }
    requestErrorCode(code, false)
  }

  const addCustomErrorCode = () => {
    const raw = form.customErrorCodeInput.trim()
    const code = raw ? Number(raw) : NaN
    if (!Number.isInteger(code) || code < 100 || code > 599) {
      toast.error(t('admin.accounts.invalidErrorCode'))
      return
    }
    if (form.selectedErrorCodes.includes(code)) {
      toast.warning(t('admin.accounts.errorCodeExists'))
      return
    }
    requestErrorCode(code, true)
  }

  const resetSubmitState = () => {
    setMixedChannel(null)
    mixedChannelConfirmed.current = false
  }

  const handleClose = () => {
    resetSubmitState()
    onClose()
  }

  // Pre-check only when groups change and every target is a single anthropic/antigravity
  // platform; mixed-platform targets fall back to the backend's 409 below.
  const canPreCheck = () =>
    enabled.groups &&
    form.groupIds.length > 0 &&
    platforms.length === 1 &&
    (platforms[0] === 'antigravity' || platforms[0] === 'anthropic')

  // Returns false when the user must confirm a mixed-channel risk first
  const preCheckMixedChannelRisk = async (built: Record<string, unknown>): Promise<boolean> => {
    if (!canPreCheck() || mixedChannelConfirmed.current) return true
    try {
      const result = await adminAPI.accounts.checkMixedChannelRisk({ platform: platforms[0], group_ids: form.groupIds })
      if (!result.has_risk) return true
      setMixedChannel({ message: result.message || t('admin.accounts.bulkEdit.failed'), pending: built })
      return false
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.accounts.bulkEdit.failed'))
      return false
    }
  }

  const submitBulkUpdate = async (baseUpdates: Record<string, unknown>) => {
    if (!target) return
    const updates = mixedChannelConfirmed.current ? { ...baseUpdates, confirm_mixed_channel_risk: true } : baseUpdates
    setSubmitting(true)
    try {
      const res =
        target.mode === 'filtered'
          ? await adminAPI.accounts.bulkUpdate({ filters: target.filters, ...updates })
          : await adminAPI.accounts.bulkUpdate(target.accountIds, updates)
      const success = res.success || 0
      const failed = res.failed || 0
      const inherited = res.long_context_inherited_count || 0

      if (success > 0 && failed === 0) {
        toast.success(
          inherited > 0
            ? t('admin.accounts.bulkEdit.successWithInherited', { count: success, inherited })
            : t('admin.accounts.bulkEdit.success', { count: success }),
        )
      } else if (success > 0) {
        const key = inherited > 0 ? 'admin.accounts.bulkEdit.partialSuccessWithInherited' : 'admin.accounts.bulkEdit.partialSuccess'
        toast.error(t(key, { success, failed, inherited }))
      } else {
        toast.error(t('admin.accounts.bulkEdit.failed'))
      }

      if (success > 0) {
        resetSubmitState()
        onUpdated()
      }
    } catch (error) {
      const err = error as { status?: number; error?: string; message?: string; reason?: string; metadata?: Record<string, unknown> }
      if (err.status === 409 && err.error === 'mixed_channel_warning') {
        // Mixed-platform targets skip the pre-check; the backend asks for confirmation instead
        setMixedChannel({ message: err.message || '', pending: baseUpdates })
      } else if (err.reason === 'UPSTREAM_BILLING_RATE_SYNC_BULK_CONFLICT') {
        toast.error(t('admin.accounts.bulkEdit.rateSyncConflict', { count: err.metadata?.count ?? 1 }))
      } else if (err.reason === 'OPENAI_LONG_CONTEXT_PARENT_REQUIRED') {
        toast.error(t('admin.accounts.bulkEdit.longContextParentRequired'))
      } else {
        toast.error(err.message || t('admin.accounts.bulkEdit.failed'))
        console.error('Error bulk updating accounts:', error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!target) return
    if (target.mode === 'selected' && target.accountIds.length === 0) {
      toast.error(t('admin.accounts.bulkEdit.noSelection'))
      return
    }
    if (!hasAnyBulkFieldEnabled(form, enabled, caps)) {
      toast.error(t('admin.accounts.bulkEdit.noFieldsSelected'))
      return
    }
    // base_url also drives the Grok OAuth forwarding endpoint, so a bad value is rejected up front
    if (enabled.baseUrl) {
      const trimmedBaseUrl = form.baseUrl.trim()
      if (trimmedBaseUrl && !/^https?:\/\//i.test(trimmedBaseUrl)) {
        toast.error(t('admin.accounts.grokCustomBaseUrl.invalid'))
        return
      }
    }
    if (enabled.headerOverride && form.headerOverrideEnabled) {
      // Bulk save replaces header_overrides wholesale: enabled with no named row would silently wipe them
      if (!form.headerOverrideRows.some((row) => row.name.trim())) {
        toast.error(t('admin.accounts.headerOverride.bulkEmptyRows'))
        return
      }
      const headerError = validateHeaderOverrideRows(form.headerOverrideRows)
      if (headerError) {
        toast.error(t(`admin.accounts.headerOverride.${headerError}`))
        return
      }
    }
    const built = buildBulkUpdatePayload(form, enabled, caps)
    if (!built) {
      toast.error(t('admin.accounts.bulkEdit.noFieldsSelected'))
      return
    }
    if (!(await preCheckMixedChannelRisk(built))) return
    await submitBulkUpdate(built)
  }

  const handleMixedChannelConfirm = async () => {
    const pending = mixedChannel?.pending
    setMixedChannel(null)
    mixedChannelConfirmed.current = true
    if (pending) await submitBulkUpdate(pending)
  }

  const presetLabel = (preset: (typeof GROK_BASE_URL_PRESETS)[number]) =>
    preset.label ?? t(`admin.accounts.grokCustomBaseUrl.presets.${preset.labelKey}`)

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={880} maxHeight="85dvh" purpose="form">
        <Layout
          header={<DialogHeader title={t('admin.accounts.bulkEdit.title')} onOpenChange={(open) => !open && handleClose()} />}
          content={
            <LayoutContent isScrollable>
              <VStack gap={5} hAlign="stretch">
                <Banner status="info" title={t('admin.accounts.bulkEdit.selectionInfo', { count: targetCount })} />
                {caps.isMixedPlatform && (
                  <Banner
                    status="warning"
                    title={t('admin.accounts.bulkEdit.mixedPlatformWarning', { platforms: platforms.join(', ') })}
                  />
                )}

                {/* OpenAI passthrough */}
                {caps.allOpenAIPassthroughCapable && (
                  <FieldSection
                    title={t('admin.accounts.openai.oauthPassthrough')}
                    description={t('admin.accounts.openai.oauthPassthroughDesc')}
                    enabled={enabled.openaiPassthrough}
                    onEnabledChange={toggle('openaiPassthrough')}
                  >
                    <Switch
                      label={t('admin.accounts.openai.oauthPassthrough')}
                      isLabelHidden
                      value={form.openaiPassthroughEnabled}
                      onChange={(value) => patch({ openaiPassthroughEnabled: value })}
                      isDisabled={!enabled.openaiPassthrough}
                    />
                  </FieldSection>
                )}

                {/* OpenAI Codex namespace tool flattening (OAuth only) */}
                {caps.allOpenAIOAuthOnly && (
                  <FieldSection
                    title={t('admin.accounts.openai.flattenNamespaces')}
                    description={t('admin.accounts.openai.flattenNamespacesDesc')}
                    enabled={enabled.openaiFlattenNamespaces}
                    onEnabledChange={toggle('openaiFlattenNamespaces')}
                  >
                    <Switch
                      label={t('admin.accounts.openai.flattenNamespaces')}
                      isLabelHidden
                      value={form.openaiFlattenNamespacesEnabled}
                      onChange={(value) => patch({ openaiFlattenNamespacesEnabled: value })}
                      isDisabled={!enabled.openaiFlattenNamespaces}
                    />
                  </FieldSection>
                )}

                {/* OpenAI API long-context billing */}
                {caps.allOpenAIPassthroughCapable && (
                  <FieldSection
                    title={t('admin.accounts.openai.longContextBilling')}
                    description={t('admin.accounts.openai.longContextBillingDesc')}
                    enabled={enabled.openaiLongContextBilling}
                    onEnabledChange={toggle('openaiLongContextBilling')}
                  >
                    <Switch
                      label={t('admin.accounts.openai.longContextBilling')}
                      isLabelHidden
                      value={form.openAILongContextBillingEnabled}
                      onChange={(value) => patch({ openAILongContextBillingEnabled: value })}
                      isDisabled={!enabled.openaiLongContextBilling}
                    />
                    <Banner status="warning" title={t('admin.accounts.bulkEdit.longContextShadowHint')} />
                  </FieldSection>
                )}

                {/* OpenAI images: size tier routing */}
                {caps.allOpenAIPassthroughCapable && (
                  <FieldSection
                    title={t('admin.accounts.openai.imageSizeTiers')}
                    enabled={enabled.openaiImageSizeTiers}
                    onEnabledChange={toggle('openaiImageSizeTiers')}
                  >
                    <Grid columns={3} gap={2}>
                      {OPENAI_IMAGE_SIZE_TIERS.map((tier) => {
                        const isLast = form.openAIImageSizeTiers.length === 1 && form.openAIImageSizeTiers[0] === tier
                        return (
                          <CheckboxInput
                            key={tier}
                            label={tier}
                            value={form.openAIImageSizeTiers.includes(tier)}
                            onChange={(checked) => toggleImageSizeTier(tier, checked)}
                            isDisabled={!enabled.openaiImageSizeTiers || isLast}
                            disabledMessage={enabled.openaiImageSizeTiers && isLast ? t('admin.accounts.openai.imageSizeTiersAtLeastOne') : undefined}
                          />
                        )
                      })}
                    </Grid>
                    <Text type="supporting">{t('admin.accounts.openai.imageSizeTiersDesc')}</Text>
                  </FieldSection>
                )}

                {/* Base URL (API key accounts and the Grok OAuth forwarding endpoint) */}
                <FieldSection title={t('admin.accounts.baseUrl')} enabled={enabled.baseUrl} onEnabledChange={toggle('baseUrl')}>
                  <TextInput
                    label={t('admin.accounts.baseUrl')}
                    isLabelHidden
                    placeholder={t('admin.accounts.bulkEdit.baseUrlPlaceholder')}
                    value={form.baseUrl}
                    onChange={(baseUrl) => patch({ baseUrl })}
                    isDisabled={!enabled.baseUrl}
                  />
                  {caps.allTargetsGrok && (
                    <HStack gap={2} wrap="wrap">
                      {GROK_BASE_URL_PRESETS.map((preset) => (
                        <Button
                          key={preset.url}
                          size="sm"
                          variant="ghost"
                          label={`${presetLabel(preset)} (${preset.url.replace(/^https?:\/\//i, '')})`}
                          onClick={() => {
                            patch({ baseUrl: preset.url })
                            toggle('baseUrl')(true)
                          }}
                        />
                      ))}
                    </HStack>
                  )}
                  <Text type="supporting">{t('admin.accounts.bulkEdit.baseUrlNotice')}</Text>
                </FieldSection>

                {/* Model restriction */}
                <FieldSection
                  title={t('admin.accounts.modelRestriction')}
                  enabled={enabled.modelRestriction}
                  onEnabledChange={toggle('modelRestriction')}
                >
                  {modelRestrictionDisabled ? (
                    <Banner status="warning" title={t('admin.accounts.openai.modelRestrictionDisabledByPassthrough')} />
                  ) : (
                    <VStack gap={3} hAlign="stretch">
                      <SegmentedControl
                        label={t('admin.accounts.modelRestriction')}
                        value={form.modelRestrictionMode}
                        onChange={(mode) => patch({ modelRestrictionMode: mode === 'mapping' ? 'mapping' : 'whitelist' })}
                        layout="fill"
                        isDisabled={!enabled.modelRestriction}
                      >
                        <SegmentedControlItem value="whitelist" label={t('admin.accounts.modelWhitelist')} />
                        <SegmentedControlItem value="mapping" label={t('admin.accounts.modelMapping')} />
                      </SegmentedControl>
                      {form.modelRestrictionMode === 'whitelist' ? (
                        <VStack gap={3} hAlign="stretch">
                          <Banner status="info" title={t('admin.accounts.selectAllowedModels')} />
                          <ModelWhitelistField
                            value={form.allowedModels}
                            onChange={(allowedModels) => patch({ allowedModels })}
                            modelMappings={form.modelMappings}
                            platforms={platforms}
                            isDisabled={!enabled.modelRestriction}
                          />
                          <Text type="supporting">
                            {t('admin.accounts.selectedModels', { count: form.allowedModels.length })}
                            {form.allowedModels.length === 0 && ` ${t('admin.accounts.supportsAllModels')}`}
                          </Text>
                        </VStack>
                      ) : (
                        <VStack gap={3} hAlign="stretch">
                          <Banner status="info" title={t('admin.accounts.mapRequestModels')} />
                          <MappingRows
                            rows={form.modelMappings}
                            onChange={(modelMappings) => patch({ modelMappings })}
                            fromPlaceholder={t('admin.accounts.requestModel')}
                            toPlaceholder={t('admin.accounts.actualModel')}
                            isDisabled={!enabled.modelRestriction}
                          />
                          <HStack gap={2} wrap="wrap">
                            {filteredPresets.map((preset) => (
                              <Button
                                key={preset.label}
                                size="sm"
                                variant="ghost"
                                label={`+ ${preset.label}`}
                                isDisabled={!enabled.modelRestriction}
                                onClick={() => addPresetMapping(preset.from, preset.to)}
                              />
                            ))}
                          </HStack>
                        </VStack>
                      )}
                    </VStack>
                  )}
                </FieldSection>

                {/* Custom error codes */}
                <FieldSection
                  title={t('admin.accounts.customErrorCodes')}
                  description={t('admin.accounts.customErrorCodesHint')}
                  enabled={enabled.customErrorCodes}
                  onEnabledChange={toggle('customErrorCodes')}
                >
                  {enabled.customErrorCodes && (
                    <VStack gap={3} hAlign="stretch">
                      <Banner status="warning" title={t('admin.accounts.customErrorCodesWarning')} />
                      <HStack gap={2} wrap="wrap">
                        {COMMON_ERROR_CODES.map((code) => (
                          <ToggleButton
                            key={code.value}
                            size="sm"
                            label={`${code.value} ${code.label}`}
                            isPressed={form.selectedErrorCodes.includes(code.value)}
                            onPressedChange={() => toggleErrorCode(code.value)}
                          />
                        ))}
                      </HStack>
                      <HStack gap={2} vAlign="center">
                        <StackItem size="fill">
                          <TextInput
                            label={t('admin.accounts.customErrorCodes')}
                            isLabelHidden
                            inputMode="numeric"
                            placeholder={t('admin.accounts.enterErrorCode')}
                            value={form.customErrorCodeInput}
                            onChange={(customErrorCodeInput) => patch({ customErrorCodeInput })}
                            onEnter={addCustomErrorCode}
                          />
                        </StackItem>
                        <IconButton icon={<Icon icon={PlusIcon} />} label={t('common.add')} onClick={addCustomErrorCode} />
                      </HStack>
                      <HStack gap={1.5} wrap="wrap" vAlign="center">
                        {[...form.selectedErrorCodes]
                          .sort((a, b) => a - b)
                          .map((code) => (
                            <Token
                              key={code}
                              label={String(code)}
                              color="red"
                              size="sm"
                              onRemove={() => patch({ selectedErrorCodes: form.selectedErrorCodes.filter((item) => item !== code) })}
                            />
                          ))}
                        {form.selectedErrorCodes.length === 0 && (
                          <Text type="supporting">{t('admin.accounts.noneSelectedUsesDefault')}</Text>
                        )}
                      </HStack>
                    </VStack>
                  )}
                </FieldSection>

                {/* Intercept warmup requests (Anthropic only) */}
                <FieldSection
                  title={t('admin.accounts.interceptWarmupRequests')}
                  description={t('admin.accounts.interceptWarmupRequestsDesc')}
                  enabled={enabled.interceptWarmup}
                  onEnabledChange={toggle('interceptWarmup')}
                >
                  {enabled.interceptWarmup && (
                    <Switch
                      label={t('admin.accounts.interceptWarmupRequests')}
                      isLabelHidden
                      value={form.interceptWarmupRequests}
                      onChange={(value) => patch({ interceptWarmupRequests: value })}
                    />
                  )}
                </FieldSection>

                {/* Header override (eligible API-key platforms + grok OAuth) */}
                {caps.allHeaderOverrideCapable && (
                  <FieldSection
                    title={t('admin.accounts.headerOverride.title')}
                    description={t('admin.accounts.headerOverride.hint')}
                    enabled={enabled.headerOverride}
                    onEnabledChange={toggle('headerOverride')}
                  >
                    {enabled.headerOverride && (
                      <VStack gap={3} hAlign="stretch">
                        <Switch
                          label={t('admin.accounts.headerOverride.title')}
                          isLabelHidden
                          value={form.headerOverrideEnabled}
                          onChange={(value) => patch({ headerOverrideEnabled: value })}
                        />
                        {form.headerOverrideEnabled ? (
                          <VStack gap={3} hAlign="stretch">
                            <Banner status="info" title={t('admin.accounts.headerOverride.info')} />
                            <Banner status="warning" title={t('admin.accounts.headerOverride.bulkReplaceHint')} />
                            <HeaderOverrideRowsEditor
                              rows={form.headerOverrideRows}
                              onChange={(headerOverrideRows) => patch({ headerOverrideRows })}
                            />
                          </VStack>
                        ) : (
                          <Text type="supporting">{t('admin.accounts.headerOverride.bulkDisableHint')}</Text>
                        )}
                      </VStack>
                    )}
                  </FieldSection>
                )}

                {/* Proxy */}
                <FieldSection title={t('admin.accounts.proxy')} enabled={enabled.proxy} onEnabledChange={toggle('proxy')}>
                  <ProxyPicker
                    label={t('admin.accounts.proxy')}
                    value={form.proxyId}
                    onChange={(proxyId) => patch({ proxyId })}
                    proxies={proxies}
                    isDisabled={!enabled.proxy}
                  />
                </FieldSection>

                {/* Concurrency, load factor, priority and rate multiplier */}
                <VStack gap={3} hAlign="stretch">
                  <Divider />
                  <Grid columns={{ minWidth: 180, max: 4 }} gap={4}>
                    <FieldSection
                      title={t('admin.accounts.concurrency')}
                      enabled={enabled.concurrency}
                      onEnabledChange={toggle('concurrency')}
                      hasDivider={false}
                    >
                      <NumberInput
                        label={t('admin.accounts.concurrency')}
                        isLabelHidden
                        value={form.concurrency}
                        onChange={(value) => patch({ concurrency: Math.max(1, value || 1) })}
                        min={1}
                        isIntegerOnly
                        isDisabled={!enabled.concurrency}
                      />
                    </FieldSection>
                    <FieldSection
                      title={t('admin.accounts.loadFactor')}
                      enabled={enabled.loadFactor}
                      onEnabledChange={toggle('loadFactor')}
                      hasDivider={false}
                    >
                      <NumberInput
                        label={t('admin.accounts.loadFactor')}
                        isLabelHidden
                        description={t('admin.accounts.loadFactorHint')}
                        value={form.loadFactor}
                        onChange={(value: number | null) => patch({ loadFactor: value && value >= 1 ? value : null })}
                        min={1}
                        hasClear
                        isDisabled={!enabled.loadFactor}
                      />
                    </FieldSection>
                    <FieldSection
                      title={t('admin.accounts.priority')}
                      enabled={enabled.priority}
                      onEnabledChange={toggle('priority')}
                      hasDivider={false}
                    >
                      <NumberInput
                        label={t('admin.accounts.priority')}
                        isLabelHidden
                        value={form.priority}
                        onChange={(priority) => patch({ priority })}
                        min={1}
                        isIntegerOnly
                        isDisabled={!enabled.priority}
                      />
                    </FieldSection>
                    <FieldSection
                      title={t('admin.accounts.billingRateMultiplier')}
                      enabled={enabled.rateMultiplier}
                      onEnabledChange={toggle('rateMultiplier')}
                      hasDivider={false}
                    >
                      <NumberInput
                        label={t('admin.accounts.billingRateMultiplier')}
                        isLabelHidden
                        description={t('admin.accounts.billingRateMultiplierHint')}
                        value={form.rateMultiplier}
                        onChange={(rateMultiplier) => patch({ rateMultiplier })}
                        min={0}
                        step={0.01}
                        isDisabled={!enabled.rateMultiplier}
                      />
                      {enabled.rateMultiplier && <Banner status="warning" title={t('admin.accounts.bulkEdit.rateSyncWarning')} />}
                    </FieldSection>
                  </Grid>
                </VStack>

                {/* Status */}
                <FieldSection title={t('common.status')} enabled={enabled.status} onEnabledChange={toggle('status')}>
                  <Selector
                    label={t('common.status')}
                    isLabelHidden
                    options={statusOptions}
                    value={form.status}
                    onChange={(status) => patch({ status: status === 'inactive' ? 'inactive' : 'active' })}
                    isDisabled={!enabled.status}
                  />
                </FieldSection>

                {/* OpenAI OAuth WS mode */}
                {caps.allOpenAIOAuth && (
                  <FieldSection
                    title={t('admin.accounts.openai.wsMode')}
                    description={t('admin.accounts.openai.wsModeDesc')}
                    enabled={enabled.openaiWSMode}
                    onEnabledChange={toggle('openaiWSMode')}
                  >
                    {oauthWSModeHintKey && <Text type="supporting">{t(oauthWSModeHintKey)}</Text>}
                    <Selector
                      label={t('admin.accounts.openai.wsMode')}
                      isLabelHidden
                      options={wsModeOptions}
                      value={form.openaiOAuthWSMode}
                      onChange={(mode) => patch({ openaiOAuthWSMode: mode as OpenAIWSMode })}
                      isDisabled={!enabled.openaiWSMode}
                    />
                  </FieldSection>
                )}

                {/* OpenAI OAuth Codex CLI only */}
                {caps.allOpenAIOAuth && (
                  <FieldSection
                    title={t('admin.accounts.openai.codexCLIOnly')}
                    description={t('admin.accounts.openai.codexCLIOnlyDesc')}
                    enabled={enabled.codexCLIOnly}
                    onEnabledChange={toggle('codexCLIOnly')}
                  >
                    <Switch
                      label={t('admin.accounts.openai.codexCLIOnly')}
                      isLabelHidden
                      value={form.codexCLIOnlyEnabled}
                      onChange={(value) => patch({ codexCLIOnlyEnabled: value })}
                      isDisabled={!enabled.codexCLIOnly}
                    />
                  </FieldSection>
                )}

                {/* OpenAI OAuth Codex app-server */}
                {caps.allOpenAIOAuth && (
                  <FieldSection
                    title={t('admin.accounts.openai.codexCLIOnlyAppServer')}
                    description={t('admin.accounts.openai.codexCLIOnlyAppServerDesc')}
                    enabled={enabled.codexCLIOnlyAppServer}
                    onEnabledChange={toggle('codexCLIOnlyAppServer')}
                  >
                    <Switch
                      label={t('admin.accounts.openai.codexCLIOnlyAppServer')}
                      isLabelHidden
                      value={form.codexCLIOnlyAppServerEnabled}
                      onChange={(value) => patch({ codexCLIOnlyAppServerEnabled: value })}
                      isDisabled={!enabled.codexCLIOnlyAppServer}
                    />
                  </FieldSection>
                )}

                {/* Codex fingerprint convergence mode (OpenAI OAuth only) */}
                {caps.allOpenAIOAuth && (
                  <FieldSection
                    title={t('admin.accounts.openai.codexFingerprintMode')}
                    description={t('admin.accounts.openai.codexFingerprintModeDesc')}
                    enabled={enabled.codexFingerprintMode}
                    onEnabledChange={toggle('codexFingerprintMode')}
                  >
                    <Selector
                      label={t('admin.accounts.openai.codexFingerprintMode')}
                      isLabelHidden
                      options={fingerprintModeOptions}
                      value={form.codexFingerprintMode}
                      onChange={(mode) => patch({ codexFingerprintMode: mode as CodexFingerprintMode })}
                      isDisabled={!enabled.codexFingerprintMode}
                    />
                  </FieldSection>
                )}

                {/* Upstream billing auto probe (any API-key platform) */}
                {caps.allBillingProbeCapable && (
                  <FieldSection
                    title={t('admin.accounts.upstreamBilling.autoProbe')}
                    description={t('admin.accounts.upstreamBilling.autoProbeHint')}
                    enabled={enabled.upstreamBillingAutoProbe}
                    onEnabledChange={toggle('upstreamBillingAutoProbe')}
                  >
                    <Selector
                      label={t('admin.accounts.upstreamBilling.autoProbe')}
                      isLabelHidden
                      options={probeOptions}
                      value={form.upstreamBillingAutoProbeMode}
                      onChange={(mode) => patch({ upstreamBillingAutoProbeMode: mode === 'disabled' ? 'disabled' : 'enabled' })}
                      isDisabled={!enabled.upstreamBillingAutoProbe}
                    />
                  </FieldSection>
                )}

                {/* OpenAI API key endpoint capabilities */}
                {caps.allOpenAIAPIKey && (
                  <FieldSection
                    title={t('admin.accounts.openai.endpointCapabilities')}
                    description={t('admin.accounts.openai.endpointCapabilitiesDesc')}
                    enabled={enabled.openaiEndpointCapabilities}
                    onEnabledChange={toggle('openaiEndpointCapabilities')}
                  >
                    <Grid columns={{ minWidth: 220, max: 2 }} gap={2}>
                      {endpointCapabilityOptions.map((option) => (
                        <CheckboxInput
                          key={option.value}
                          label={option.label}
                          value={form.openAIEndpointCapabilities.includes(option.value)}
                          onChange={(checked) => toggleEndpointCapability(option.value, checked)}
                          isDisabled={!enabled.openaiEndpointCapabilities}
                        />
                      ))}
                    </Grid>
                  </FieldSection>
                )}

                {/* OpenAI API key Responses route */}
                {caps.allOpenAIAPIKey && (
                  <FieldSection
                    title={t('admin.accounts.openai.responsesMode')}
                    description={t('admin.accounts.openai.responsesModeDesc')}
                    enabled={enabled.openaiResponsesMode}
                    onEnabledChange={toggle('openaiResponsesMode')}
                  >
                    <Selector
                      label={t('admin.accounts.openai.responsesMode')}
                      isLabelHidden
                      options={responsesModeOptions}
                      value={form.openAIResponsesMode}
                      onChange={(mode) => patch({ openAIResponsesMode: mode as BulkEditForm['openAIResponsesMode'] })}
                      isDisabled={!enabled.openaiResponsesMode || !responsesModeApplicable}
                    />
                    {enabled.openaiEndpointCapabilities && !textGenerationEnabled && (
                      <Banner status="warning" title={t('admin.accounts.openai.responsesModeTextDisabledHint')} />
                    )}
                  </FieldSection>
                )}

                {/* OpenAI API key WS mode */}
                {caps.allOpenAIAPIKey && (
                  <FieldSection
                    title={t('admin.accounts.openai.wsMode')}
                    description={t('admin.accounts.openai.wsModeDesc')}
                    enabled={enabled.openaiAPIKeyWSMode}
                    onEnabledChange={toggle('openaiAPIKeyWSMode')}
                  >
                    {apiKeyWSModeHintKey && <Text type="supporting">{t(apiKeyWSModeHintKey)}</Text>}
                    <Selector
                      label={t('admin.accounts.openai.wsMode')}
                      isLabelHidden
                      options={wsModeOptions}
                      value={form.openaiAPIKeyWSMode}
                      onChange={(mode) => patch({ openaiAPIKeyWSMode: mode as OpenAIWSMode })}
                      isDisabled={!enabled.openaiAPIKeyWSMode}
                    />
                  </FieldSection>
                )}

                {/* OpenAI compact mode */}
                {caps.allOpenAIPassthroughCapable && (
                  <FieldSection
                    title={t('admin.accounts.openai.compactMode')}
                    description={t('admin.accounts.openai.compactModeDesc')}
                    enabled={enabled.openaiCompactMode}
                    onEnabledChange={toggle('openaiCompactMode')}
                  >
                    <Selector
                      label={t('admin.accounts.openai.compactMode')}
                      isLabelHidden
                      options={compactModeOptions}
                      value={form.openAICompactMode}
                      onChange={(mode) => patch({ openAICompactMode: mode as BulkEditForm['openAICompactMode'] })}
                      isDisabled={!enabled.openaiCompactMode}
                    />
                  </FieldSection>
                )}

                {/* OpenAI compact model mapping */}
                {caps.allOpenAIPassthroughCapable && (
                  <FieldSection
                    title={t('admin.accounts.openai.compactModelMapping')}
                    description={t('admin.accounts.openai.compactModelMappingDesc')}
                    enabled={enabled.openaiCompactModelMapping}
                    onEnabledChange={toggle('openaiCompactModelMapping')}
                  >
                    <MappingRows
                      rows={form.openAICompactModelMappings}
                      onChange={(openAICompactModelMappings) => patch({ openAICompactModelMappings })}
                      fromPlaceholder={t('admin.accounts.fromModel')}
                      toPlaceholder={t('admin.accounts.toModel')}
                      isDisabled={!enabled.openaiCompactModelMapping}
                    />
                  </FieldSection>
                )}

                {/* RPM limit (only when every target is Anthropic OAuth/setup-token) */}
                {caps.allAnthropicOAuthOrSetupToken && (
                  <FieldSection
                    title={t('admin.accounts.quotaControl.rpmLimit.label')}
                    enabled={enabled.rpmLimit}
                    onEnabledChange={toggle('rpmLimit')}
                  >
                    <Switch
                      label={t('admin.accounts.quotaControl.rpmLimit.hint')}
                      labelPosition="start"
                      labelSpacing="spread"
                      value={form.rpmLimitEnabled}
                      onChange={(value) => patch({ rpmLimitEnabled: value })}
                      isDisabled={!enabled.rpmLimit}
                    />
                    {form.rpmLimitEnabled && (
                      <VStack gap={3} hAlign="stretch">
                        <NumberInput
                          label={t('admin.accounts.quotaControl.rpmLimit.baseRpm')}
                          description={t('admin.accounts.quotaControl.rpmLimit.baseRpmHint')}
                          placeholder={t('admin.accounts.quotaControl.rpmLimit.baseRpmPlaceholder')}
                          value={form.baseRpm}
                          onChange={(value: number | null) => patch({ baseRpm: value })}
                          min={1}
                          max={1000}
                          isIntegerOnly
                          hasClear
                          isDisabled={!enabled.rpmLimit}
                        />
                        <VStack gap={1.5} hAlign="stretch">
                          <Text type="label">{t('admin.accounts.quotaControl.rpmLimit.strategy')}</Text>
                          <SegmentedControl
                            label={t('admin.accounts.quotaControl.rpmLimit.strategy')}
                            value={form.rpmStrategy}
                            onChange={(strategy) => patch({ rpmStrategy: strategy as RpmStrategy })}
                            layout="fill"
                            isDisabled={!enabled.rpmLimit}
                          >
                            <SegmentedControlItem value="tiered" label={t('admin.accounts.quotaControl.rpmLimit.strategyTiered')} />
                            <SegmentedControlItem
                              value="sticky_exempt"
                              label={t('admin.accounts.quotaControl.rpmLimit.strategyStickyExempt')}
                            />
                          </SegmentedControl>
                        </VStack>
                        {form.rpmStrategy === 'tiered' && (
                          <NumberInput
                            label={t('admin.accounts.quotaControl.rpmLimit.stickyBuffer')}
                            description={t('admin.accounts.quotaControl.rpmLimit.stickyBufferHint')}
                            placeholder={t('admin.accounts.quotaControl.rpmLimit.stickyBufferPlaceholder')}
                            value={form.rpmStickyBuffer}
                            onChange={(value: number | null) => patch({ rpmStickyBuffer: value })}
                            min={1}
                            isIntegerOnly
                            hasClear
                            isDisabled={!enabled.rpmLimit}
                          />
                        )}
                      </VStack>
                    )}
                    {/* User message queue mode: independent of the RPM switch, always editable */}
                    <VStack gap={1.5} hAlign="stretch">
                      <Text type="label">{t('admin.accounts.quotaControl.rpmLimit.userMsgQueue')}</Text>
                      <Text type="supporting">{t('admin.accounts.quotaControl.rpmLimit.userMsgQueueHint')}</Text>
                      <HStack gap={2} wrap="wrap">
                        {umqModeOptions.map((option) => (
                          <ToggleButton
                            key={option.value}
                            size="sm"
                            label={option.label}
                            isPressed={form.userMsgQueueMode === option.value}
                            onPressedChange={() =>
                              patch({ userMsgQueueMode: form.userMsgQueueMode === option.value ? null : option.value })
                            }
                          />
                        ))}
                      </HStack>
                    </VStack>
                  </FieldSection>
                )}

                {/* Groups */}
                <FieldSection title={t('nav.groups')} enabled={enabled.groups} onEnabledChange={toggle('groups')}>
                  <GroupPicker
                    label={t('admin.users.groups')}
                    value={form.groupIds}
                    onChange={(groupIds) => patch({ groupIds })}
                    groups={groups}
                    isDisabled={!enabled.groups}
                  />
                </FieldSection>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" onClick={handleClose} />
                <Button
                  label={submitting ? t('admin.accounts.bulkEdit.updating') : t('admin.accounts.bulkEdit.submit')}
                  variant="primary"
                  isLoading={submitting}
                  onClick={() => void handleSubmit()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={mixedChannel !== null}
        onOpenChange={(open) => !open && setMixedChannel(null)}
        title={t('admin.accounts.mixedChannelWarningTitle')}
        description={mixedChannel?.message ?? ''}
        actionLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onAction={() => void handleMixedChannelConfirm()}
      />

      <AlertDialog
        isOpen={pendingErrorCode !== null}
        onOpenChange={(open) => !open && setPendingErrorCode(null)}
        title={t('admin.accounts.customErrorCodes')}
        description={
          pendingErrorCode?.code === 529
            ? t('admin.accounts.customErrorCodes529Warning')
            : t('admin.accounts.customErrorCodes429Warning')
        }
        actionLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onAction={() => {
          if (pendingErrorCode) commitErrorCode(pendingErrorCode.code, pendingErrorCode.fromInput)
          setPendingErrorCode(null)
        }}
      />
    </>
  )
}
