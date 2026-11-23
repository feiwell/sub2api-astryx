import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Table, proportional, pixel, useTablePagination, useTableSortable, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import { Switch } from '@astryxdesign/core/Switch'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Token } from '@astryxdesign/core/Token'
import { Typeahead } from '@astryxdesign/core/Typeahead'
import type { SearchSource, SearchableItem } from '@astryxdesign/core/Typeahead'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { AdminGroup, GroupPlatform } from '@/types'
import type {
  AccountStatsPricingRule,
  BillingMode,
  Channel,
  ChannelModelPricing,
  CreateChannelRequest,
  UpdateChannelRequest,
} from '@/api/admin/channels'
import type {
  IntervalFormEntry,
  PricingFormEntry,
  TimePricingFormEntry,
  TimePricingPeriodFormEntry,
} from '@/components/admin/channel/types'
import {
  COMMON_TIMEZONES,
  apiIntervalsToForm,
  apiTimePricingToForm,
  createDefaultTimePricingForm,
  findModelConflict,
  formIntervalsToAPI,
  formReasoningEffortMultipliersToAPI,
  formTimePricingToAPI,
  formatTimezoneOffset,
  isValidPositiveMultiplier,
  isValidTimePricingMultiplier,
  mTokToPerToken,
  perTokenToMTok,
  toNullableNumber,
  validateIntervals,
  validateReasoningEffortMultipliers,
  validateTimePricing,
} from '@/components/admin/channel/types'
import { REASONING_EFFORT_LEVELS } from '@/constants/channel'
import { listPlatformIds, supportsPricingModelSync } from '@/constants/platformCatalog'
import { platformLabel as catalogPlatformLabel } from '@/utils/platformColors'
import { extractApiErrorMessage } from '@/utils/apiError'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

interface ChannelRow extends Record<string, unknown> {
  __id: string
  id: number
  name: string
  description: string
  status: 'active' | 'disabled'
  group_ids: number[]
  model_pricing: unknown[]
  created_at: string
}

type SortDirection = 'ascending' | 'descending'
type KeyedPricing = PricingFormEntry & { __key: number }

interface MappingRow {
  key: number
  from: string
  to: string
}

interface FormPricingRule {
  key: number
  name: string
  group_ids: number[]
  account_ids: number[]
  pricing: KeyedPricing[]
}

interface PlatformSection {
  platform: GroupPlatform
  enabled: boolean
  group_ids: number[]
  model_mapping: MappingRow[]
  model_pricing: KeyedPricing[]
  web_search_emulation: boolean
  codex_image_generation_bridge: boolean
  bedrock_cc_compat: boolean
  account_stats_pricing_rules: FormPricingRule[]
}

interface ChannelForm {
  name: string
  description: string
  status: 'active' | 'disabled'
  restrict_models: boolean
  billing_model_source: string
  platforms: PlatformSection[]
  apply_pricing_to_account_stats: boolean
}

// Platforms that support the account-level Web Search emulation toggle (must stay
// in sync with the backend whitelist in service/account.go webSearchEmulationPlatformEnabled).
const WEB_SEARCH_EMULATION_PLATFORMS: ReadonlySet<string> = new Set([
  'anthropic',
  'openai',
  'command_code',
  'opencode_go',
  'minimax',
  'zhipu',
])

const EMPTY_FORM: ChannelForm = {
  name: '',
  description: '',
  status: 'active',
  restrict_models: false,
  billing_model_source: 'channel_mapped',
  platforms: [],
  apply_pricing_to_account_stats: false,
}

let keySeq = 0
const nextKey = () => ++keySeq

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

const createPricingEntry = (models: string[] = [], withTiers = true): KeyedPricing => ({
  __key: nextKey(),
  models,
  billing_mode: 'token',
  input_price: null,
  output_price: null,
  cache_write_price: null,
  cache_write_1h_price: null,
  cache_write_12h_price: null,
  cache_read_price: null,
  ...(withTiers ? { fast_multiplier: null, flex_multiplier: null } : {}),
  reasoning_effort_multipliers: null,
  image_input_price: null,
  image_output_price: null,
  per_request_price: null,
  intervals: [],
  time_pricing: createDefaultTimePricingForm(),
})

const createInterval = (sortOrder: number, tierLabel = ''): IntervalFormEntry => ({
  min_tokens: 0,
  max_tokens: null,
  tier_label: tierLabel,
  input_price: null,
  output_price: null,
  cache_write_price: null,
  cache_write_1h_price: null,
  cache_write_12h_price: null,
  cache_read_price: null,
  per_request_price: null,
  input_multiplier: null,
  output_multiplier: null,
  cache_write_multiplier: null,
  cache_read_multiplier: null,
  sort_order: sortOrder,
})

const isBlank = (value: unknown) => value == null || value === ''

const platformTokenColor = (platform: string): 'orange' | 'green' | 'blue' | 'purple' | 'gray' | 'pink' | 'cyan' | 'teal' | 'default' => {
  switch (platform) {
    case 'anthropic':
      return 'orange'
    case 'openai':
      return 'green'
    case 'gemini':
      return 'blue'
    case 'antigravity':
      return 'purple'
    case 'grok':
      return 'gray'
    case 'kimi':
      return 'pink'
    case 'zhipu':
      return 'cyan'
    case 'deepseek':
      return 'teal'
    default:
      return 'default'
  }
}

/* ------------------------------------------------------------------------- */
/* Pricing editor building blocks (ports of components/admin/channel/*.vue)  */
/* ------------------------------------------------------------------------- */

/** Nullable $/MTok price input: empty clears the value. */
function PriceInput({
  label,
  value,
  onChange,
  placeholder,
  min = 0,
  isRequired,
  labelTooltip,
}: {
  label: string
  value: number | string | null | undefined
  onChange: (value: number | null) => void
  placeholder?: string
  min?: number
  isRequired?: boolean
  labelTooltip?: string
}) {
  return (
    <NumberInput
      label={label}
      size="sm"
      value={toNullableNumber(value)}
      onChange={(next) => onChange(next ?? null)}
      min={min}
      step={null}
      hasClear
      placeholder={placeholder}
      isRequired={isRequired}
      labelTooltip={labelTooltip}
    />
  )
}

/** Port of ModelTagInput.vue: Enter / comma / paste to add model names. */
function ModelTagInput({
  models,
  platform,
  placeholder,
  onChange,
}: {
  models: string[]
  platform: string
  placeholder?: string
  onChange: (models: string[]) => void
}) {
  const { t } = useI18n()
  const [input, setInput] = useState('')

  const addItems = (items: string[]) => {
    const cleaned = items.map((s) => s.trim()).filter(Boolean)
    if (cleaned.length === 0) return
    onChange([...new Set([...models, ...cleaned])])
  }

  const handleChange = (value: string) => {
    // A typed separator (Enter, comma, semicolon) commits everything before it
    if (/[,\n;]/.test(value)) {
      const parts = value.split(/[,\n;]+/)
      const pending = /[,\n;]$/.test(value) ? '' : parts.pop() ?? ''
      addItems(parts)
      setInput(pending)
      return
    }
    setInput(value)
  }

  return (
    <VStack gap={1.5} hAlign="stretch">
      {models.length > 0 && (
        <HStack gap={1} wrap="wrap">
          {models.map((model, idx) => (
            <Token
              key={`${model}-${idx}`}
              size="sm"
              color={platformTokenColor(platform)}
              label={model}
              onRemove={() => onChange(models.filter((_, i) => i !== idx))}
            />
          ))}
        </HStack>
      )}
      <HStack gap={2} vAlign="start">
        <StackItem size="fill">
          <TextArea
            label={t('admin.channels.form.models')}
            isLabelHidden
            size="sm"
            rows={1}
            value={input}
            onChange={handleChange}
            onPaste={(event) => {
              const text = event.clipboardData?.getData('text') || ''
              const items = text.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
              if (items.length === 0) return
              event.preventDefault()
              addItems(items)
              setInput('')
            }}
            placeholder={models.length === 0 ? placeholder : ''}
            hasSpellCheck={false}
          />
        </StackItem>
        <IconButton
          label={t('common.add')}
          tooltip={t('common.add')}
          size="sm"
          icon={<Icon icon={PlusIcon} />}
          isDisabled={!input.trim()}
          onClick={() => {
            addItems([input])
            setInput('')
          }}
        />
      </HStack>
      <Text type="supporting">{t('admin.channels.form.modelInputHint')}</Text>
    </VStack>
  )
}

