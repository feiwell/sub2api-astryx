import { useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import type { ApiKey, UsageRequestType } from '@/types'
import { getBillingModeLabel } from '@/utils/billingMode'
import { COMMON_ERROR_STATUS_CODES, requestTypeLabelKey } from '@/utils/errorBadges'
import { useI18n } from '~/i18n'
import { USAGE_ERROR_CATEGORIES } from './usageQuery'
import type { UsageErrors } from './useUsageErrors'
import type { UsageLogs } from './useUsageLogs'

// Selector values are strings, so "not filtered by this" needs a value of its own.
const ALL = '__all__'
const COMPACTED_ONLY = 'compacted'

// The request types a list can be narrowed to; "unknown" and "cyber" are not offered.
const REQUEST_TYPES: UsageRequestType[] = ['ws_v2', 'live', 'stream', 'sync']
const BILLING_MODES = ['token', 'per_request', 'image', 'video']
// What a request was charged to: the balance (0) or a subscription (1).
const BILLING_TYPE_LABEL_KEYS = ['admin.usage.billingTypeBalance', 'admin.usage.billingTypeSubscription']

interface Choice {
  value: string
  label: string
}

/** One filter picked from a list. Its first choice, `allLabel`, is "not filtered by this" and gives null. */
export function FilterSelect({
  label,
  allLabel,
  choices,
  value,
  onChange,
  hasSearch = false,
}: {
  label: string
  allLabel: string
  choices: Choice[]
  value: string | null
  onChange: (value: string | null) => void
  hasSearch?: boolean
}) {
  const { t } = useI18n()
  return (
    <Selector
      label={label}
      width="100%"
      value={value ?? ALL}
      onChange={(next) => onChange(next === ALL ? null : next)}
      options={[{ value: ALL, label: allLabel }, ...choices]}
      hasSearch={hasSearch}
      searchPlaceholder={t('common.searchPlaceholder')}
      emptySearchText={t('common.noOptionsFound')}
    />
  )
}

const keyChoices = (apiKeys: ApiKey[]): Choice[] => apiKeys.map((key) => ({ value: String(key.id), label: key.name }))
const asId = (value: string | null) => (value == null ? null : Number(value))

/**
 * The filters of the usage list. Each applies as soon as it is picked, to the list, the figures and the charts
 * alike. `trailing` sits at the far end of the button row.
 */
export function UsageFilterBar({
  usage,
  hasBillingType,
  trailing,
}: {
  usage: UsageLogs
  /** Whether requests can be charged to a subscription at all; without it there is one billing type. */
  hasBillingType: boolean
  trailing?: ReactNode
}) {
  const { t } = useI18n()
  const { filters, changeFilters } = usage

  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 190 }} gap={3}>
        <FilterSelect
          label={t('usage.apiKeyFilter')}
          allLabel={t('usage.allApiKeys')}
          choices={keyChoices(usage.apiKeys)}
          value={filters.apiKeyId == null ? null : String(filters.apiKeyId)}
          onChange={(value) => changeFilters({ apiKeyId: asId(value) })}
          hasSearch
        />
        <FilterSelect
          label={t('usage.model')}
          allLabel={t('admin.usage.allModels')}
          choices={usage.modelNames.map((model) => ({ value: model, label: model }))}
          value={filters.model}
          onChange={(model) => changeFilters({ model })}
          hasSearch
        />
        <FilterSelect
          label={t('admin.usage.group')}
          allLabel={t('admin.usage.allGroups')}
          choices={usage.groups.map((group) => ({ value: String(group.id), label: group.name }))}
          value={filters.groupId == null ? null : String(filters.groupId)}
          onChange={(value) => changeFilters({ groupId: asId(value) })}
          hasSearch
        />
        <FilterSelect
          label={t('usage.type')}
          allLabel={t('admin.usage.allTypes')}
          choices={REQUEST_TYPES.map((type) => ({ value: type, label: t(requestTypeLabelKey(type)) }))}
          value={filters.requestType}
          onChange={(value) => changeFilters({ requestType: REQUEST_TYPES.find((type) => type === value) ?? null })}
        />
        <FilterSelect
          label={t('usage.compactionFilter')}
          allLabel={t('usage.allCompactionTypes')}
          choices={[{ value: COMPACTED_ONLY, label: t('usage.compactionOnly') }]}
          value={filters.isCompactedOnly ? COMPACTED_ONLY : null}
          onChange={(value) => changeFilters({ isCompactedOnly: value === COMPACTED_ONLY })}
        />
        {hasBillingType && (
          <FilterSelect
            label={t('admin.usage.billingType')}
            allLabel={t('admin.usage.allBillingTypes')}
            choices={BILLING_TYPE_LABEL_KEYS.map((labelKey, type) => ({ value: String(type), label: t(labelKey) }))}
            value={filters.billingType == null ? null : String(filters.billingType)}
            onChange={(value) => changeFilters({ billingType: asId(value) })}
          />
        )}
        <FilterSelect
          label={t('admin.usage.billingMode')}
          allLabel={t('admin.usage.allBillingModes')}
          choices={BILLING_MODES.map((mode) => ({ value: mode, label: getBillingModeLabel(mode, t) }))}
          value={filters.billingMode}
          onChange={(billingMode) => changeFilters({ billingMode })}
        />
      </Grid>

      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <Button label={t('common.reset')} variant="secondary" onClick={usage.reset} />
        {trailing}
      </HStack>
    </VStack>
  )
}

