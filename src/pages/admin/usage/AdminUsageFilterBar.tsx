import { useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { UsageRequestType } from '@/types'
import { getBillingModeLabel } from '@/utils/billingMode'
import { COMMON_ERROR_STATUS_CODES, requestTypeLabelKey } from '@/utils/errorBadges'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { FilterSelect } from '~/pages/user/usage/UsageFilterBar'
import { USAGE_ERROR_CATEGORIES } from '~/pages/user/usage/usageQuery'
import { RemoteSearchField, type SearchMatch } from './RemoteSearchField'
import type { AdminUsageFilters, PickedOption } from './adminUsageQuery'
import type { AdminUsage } from './useAdminUsage'

/** What the page lists under its filters: the requests, the failed ones, or the users who used the most. */
export type AdminUsageTab = 'usage' | 'errors' | 'ranking'

/** What a set of filter fields narrows: one of the page's lists, or a cleanup of the usage records. */
export type FilterScope = AdminUsageTab | 'cleanup'

/** The filters a set of fields reads and changes, and what its lists have on offer. */
export interface FilterTarget {
  filters: AdminUsageFilters
  changeFilters: (patch: Partial<AdminUsageFilters>) => void
  modelNames: string[]
  groups: PickedOption[]
}

const COMPACTED_ONLY = 'compacted'
const ACCOUNT_MATCHES = 20

const REQUEST_TYPES: UsageRequestType[] = ['ws_v2', 'live', 'stream', 'sync', 'cyber']
const BILLING_MODES = ['token', 'per_request', 'image', 'video']
// What a request was charged to: the balance (0) or a subscription (1).
const BILLING_TYPE_LABEL_KEYS = ['admin.usage.billingTypeBalance', 'admin.usage.billingTypeSubscription']
// Whether the upstream answered as the model it was sent.
const MODEL_AUDITS = [
  { value: 'mismatch', hasMismatch: true, labelKey: 'admin.usage.upstreamModelMismatchOnly' },
  { value: 'matched', hasMismatch: false, labelKey: 'admin.usage.upstreamModelMatchedOnly' },
]
// Where a failed request went wrong.
const ERROR_PHASES = [
  { value: 'upstream', labelKey: 'admin.ops.errorLog.typeUpstream' },
  { value: 'account_auth', labelKey: 'admin.ops.errorLog.typeAccountAuth' },
  { value: 'request', labelKey: 'admin.ops.errorLog.typeRequest' },
  { value: 'auth', labelKey: 'admin.ops.errorLog.typeAuth' },
  { value: 'routing', labelKey: 'admin.ops.errorLog.typeRouting' },
  { value: 'internal', labelKey: 'admin.ops.errorLog.typeInternal' },
]

const asNumber = (value: string | null) => (value == null ? null : Number(value))
const asText = (value: number | null) => (value == null ? null : String(value))

/**
 * The filter fields of the admin usage page. A field shows where it can narrow something: the ones about how a
 * request was billed are of no use to the failed requests, the ones about how a request failed are of use to
 * nothing else, and a cleanup can only delete by the filters its task takes.
 * `resetCount` starts the search boxes over each time it changes.
 */
export function AdminUsageFilterFields({
  target,
  scope,
  resetCount = 0,
}: {
  target: FilterTarget
  scope: FilterScope
  resetCount?: number
}) {
  const { t } = useI18n()
  const { filters, changeFilters } = target
  const isErrors = scope === 'errors'
  const isUsage = scope === 'usage'
  const isCleanup = scope === 'cleanup'

  const searchUsers = async (text: string): Promise<SearchMatch[]> => {
    if (!text) return []
    const users = await adminAPI.usage.searchUsers(text)
    // Deleted users can still be searched for, as their usage stays; they come last.
    return [...(users || [])]
      .sort((a, b) => Number(Boolean(a.deleted)) - Number(Boolean(b.deleted)))
      .map((user) => ({
        id: user.id,
        label: user.email,
        note: user.deleted ? `#${user.id} · ${t('admin.usage.userDeletedBadge')}` : `#${user.id}`,
      }))
  }
  // The keys of the user being filtered by, or of everyone.
  const searchApiKeys = async (text: string): Promise<SearchMatch[]> => {
    const keys = await adminAPI.usage.searchApiKeys(filters.user?.id, text)
    return (keys || []).map((key) => ({ id: key.id, label: key.name || String(key.id), note: `#${key.id}` }))
  }
  const searchAccounts = async (text: string): Promise<SearchMatch[]> => {
    const answer = await adminAPI.accounts.list(1, ACCOUNT_MATCHES, { search: text })
    return (answer.items || []).map((account) => ({ id: account.id, label: account.name, note: `#${account.id}` }))
  }

  return (
    <Grid columns={{ minWidth: 190 }} gap={3}>
      <RemoteSearchField
        key={`user#${resetCount}`}
        label={t('admin.usage.userFilter')}
        placeholder={t('admin.usage.searchUserPlaceholder')}
        value={filters.user}
        // A key belongs to one user: the key filter does not outlive a change of user.
        onChange={(user) => changeFilters({ user, apiKey: null })}
        search={searchUsers}
      />
      <RemoteSearchField
        // The matches offered on entering the field are those of one user; another user starts the field over.
        key={`key#${filters.user?.id ?? 'everyone'}#${resetCount}`}
        label={t('usage.apiKeyFilter')}
        placeholder={t('admin.usage.searchApiKeyPlaceholder')}
        value={filters.apiKey}
        onChange={(apiKey) => changeFilters({ apiKey })}
        search={searchApiKeys}
        hasMatchesOnFocus
      />
      <FilterSelect
        label={t('usage.model')}
        allLabel={t('admin.usage.allModels')}
        choices={target.modelNames.map((model) => ({ value: model, label: model }))}
        value={filters.model}
        onChange={(model) => changeFilters({ model })}
        hasSearch
      />
      <RemoteSearchField
        key={`account#${resetCount}`}
        label={t('admin.usage.account')}
        placeholder={t('admin.usage.searchAccountPlaceholder')}
        value={filters.account}
        onChange={(account) => changeFilters({ account })}
        search={searchAccounts}
        hasMatchesOnFocus
      />
      {!isErrors && (
        <FilterSelect
          label={t('usage.type')}
          allLabel={t('admin.usage.allTypes')}
          choices={REQUEST_TYPES.map((type) => ({ value: type, label: t(requestTypeLabelKey(type)) }))}
          value={filters.requestType}
          onChange={(value) => changeFilters({ requestType: REQUEST_TYPES.find((type) => type === value) ?? null })}
        />
      )}
      {!isErrors && !isCleanup && (
        <FilterSelect
          label={t('usage.compactionFilter')}
          allLabel={t('usage.allCompactionTypes')}
          choices={[{ value: COMPACTED_ONLY, label: t('usage.compactionOnly') }]}
          value={filters.isCompactedOnly ? COMPACTED_ONLY : null}
          onChange={(value) => changeFilters({ isCompactedOnly: value === COMPACTED_ONLY })}
        />
      )}
      {!isErrors && (
        <FilterSelect
          label={t('admin.usage.billingType')}
          allLabel={t('admin.usage.allBillingTypes')}
          choices={BILLING_TYPE_LABEL_KEYS.map((labelKey, type) => ({ value: String(type), label: t(labelKey) }))}
          value={asText(filters.billingType)}
          onChange={(value) => changeFilters({ billingType: asNumber(value) })}
        />
      )}
      {isUsage && (
        <FilterSelect
          label={t('admin.usage.billingMode')}
          allLabel={t('admin.usage.allBillingModes')}
          choices={BILLING_MODES.map((mode) => ({ value: mode, label: getBillingModeLabel(mode, t) }))}
          value={filters.billingMode}
          onChange={(billingMode) => changeFilters({ billingMode })}
        />
      )}
      {isUsage && (
        <FilterSelect
          label={t('admin.usage.upstreamModelAudit')}
          allLabel={t('admin.usage.allUpstreamModelAudit')}
          choices={MODEL_AUDITS.map((audit) => ({ value: audit.value, label: t(audit.labelKey) }))}
          value={MODEL_AUDITS.find((audit) => audit.hasMismatch === filters.hasModelMismatch)?.value ?? null}
          onChange={(value) =>
            changeFilters({ hasModelMismatch: MODEL_AUDITS.find((audit) => audit.value === value)?.hasMismatch ?? null })
          }
        />
      )}
      {isErrors && (
        <FilterSelect
          label={t('admin.ops.errorLog.type')}
          allLabel={t('admin.usage.allTypes')}
          choices={ERROR_PHASES.map((phase) => ({ value: phase.value, label: t(phase.labelKey) }))}
          value={filters.errorPhase}
          onChange={(errorPhase) => changeFilters({ errorPhase })}
        />
      )}
      {isErrors && (
        <FilterSelect
          label={t('usage.errors.category')}
          allLabel={t('usage.errors.allCategories')}
          choices={USAGE_ERROR_CATEGORIES.map((category) => ({
            value: category,
            label: t(`usage.errors.categories.${category}`),
          }))}
          value={filters.errorCategory}
          onChange={(errorCategory) => changeFilters({ errorCategory })}
        />
      )}
      {isErrors && (
        <FilterSelect
          label={t('admin.ops.errorLog.status')}
          allLabel={t('usage.errors.allStatuses')}
          choices={COMMON_ERROR_STATUS_CODES.map((code) => ({ value: String(code), label: String(code) }))}
          value={asText(filters.statusCode)}
          onChange={(value) => changeFilters({ statusCode: asNumber(value) })}
        />
      )}
      <FilterSelect
        label={t('admin.usage.group')}
        allLabel={t('admin.usage.allGroups')}
        choices={target.groups.map((group) => ({ value: String(group.id), label: group.label }))}
        value={asText(filters.groupId)}
        onChange={(value) => changeFilters({ groupId: asNumber(value) })}
        hasSearch
      />
    </Grid>
  )
}

/**
 * The filters of the admin usage page, under the tab being shown. Each applies as soon as it is picked, to
 * everything on the page it can narrow. `trailing` sits at the far end of the button row.
 */
export function AdminUsageFilterBar({
  usage,
  tab,
  trailing,
}: {
  usage: AdminUsage
  tab: AdminUsageTab
  trailing?: ReactNode
}) {
  const { t } = useI18n()
  // Text typed into a search box without picking a match is no filter, so clearing the filters leaves it there:
  // "reset" starts the boxes over as well.
  const [resetCount, setResetCount] = useState(0)
  const reset = () => {
    usage.reset()
    setResetCount((count) => count + 1)
  }

  return (
    <VStack gap={4}>
      <AdminUsageFilterFields target={usage} scope={tab} resetCount={resetCount} />

      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <Button label={t('common.reset')} variant="secondary" onClick={reset} />
        {trailing}
      </HStack>
    </VStack>
  )
}