/** Port of IntervalRow.vue */
function IntervalRow({
  interval,
  mode,
  platform,
  enableMultipliers,
  onChange,
  onRemove,
}: {
  interval: IntervalFormEntry
  mode: BillingMode
  platform?: string
  enableMultipliers?: boolean
  onChange: (next: IntervalFormEntry) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const isEmpty =
    isBlank(interval.input_price) &&
    isBlank(interval.output_price) &&
    isBlank(interval.cache_write_price) &&
    isBlank(interval.cache_write_1h_price) &&
    isBlank(interval.cache_write_12h_price) &&
    isBlank(interval.cache_read_price) &&
    isBlank(interval.input_multiplier) &&
    isBlank(interval.output_multiplier) &&
    isBlank(interval.cache_write_multiplier) &&
    isBlank(interval.cache_read_multiplier) &&
    isBlank(interval.per_request_price)
  const field = (key: keyof IntervalFormEntry) => (value: number | null) => onChange({ ...interval, [key]: value })
  const maxLabel = `${t('admin.channels.form.maxTokens')} ${t('admin.channels.form.inclusive')}`

  return (
    <Card padding={3} variant={isEmpty ? 'red' : 'default'}>
      <HStack gap={2} vAlign="start">
        <StackItem size="fill">
          {mode === 'token' ? (
            <Grid columns={{ minWidth: 120, repeat: 'fit' }} gap={2}>
              <NumberInput
                label={t('admin.channels.form.minTokens')}
                size="sm"
                value={interval.min_tokens}
                onChange={(value) => onChange({ ...interval, min_tokens: Math.trunc(value ?? 0) || 0 })}
                min={0}
                isIntegerOnly
              />
              <NumberInput
                label={maxLabel}
                size="sm"
                value={interval.max_tokens}
                onChange={(value) => onChange({ ...interval, max_tokens: value == null ? null : Math.trunc(value) })}
                min={0}
                isIntegerOnly
                hasClear
                placeholder="∞"
              />
              <PriceInput label={`${t('admin.channels.form.inputPrice')} $/M`} value={interval.input_price} onChange={field('input_price')} isRequired={isEmpty} />
              <PriceInput label={`${t('admin.channels.form.outputPrice')} $/M`} value={interval.output_price} onChange={field('output_price')} isRequired={isEmpty} />
              <PriceInput
                label={`${t(platform === 'openai' ? 'admin.channels.form.cacheWrite30mPrice' : 'admin.channels.form.cacheWrite5mPriceShort')} $/M`}
                value={interval.cache_write_price}
                onChange={field('cache_write_price')}
              />
              {platform !== 'openai' ? (
                <PriceInput label={`${t('admin.channels.form.cacheWrite1hPriceShort')} $/M`} value={interval.cache_write_1h_price} onChange={field('cache_write_1h_price')} />
              ) : (
                <PriceInput label={`${t('admin.channels.form.cacheWrite12hPriceShort')} $/M`} value={interval.cache_write_12h_price} onChange={field('cache_write_12h_price')} />
              )}
              <PriceInput label={`${t('admin.channels.form.cacheReadPriceShort')} $/M`} value={interval.cache_read_price} onChange={field('cache_read_price')} />
              {enableMultipliers && (
                <>
                  <PriceInput label={t('admin.channels.form.inputMultiplier')} value={interval.input_multiplier} onChange={field('input_multiplier')} min={0.000001} />
                  <PriceInput label={t('admin.channels.form.outputMultiplier')} value={interval.output_multiplier} onChange={field('output_multiplier')} min={0.000001} />
                  <PriceInput label={t('admin.channels.form.cacheWriteMultiplier')} value={interval.cache_write_multiplier} onChange={field('cache_write_multiplier')} min={0.000001} />
                  <PriceInput label={t('admin.channels.form.cacheReadMultiplier')} value={interval.cache_read_multiplier} onChange={field('cache_read_multiplier')} min={0.000001} />
                </>
              )}
            </Grid>
          ) : (
            <Grid columns={{ minWidth: 120, repeat: 'fit' }} gap={2}>
              <TextInput
                label={mode === 'image' ? t('admin.channels.form.resolution') : t('admin.channels.form.tierLabel')}
                size="sm"
                value={interval.tier_label}
                onChange={(tier_label) => onChange({ ...interval, tier_label })}
                placeholder={mode === 'image' ? '1K / 2K / 4K' : ''}
              />
              <NumberInput
                label={t('admin.channels.form.minTokens')}
                size="sm"
                value={interval.min_tokens}
                onChange={(value) => onChange({ ...interval, min_tokens: Math.trunc(value ?? 0) || 0 })}
                min={0}
                isIntegerOnly
              />
              <NumberInput
                label={maxLabel}
                size="sm"
                value={interval.max_tokens}
                onChange={(value) => onChange({ ...interval, max_tokens: value == null ? null : Math.trunc(value) })}
                min={0}
                isIntegerOnly
                hasClear
                placeholder="∞"
              />
              <PriceInput
                label={`${t('admin.channels.form.perRequestPrice')} $`}
                value={interval.per_request_price}
                onChange={field('per_request_price')}
                isRequired={isEmpty}
              />
            </Grid>
          )}
        </StackItem>
        <IconButton label={t('common.delete')} tooltip={t('common.delete')} variant="ghost" size="sm" icon={<Icon icon={XMarkIcon} />} onClick={onRemove} />
      </HStack>
    </Card>
  )
}

/** Port of TimePricingSection.vue */
function TimePricingSection({ value, onChange }: { value: TimePricingFormEntry; onChange: (next: TimePricingFormEntry) => void }) {
  const { t } = useI18n()
  const timezoneOptions = useMemo(() => {
    const zones = COMMON_TIMEZONES.includes(value.timezone) || !value.timezone ? COMMON_TIMEZONES : [value.timezone, ...COMMON_TIMEZONES]
    return zones.map((zone) => {
      const offset = formatTimezoneOffset(zone)
      return { value: zone, label: offset ? `${zone} (${offset})` : zone }
    })
  }, [value.timezone])
  const normalizeClockTime = (raw: string) => {
    const normalized = raw.replace(/：/g, ':')
    return normalized === '24:00:00' ? '00:00:00' : normalized
  }
  const updatePeriod = (index: number, patch: Partial<TimePricingPeriodFormEntry>) =>
    onChange({ ...value, periods: value.periods.map((period, i) => (i === index ? { ...period, ...patch } : period)) })

  return (
    <VStack gap={3} hAlign="stretch">
      <HStack gap={3} vAlign="end" hAlign="between" wrap="wrap">
        <VStack gap={2} hAlign="stretch">
          <Text type="label">{t('admin.channels.form.timePricing')}</Text>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={2}>
            <Selector
              label={t('admin.channels.form.timezone')}
              size="sm"
              value={value.timezone}
              onChange={(timezone) => onChange({ ...value, timezone })}
              options={timezoneOptions}
              hasSearch
            />
            <Selector
              label={t('admin.channels.form.timePricingDayScope')}
              size="sm"
              value={value.weekdays_only ? 'weekdays' : 'everyday'}
              onChange={(scope) => onChange({ ...value, weekdays_only: scope === 'weekdays' })}
              options={[
                { value: 'everyday', label: t('admin.channels.form.timePricingEveryDay') },
                { value: 'weekdays', label: t('admin.channels.form.timePricingWeekdaysOnly') },
              ]}
            />
          </Grid>
        </VStack>
        <Button
          size="sm"
          variant="ghost"
          icon={<Icon icon={PlusIcon} />}
          label={t('admin.channels.form.addTimePeriod')}
          onClick={() => onChange({ ...value, periods: [...value.periods, { start_time: '', end_time: '', multiplier: '1.00' }] })}
        />
      </HStack>
      {value.periods.map((period, index) => (
        <HStack key={index} gap={2} vAlign="end" wrap="wrap">
          <StackItem size="fill">
            <TextInput
              label={t('admin.channels.form.startTime')}
              size="sm"
              value={period.start_time}
              onChange={(raw) => updatePeriod(index, { start_time: normalizeClockTime(raw) })}
              placeholder="HH:mm:ss"
              inputMode="numeric"
              autoComplete="off"
            />
          </StackItem>
          <StackItem size="fill">
            <TextInput
              label={t('admin.channels.form.endTime')}
              size="sm"
              value={period.end_time}
              onChange={(raw) => updatePeriod(index, { end_time: normalizeClockTime(raw) })}
              placeholder="HH:mm:ss"
              inputMode="numeric"
              autoComplete="off"
            />
          </StackItem>
          <StackItem size="fill">
            <NumberInput
              label={t('admin.channels.form.multiplier')}
              size="sm"
              value={toNullableNumber(period.multiplier)}
              onChange={(next) => {
                const raw = next == null ? '' : String(next)
                updatePeriod(index, { multiplier: isValidTimePricingMultiplier(raw) ? Number(raw).toFixed(2) : raw })
              }}
              min={0.01}
              step={0.01}
            />
          </StackItem>
          <IconButton
            label={t('admin.channels.form.removeTimePeriod')}
            tooltip={t('admin.channels.form.removeTimePeriod')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={TrashIcon} />}
            onClick={() => onChange({ ...value, periods: value.periods.filter((_, i) => i !== index) })}
          />
        </HStack>
      ))}
    </VStack>
  )
}

/** Port of PricingEntryCard.vue */
function PricingEntryCard({
  entry,
  platform,
  enableTimePricing = false,
  enableTierMultipliers = false,
  onChange,
  onRemove,
}: {
  entry: PricingFormEntry
  platform: string
  enableTimePricing?: boolean
  enableTierMultipliers?: boolean
  onChange: (patch: Partial<PricingFormEntry>) => void
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
  const priceField = (key: keyof PricingFormEntry) => (value: number | null) => onChange({ [key]: value } as Partial<PricingFormEntry>)
  const pricePlaceholder = t('admin.channels.form.pricePlaceholder')

  const updateIntervals = (intervals: IntervalFormEntry[]) => onChange({ intervals })
  const addInterval = () => updateIntervals([...(entry.intervals || []), createInterval((entry.intervals || []).length)])
  const addMediaTier = () => {
    const intervals = entry.intervals || []
    const labels = entry.billing_mode === 'video' ? ['480p', '720p', '1080p'] : ['1K', '2K', '4K', 'HD']
    updateIntervals([...intervals, createInterval(intervals.length, labels[intervals.length] || '')])
  }
  const renderIntervals = (withPlatform: boolean) =>
    (entry.intervals || []).map((interval, idx) => (
      <IntervalRow
        key={idx}
        interval={interval}
        mode={entry.billing_mode}
        platform={withPlatform ? platform : undefined}
        enableMultipliers={withPlatform && enableTierMultipliers}
        onChange={(next) => updateIntervals(entry.intervals.map((iv, i) => (i === idx ? next : iv)))}
        onRemove={() => updateIntervals(entry.intervals.filter((_, i) => i !== idx))}
      />
    ))

  const updateReasoningMultiplier = (effort: string, value: number | null) => {
    const multipliers = { ...(entry.reasoning_effort_multipliers || {}) }
    if (value == null) delete multipliers[effort]
    else multipliers[effort] = value
    onChange({ reasoning_effort_multipliers: Object.keys(multipliers).length ? multipliers : null })
  }

  const handleModelsUpdate = async (newModels: string[]) => {
    const oldModels = entry.models
    onChange({ models: newModels })
    // Auto-fill default prices only when an empty entry gets its first single model
    const added = newModels.filter((m) => !oldModels.includes(m))
    if (oldModels.length !== 0 || added.length !== 1) return
    const hasPrice =
      entry.input_price != null ||
      entry.output_price != null ||
      entry.cache_write_price != null ||
      entry.cache_write_1h_price != null ||
      entry.cache_write_12h_price != null ||
      entry.cache_read_price != null
    if (hasPrice) return
    try {
      const result = await adminAPI.channels.getModelDefaultPricing(added[0])
      if (!result.found) return
      onChange({
        input_price: perTokenToMTok(result.input_price ?? null),
        output_price: perTokenToMTok(result.output_price ?? null),
        cache_write_price: perTokenToMTok(result.cache_write_price ?? null),
        cache_write_1h_price: perTokenToMTok(result.cache_write_1h_price ?? null),
        cache_write_12h_price: perTokenToMTok(result.cache_write_12h_price ?? null),
        cache_read_price: perTokenToMTok(result.cache_read_price ?? null),
        image_input_price: perTokenToMTok(result.image_input_price ?? null),
        image_output_price: perTokenToMTok(result.image_output_price ?? null),
        reasoning_effort_multipliers: entry.reasoning_effort_multipliers ?? result.reasoning_effort_multipliers ?? null,
      })
    } catch {
      // A failed lookup leaves the prices for the admin to fill in
    }
  }

  return (
    <Card variant="muted" padding={3}>
      <VStack gap={3} hAlign="stretch">
        <HStack gap={2} vAlign="center">
          <IconButton
            label={collapsed ? t('admin.ops.errorDetail.responsePreview.expand') : t('admin.ops.errorDetail.responsePreview.collapse')}
            variant="ghost"
            size="sm"
            icon={<Icon icon={collapsed ? ChevronRightIcon : ChevronDownIcon} />}
            onClick={() => setCollapsed((v) => !v)}
          />
          <StackItem size="fill">
            {collapsed ? (
              <HStack gap={1} vAlign="center" wrap="wrap">
                {entry.models.slice(0, 3).map((model, i) => (
                  <Token key={i} size="sm" color={platformTokenColor(platform)} label={model} />
                ))}
                {entry.models.length > 3 && <Text type="supporting">+{entry.models.length - 3}</Text>}
                {entry.models.length === 0 && <Text type="supporting">{t('admin.channels.form.noModels')}</Text>}
                <Badge variant="info" label={billingModeLabel} />
              </HStack>
            ) : (
              <Text type="supporting" weight="medium">{t('admin.channels.form.pricingEntry')}</Text>
            )}
          </StackItem>
          <IconButton label={t('common.delete')} tooltip={t('common.delete')} variant="ghost" size="sm" icon={<Icon icon={TrashIcon} />} onClick={onRemove} />
        </HStack>

        {!collapsed && (
          <VStack gap={4} hAlign="stretch">
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <VStack gap={1} hAlign="stretch">
                <Text type="label">
                  {t('admin.channels.form.models')} *
                </Text>
                <ModelTagInput
                  models={entry.models}
                  platform={platform}
                  placeholder={t('admin.channels.form.modelsPlaceholder')}
                  onChange={(models) => void handleModelsUpdate(models)}
                />
              </VStack>
              <Selector
                label={t('admin.channels.form.billingMode')}
                size="sm"
                value={entry.billing_mode}
                onChange={(mode) =>
                  onChange({
                    billing_mode: mode as BillingMode,
                    intervals: [],
                    time_pricing: { ...entry.time_pricing, periods: [] },
                  })
                }
                options={billingModeOptions}
              />
            </Grid>

            {entry.billing_mode === 'token' ? (
              <VStack gap={3} hAlign="stretch">
                <Text type="label">{t('admin.channels.form.defaultPrices')} ($/MTok)</Text>
                <Grid columns={{ minWidth: 128, repeat: 'fit' }} gap={2}>
                  <PriceInput label={t('admin.channels.form.inputPrice')} value={entry.input_price} onChange={priceField('input_price')} placeholder={pricePlaceholder} />
                  <PriceInput label={t('admin.channels.form.outputPrice')} value={entry.output_price} onChange={priceField('output_price')} placeholder={pricePlaceholder} />
                  <PriceInput
                    label={t(platform === 'openai' ? 'admin.channels.form.cacheWrite30mPrice' : 'admin.channels.form.cacheWrite5mPrice')}
                    value={entry.cache_write_price}
                    onChange={priceField('cache_write_price')}
                    placeholder={pricePlaceholder}
                  />
                  {platform !== 'openai' ? (
                    <PriceInput label={t('admin.channels.form.cacheWrite1hPrice')} value={entry.cache_write_1h_price} onChange={priceField('cache_write_1h_price')} placeholder={pricePlaceholder} />
                  ) : (
                    <PriceInput
                      label={t('admin.channels.form.cacheWrite12hPrice')}
                      labelTooltip={t('admin.channels.form.cacheWrite12hHint')}
                      value={entry.cache_write_12h_price}
                      onChange={priceField('cache_write_12h_price')}
                      placeholder={pricePlaceholder}
                    />
                  )}
                  <PriceInput label={t('admin.channels.form.cacheReadPrice')} value={entry.cache_read_price} onChange={priceField('cache_read_price')} placeholder={pricePlaceholder} />
                  <PriceInput label={t('admin.channels.form.imageInputPrice')} value={entry.image_input_price} onChange={priceField('image_input_price')} placeholder={pricePlaceholder} />
                  <PriceInput label={t('admin.channels.form.imageTokenPrice')} value={entry.image_output_price} onChange={priceField('image_output_price')} placeholder={pricePlaceholder} />
                </Grid>

                {enableTierMultipliers && (
                  <Grid columns={{ minWidth: 160, max: 2 }} gap={2}>
                    <PriceInput
                      label={t('admin.channels.form.fastMultiplier')}
                      value={entry.fast_multiplier}
                      onChange={priceField('fast_multiplier')}
                      min={0.000001}
                      placeholder={t('admin.channels.form.multiplierPlaceholder')}
                    />
                    <PriceInput
                      label={t('admin.channels.form.flexMultiplier')}
                      value={entry.flex_multiplier}
                      onChange={priceField('flex_multiplier')}
                      min={0.000001}
                      placeholder={t('admin.channels.form.multiplierPlaceholder')}
                    />
                  </Grid>
                )}

                <VStack gap={2} hAlign="stretch">
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <Text type="label">{t('admin.channels.form.intervals')} (min, max]</Text>
                    <Button size="sm" variant="ghost" icon={<Icon icon={PlusIcon} />} label={t('admin.channels.form.addInterval')} onClick={addInterval} />
                  </HStack>
                  {renderIntervals(true)}
                </VStack>

                {enableTimePricing && (
                  <TimePricingSection value={entry.time_pricing} onChange={(time_pricing) => onChange({ time_pricing })} />
                )}
              </VStack>
            ) : entry.billing_mode === 'per_request' ? (
              <VStack gap={3} hAlign="stretch">
                <PriceInput
                  label={`${t('admin.channels.form.defaultPerRequestPrice')} $`}
                  value={entry.per_request_price}
                  onChange={priceField('per_request_price')}
                  placeholder={pricePlaceholder}
                />
                <HStack gap={2} vAlign="center" hAlign="between">
                  <Text type="label">{t('admin.channels.form.requestTiers')}</Text>
                  <Button size="sm" variant="ghost" icon={<Icon icon={PlusIcon} />} label={t('admin.channels.form.addTier')} onClick={addInterval} />
                </HStack>
                {(entry.intervals || []).length > 0 ? renderIntervals(false) : <Text type="supporting">{t('admin.channels.form.noTiersYet')}</Text>}
              </VStack>
            ) : (
              <VStack gap={3} hAlign="stretch">
                <PriceInput
                  label={`${entry.billing_mode === 'video' ? t('admin.channels.form.defaultVideoPrice') : t('admin.channels.form.defaultImagePrice')} $`}
                  value={entry.per_request_price}
                  onChange={priceField('per_request_price')}
                  placeholder={pricePlaceholder}
                />
                <HStack gap={2} vAlign="center" hAlign="between">
                  <Text type="label">{entry.billing_mode === 'video' ? t('admin.channels.form.videoTiers') : t('admin.channels.form.imageTiers')}</Text>
                  <Button size="sm" variant="ghost" icon={<Icon icon={PlusIcon} />} label={t('admin.channels.form.addTier')} onClick={addMediaTier} />
                </HStack>
                {renderIntervals(false)}
              </VStack>
            )}

            <VStack gap={2} hAlign="stretch">
              <HStack gap={2} vAlign="center" hAlign="between">
                <Text type="label">{t('admin.channels.form.reasoningEffortMultipliers')}</Text>
                {Object.keys(entry.reasoning_effort_multipliers || {}).length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    label={t('admin.channels.form.clearReasoningEffortMultipliers')}
                    onClick={() => onChange({ reasoning_effort_multipliers: null })}
                  />
                )}
              </HStack>
              <Text type="supporting">{t('admin.channels.form.reasoningEffortMultipliersHint')}</Text>
              <Grid columns={{ minWidth: 110, repeat: 'fit' }} gap={2}>
                {REASONING_EFFORT_LEVELS.map((effort) => (
                  <NumberInput
                    key={effort}
                    label={effort}
                    size="sm"
                    value={toNullableNumber(entry.reasoning_effort_multipliers?.[effort])}
                    onChange={(next) => updateReasoningMultiplier(effort, next ?? null)}
                    min={0}
                    step={null}
                    hasClear
                    placeholder={t('admin.channels.form.reasoningEffortMultiplierDefault')}
                    status={
                      isValidPositiveMultiplier(entry.reasoning_effort_multipliers?.[effort]) ? undefined : { type: 'error' }
                    }
                  />
                ))}
              </Grid>
              {reasoningError && <Banner status="error" title={reasoningError} />}
            </VStack>
          </VStack>
        )}
      </VStack>
    </Card>
  )
}

/* ------------------------------------------------------------------------- */
/* Account search for account-stats pricing rules                            */
/* ------------------------------------------------------------------------- */

interface AccountItem extends SearchableItem<{ id: number; name: string }> {
  id: string
  label: string
}

function RuleAccountPicker({
  platform,
  selectedIds,
  onSelect,
}: {
  platform: string
  selectedIds: number[]
  onSelect: (account: { id: number; name: string }) => void
}) {
  const { t } = useI18n()
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds
  const source = useMemo<SearchSource<AccountItem>>(() => {
    const search = async (query: string) => {
      const res = await adminAPI.accounts.list(1, 20, { platform, search: query })
      return res.items
        .filter((a) => !selectedRef.current.includes(a.id))
        .map((a) => ({ id: String(a.id), label: `${a.name} #${a.id}`, auxiliaryData: { id: a.id, name: a.name } }))
    }
    return { search, bootstrap: () => search('') }
  }, [platform])

  return (
    <Typeahead<AccountItem>
      label={t('admin.channels.form.ruleAccounts')}
      isLabelHidden
      size="sm"
      searchSource={source}
      value={null}
      onChange={(item) => {
        if (item?.auxiliaryData) onSelect(item.auxiliaryData)
      }}
      placeholder={t('admin.channels.form.searchAccountPlaceholder')}
      hasEntriesOnFocus
      minQueryLength={0}
      debounceMs={300}
      startIcon={MagnifyingGlassIcon}
    />
  )
}

/* ------------------------------------------------------------------------- */
/* Page                                                                      */
/* ------------------------------------------------------------------------- */

/** React port of views/admin/ChannelsView.vue */
export function AdminChannelsPage() {
  const { t, te } = useI18n()

  const [channels, setChannels] = useState<Channel[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [sort, setSort] = useState<Array<{ sortKey: string; direction: SortDirection }>>([
    { sortKey: 'created_at', direction: 'descending' },
  ])

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [form, setForm] = useState<ChannelForm>(EMPTY_FORM)
  const [activeTab, setActiveTab] = useState<string>('basic')
  const [submitting, setSubmitting] = useState(false)
  const [allGroups, setAllGroups] = useState<AdminGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [allChannelsForConflict, setAllChannelsForConflict] = useState<Channel[]>([])
  const [webSearchGlobalEnabled, setWebSearchGlobalEnabled] = useState(false)
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null)
  const [ruleAccountNames, setRuleAccountNames] = useState<Record<number, string>>({})
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null)
  const [deleting, setDeleting] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const platformOrder = useMemo(() => listPlatformIds() as GroupPlatform[], [])

  const platformName = useCallback(
    (platform: string) => {
      const key = `admin.groups.platforms.${platform}`
      return te(key) ? t(key) : catalogPlatformLabel(platform)
    },
    [t, te],
  )

  /* ---------------- list ---------------- */

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const loadChannels = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl
    setLoading(true)

    try {
      const response = await adminAPI.channels.list(
        page,
        pageSize,
        {
          status: statusFilter || undefined,
          search: searchQuery || undefined,
          sort_by: sort[0]?.sortKey || 'created_at',
          sort_order: sort[0]?.direction === 'ascending' ? 'asc' : 'desc',
        },
        { signal: ctrl.signal }
      )

      if (ctrl.signal.aborted || abortControllerRef.current !== ctrl) return
      setChannels(response.items || [])
      setTotal(response.total || 0)
    } catch (error: unknown) {
      const e = error as { name?: string; code?: string }
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return
      toast.error(extractApiErrorMessage(error, t('admin.channels.loadError')))
      console.error('Failed to load channels:', error)
    } finally {
      if (abortControllerRef.current === ctrl) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [page, pageSize, statusFilter, searchQuery, sort, t])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const groups = await adminAPI.groups.getAll()
      setAllGroups(groups)
      return groups
    } catch (error) {
      console.error('Error loading groups:', error)
      return [] as AdminGroup[]
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  // Web search emulation is only configurable while the global switch has providers
  useEffect(() => {
    adminAPI.settings
      .getWebSearchEmulationConfig()
      .then((cfg) => setWebSearchGlobalEnabled(cfg?.enabled === true && (cfg?.providers?.length ?? 0) > 0))
      .catch((err) => {
        console.warn('Failed to load web search global state:', err)
        setWebSearchGlobalEnabled(false)
      })
    void loadGroups()
  }, [loadGroups])

  const loadAllChannelsForConflict = useCallback(async () => {
    try {
      const response = await adminAPI.channels.list(1, 1000)
      setAllChannelsForConflict(response.items || [])
    } catch {
      setAllChannelsForConflict(channels)
    }
  }, [channels])

  const handleToggleStatus = useCallback(
    async (channel: Channel) => {
      const newStatus = channel.status === 'active' ? 'disabled' : 'active'
      try {
        await adminAPI.channels.update(channel.id, { status: newStatus })
        if (statusFilter && statusFilter !== newStatus) {
          await loadChannels()
        } else {
          setChannels((prev) => prev.map((c) => (c.id === channel.id ? { ...c, status: newStatus } : c)))
        }
        toast.success(t('admin.channels.updateSuccess'))
      } catch (error) {
        toast.error(t('admin.channels.updateError'))
        console.error('Error toggling channel status:', error)
      }
    },
    [statusFilter, loadChannels, t]
  )

  /* ---------------- form ↔ API ---------------- */

  const compositeAware = useCallback(
    (groupPlatform: string | undefined, platform: GroupPlatform) =>
      groupPlatform === platform || (groupPlatform === 'composite' && platformOrder.includes(platform)),
    [platformOrder],
  )

  const apiToForm = useCallback(
    (channel: Channel, groups: AdminGroup[]): PlatformSection[] => {
      const groupPlatformMap = new Map<number, string>(groups.map((g) => [g.id, g.platform]))
      const active = new Set<GroupPlatform>()
      for (const gid of channel.group_ids || []) {
        const p = groupPlatformMap.get(gid)
        if (p === 'composite') platformOrder.forEach((platform) => active.add(platform))
        else if (p) active.add(p as GroupPlatform)
      }
      for (const p of channel.model_pricing || []) {
        if (p.platform) active.add(p.platform as GroupPlatform)
      }
      for (const p of Object.keys(channel.model_mapping || {})) {
        if (platformOrder.includes(p as GroupPlatform)) active.add(p as GroupPlatform)
      }

      const fc = channel.features_config
      const wsEmulation = fc?.web_search_emulation as Record<string, boolean> | undefined
      const codexBridge = fc?.codex_image_generation_bridge as Record<string, boolean> | undefined
      const sections: PlatformSection[] = []
      for (const platform of platformOrder) {
        if (!active.has(platform)) continue
        const mapping = (channel.model_mapping || {})[platform] || {}
        sections.push({
          platform,
          enabled: true,
          group_ids: (channel.group_ids || []).filter((gid) => compositeAware(groupPlatformMap.get(gid), platform)),
          model_mapping: Object.entries(mapping).map(([from, to]) => ({ key: nextKey(), from, to })),
          model_pricing: (channel.model_pricing || [])
            .filter((p) => (p.platform || 'anthropic') === platform)
            .map((p) => ({
              __key: nextKey(),
              models: p.models || [],
              billing_mode: p.billing_mode,
              input_price: perTokenToMTok(p.input_price),
              output_price: perTokenToMTok(p.output_price),
              cache_write_price: perTokenToMTok(p.cache_write_price),
              cache_write_1h_price: perTokenToMTok(p.cache_write_1h_price),
              cache_write_12h_price: perTokenToMTok(p.cache_write_12h_price),
              cache_read_price: perTokenToMTok(p.cache_read_price),
              fast_multiplier: p.fast_multiplier,
              flex_multiplier: p.flex_multiplier,
              reasoning_effort_multipliers: p.reasoning_effort_multipliers ? { ...p.reasoning_effort_multipliers } : null,
              image_input_price: perTokenToMTok(p.image_input_price),
              image_output_price: perTokenToMTok(p.image_output_price),
              per_request_price: p.per_request_price,
              intervals: apiIntervalsToForm(p.intervals || []),
              time_pricing: apiTimePricingToForm(p.time_pricing),
            })),
          web_search_emulation: wsEmulation?.[platform] === true,
          codex_image_generation_bridge: codexBridge?.[platform] === true,
          bedrock_cc_compat: fc?.bedrock_cc_compat === true,
          account_stats_pricing_rules: [],
        })
      }

      // Distribute channel-level account stats rules into the platform inferred from their groups
      for (const apiRule of channel.account_stats_pricing_rules || []) {
        const platforms = new Set<string>()
        for (const gid of apiRule.group_ids || []) {
          const p = groupPlatformMap.get(gid)
          if (p && p !== 'composite') platforms.add(p)
        }
        if (platforms.size === 0 && apiRule.pricing?.length > 0 && apiRule.pricing[0].platform) {
          platforms.add(apiRule.pricing[0].platform)
        }
        const target = [...platforms][0]
        const section = sections.find((s) => s.platform === target)
        if (!section) continue
        section.account_stats_pricing_rules.push({
          key: nextKey(),
          name: apiRule.name || '',
          group_ids: [...(apiRule.group_ids || [])],
          account_ids: [...(apiRule.account_ids || [])],
          pricing: (apiRule.pricing || []).map((p) => ({
            __key: nextKey(),
            models: [...(p.models || [])],
            billing_mode: p.billing_mode,
            input_price: perTokenToMTok(p.input_price),
            output_price: perTokenToMTok(p.output_price),
            cache_write_price: perTokenToMTok(p.cache_write_price),
            cache_write_1h_price: perTokenToMTok(p.cache_write_1h_price),
            cache_write_12h_price: perTokenToMTok(p.cache_write_12h_price),
            cache_read_price: perTokenToMTok(p.cache_read_price),
            reasoning_effort_multipliers: p.reasoning_effort_multipliers ? { ...p.reasoning_effort_multipliers } : null,
            image_input_price: perTokenToMTok(p.image_input_price),
            image_output_price: perTokenToMTok(p.image_output_price),
            per_request_price: p.per_request_price,
            intervals: apiIntervalsToForm(p.intervals || []),
            time_pricing: createDefaultTimePricingForm(),
          })),
        })
      }
      return sections
    },
    [platformOrder, compositeAware],
  )

  const pricingEntryToAPI = (platform: string, entry: PricingFormEntry, withTiersAndTime: boolean): ChannelModelPricing => ({
    platform,
    models: entry.models,
    billing_mode: entry.billing_mode,
    input_price: mTokToPerToken(entry.input_price),
    output_price: mTokToPerToken(entry.output_price),
    cache_write_price: mTokToPerToken(entry.cache_write_price),
    cache_write_1h_price: mTokToPerToken(entry.cache_write_1h_price),
    cache_write_12h_price: mTokToPerToken(entry.cache_write_12h_price),
    cache_read_price: mTokToPerToken(entry.cache_read_price),
    ...(withTiersAndTime
      ? {
          fast_multiplier: !isBlank(entry.fast_multiplier) ? Number(entry.fast_multiplier) : null,
          flex_multiplier: !isBlank(entry.flex_multiplier) ? Number(entry.flex_multiplier) : null,
        }
      : {}),
    reasoning_effort_multipliers: formReasoningEffortMultipliersToAPI(entry.reasoning_effort_multipliers),
    image_input_price: mTokToPerToken(entry.image_input_price),
    image_output_price: mTokToPerToken(entry.image_output_price),
    per_request_price: !isBlank(entry.per_request_price) ? Number(entry.per_request_price) : null,
    intervals: formIntervalsToAPI(entry.intervals || []),
    time_pricing: withTiersAndTime ? formTimePricingToAPI(entry.time_pricing) : null,
  })

  const formToAPI = () => {
    const group_ids: number[] = []
    const model_pricing: ChannelModelPricing[] = []
    const model_mapping: Record<string, Record<string, string>> = {}
    // Keep features_config fields the form does not manage
    const featuresConfig: Record<string, unknown> = editingChannel?.features_config ? { ...editingChannel.features_config } : {}

    for (const section of form.platforms) {
      if (!section.enabled) continue
      group_ids.push(...section.group_ids)
      const mapping = Object.fromEntries(section.model_mapping.filter((row) => row.from.trim()).map((row) => [row.from.trim(), row.to]))
      if (Object.keys(mapping).length > 0) model_mapping[section.platform] = mapping
      for (const entry of section.model_pricing) {
        if (entry.models.length === 0) continue
        model_pricing.push(pricingEntryToAPI(section.platform, entry, true))
      }
    }

    // Every whitelisted section is written explicitly (false included) so a disabled
    // section never leaves a stale `true` behind.
    const wsEmulation: Record<string, boolean> = {}
    for (const section of form.platforms) {
      if (!WEB_SEARCH_EMULATION_PLATFORMS.has(section.platform)) continue
      wsEmulation[section.platform] = section.enabled ? section.web_search_emulation : false
    }
    if (Object.keys(wsEmulation).length > 0) featuresConfig.web_search_emulation = wsEmulation
    else delete featuresConfig.web_search_emulation

    const codexBridge: Record<string, boolean> = {}
    const bedrockCompat: Record<string, boolean> = {}
    for (const section of form.platforms) {
      if (!section.enabled) continue
      if (section.platform === 'openai') codexBridge[section.platform] = section.codex_image_generation_bridge
      if (section.platform === 'anthropic') bedrockCompat[section.platform] = section.bedrock_cc_compat
    }
    if (Object.keys(codexBridge).length > 0) featuresConfig.codex_image_generation_bridge = codexBridge
    else delete featuresConfig.codex_image_generation_bridge
    if (Object.keys(bedrockCompat).length > 0) featuresConfig.bedrock_cc_compat = bedrockCompat
    else delete featuresConfig.bedrock_cc_compat

    const rules: AccountStatsPricingRule[] = []
    for (const section of form.platforms) {
      if (!section.enabled) continue
      for (const rule of section.account_stats_pricing_rules) {
        rules.push({
          name: rule.name,
          group_ids: rule.group_ids,
          account_ids: rule.account_ids,
          pricing: rule.pricing.filter((p) => p.models.length > 0).map((p) => pricingEntryToAPI(section.platform, p, false)),
        })
      }
    }

    return { group_ids: Array.from(new Set(group_ids)), model_pricing, model_mapping, features_config: featuresConfig, rules }
  }

  /* ---------------- form state updates ---------------- */

  const updateSection = (platform: string, patch: (section: PlatformSection) => PlatformSection) =>
    setForm((prev) => ({ ...prev, platforms: prev.platforms.map((s) => (s.platform === platform ? patch(s) : s)) }))

  const togglePlatform = (platform: GroupPlatform) => {
    setForm((prev) => {
      const existing = prev.platforms.find((s) => s.platform === platform)
      if (existing) {
        return { ...prev, platforms: prev.platforms.map((s) => (s.platform === platform ? { ...s, enabled: !s.enabled } : s)) }
      }
      return {
        ...prev,
        platforms: [
          ...prev.platforms,
          {
            platform,
            enabled: true,
            group_ids: [],
            model_mapping: [],
            model_pricing: [],
            web_search_emulation: false,
            codex_image_generation_bridge: false,
            bedrock_cc_compat: false,
            account_stats_pricing_rules: [],
          },
        ],
      }
    })
    if (activeTab === platform) setActiveTab('basic')
  }

  const updatePricing = (platform: string, key: number, patch: Partial<PricingFormEntry>) =>
    updateSection(platform, (s) => ({ ...s, model_pricing: s.model_pricing.map((e) => (e.__key === key ? { ...e, ...patch } : e)) }))

  const updateRule = (platform: string, ruleKey: number, patch: (rule: FormPricingRule) => FormPricingRule) =>
    updateSection(platform, (s) => ({
      ...s,
      account_stats_pricing_rules: s.account_stats_pricing_rules.map((r) => (r.key === ruleKey ? patch(r) : r)),
    }))

  const groupToChannel = useMemo(() => {
    const map = new Map<number, Channel>()
    for (const ch of allChannelsForConflict) {
      if (editingChannel && ch.id === editingChannel.id) continue
      for (const gid of ch.group_ids || []) map.set(gid, ch)
    }
    return map
  }, [allChannelsForConflict, editingChannel])

  const groupsForPlatform = (platform: GroupPlatform) => allGroups.filter((g) => compositeAware(g.platform, platform))
  const groupNameById = (groupId: number) => allGroups.find((g) => g.id === groupId)?.name || `#${groupId}`

  const syncLatestModels = async (platform: GroupPlatform) => {
    const section = form.platforms.find((s) => s.platform === platform)
    if (!section || syncingPlatform || !supportsPricingModelSync(platform)) return
    setSyncingPlatform(platform)
    try {
      const result = await adminAPI.channels.syncPricingModels(platform)
      const existing = new Set(section.model_pricing.flatMap((e) => e.models))
      const newModels = result.models.filter((m) => !existing.has(m))
      if (newModels.length === 0) {
        toast.success(t('admin.channels.form.syncModelsAlreadyUpToDate'))
        return
      }
      // New models land in a single new entry; the admin fills in the prices
      updateSection(platform, (s) => ({ ...s, model_pricing: [...s.model_pricing, createPricingEntry(newModels)] }))
      toast.success(t('admin.channels.form.syncModelsSuccess', { count: newModels.length }))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.channels.form.syncModelsError')))
    } finally {
      setSyncingPlatform(null)
    }
  }

  /* ---------------- dialog ---------------- */

  const openCreateDialog = useCallback(async () => {
    setEditingChannel(null)
    setForm(EMPTY_FORM)
    setActiveTab('basic')
    setRuleAccountNames({})
    await Promise.all([loadGroups(), loadAllChannelsForConflict()])
    setShowDialog(true)
  }, [loadGroups, loadAllChannelsForConflict])

  const openEditDialog = useCallback(
    async (channel: Channel) => {
      setEditingChannel(channel)
      setActiveTab('basic')
      // Groups are needed first so group ids map onto platforms
      const [groups] = await Promise.all([loadGroups(), loadAllChannelsForConflict()])
      setForm({
        name: channel.name,
        description: channel.description || '',
        status: channel.status,
        restrict_models: channel.restrict_models || false,
        billing_model_source: channel.billing_model_source || 'channel_mapped',
        platforms: apiToForm(channel, groups),
        apply_pricing_to_account_stats: channel.apply_pricing_to_account_stats || false,
      })
      // Names for accounts already referenced by account stats rules
      const accountIds = [...new Set((channel.account_stats_pricing_rules || []).flatMap((r) => r.account_ids || []))]
      const names: Record<number, string> = {}
      if (accountIds.length > 0) {
        const results = await Promise.allSettled(accountIds.map((id) => adminAPI.accounts.getById(id)))
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') names[accountIds[i]] = result.value.name
        })
      }
      setRuleAccountNames(names)
      setShowDialog(true)
    },
    [loadGroups, loadAllChannelsForConflict, apiToForm],
  )

  const closeDialog = useCallback(() => {
    if (submitting) return
    setShowDialog(false)
    setEditingChannel(null)
    setForm(EMPTY_FORM)
  }, [submitting])

  const handleSubmit = async () => {
    if (submitting) return
    if (!form.name.trim()) {
      toast.error(t('admin.channels.nameRequired'))
      return
    }
    const enabled = form.platforms.filter((s) => s.enabled)
    const fail = (message: string, platform: string) => {
      toast.error(message)
      setActiveTab(platform)
    }
    const entryLabel = (section: PlatformSection, entry: PricingFormEntry) =>
      `${platformName(section.platform)} - ${entry.models.join(', ') || t('admin.channels.form.unnamed')}`

    for (const section of enabled) {
      if (section.group_ids.length === 0) {
        return fail(t('admin.channels.noGroupsSelected', { platform: platformName(section.platform) }), section.platform)
      }
      if (section.model_pricing.some((e) => e.models.length === 0)) {
        return fail(t('admin.channels.emptyModelsInPricing', { platform: platformName(section.platform) }), section.platform)
      }
    }
    for (const section of enabled) {
      const pricingConflict = findModelConflict(section.model_pricing.flatMap((e) => e.models))
      if (pricingConflict) {
        return fail(t('admin.channels.modelConflict', { model1: pricingConflict[0], model2: pricingConflict[1] }), section.platform)
      }
      const mappingKeys = section.model_mapping.map((row) => row.from.trim()).filter(Boolean)
      const mappingConflict = mappingKeys.length > 0 ? findModelConflict(mappingKeys) : null
      if (mappingConflict) {
        return fail(t('admin.channels.mappingConflict', { model1: mappingConflict[0], model2: mappingConflict[1] }), section.platform)
      }
    }
    for (const section of enabled) {
      for (const entry of section.model_pricing) {
        if (
          (entry.billing_mode === 'per_request' || entry.billing_mode === 'image') &&
          isBlank(entry.per_request_price) &&
          (!entry.intervals || entry.intervals.length === 0)
        ) {
          toast.error(t('admin.channels.form.perRequestPriceRequired'))
          return
        }
      }
    }
    for (const section of enabled) {
      for (const entry of [...section.model_pricing, ...section.account_stats_pricing_rules.flatMap((r) => r.pricing)]) {
        const error = validateReasoningEffortMultipliers(entry.reasoning_effort_multipliers, t)
        if (error) return fail(`${entryLabel(section, entry)}: ${error}`, section.platform)
      }
    }
    for (const section of enabled) {
      for (const entry of section.model_pricing) {
        if (!isValidPositiveMultiplier(entry.fast_multiplier) || !isValidPositiveMultiplier(entry.flex_multiplier)) {
          return fail(`${entryLabel(section, entry)}: ${t('admin.channels.form.multiplierPositive')}`, section.platform)
        }
        if (entry.intervals && entry.intervals.length > 0) {
          const intervalErr = validateIntervals(entry.intervals, entry.billing_mode, t)
          if (intervalErr) return fail(`${entryLabel(section, entry)}: ${intervalErr}`, section.platform)
        }
      }
    }
    for (const section of enabled) {
      for (const entry of section.model_pricing) {
        const timePricingError = validateTimePricing(entry.time_pricing, t)
        if (timePricingError) return fail(`${entryLabel(section, entry)}: ${timePricingError}`, section.platform)
      }
    }

    const { group_ids, model_pricing, model_mapping, features_config, rules } = formToAPI()
    setSubmitting(true)
    try {
      if (editingChannel) {
        const req: UpdateChannelRequest = {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          status: form.status,
          group_ids,
          model_pricing,
          model_mapping,
          billing_model_source: form.billing_model_source,
          restrict_models: form.restrict_models,
          features_config,
          apply_pricing_to_account_stats: form.apply_pricing_to_account_stats,
          account_stats_pricing_rules: rules,
        }
        await adminAPI.channels.update(editingChannel.id, req)
        toast.success(t('admin.channels.updateSuccess'))
      } else {
        const req: CreateChannelRequest = {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          group_ids,
          model_pricing,
          model_mapping,
          billing_model_source: form.billing_model_source,
          restrict_models: form.restrict_models,
          features_config,
          apply_pricing_to_account_stats: form.apply_pricing_to_account_stats,
          account_stats_pricing_rules: rules,
        }
        await adminAPI.channels.create(req)
        toast.success(t('admin.channels.createSuccess'))
      }
      setShowDialog(false)
      setEditingChannel(null)
      setForm(EMPTY_FORM)
      loadChannels()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, editingChannel ? t('admin.channels.updateError') : t('admin.channels.createError')))
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = useCallback(async () => {
    if (!deletingChannel) return
    setDeleting(true)
    try {
      await adminAPI.channels.remove(deletingChannel.id)
      toast.success(t('admin.channels.deleteSuccess'))
      setDeletingChannel(null)
      loadChannels()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.channels.deleteError')))
      console.error('Error deleting channel:', error)
    } finally {
      setDeleting(false)
    }
  }, [deletingChannel, loadChannels, t])

  /* ---------------- table ---------------- */

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.channels.allStatus') },
      { value: 'active', label: t('admin.channels.statusActive') },
      { value: 'disabled', label: t('admin.channels.statusDisabled') },
    ],
    [t]
  )

  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels])

  const columns = useMemo<TableColumn<ChannelRow>[]>(
    () => [
      {
        key: 'name',
        header: t('admin.channels.columns.name'),
        width: proportional(2),
        sortable: true,
        renderCell: (row: ChannelRow) => (
          <Text weight="semibold" color="primary">
            {row.name}
          </Text>
        ),
      },
      {
        key: 'description',
        header: t('admin.channels.columns.description'),
        width: proportional(2),
        renderCell: (row: ChannelRow) => (
          <Text color="secondary">
            {row.description || '-'}
          </Text>
        ),
      },
      {
        key: 'status',
        header: t('admin.channels.columns.status'),
        width: pixel(100),
        sortable: true,
        renderCell: (row: ChannelRow) => {
          const channel = channelById.get(row.id)
          if (!channel) return null
          return (
            <Switch
              label={channel.status === 'active' ? t('admin.channels.statusActive') : t('admin.channels.statusDisabled')}
              isLabelHidden
              value={channel.status === 'active'}
              onChange={() => void handleToggleStatus(channel)}
            />
          )
        },
      },
      {
        key: 'group_count',
        header: t('admin.channels.columns.groups'),
        width: pixel(110),
        renderCell: (row: ChannelRow) => <Badge label={`${row.group_ids.length} ${t('admin.channels.groupsUnit')}`} />,
      },
      {
        key: 'pricing_count',
        header: t('admin.channels.columns.pricing'),
        width: pixel(140),
        renderCell: (row: ChannelRow) => <Badge label={`${row.model_pricing.length} ${t('admin.channels.pricingUnit')}`} />,
      },
      {
        key: 'created_at',
        header: t('admin.channels.columns.createdAt'),
        width: pixel(120),
        sortable: true,
        renderCell: (row: ChannelRow) => (
          <Text color="secondary">
            {formatDate(row.created_at)}
          </Text>
        ),
      },
      {
        key: 'actions',
        header: t('admin.channels.columns.actions'),
        width: pixel(110),
        renderCell: (row: ChannelRow) => {
          const channel = channelById.get(row.id)
          if (!channel) return null
          return (
            <HStack gap={1}>
              <IconButton
                label={t('common.edit')}
                tooltip={t('common.edit')}
                variant="ghost"
                icon={<Icon icon={PencilIcon} />}
                onClick={() => void openEditDialog(channel)}
              />
              <IconButton
                label={t('common.delete')}
                tooltip={t('common.delete')}
                variant="ghost"
                icon={<Icon icon={TrashIcon} />}
                onClick={() => setDeletingChannel(channel)}
              />
            </HStack>
          )
        },
      },
    ],
    [t, channelById, handleToggleStatus, openEditDialog]
  )

  const tableRows = useMemo<ChannelRow[]>(
    () =>
      channels.map((channel) => ({
        __id: String(channel.id),
        id: channel.id,
        name: channel.name,
        description: channel.description,
        status: channel.status,
        group_ids: channel.group_ids || [],
        model_pricing: channel.model_pricing || [],
        created_at: channel.created_at,
      })),
    [channels]
  )

  const sortPlugin = useTableSortable<ChannelRow>({
    sort,
    onSortChange: (next) => {
      setSort(next.length > 0 ? next : [{ sortKey: 'created_at', direction: 'descending' }])
      setPage(1)
    },
  })

  const paginationPlugin = useTablePagination<ChannelRow>({
    page,
    pageSize,
    totalItems: total,
    onPageChange: setPage,
    onPageSizeChange: (size) => {
      setPageSize(size)
      setPersistedPageSize(size)
      setPage(1)
    },
    pageSizeOptions,
  })

  /* ---------------- dialog content ---------------- */

  const enabledSections = form.platforms.filter((s) => s.enabled)
  const activeSection = enabledSections.find((s) => s.platform === activeTab)

  const renderBasicTab = () => (
    <VStack gap={5} hAlign="stretch">
      <TextInput
        label={t('admin.channels.form.name')}
        value={form.name}
        onChange={(name) => setForm((prev) => ({ ...prev, name }))}
        placeholder={t('admin.channels.form.namePlaceholder')}
        isRequired
      />
      <TextArea
        label={t('admin.channels.form.description')}
        value={form.description}
        onChange={(description) => setForm((prev) => ({ ...prev, description }))}
        rows={2}
        placeholder={t('admin.channels.form.descriptionPlaceholder')}
      />
      {editingChannel && (
        <Selector
          label={t('admin.channels.form.status')}
          value={form.status}
          onChange={(status) => setForm((prev) => ({ ...prev, status: status as 'active' | 'disabled' }))}
          options={[
            { value: 'active', label: t('admin.channels.statusActive') },
            { value: 'disabled', label: t('admin.channels.statusDisabled') },
          ]}
        />
      )}
      <CheckboxInput
        label={t('admin.channels.form.restrictModels')}
        description={t('admin.channels.form.restrictModelsHint')}
        value={form.restrict_models}
        onChange={(restrict_models) => setForm((prev) => ({ ...prev, restrict_models }))}
      />
      <Selector
        label={t('admin.channels.form.billingModelSource')}
        description={t('admin.channels.form.billingModelSourceHint')}
        value={form.billing_model_source}
        onChange={(billing_model_source) => setForm((prev) => ({ ...prev, billing_model_source }))}
        options={[
          { value: 'channel_mapped', label: t('admin.channels.form.billingModelSourceChannelMapped') },
          { value: 'requested', label: t('admin.channels.form.billingModelSourceRequested') },
          { value: 'upstream', label: t('admin.channels.form.billingModelSourceUpstream') },
          { value: 'response_model', label: t('admin.channels.form.billingModelSourceResponse') },
        ]}
      />
      <VStack gap={2} hAlign="stretch">
        <Text type="label">{t('admin.channels.form.platformConfig')}</Text>
        <Grid columns={{ minWidth: 160, repeat: 'fill' }} gap={2}>
          {platformOrder.map((platform) => (
            <CheckboxInput
              key={platform}
              label={platformName(platform)}
              value={enabledSections.some((s) => s.platform === platform)}
              onChange={() => togglePlatform(platform)}
            />
          ))}
        </Grid>
      </VStack>
      <Card padding={4}>
        <Switch
          label={t('admin.channels.form.applyPricingToAccountStats')}
          description={t('admin.channels.form.applyPricingToAccountStatsDesc')}
          value={form.apply_pricing_to_account_stats}
          onChange={(apply_pricing_to_account_stats) => setForm((prev) => ({ ...prev, apply_pricing_to_account_stats }))}
          labelPosition="start"
          labelSpacing="spread"
          width="100%"
        />
      </Card>
    </VStack>
  )

  const renderPlatformTab = (section: PlatformSection) => {
    const platform = section.platform
    const groups = groupsForPlatform(platform)
    return (
      <VStack gap={5} hAlign="stretch">
        {/* Groups */}
        <VStack gap={2} hAlign="stretch">
          <HStack gap={2} vAlign="center">
            <Text type="label">{t('admin.channels.form.groups')} *</Text>
            {section.group_ids.length > 0 && (
              <Text type="supporting">({t('admin.channels.form.selectedCount', { count: section.group_ids.length })})</Text>
            )}
          </HStack>
          <Card variant="muted" padding={3}>
            {groupsLoading ? (
              <Center padding={2}>
                <Spinner size="sm" label={t('common.loading')} />
              </Center>
            ) : groups.length === 0 ? (
              <Text type="supporting">{t('admin.channels.form.noGroupsAvailable')}</Text>
            ) : (
              <Grid columns={{ minWidth: 220, repeat: 'fill' }} gap={2}>
                {groups.map((group) => {
                  const otherChannel = groupToChannel.get(group.id)
                  return (
                    <CheckboxInput
                      key={group.id}
                      size="sm"
                      label={group.name}
                      description={`${group.rate_multiplier}x · ${group.account_count || 0}${
                        otherChannel ? ` · ${t('admin.channels.form.inOtherChannel', { name: otherChannel.name })}` : ''
                      }`}
                      value={section.group_ids.includes(group.id)}
                      isDisabled={Boolean(otherChannel)}
                      onChange={(checked) =>
                        updateSection(platform, (s) => ({
                          ...s,
                          group_ids: checked ? [...s.group_ids, group.id] : s.group_ids.filter((id) => id !== group.id),
                        }))
                      }
                    />
                  )
                })}
              </Grid>
            )}
          </Card>
        </VStack>

        {WEB_SEARCH_EMULATION_PLATFORMS.has(platform) && webSearchGlobalEnabled && (
          <Card padding={4}>
            <Switch
              label={t('admin.channels.form.webSearchEmulation')}
              description={t('admin.channels.form.webSearchEmulationHint')}
              value={section.web_search_emulation}
              onChange={(web_search_emulation) => updateSection(platform, (s) => ({ ...s, web_search_emulation }))}
              labelPosition="start"
              labelSpacing="spread"
              width="100%"
            />
          </Card>
        )}
        {platform === 'openai' && (
          <Card padding={4}>
            <Switch
              label={t('admin.channels.form.codexImageGenerationBridge')}
              description={t('admin.channels.form.codexImageGenerationBridgeHint')}
              value={section.codex_image_generation_bridge}
              onChange={(codex_image_generation_bridge) => updateSection(platform, (s) => ({ ...s, codex_image_generation_bridge }))}
              labelPosition="start"
              labelSpacing="spread"
              width="100%"
            />
          </Card>
        )}
        {platform === 'anthropic' && (
          <Card padding={4}>
            <Switch
              label={t('admin.channels.form.bedrockCCCompat')}
              description={t('admin.channels.form.bedrockCCCompatHint')}
              value={section.bedrock_cc_compat}
              onChange={(bedrock_cc_compat) => updateSection(platform, (s) => ({ ...s, bedrock_cc_compat }))}
              labelPosition="start"
              labelSpacing="spread"
              width="100%"
            />
          </Card>
        )}

        {/* Model mapping */}
        <VStack gap={2} hAlign="stretch">
          <HStack gap={2} vAlign="center" hAlign="between">
            <Text type="label">{t('admin.channels.form.modelMapping')}</Text>
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon icon={PlusIcon} />}
              label={t('common.add')}
              onClick={() => updateSection(platform, (s) => ({ ...s, model_mapping: [...s.model_mapping, { key: nextKey(), from: '', to: '' }] }))}
            />
          </HStack>
          {section.model_mapping.length === 0 ? (
            <Text type="supporting">{t('admin.channels.form.noMappingRules')}</Text>
          ) : (
            section.model_mapping.map((row) => (
              <HStack key={row.key} gap={2} vAlign="center">
                <StackItem size="fill">
                  <TextInput
                    label={t('admin.channels.form.mappingSource')}
                    isLabelHidden
                    size="sm"
                    value={row.from}
                    onChange={(from) =>
                      updateSection(platform, (s) => ({ ...s, model_mapping: s.model_mapping.map((r) => (r.key === row.key ? { ...r, from } : r)) }))
                    }
                    placeholder={t('admin.channels.form.mappingSource')}
                  />
                </StackItem>
                <Text type="supporting">→</Text>
                <StackItem size="fill">
                  <TextInput
                    label={t('admin.channels.form.mappingTarget')}
                    isLabelHidden
                    size="sm"
                    value={row.to}
                    onChange={(to) =>
                      updateSection(platform, (s) => ({ ...s, model_mapping: s.model_mapping.map((r) => (r.key === row.key ? { ...r, to } : r)) }))
                    }
                    placeholder={t('admin.channels.form.mappingTarget')}
                  />
                </StackItem>
                <IconButton
                  label={t('common.delete')}
                  tooltip={t('common.delete')}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={TrashIcon} />}
                  onClick={() => updateSection(platform, (s) => ({ ...s, model_mapping: s.model_mapping.filter((r) => r.key !== row.key) }))}
                />
              </HStack>
            ))
          )}
        </VStack>

        {/* Model pricing */}
        <VStack gap={2} hAlign="stretch">
          <HStack gap={2} vAlign="center" hAlign="between">
            <Text type="label">{t('admin.channels.form.modelPricing')}</Text>
            <HStack gap={1}>
              {supportsPricingModelSync(platform) && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Icon icon={ArrowPathIcon} />}
                  label={syncingPlatform === platform ? t('admin.channels.form.syncingModels') : t('admin.channels.form.syncLatestModels')}
                  isLoading={syncingPlatform === platform}
                  isDisabled={Boolean(syncingPlatform) && syncingPlatform !== platform}
                  onClick={() => void syncLatestModels(platform)}
                />
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon icon={PlusIcon} />}
                label={t('common.add')}
                onClick={() => updateSection(platform, (s) => ({ ...s, model_pricing: [...s.model_pricing, createPricingEntry()] }))}
              />
            </HStack>
          </HStack>
          {section.model_pricing.length === 0 ? (
            <Text type="supporting">{t('admin.channels.form.noPricingRules')}</Text>
          ) : (
            section.model_pricing.map((entry) => (
              <PricingEntryCard
                key={entry.__key}
                entry={entry}
                platform={platform}
                enableTimePricing
                enableTierMultipliers
                onChange={(patch) => updatePricing(platform, entry.__key, patch)}
                onRemove={() => updateSection(platform, (s) => ({ ...s, model_pricing: s.model_pricing.filter((e) => e.__key !== entry.__key) }))}
              />
            ))
          )}
        </VStack>

        {/* Account stats pricing rules */}
        <VStack gap={3} hAlign="stretch">
          <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={4}>{t('admin.channels.form.accountStatsPricingRules')}</Heading>
            <Button
              size="sm"
              icon={<Icon icon={PlusIcon} />}
              label={t('admin.channels.form.addRule')}
              onClick={() =>
                updateSection(platform, (s) => ({
                  ...s,
                  account_stats_pricing_rules: [...s.account_stats_pricing_rules, { key: nextKey(), name: '', group_ids: [], account_ids: [], pricing: [] }],
                }))
              }
            />
          </HStack>
          {section.account_stats_pricing_rules.length === 0 && (
            <Text type="supporting">{t('admin.channels.form.noRulesConfigured')}</Text>
          )}
          {section.account_stats_pricing_rules.map((rule) => (
            <Card key={rule.key} padding={4}>
              <VStack gap={3} hAlign="stretch">
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill">
                    <TextInput
                      label={t('admin.channels.form.ruleName')}
                      isLabelHidden
                      size="sm"
                      value={rule.name}
                      onChange={(name) => updateRule(platform, rule.key, (r) => ({ ...r, name }))}
                      placeholder={t('admin.channels.form.ruleName')}
                    />
                  </StackItem>
                  <Button
                    size="sm"
                    variant="ghost"
                    label={t('common.delete')}
                    onClick={() =>
                      updateSection(platform, (s) => ({
                        ...s,
                        account_stats_pricing_rules: s.account_stats_pricing_rules.filter((r) => r.key !== rule.key),
                      }))
                    }
                  />
                </HStack>

                <VStack gap={1.5} hAlign="stretch">
                  <Text type="supporting">{t('admin.channels.form.ruleGroups')}</Text>
                  {section.group_ids.length === 0 ? (
                    <Text type="supporting">{t('admin.channels.form.noGroupsInChannel')}</Text>
                  ) : (
                    <HStack gap={3} wrap="wrap">
                      {section.group_ids.map((gid) => (
                        <CheckboxInput
                          key={gid}
                          size="sm"
                          label={groupNameById(gid)}
                          value={rule.group_ids.includes(gid)}
                          onChange={(checked) =>
                            updateRule(platform, rule.key, (r) => ({
                              ...r,
                              group_ids: checked ? [...r.group_ids, gid] : r.group_ids.filter((id) => id !== gid),
                            }))
                          }
                        />
                      ))}
                    </HStack>
                  )}
                </VStack>

                <VStack gap={1.5} hAlign="stretch">
                  <Text type="supporting">{t('admin.channels.form.ruleAccounts')}</Text>
                  {rule.account_ids.length > 0 && (
                    <HStack gap={1} wrap="wrap">
                      {rule.account_ids.map((accountId) => (
                        <Token
                          key={accountId}
                          size="sm"
                          color={platformTokenColor(platform)}
                          label={ruleAccountNames[accountId] ? `${ruleAccountNames[accountId]} #${accountId}` : `#${accountId}`}
                          onRemove={() => updateRule(platform, rule.key, (r) => ({ ...r, account_ids: r.account_ids.filter((id) => id !== accountId) }))}
                        />
                      ))}
                    </HStack>
                  )}
                  <RuleAccountPicker
                    platform={platform}
                    selectedIds={rule.account_ids}
                    onSelect={(account) => {
                      setRuleAccountNames((prev) => ({ ...prev, [account.id]: account.name }))
                      updateRule(platform, rule.key, (r) =>
                        r.account_ids.includes(account.id) ? r : { ...r, account_ids: [...r.account_ids, account.id] },
                      )
                    }}
                  />
                  <Text type="supporting">{t('admin.channels.form.ruleAccountsHint')}</Text>
                </VStack>

                <VStack gap={2} hAlign="stretch">
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <Text type="supporting">{t('admin.channels.form.ruleModelPricing')}</Text>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Icon icon={PlusIcon} />}
                      label={t('common.add')}
                      onClick={() => updateRule(platform, rule.key, (r) => ({ ...r, pricing: [...r.pricing, createPricingEntry([], false)] }))}
                    />
                  </HStack>
                  {rule.pricing.length === 0 ? (
                    <Text type="supporting">{t('admin.channels.form.noPricingRules')}</Text>
                  ) : (
                    rule.pricing.map((entry) => (
                      <PricingEntryCard
                        key={entry.__key}
                        entry={entry}
                        platform={platform}
                        onChange={(patch) =>
                          updateRule(platform, rule.key, (r) => ({
                            ...r,
                            pricing: r.pricing.map((e) => (e.__key === entry.__key ? { ...e, ...patch } : e)),
                          }))
                        }
                        onRemove={() => updateRule(platform, rule.key, (r) => ({ ...r, pricing: r.pricing.filter((e) => e.__key !== entry.__key) }))}
                      />
                    ))
                  )}
                </VStack>
              </VStack>
            </Card>
          ))}
        </VStack>
      </VStack>
    )
  }

  return (
    <Page title={t("admin.channels.title")} description={t('admin.channels.description')}>
      <VStack gap={4} hAlign="stretch">
        {/* Filters */}
        <Card padding={4}>
          <HStack gap={3} vAlign="end" wrap="wrap">
            <StackItem size="fill">
              <TextInput
                label={t('admin.channels.searchChannels')}
                isLabelHidden
                value={searchInput}
                onChange={setSearchInput}
                placeholder={t('admin.channels.searchChannels')}
                startIcon={MagnifyingGlassIcon}
                hasClear
              />
            </StackItem>
            <Selector
              label={t('admin.channels.columns.status')}
              isLabelHidden
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
              options={statusOptions}
              width={180}
            />
            <IconButton
              label={t('common.refresh')}
              tooltip={t('common.refresh')}
              icon={<Icon icon={ArrowPathIcon} />}
              onClick={() => void loadChannels()}
              isLoading={loading}
            />
            <Button
              label={t('admin.channels.createChannel')}
              variant="primary"
              icon={<Icon icon={PlusIcon} />}
              onClick={() => void openCreateDialog()}
            />
          </HStack>
        </Card>

        {/* Table */}
        <Card padding={0}>
          {loading && tableRows.length === 0 ? (
            <Center padding={8}>
              <Spinner />
            </Center>
          ) : tableRows.length === 0 ? (
            <Center padding={8}>
              <EmptyState
                title={t('admin.channels.noChannelsYet')}
                description={t('admin.channels.createFirstChannel')}
                actions={
                  <Button label={t('admin.channels.createChannel')} variant="primary" onClick={() => void openCreateDialog()} />
                }
              />
            </Center>
          ) : (
            <Table
              columns={columns}
              data={tableRows}
              idKey="__id"
              plugins={{ sort: sortPlugin, pagination: paginationPlugin }}
            />
          )}
        </Card>
      </VStack>

      {/* Create / Edit */}
      <Dialog isOpen={showDialog} onOpenChange={(open) => !open && closeDialog()} width={1100} maxHeight="90dvh" purpose="form">
        <Layout
          header={
            <DialogHeader
              title={editingChannel ? t('admin.channels.editChannel') : t('admin.channels.createChannel')}
              onOpenChange={(open) => !open && closeDialog()}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={5} hAlign="stretch">
                <TabList value={activeSection ? activeTab : 'basic'} onChange={setActiveTab} hasDivider>
                  <Tab value="basic" label={t('admin.channels.form.basicSettings')} />
                  {enabledSections.map((section) => (
                    <Tab key={section.platform} value={section.platform} label={platformName(section.platform)} />
                  ))}
                </TabList>
                {activeSection ? renderPlatformTab(activeSection) : renderBasicTab()}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" isDisabled={submitting} onClick={closeDialog} />
                <Button
                  label={submitting ? t('common.submitting') : editingChannel ? t('common.update') : t('common.create')}
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
        isOpen={deletingChannel !== null}
        onOpenChange={(open) => !open && !deleting && setDeletingChannel(null)}
        title={t('admin.channels.deleteChannel')}
        description={t('admin.channels.deleteConfirm', { name: deletingChannel?.name || '' })}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void confirmDelete()}
      />
    </Page>
  )
}
