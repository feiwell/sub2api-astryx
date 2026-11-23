/**
 * Model pricing, model allowlist and routing sections of the create and edit
 * group dialogs. Ports the matching template blocks of
 * views/admin/GroupsView.vue (pricing: :1493, allowlist: :771, Claude Code
 * fallback: :1401, supported scopes: :1286, invalid-request fallback: :1892,
 * routing: :1913) and keeps their platform gating.
 */
import { useMemo, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Section } from '@astryxdesign/core/Section'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Token } from '@astryxdesign/core/Token'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Tokenizer } from '@astryxdesign/core/Tokenizer'
import { TypeaheadItem, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type { BillingMode } from '@/api/admin/channels'
import type { PricingFormEntry } from '@/components/admin/channel/types'
import { toNullableNumber, validateReasoningEffortMultipliers } from '@/components/admin/channel/types'
import { REASONING_EFFORT_LEVELS } from '@/constants/channel'
import {
  addCustomModelAllowlistItem,
  invertModelAllowlistSelection,
  moveModelAllowlistItem,
  selectAllModelAllowlistItems,
  selectedModelAllowlistCount,
  toggleModelAllowlistItem,
  type ModelAllowlistState,
} from '@/views/admin/groupModelAllowlist'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import {
  emptyGroupPricing,
  nextUiKey,
  updateModelAllowlist,
  type FallbackGroupOption,
  type GroupEditorState,
  type GroupPricingEntry,
  type ModelRoutingRuleForm,
  type RoutingAccount,
} from './groupEditorState'

type Patch = (patch: Partial<GroupEditorState>) => void

/** Collapsible form section with a heading and optional description. */
function EditorSection({
  title,
  description,
  endContent,
  children,
}: {
  title: string
  description?: string
  endContent?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <VStack gap={3} hAlign="stretch">
      <Divider />
      <HStack gap={3} vAlign="start" hAlign="between" wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <Text type="label">{title}</Text>
            {description && <Text type="supporting">{description}</Text>}
          </VStack>
        </StackItem>
        {endContent}
      </HStack>
      {children}
    </VStack>
  )
}

/** $/MTok style price field; stores null when cleared. */
function PriceInput({
  label,
  labelTooltip,
  value,
  onChange,
  placeholder,
}: {
  label: string
  labelTooltip?: string
  value: number | string | null | undefined
  onChange: (value: number | null) => void
  placeholder?: string
}) {
  return (
    <NumberInput
      label={label}
      labelTooltip={labelTooltip}
      size="sm"
      value={toNullableNumber(value)}
      onChange={(next) => onChange(next ?? null)}
      min={0}
      step={null}
      hasClear
      placeholder={placeholder}
    />
  )
}

/** Free-text model list for a pricing entry (port of ModelTagInput.vue). */
function ModelTagInput({
  models,
  placeholder,
  onChange,
}: {
  models: string[]
  placeholder?: string
  onChange: (models: string[]) => void
}) {
  const { t } = useI18n()
  const searchSource = useMemo<SearchSource<SearchableItem>>(() => ({ search: () => [], bootstrap: () => [] }), [])
  const value = useMemo<SearchableItem[]>(() => models.map((model) => ({ id: model, label: model })), [models])

  return (
    <Tokenizer
      label={t('admin.channels.form.models')}
      isLabelHidden
      description={t('admin.channels.form.modelsPlaceholder')}
      placeholder={placeholder}
      searchSource={searchSource}
      value={value}
      onChange={(items) => {
        const next: string[] = []
        for (const item of items) {
          const model = item.label.trim()
          if (model && !next.includes(model)) next.push(model)
        }
        onChange(next)
      }}
      hasCreate
      minQueryLength={1}
      emptySearchText={t('admin.channels.form.modelsPlaceholder')}
      renderItem={(item) => <TypeaheadItem item={item} />}
      size="sm"
    />
  )
}

/**
 * One group pricing entry (port of PricingEntryCard.vue with
 * hide-token-intervals: groups never edit channel token intervals).
 */
function GroupPricingEntryCard({
  entry,
  platform,
  onChange,
  onRemove,
}: {
  entry: GroupPricingEntry
  platform: string
  onChange: (patch: Partial<GroupPricingEntry>) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  // Entries that already have models start collapsed
  const [collapsed, setCollapsed] = useState(entry.models.length > 0)

  const billingModeOptions = [
    { value: 'token', label: t('admin.channels.billingMode.token') },
    { value: 'per_request', label: t('admin.channels.billingMode.perRequest') },
    { value: 'image', label: t('admin.channels.billingMode.image') },
    { value: 'video', label: t('admin.channels.billingMode.video') },
  ]
  const billingModeLabel = billingModeOptions.find((o) => o.value === entry.billing_mode)?.label ?? entry.billing_mode
  const reasoningError = validateReasoningEffortMultipliers(entry.reasoning_effort_multipliers, t)
  const pricePlaceholder = t('admin.channels.form.pricePlaceholder')
  const priceField = (key: keyof PricingFormEntry) => (value: number | null) =>
    onChange({ [key]: value } as Partial<GroupPricingEntry>)

  const updateReasoningMultiplier = (effort: string, value: number | null) => {
    const multipliers = { ...(entry.reasoning_effort_multipliers || {}) }
    if (value == null) delete multipliers[effort]
    else multipliers[effort] = value
    onChange({ reasoning_effort_multipliers: Object.keys(multipliers).length ? multipliers : null })
  }

  return (
    <Card variant="muted" padding={3}>
      <VStack gap={3} hAlign="stretch">
        <HStack gap={2} vAlign="center">
          <IconButton
            label={collapsed ? t('common.expand') : t('common.collapse')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={collapsed ? ChevronRightIcon : ChevronDownIcon} />}
            onClick={() => setCollapsed((v) => !v)}
          />
          <StackItem size="fill">
            {collapsed ? (
              <HStack gap={1} vAlign="center" wrap="wrap">
                {entry.models.slice(0, 3).map((model) => (
                  <Token key={model} size="sm" color="blue" label={model} />
                ))}
                {entry.models.length > 3 && <Text type="supporting">+{entry.models.length - 3}</Text>}
                {entry.models.length === 0 && <Text type="supporting">{t('admin.channels.form.noModels')}</Text>}
                <Badge variant="info" label={billingModeLabel} />
              </HStack>
            ) : (
              <Text type="supporting" weight="medium">
                {t('admin.channels.form.pricingEntry')}
              </Text>
            )}
          </StackItem>
          <IconButton
            label={t('common.delete')}
            tooltip={t('common.delete')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={TrashIcon} />}
            onClick={onRemove}
          />
        </HStack>

        {!collapsed && (
          <VStack gap={4} hAlign="stretch">
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <VStack gap={1} hAlign="stretch">
                <Text type="label">{`${t('admin.channels.form.models')} *`}</Text>
                <ModelTagInput
                  models={entry.models}
                  placeholder={t('admin.channels.form.modelsPlaceholder')}
                  onChange={(models) => onChange({ models })}
                />
              </VStack>
              <Selector
                label={t('admin.channels.form.billingMode')}
                size="sm"
                value={entry.billing_mode}
                onChange={(mode) => onChange({ billing_mode: mode as BillingMode, intervals: [] })}
                options={billingModeOptions}
              />
            </Grid>

            {entry.billing_mode === 'token' ? (
              <VStack gap={3} hAlign="stretch">
                <Text type="label">{`${t('admin.channels.form.defaultPrices')} ($/MTok)`}</Text>
                <Grid columns={{ minWidth: 128, repeat: 'fit' }} gap={2}>
                  <PriceInput
                    label={t('admin.channels.form.inputPrice')}
                    value={entry.input_price}
                    onChange={priceField('input_price')}
                    placeholder={pricePlaceholder}
                  />
                  <PriceInput
                    label={t('admin.channels.form.outputPrice')}
                    value={entry.output_price}
                    onChange={priceField('output_price')}
                    placeholder={pricePlaceholder}
                  />
                  <PriceInput
                    label={t(
                      platform === 'openai'
                        ? 'admin.channels.form.cacheWrite30mPrice'
                        : 'admin.channels.form.cacheWrite5mPrice',
                    )}
                    value={entry.cache_write_price}
                    onChange={priceField('cache_write_price')}
                    placeholder={pricePlaceholder}
                  />
                  {platform !== 'openai' ? (
                    <PriceInput
                      label={t('admin.channels.form.cacheWrite1hPrice')}
                      value={entry.cache_write_1h_price}
                      onChange={priceField('cache_write_1h_price')}
                      placeholder={pricePlaceholder}
                    />
                  ) : (
                    <PriceInput
                      label={t('admin.channels.form.cacheWrite12hPrice')}
                      labelTooltip={t('admin.channels.form.cacheWrite12hHint')}
                      value={entry.cache_write_12h_price}
                      onChange={priceField('cache_write_12h_price')}
                      placeholder={pricePlaceholder}
                    />
                  )}
                  <PriceInput
                    label={t('admin.channels.form.cacheReadPrice')}
                    value={entry.cache_read_price}
                    onChange={priceField('cache_read_price')}
                    placeholder={pricePlaceholder}
                  />
                  <PriceInput
                    label={t('admin.channels.form.imageInputPrice')}
                    value={entry.image_input_price}
                    onChange={priceField('image_input_price')}
                    placeholder={pricePlaceholder}
                  />
                  <PriceInput
                    label={t('admin.channels.form.imageTokenPrice')}
                    value={entry.image_output_price}
                    onChange={priceField('image_output_price')}
                    placeholder={pricePlaceholder}
                  />
                </Grid>
              </VStack>
            ) : (
              <PriceInput
                label={`${
                  entry.billing_mode === 'video'
                    ? t('admin.channels.form.defaultVideoPrice')
                    : entry.billing_mode === 'image'
                      ? t('admin.channels.form.defaultImagePrice')
                      : t('admin.channels.form.defaultPerRequestPrice')
                } $`}
                value={entry.per_request_price}
                onChange={priceField('per_request_price')}
                placeholder={pricePlaceholder}
              />
            )}

            <VStack gap={2} hAlign="stretch">
              <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                <Text type="label">{t('admin.channels.form.reasoningEffortMultipliers')}</Text>
                {Object.keys(entry.reasoning_effort_multipliers || {}).length > 0 && (
                  <Button
                    label={t('admin.channels.form.clearReasoningEffortMultipliers')}
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ reasoning_effort_multipliers: null })}
                  />
                )}
              </HStack>
              <Text type="supporting">{t('admin.channels.form.reasoningEffortMultipliersHint')}</Text>
              <Grid columns={{ minWidth: 104, repeat: 'fit' }} gap={2}>
                {REASONING_EFFORT_LEVELS.map((effort) => (
                  <NumberInput
                    key={effort}
                    label={effort}
                    size="sm"
                    value={toNullableNumber(entry.reasoning_effort_multipliers?.[effort])}
                    onChange={(value) => updateReasoningMultiplier(effort, value)}
                    min={0}
                    step={null}
                    hasClear
                    placeholder={t('admin.channels.form.reasoningEffortMultiplierDefault')}
                  />
                ))}
              </Grid>
              {reasoningError && <FieldStatus type="error" message={reasoningError} variant="detached" />}
            </VStack>
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

/** Gap 47: per-model group pricing. */
export function GroupModelPricingSection({
  state,
  platform,
  patch,
}: {
  state: GroupEditorState
  platform: string
  patch: Patch
}) {
  const { t } = useI18n()

  return (
    <EditorSection
      title={t('admin.groups.modelPricing.title')}
      description={t('admin.groups.modelPricing.description')}
      endContent={
        <Button
          label={t('admin.groups.modelPricing.add')}
          variant="secondary"
          size="sm"
          icon={<Icon icon={PlusIcon} />}
          onClick={() => patch({ model_pricing: [...state.model_pricing, emptyGroupPricing()] })}
        />
      }
    >
      <CheckboxInput
        label={t('admin.groups.modelPricing.longContext')}
        description={t('admin.groups.modelPricing.longContextHint')}
        value={state.long_context_pricing_enabled}
        onChange={(checked) => patch({ long_context_pricing_enabled: checked })}
      />
      {state.model_pricing.map((entry, index) => (
        <GroupPricingEntryCard
          key={entry.uiKey}
          entry={entry}
          platform={platform}
          onChange={(entryPatch) =>
            patch({
              model_pricing: state.model_pricing.map((item, i) => (i === index ? { ...item, ...entryPatch } : item)),
            })
          }
          onRemove={() => patch({ model_pricing: state.model_pricing.filter((_, i) => i !== index) })}
        />
      ))}
    </EditorSection>
  )
}

/** Gap 47: model allowlist. */
export function GroupModelAllowlistSection({
  state,
  isLoading,
  patch,
}: {
  state: GroupEditorState
  isLoading: boolean
  patch: Patch
}) {
  const { t } = useI18n()
  const [customEntry, setCustomEntry] = useState('')
  const [customErrorKey, setCustomErrorKey] = useState<string | null>(null)

  const allowlist = state.model_allowlist
  const selectedCount = selectedModelAllowlistCount(allowlist)
  const mutate = (fn: (draft: ModelAllowlistState) => void) =>
    patch({ model_allowlist: updateModelAllowlist(allowlist, fn) })

  const submitCustomEntry = () => {
    let error: string | null = null
    patch({
      model_allowlist: updateModelAllowlist(allowlist, (draft) => {
        error = addCustomModelAllowlistItem(draft, customEntry)
      }),
    })
    if (error) {
      setCustomErrorKey(`admin.groups.modelAllowlist.errors.${error}`)
      return
    }
    setCustomErrorKey(null)
    setCustomEntry('')
  }

  return (
    <EditorSection
      title={t('admin.groups.modelAllowlist.title')}
      description={t('admin.groups.modelAllowlist.hint')}
      endContent={
        <Switch
          label={t('admin.groups.modelAllowlist.title')}
          isLabelHidden
          value={allowlist.enabled}
          onChange={(enabled) => mutate((draft) => { draft.enabled = enabled })}
        />
      }
    >
      {allowlist.enabled && (
        <Section variant="muted" padding={3}>
          <VStack gap={3} hAlign="stretch">
            {!isLoading && allowlist.items.length > 0 && (
              <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                <Text type="supporting">
                  {t('admin.groups.modelAllowlist.selectedSummary', {
                    selected: selectedCount,
                    total: allowlist.items.length,
                  })}
                </Text>
                <HStack gap={1} vAlign="center">
                  <Button
                    label={t('admin.groups.modelAllowlist.selectAll')}
                    variant="ghost"
                    size="sm"
                    onClick={() => mutate(selectAllModelAllowlistItems)}
                  />
                  <Button
                    label={t('admin.groups.modelAllowlist.invertSelection')}
                    variant="ghost"
                    size="sm"
                    onClick={() => mutate(invertModelAllowlistSelection)}
                  />
                </HStack>
              </HStack>
            )}

            {isLoading ? (
              <HStack gap={2} vAlign="center">
                <Spinner size="sm" />
                <Text type="supporting">{t('admin.groups.modelAllowlist.loading')}</Text>
              </HStack>
            ) : allowlist.items.length === 0 ? (
              <Text type="supporting">{t('admin.groups.modelAllowlist.empty')}</Text>
            ) : (
              <ScrollableArea label={t('admin.groups.modelAllowlist.title')} height={256}>
                <VStack gap={1} hAlign="stretch">
                {allowlist.items.map((item, index) => (
                  <HStack key={item.id} gap={2} vAlign="center">
                    <StackItem size="fill">
                      <CheckboxInput
                        label={item.id}
                        value={item.selected}
                        onChange={() => mutate((draft) => toggleModelAllowlistItem(draft, item.id))}
                      />
                    </StackItem>
                    {item.id.includes('*') && (
                      <Badge variant="info" label={t('admin.groups.modelAllowlist.wildcardTag')} />
                    )}
                    <IconButton
                      label={t('admin.settings.customMenu.moveUp')}
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={ArrowUpIcon} />}
                      isDisabled={index === 0}
                      onClick={() => mutate((draft) => moveModelAllowlistItem(draft, index, index - 1))}
                    />
                    <IconButton
                      label={t('admin.settings.customMenu.moveDown')}
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={ArrowDownIcon} />}
                      isDisabled={index === allowlist.items.length - 1}
                      onClick={() => mutate((draft) => moveModelAllowlistItem(draft, index, index + 1))}
                    />
                  </HStack>
                ))}
                </VStack>
              </ScrollableArea>
            )}

            <HStack gap={2} vAlign="end">
              <StackItem size="fill">
                <TextInput
                  label={t('admin.groups.modelAllowlist.customPlaceholder')}
                  isLabelHidden
                  size="sm"
                  value={customEntry}
                  onChange={(value) => {
                    setCustomEntry(value)
                    setCustomErrorKey(null)
                  }}
                  onEnter={submitCustomEntry}
                  placeholder={t('admin.groups.modelAllowlist.customPlaceholder')}
                  status={customErrorKey ? { type: 'error', message: t(customErrorKey) } : undefined}
                />
              </StackItem>
              <Button
                label={t('admin.groups.modelAllowlist.addCustom')}
                variant="primary"
                size="sm"
                onClick={submitCustomEntry}
              />
            </HStack>
          </VStack>
        </Section>
      )}
    </EditorSection>
  )
}

/** Account picker of one routing rule: debounced search over anthropic accounts. */
function RoutingAccountPicker({
  accounts,
  onChange,
}: {
  accounts: RoutingAccount[]
  onChange: (accounts: RoutingAccount[]) => void
}) {
  const { t } = useI18n()

  const searchSource = useMemo<SearchSource<SearchableItem<RoutingAccount>>>(
    () => ({
      async search(query) {
        const search = query.trim()
        if (!search) return []
        try {
          const res = await adminAPI.accounts.list(1, 20, { search, platform: 'anthropic' })
          return res.items.map((account) => ({
            id: String(account.id),
            label: account.name,
            auxiliaryData: { id: account.id, name: account.name },
          }))
        } catch {
          return []
        }
      },
      bootstrap: () => [],
    }),
    [],
  )

  const value = useMemo<SearchableItem<RoutingAccount>[]>(
    () => accounts.map((account) => ({ id: String(account.id), label: account.name, auxiliaryData: account })),
    [accounts],
  )

  return (
    <Tokenizer
      label={t('admin.groups.modelRouting.accounts')}
      description={t('admin.groups.modelRouting.accountsHint')}
      placeholder={t('admin.groups.modelRouting.searchAccountPlaceholder')}
      size="sm"
      searchSource={searchSource}
      value={value}
      onChange={(items) => {
        const next: RoutingAccount[] = []
        for (const item of items) {
          const account = item.auxiliaryData ?? { id: Number(item.id), name: item.label }
          if (account.id > 0 && !next.some((a) => a.id === account.id)) next.push(account)
        }
        onChange(next)
      }}
      debounceMs={300}
      emptySearchText={t('admin.groups.modelRouting.noAccounts')}
      renderItem={(item) => <TypeaheadItem item={item} description={`#${item.id}`} />}
    />
  )
}

/**
 * Gap 47: routing — the Claude Code client restriction with its fallback group,
 * the antigravity supported model families, the invalid-request fallback group
 * and the per-pattern model routing rules.
 */
export function GroupRoutingSection({
  state,
  platform,
  subscriptionType,
  fallbackGroupOptions,
  invalidRequestFallbackOptions,
  patch,
}: {
  state: GroupEditorState
  platform: string
  subscriptionType?: string
  fallbackGroupOptions: FallbackGroupOption[]
  invalidRequestFallbackOptions: FallbackGroupOption[]
  patch: Patch
}) {
  const { t } = useI18n()

  const toggleScope = (scope: string) =>
    patch({
      supported_model_scopes: state.supported_model_scopes.includes(scope)
        ? state.supported_model_scopes.filter((s) => s !== scope)
        : [...state.supported_model_scopes, scope],
    })

  const updateRule = (uiKey: string, rulePatch: Partial<ModelRoutingRuleForm>) =>
    patch({
      model_routing_rules: state.model_routing_rules.map((rule) =>
        rule.uiKey === uiKey ? { ...rule, ...rulePatch } : rule,
      ),
    })

  const toOption = (option: FallbackGroupOption) => ({
    value: option.value === null ? '' : String(option.value),
    label: option.label,
  })

  const showInvalidRequestFallback =
    ['anthropic', 'antigravity'].includes(platform) && subscriptionType !== 'subscription'

  return (
    <>
      {/* Claude Code client restriction (anthropic only) */}
      {platform === 'anthropic' && (
        <EditorSection
          title={t('admin.groups.claudeCode.title')}
          description={t('admin.groups.claudeCode.tooltip')}
          endContent={
            <Switch
              label={
                state.claude_code_only ? t('admin.groups.claudeCode.enabled') : t('admin.groups.claudeCode.disabled')
              }
              value={state.claude_code_only}
              onChange={(claude_code_only) => patch({ claude_code_only })}
            />
          }
        >
          {state.claude_code_only && (
            <Selector
              label={t('admin.groups.claudeCode.fallbackGroup')}
              description={t('admin.groups.claudeCode.fallbackHint')}
              placeholder={t('admin.groups.claudeCode.noFallback')}
              value={state.fallback_group_id === null ? '' : String(state.fallback_group_id)}
              onChange={(value) => patch({ fallback_group_id: value ? Number(value) : null })}
              options={fallbackGroupOptions.map(toOption)}
            />
          )}
        </EditorSection>
      )}

      {/* Supported model families (antigravity only) */}
      {platform === 'antigravity' && (
        <EditorSection
          title={t('admin.groups.supportedScopes.title')}
          description={t('admin.groups.supportedScopes.tooltip')}
        >
          <VStack gap={2} hAlign="stretch">
            <CheckboxInput
              label={t('admin.groups.supportedScopes.claude')}
              value={state.supported_model_scopes.includes('claude')}
              onChange={() => toggleScope('claude')}
            />
            <CheckboxInput
              label={t('admin.groups.supportedScopes.geminiText')}
              value={state.supported_model_scopes.includes('gemini_text')}
              onChange={() => toggleScope('gemini_text')}
            />
            <CheckboxInput
              label={t('admin.groups.supportedScopes.geminiImage')}
              value={state.supported_model_scopes.includes('gemini_image')}
              onChange={() => toggleScope('gemini_image')}
            />
            <Text type="supporting">{t('admin.groups.supportedScopes.hint')}</Text>
          </VStack>
        </EditorSection>
      )}

      {/* Invalid-request fallback group (anthropic/antigravity, non-subscription) */}
      {showInvalidRequestFallback && (
        <EditorSection title={t('admin.groups.invalidRequestFallback.title')}>
          <Selector
            label={t('admin.groups.invalidRequestFallback.title')}
            isLabelHidden
            description={t('admin.groups.invalidRequestFallback.hint')}
            placeholder={t('admin.groups.invalidRequestFallback.noFallback')}
            value={
              state.fallback_group_id_on_invalid_request === null
                ? ''
                : String(state.fallback_group_id_on_invalid_request)
            }
            onChange={(value) => patch({ fallback_group_id_on_invalid_request: value ? Number(value) : null })}
            options={invalidRequestFallbackOptions.map(toOption)}
          />
        </EditorSection>
      )}

      {/* Model routing rules (anthropic only) */}
      {platform === 'anthropic' && (
        <EditorSection
          title={t('admin.groups.modelRouting.title')}
          description={t('admin.groups.modelRouting.tooltip')}
          endContent={
            <Switch
              label={
                state.model_routing_enabled
                  ? t('admin.groups.modelRouting.enabled')
                  : t('admin.groups.modelRouting.disabled')
              }
              value={state.model_routing_enabled}
              onChange={(model_routing_enabled) => patch({ model_routing_enabled })}
            />
          }
        >
          <Text type="supporting">
            {state.model_routing_enabled
              ? t('admin.groups.modelRouting.noRulesHint')
              : t('admin.groups.modelRouting.disabledHint')}
          </Text>
          {state.model_routing_enabled && (
            <VStack gap={3} hAlign="stretch">
              {state.model_routing_rules.map((rule) => (
                <Card key={rule.uiKey} variant="muted" padding={3}>
                  <HStack gap={3} vAlign="start">
                    <StackItem size="fill">
                      <VStack gap={2} hAlign="stretch">
                        <TextInput
                          label={t('admin.groups.modelRouting.modelPattern')}
                          description={t('admin.groups.modelRouting.modelPatternHint')}
                          size="sm"
                          value={rule.pattern}
                          onChange={(pattern) => updateRule(rule.uiKey, { pattern })}
                          placeholder={t('admin.groups.modelRouting.modelPatternPlaceholder')}
                        />
                        <RoutingAccountPicker
                          accounts={rule.accounts}
                          onChange={(accounts) => updateRule(rule.uiKey, { accounts })}
                        />
                      </VStack>
                    </StackItem>
                    <IconButton
                      label={t('admin.groups.modelRouting.removeRule')}
                      tooltip={t('admin.groups.modelRouting.removeRule')}
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={TrashIcon} />}
                      onClick={() =>
                        patch({ model_routing_rules: state.model_routing_rules.filter((r) => r.uiKey !== rule.uiKey) })
                      }
                    />
                  </HStack>
                </Card>
              ))}
              <HStack>
                <Button
                  label={t('admin.groups.modelRouting.addRule')}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={PlusIcon} />}
                  onClick={() =>
                    patch({
                      model_routing_rules: [
                        ...state.model_routing_rules,
                        { uiKey: nextUiKey('routing-rule'), pattern: '', accounts: [] },
                      ],
                    })
                  }
                />
              </HStack>
            </VStack>
          )}
        </EditorSection>
      )}
    </>
  )
}