/**
 * The filters of the failed-request list. A choice from a list applies at once; the model, which is typed and
 * matched loosely by the server, waits for Enter or the search button. `onReset` clears these filters and
 * whatever else the page resets with them.
 */
export function UsageErrorFilterBar({
  errors,
  apiKeys,
  onReset,
  trailing,
}: {
  errors: UsageErrors
  apiKeys: ApiKey[]
  onReset: () => void
  trailing?: ReactNode
}) {
  const { t } = useI18n()
  const { filters, changeFilters } = errors
  // What the model field holds; the list is only asked for it on Enter or "search".
  const [modelDraft, setModelDraft] = useState(filters.model)

  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 190 }} gap={3}>
        <FilterSelect
          label={t('usage.errors.keyName')}
          allLabel={t('usage.errors.allKeys')}
          choices={keyChoices(apiKeys)}
          value={filters.apiKeyId == null ? null : String(filters.apiKeyId)}
          onChange={(value) => changeFilters({ apiKeyId: asId(value), model: modelDraft })}
          hasSearch
        />
        <TextInput
          label={t('usage.errors.model')}
          width="100%"
          placeholder={t('usage.errors.modelPlaceholder')}
          startIcon={MagnifyingGlassIcon}
          hasClear
          value={modelDraft}
          onChange={(value) => {
            setModelDraft(value)
            // Emptying a model that is being filtered by takes the filter off at once.
            if (value === '' && filters.model !== '') changeFilters({ model: '' })
          }}
          onEnter={() => changeFilters({ model: modelDraft })}
        />
        <FilterSelect
          label={t('usage.errors.category')}
          allLabel={t('usage.errors.allCategories')}
          choices={USAGE_ERROR_CATEGORIES.map((category) => ({
            value: category,
            label: t(`usage.errors.categories.${category}`),
          }))}
          value={filters.category}
          onChange={(category) => changeFilters({ category, model: modelDraft })}
        />
        <FilterSelect
          label={t('usage.errors.status')}
          allLabel={t('usage.errors.allStatuses')}
          choices={COMMON_ERROR_STATUS_CODES.map((code) => ({ value: String(code), label: String(code) }))}
          value={filters.statusCode == null ? null : String(filters.statusCode)}
          onChange={(value) => changeFilters({ statusCode: asId(value), model: modelDraft })}
        />
      </Grid>

      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <HStack gap={2}>
          <Button
            label={t('common.search')}
            variant="primary"
            icon={<Icon icon={MagnifyingGlassIcon} />}
            isLoading={errors.isLoading}
            onClick={() => changeFilters({ model: modelDraft })}
          />
          <Button
            label={t('common.reset')}
            variant="secondary"
            onClick={() => {
              setModelDraft('')
              onReset()
            }}
          />
        </HStack>
        {trailing}
      </HStack>
    </VStack>
  )
}
