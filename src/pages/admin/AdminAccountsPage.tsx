import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core'
import { Switch } from '@astryxdesign/core/Switch'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Banner } from '@astryxdesign/core/Banner'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Table, proportional, pixel, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import {
  ArrowPathIcon,
  ChartBarIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  LinkIcon,
  PlayIcon,
  PlusIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { adminAPI } from '~/lib/api/admin'
import type { Account, AccountListItem, AccountPlatform, AccountType } from '@/types'
import { supportsAccountQuota } from '@/utils/accountQuota'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { formatDateTime } from '@/utils/format'
// Toolbar "More actions" menu: data import/export, CRS sync and gateway tools
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUpTrayIcon,
  EllipsisHorizontalIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { SyncFromCrsDialog } from './accounts/SyncFromCrsDialog'
import { ImportDataDialog } from './accounts/ImportDataDialog'
import { ExportDataDialog } from './accounts/ExportDataDialog'
import { ErrorPassthroughRulesDialog } from './accounts/ErrorPassthroughRulesDialog'
import { TlsFingerprintProfilesDialog } from './accounts/TlsFingerprintProfilesDialog'
import { BulkEditAccountsDialog } from './accounts/BulkEditAccountsDialog'
import { AccountTestDialog } from './accounts/AccountTestDialog'
import { AccountStatsDialog } from './accounts/AccountStatsDialog'
import { ScheduledTestsDialog } from './accounts/ScheduledTestsDialog'
import { TempUnschedulableStatusDialog } from './accounts/TempUnschedulableStatusDialog'
import { ReauthAccountDialog } from './accounts/ReauthAccountDialog'
import type { BulkEditTarget } from './accounts/bulkEditPayload'

const PLATFORMS = ['anthropic', 'openai', 'gemini', 'grok', 'antigravity'] as const
/** Account types that can be duplicated (AccountActionMenu.vue canDuplicate). */
const DUPLICABLE_TYPES = ['apikey', 'upstream', 'bedrock', 'service_account']

const isFuture = (value: string | null | undefined) => !!value && new Date(value) > new Date()

const isTempUnschedulable = (account: AccountListItem) => isFuture(account.temp_unschedulable_until)

/** Rate limited either at account level or for one model (AccountActionMenu.vue isRateLimited). */
const isRateLimited = (account: AccountListItem) => {
  if (isFuture(account.rate_limit_reset_at)) return true
  const modelLimits = account.extra?.model_rate_limits as Record<string, { rate_limit_reset_at: string }> | undefined
  if (!modelLimits) return false
  return Object.values(modelLimits).some((info) => isFuture(info.rate_limit_reset_at))
}

/** Error, rate limit, overload or temporary block can all be recovered. */
const hasRecoverableState = (account: AccountListItem) =>
  account.status === 'error' || isRateLimited(account) || isFuture(account.overload_until) || isTempUnschedulable(account)

const hasQuotaLimit = (account: AccountListItem) =>
  supportsAccountQuota(account.type) &&
  ((account.quota_limit ?? 0) > 0 || (account.quota_daily_limit ?? 0) > 0 || (account.quota_weekly_limit ?? 0) > 0)

const STATUSES = ['active', 'inactive', 'error', 'rate_limited'] as const
const TYPES = ['oauth', 'apikey', 'setup-token'] as const

// Catalog key for each account status value
const STATUS_KEYS: Record<string, string> = {
  active: 'admin.accounts.status.active',
  inactive: 'admin.accounts.status.inactive',
  error: 'admin.accounts.status.error',
  rate_limited: 'admin.accounts.status.rateLimited',
}

// Catalog key for each account type value; the backend writes apikey, older data api_key
const TYPE_KEYS: Record<string, string> = {
  oauth: 'admin.accounts.types.oauth',
  apikey: 'admin.accounts.apiKey',
  api_key: 'admin.accounts.apiKey',
  'setup-token': 'admin.accounts.setupToken',
  upstream: 'admin.accounts.types.upstream',
}

interface AccountRow extends Record<string, unknown> {
  __id: string
  id: number
  name: string
  platform: string
  type: string
  status: string
  schedulable: boolean
  created_at: string
  extra?: Record<string, any>
}

interface AccountForm {
  name: string
  notes: string
  platform: string
  base_url: string
  api_key: string
  priority: number
  concurrency: number
  status: 'active' | 'inactive'
  schedulable: boolean
}

const EMPTY_FORM: AccountForm = {
  name: '',
  notes: '',
  platform: 'anthropic',
  base_url: '',
  api_key: '',
  priority: 1,
  concurrency: 3,
  status: 'active',
  schedulable: true,
}

interface AccountFormDialogProps {
  isOpen: boolean
  editing: AccountListItem | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Create (Base URL + API Key accounts) or edit an account's common fields.
 * OAuth and setup-token accounts need an authorization flow that is not part
 * of this dialog; the create form says so.
 */
function AccountFormDialog({ isOpen, editing, onClose, onSaved }: AccountFormDialogProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(
      editing
        ? {
            ...EMPTY_FORM,
            name: editing.name,
            notes: editing.notes ?? '',
            platform: editing.platform,
            priority: editing.priority ?? EMPTY_FORM.priority,
            concurrency: editing.concurrency ?? EMPTY_FORM.concurrency,
            status: editing.status === 'inactive' ? 'inactive' : 'active',
            schedulable: editing.schedulable,
          }
        : EMPTY_FORM,
    )
  }, [isOpen, editing])

  const patch = (next: Partial<AccountForm>) => setForm((prev) => ({ ...prev, ...next }))

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('admin.accounts.pleaseEnterAccountName'))
      return
    }
    if (!editing && !form.api_key.trim()) {
      toast.error(t('admin.accounts.vertexApiKeyRequired'))
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await adminAPI.accounts.update(editing.id, {
          name: form.name.trim(),
          notes: form.notes.trim() || null,
          priority: form.priority,
          concurrency: form.concurrency,
          status: form.status,
          schedulable: form.schedulable,
        })
        toast.success(t('admin.accounts.accountUpdated'))
      } else {
        await adminAPI.accounts.create({
          name: form.name.trim(),
          notes: form.notes.trim() || null,
          platform: form.platform as AccountPlatform,
          type: 'apikey',
          credentials: {
            api_key: form.api_key.trim(),
            ...(form.base_url.trim() ? { base_url: form.base_url.trim() } : {}),
          },
          priority: form.priority,
          concurrency: form.concurrency,
        })
        toast.success(t('admin.accounts.accountCreated'))
      }
      onSaved()
      onClose()
    } catch (error) {
      console.error('Failed to save account:', error)
      toast.error(error instanceof Error && error.message ? error.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const platformOptions = PLATFORMS.map((p) => ({ value: p, label: t(`admin.accounts.platforms.${p}`) }))

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={560} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={editing ? t('admin.accounts.editAccount') : t('admin.accounts.createAccount')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {!editing && <Banner status="info" title={t('admin.accounts.types.upstreamDesc')} description={t('astryx.accountCreateApiKeyOnly')} />}
              <TextInput
                label={t('admin.accounts.accountName')}
                placeholder={t('admin.accounts.enterAccountName')}
                value={form.name}
                onChange={(name) => patch({ name })}
                isRequired
              />
              {editing ? (
                <HStack gap={2} vAlign="center">
                  <Badge label={t(`admin.accounts.platforms.${editing.platform}`)} variant="info" />
                  <Badge label={TYPE_KEYS[editing.type] ? t(TYPE_KEYS[editing.type]) : editing.type} variant="neutral" />
                </HStack>
              ) : (
                <>
                  <Selector
                    label={t('admin.accounts.platform')}
                    value={form.platform}
                    onChange={(platform) => patch({ platform: platform || EMPTY_FORM.platform })}
                    options={platformOptions}
                  />
                  <TextInput
                    label={t('admin.accounts.baseUrl')}
                    description={form.platform === 'anthropic' ? t('admin.accounts.baseUrlHint') : undefined}
                    placeholder="https://"
                    value={form.base_url}
                    onChange={(base_url) => patch({ base_url })}
                  />
                  <TextInput
                    label={t('admin.accounts.apiKey')}
                    type="password"
                    value={form.api_key}
                    onChange={(api_key) => patch({ api_key })}
                    isRequired
                  />
                </>
              )}
              <HStack gap={3}>
                <StackItem size="fill">
                  <NumberInput
                    label={t('admin.accounts.priority')}
                    description={t('admin.accounts.priorityHint')}
                    value={form.priority}
                    onChange={(priority) => patch({ priority })}
                    min={0}
                    isIntegerOnly
                  />
                </StackItem>
                <StackItem size="fill">
                  <NumberInput
                    label={t('admin.accounts.concurrency')}
                    value={form.concurrency}
                    onChange={(concurrency) => patch({ concurrency })}
                    min={0}
                    isIntegerOnly
                  />
                </StackItem>
              </HStack>
              <TextInput label={t('admin.accounts.notes')} value={form.notes} onChange={(notes) => patch({ notes })} />
              {editing && (
                <>
                  <Selector
                    label={t('admin.accounts.columns.status')}
                    value={form.status}
                    onChange={(status) => patch({ status: status === 'inactive' ? 'inactive' : 'active' })}
                    options={[
                      { value: 'active', label: t('admin.accounts.status.active') },
                      { value: 'inactive', label: t('admin.accounts.status.inactive') },
                    ]}
                  />
                  <Switch
                    label={t('admin.accounts.schedulable')}
                    description={t('admin.accounts.schedulableHint')}
                    value={form.schedulable}
                    onChange={(schedulable) => patch({ schedulable })}
                  />
                </>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={saving ? t('common.saving') : t('common.save')}
                variant="primary"
                isLoading={saving}
                onClick={handleSave}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

export function AdminAccountsPage() {
  const { t } = useI18n()
  const [accounts, setAccounts] = useState<AccountListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AccountListItem | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  // Toolbar tool dialogs (CRS sync, data import/export, error passthrough, TLS profiles)
  const [showSync, setShowSync] = useState(false)
  const [showImportData, setShowImportData] = useState(false)
  const [showExportData, setShowExportData] = useState(false)
  const [showErrorPassthrough, setShowErrorPassthrough] = useState(false)
  const [showTlsFingerprintProfiles, setShowTlsFingerprintProfiles] = useState(false)
  // Bulk edit target: either the current selection or the current list filters
  const [bulkEditTarget, setBulkEditTarget] = useState<BulkEditTarget | null>(null)
  // The filtered variant previews the match count before opening the dialog
  const [bulkEditPreviewing, setBulkEditPreviewing] = useState(false)
  // Row dialogs. Test/stats/reauth need the full account, so the row's list item
  // is resolved through GET /admin/accounts/:id first (Vue: loadAccountDetails).
  const [testAccount, setTestAccount] = useState<Account | null>(null)
  const [statsAccount, setStatsAccount] = useState<Account | null>(null)
  const [reauthAccount, setReauthAccount] = useState<Account | null>(null)
  const [scheduleAccountId, setScheduleAccountId] = useState<number | null>(null)
  const [tempUnschedAccount, setTempUnschedAccount] = useState<AccountListItem | null>(null)
  // Confirmations that replace the Vue ConfirmDialogs
  const [deletingAccount, setDeletingAccount] = useState<AccountListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [shadowAccount, setShadowAccount] = useState<AccountListItem | null>(null)
  const [creatingShadow, setCreatingShadow] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  // Load accounts
  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminAPI.accounts.list(page, pageSize, {
        platform: platformFilter,
        status: statusFilter,
        type: typeFilter,
        group: groupFilter,
        search: searchQuery,
        lite: '1',
      })

      setAccounts(response.items || [])
    } catch (error) {
      console.error('Failed to load accounts:', error)
      toast.error(t('admin.accounts.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, platformFilter, statusFilter, typeFilter, groupFilter, searchQuery, t])

  // Load on mount and when filters change
  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  const platformLabel = useCallback(
    (platform: string) => {
      const key = `admin.accounts.platforms.${platform}`
      const label = t(key)
      return label === key ? platform : label
    },
    [t],
  )
  const typeLabel = useCallback((type: string) => (TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : type), [t])

  const platformOptions = useMemo(
    () => [{ value: '', label: t('admin.accounts.allPlatforms') }, ...PLATFORMS.map((p) => ({ value: p, label: platformLabel(p) }))],
    [t, platformLabel],
  )
  const statusOptions = useMemo(
    () => [{ value: '', label: t('admin.accounts.allStatus') }, ...STATUSES.map((s) => ({ value: s, label: t(STATUS_KEYS[s]) }))],
    [t],
  )
  const typeOptions = useMemo(
    () => [{ value: '', label: t('admin.accounts.allTypes') }, ...TYPES.map((v) => ({ value: v, label: typeLabel(v) }))],
    [t, typeLabel],
  )

  // Groups are only needed to fill this filter, so they are fetched once and a
  // failed call just leaves the "all groups" entry behind.
  const [groupOptions, setGroupOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: t('admin.accounts.allGroups') },
  ])
  useEffect(() => {
    let cancelled = false
    adminAPI.groups
      .getAll()
      .then((groups) => {
        if (cancelled) return
        setGroupOptions([
          { value: '', label: t('admin.accounts.allGroups') },
          // The backend validates this as a group id and rejects names with
          // INVALID_GROUP_FILTER.
          ...groups.map((group) => ({ value: String(group.id), label: group.name })),
        ])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [t])

  // Handle search with debounce
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    setPage(1)
  }, [])

  // Handle filter changes
  const handlePlatformChange = useCallback((value: string) => {
    setPlatformFilter(value)
    setPage(1)
  }, [])

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [])

  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value)
    setPage(1)
  }, [])

  const handleGroupChange = useCallback((value: string) => {
    setGroupFilter(value)
    setPage(1)
  }, [])

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadAccounts()
  }, [loadAccounts])

  const handleDataImported = useCallback(() => {
    setShowImportData(false)
    loadAccounts()
  }, [loadAccounts])

  // Export uses the selection when present, otherwise the current list filters
  const exportFilters = useMemo(
    () => ({ platform: platformFilter, type: typeFilter, status: statusFilter, group: groupFilter, search: searchQuery }),
    [platformFilter, typeFilter, statusFilter, groupFilter, searchQuery],
  )
  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds])

  const toolsMenuItems = useMemo(
    () => [
      {
        type: 'section' as const,
        title: t('admin.accounts.dataActions'),
        items: [
          { label: t('admin.accounts.syncFromCrs'), icon: ArrowPathRoundedSquareIcon, onClick: () => setShowSync(true) },
          { label: t('admin.accounts.dataImport'), icon: ArrowUpTrayIcon, onClick: () => setShowImportData(true) },
          {
            label: selectedIds.size ? t('admin.accounts.dataExportSelected') : t('admin.accounts.dataExport'),
            icon: ArrowDownTrayIcon,
            endContent: selectedIds.size ? (
              <Badge label={t('admin.accounts.selectedCount', { count: selectedIds.size })} variant="info" />
            ) : undefined,
            onClick: () => setShowExportData(true),
          },
        ],
      },
      {
        type: 'section' as const,
        title: t('admin.accounts.toolActions'),
        items: [
          { label: t('admin.errorPassthrough.title'), icon: ShieldCheckIcon, onClick: () => setShowErrorPassthrough(true) },
          { label: t('admin.tlsFingerprintProfiles.title'), icon: LockClosedIcon, onClick: () => setShowTlsFingerprintProfiles(true) },
        ],
      },
    ],
    [t, selectedIds.size],
  )

  const openCreate = useCallback(() => {
    setEditing(null)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((account: AccountListItem) => {
    setEditing(account)
    setDialogOpen(true)
  }, [])

  // Vue shows a ConfirmDialog (AccountsView.vue handleDelete/confirmDelete)
  const handleDelete = useCallback((account: AccountListItem) => {
    setDeletingAccount(account)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingAccount) return
    setDeleting(true)
    try {
      await adminAPI.accounts.delete(deletingAccount.id)
      toast.success(t('admin.accounts.accountDeleted'))
      setDeletingAccount(null)
      loadAccounts()
    } catch (error) {
      console.error('Failed to delete account:', error)
      toast.error(extractApiErrorMessage(error, t('common.deleteFailed')))
    } finally {
      setDeleting(false)
    }
  }, [deletingAccount, t, loadAccounts])

  /** Test/stats/reauth need the full account record, not the lite list row. */
  const loadAccountDetails = useCallback(
    async (account: AccountListItem): Promise<Account | null> => {
      try {
        return await adminAPI.accounts.getById(account.id)
      } catch (error) {
        console.error('Failed to load account details:', error)
        toast.error(extractApiErrorMessage(error, t('common.error')))
        return null
      }
    },
    [t],
  )

  const handleTest = useCallback(
    async (account: AccountListItem) => {
      const full = await loadAccountDetails(account)
      if (full) setTestAccount(full)
    },
    [loadAccountDetails],
  )

  const handleViewStats = useCallback(
    async (account: AccountListItem) => {
      const full = await loadAccountDetails(account)
      if (full) setStatsAccount(full)
    },
    [loadAccountDetails],
  )

  const handleReAuth = useCallback(
    async (account: AccountListItem) => {
      const full = await loadAccountDetails(account)
      if (full) setReauthAccount(full)
    },
    [loadAccountDetails],
  )

  const handleRefreshToken = useCallback(
    async (account: AccountListItem) => {
      try {
        const result = await adminAPI.accounts.refreshCredentials(account.id)
        if (result.warning) toast.warning(result.message)
        else toast.success(t('admin.accounts.tokenRefreshed'))
        loadAccounts()
      } catch (error) {
        console.error('Failed to refresh credentials:', error)
        toast.error(extractApiErrorMessage(error, t('common.error')))
      }
    },
    [t, loadAccounts],
  )

  const handleRecoverState = useCallback(
    async (account: AccountListItem) => {
      try {
        await adminAPI.accounts.recoverState(account.id)
        toast.success(t('admin.accounts.recoverStateSuccess'))
        loadAccounts()
      } catch (error) {
        console.error('Failed to recover account state:', error)
        toast.error(extractApiErrorMessage(error, t('admin.accounts.recoverStateFailed')))
      }
    },
    [t, loadAccounts],
  )

  const handleResetQuota = useCallback(
    async (account: AccountListItem) => {
      try {
        await adminAPI.accounts.resetAccountQuota(account.id)
        toast.success(t('common.success'))
        loadAccounts()
      } catch (error) {
        console.error('Failed to reset quota:', error)
        toast.error(extractApiErrorMessage(error, t('common.error')))
      }
    },
    [t, loadAccounts],
  )

  /**
   * Privacy mode result keys, mirroring AccountsView.vue privacyResultMessageKey:
   * the backend reports what it achieved through extra.privacy_mode.
   */
  const handleSetPrivacy = useCallback(
    async (account: AccountListItem) => {
      try {
        const updated = await adminAPI.accounts.setPrivacy(account.id)
        const mode = typeof updated.extra?.privacy_mode === 'string' ? updated.extra.privacy_mode : ''
        if (updated.platform === 'openai') {
          if (mode === 'training_off') toast.success(t('admin.accounts.privacyTrainingOff'))
          else if (mode === 'training_set_cf_blocked') toast.error(t('admin.accounts.privacyCfBlocked'))
          else toast.error(t('admin.accounts.privacyFailed'))
        } else if (updated.platform === 'antigravity') {
          if (mode === 'privacy_set') toast.success(t('admin.accounts.privacyAntigravitySet'))
          else toast.error(t('admin.accounts.privacyAntigravityFailed'))
        } else {
          toast.error(t('admin.accounts.privacyFailed'))
        }
        loadAccounts()
      } catch (error) {
        console.error('Failed to set privacy:', error)
        toast.error(extractApiErrorMessage(error, t('admin.accounts.privacyFailed')))
      }
    },
    [t, loadAccounts],
  )

  const confirmCreateSparkShadow = useCallback(async () => {
    if (!shadowAccount) return
    setCreatingShadow(true)
    try {
      await adminAPI.accounts.createSparkShadow(shadowAccount.id, { name: `${shadowAccount.name} (Spark)` })
      toast.success(t('admin.accounts.createSparkShadowSuccess'))
      setShadowAccount(null)
      loadAccounts()
    } catch (error) {
      console.error('Failed to create spark shadow:', error)
      toast.error(extractApiErrorMessage(error, t('admin.accounts.createSparkShadowFailed')))
    } finally {
      setCreatingShadow(false)
    }
  }, [shadowAccount, t, loadAccounts])

  const openBulkEditSelected = useCallback(() => {
    const selected = accounts.filter((account) => selectedIds.has(account.id))
    setBulkEditTarget({
      mode: 'selected',
      accountIds: selected.map((account) => account.id),
      selectedPlatforms: [...new Set(selected.map((account) => account.platform))] as AccountPlatform[],
      selectedTypes: [...new Set(selected.map((account) => account.type))] as AccountType[],
    })
  }, [accounts, selectedIds])

  /**
   * Filter snapshot sent as the bulk-update `filters` object, matching the
   * backend BulkUpdateAccountFilters fields and Vue
   * buildBulkEditFilterSnapshot (AccountsView.vue:2074). `group` and
   * `privacy_mode` are always empty because this page has no filter for them
   * yet; the backend treats an empty string as "no constraint".
   */
  const bulkEditFilters = useMemo(
    () => ({
      platform: platformFilter,
      type: typeFilter,
      status: statusFilter,
      group: groupFilter,
      search: searchQuery,
      privacy_mode: '',
    }),
    [platformFilter, typeFilter, statusFilter, groupFilter, searchQuery],
  )

  /**
   * Bulk edit every account matching the current filters, not just the page's
   * selection (Vue openBulkEditFiltered, AccountsView.vue:2146). The preview
   * call supplies the count the dialog shows and the platform/type sets it
   * needs to decide which platform-specific sections are safe to offer.
   */
  const openBulkEditFiltered = useCallback(async () => {
    if (bulkEditPreviewing) return
    setBulkEditPreviewing(true)
    try {
      const preview = await adminAPI.accounts.list(1, 100, bulkEditFilters)
      const items = preview.items ?? []
      setBulkEditTarget({
        mode: 'filtered',
        filters: bulkEditFilters,
        previewCount: preview.total,
        selectedPlatforms: [...new Set(items.map((account) => account.platform))] as AccountPlatform[],
        selectedTypes: [...new Set(items.map((account) => account.type))] as AccountType[],
      })
    } catch (error) {
      console.error('Failed to preview filtered accounts:', error)
      toast.error(extractApiErrorMessage(error, t('admin.accounts.failedToLoad')))
    } finally {
      setBulkEditPreviewing(false)
    }
  }, [bulkEditPreviewing, bulkEditFilters, t])

  const handleBulkUpdated = useCallback(() => {
    setBulkEditTarget(null)
    setSelectedIds(new Set())
    loadAccounts()
  }, [loadAccounts])

  const handleToggleSchedulable = useCallback(
    async (account: AccountListItem) => {
      try {
        await adminAPI.accounts.setSchedulable(account.id, !account.schedulable)
        toast.success(account.schedulable ? t('admin.accounts.schedulableDisabled') : t('admin.accounts.schedulableEnabled'))
        loadAccounts()
      } catch (error) {
        console.error('Failed to toggle schedulable:', error)
        toast.error(t('admin.accounts.failedToToggleSchedulable'))
      }
    },
    [t, loadAccounts],
  )

  const handleResetStatus = useCallback(
    async (account: AccountListItem) => {
      try {
        await adminAPI.accounts.clearError(account.id)
        toast.success(t('admin.accounts.statusReset'))
        loadAccounts()
      } catch (error) {
        console.error('Failed to reset status:', error)
        toast.error(t('admin.accounts.failedToResetStatus'))
      }
    },
    [t, loadAccounts],
  )

  const handleDuplicate = useCallback(
    async (account: AccountListItem) => {
      try {
        const copy = await adminAPI.accounts.duplicate(account.id)
        toast.success(t('admin.accounts.duplicateSuccess', { name: copy.name }))
        loadAccounts()
      } catch (error) {
        console.error('Failed to duplicate account:', error)
        toast.error(t('admin.accounts.duplicateFailed'))
      }
    },
    [t, loadAccounts],
  )

  const handleBulkSchedulable = useCallback(
    async (schedulable: boolean) => {
      const ids = [...selectedIds]
      setBulkBusy(true)
      try {
        const result = await adminAPI.accounts.bulkUpdate(ids, { schedulable })
        if (result.failed > 0) {
          toast.warning(t('admin.accounts.bulkSchedulablePartial', { success: result.success, failed: result.failed }))
        } else {
          toast.success(
            t(schedulable ? 'admin.accounts.bulkSchedulableEnabled' : 'admin.accounts.bulkSchedulableDisabled', {
              count: result.success,
            }),
          )
        }
        loadAccounts()
      } catch (error) {
        console.error('Failed to bulk update schedulable:', error)
        toast.error(t('admin.accounts.failedToToggleSchedulable'))
      } finally {
        setBulkBusy(false)
      }
    },
    [selectedIds, t, loadAccounts],
  )

  /**
   * Batch delete, mirroring AccountsView.vue handleBulkDelete: a partial result
   * keeps the failed ids selected so they can be retried.
   */
  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds]
    setBulkBusy(true)
    try {
      const result = await adminAPI.accounts.batchDelete(ids)
      if (result.failed > 0) {
        toast.error(t('admin.accounts.bulkActions.partialSuccess', { success: result.success, failed: result.failed }))
        setSelectedIds(new Set(result.failed_ids?.length ? result.failed_ids : ids))
      } else {
        toast.success(t('admin.accounts.bulkActions.deleteSuccess', { count: result.success }))
        setSelectedIds(new Set())
      }
      setConfirmBulkDelete(false)
      loadAccounts()
    } catch (error) {
      console.error('Failed to bulk delete accounts:', error)
      toast.error(extractApiErrorMessage(error, t('common.deleteFailed')))
    } finally {
      setBulkBusy(false)
    }
  }, [selectedIds, t, loadAccounts])

  /**
   * Row "More" menu, ported from AccountActionMenu.vue including its gating:
   * shadow accounts hold no credentials, so credential and privacy actions are
   * hidden for them, and recover/quota actions only appear when they apply.
   */
  const rowMenuItems = useCallback(
    (account: AccountListItem) => {
      const isShadow = account.parent_account_id != null
      const isOAuthLike = account.type === 'oauth' || account.type === 'setup-token'
      const isOpenAIOAuth = account.platform === 'openai' && account.type === 'oauth'
      const isAntigravityOAuth = account.platform === 'antigravity' && account.type === 'oauth'
      const items: DropdownMenuOption[] = [
        { label: t('admin.accounts.testConnection'), icon: PlayIcon, onClick: () => void handleTest(account) },
        { label: t('admin.accounts.viewStats'), icon: ChartBarIcon, onClick: () => void handleViewStats(account) },
        {
          label: t('admin.scheduledTests.schedule'),
          icon: ClockIcon,
          onClick: () => setScheduleAccountId(account.id),
        },
      ]
      if (account.parent_account_id == null && DUPLICABLE_TYPES.includes(account.type)) {
        items.push({
          label: t('admin.accounts.duplicateAccount'),
          icon: DocumentDuplicateIcon,
          onClick: () => void handleDuplicate(account),
        })
      }
      if (isOAuthLike && !isShadow) {
        items.push({
          label: t('admin.accounts.reAuthorize'),
          icon: LinkIcon,
          onClick: () => void handleReAuth(account),
        })
        items.push({
          label: t('admin.accounts.refreshToken'),
          icon: ArrowPathIcon,
          onClick: () => void handleRefreshToken(account),
        })
      }
      if (isOpenAIOAuth && !isShadow) {
        items.push({
          label: t('admin.accounts.createSparkShadow'),
          icon: SparklesIcon,
          onClick: () => setShadowAccount(account),
        })
      }
      if ((isOpenAIOAuth || isAntigravityOAuth) && !isShadow) {
        items.push({
          label: t('admin.accounts.setPrivacy'),
          icon: ShieldCheckIcon,
          onClick: () => void handleSetPrivacy(account),
        })
      }
      items.push({ type: 'divider' })
      items.push({
        label: account.schedulable
          ? t('admin.accounts.bulkActions.disableScheduling')
          : t('admin.accounts.bulkActions.enableScheduling'),
        onClick: () => void handleToggleSchedulable(account),
      })
      items.push({ label: t('admin.accounts.resetStatus'), onClick: () => void handleResetStatus(account) })
      if (isTempUnschedulable(account)) {
        items.push({
          label: t('admin.accounts.tempUnschedulable.viewDetails'),
          icon: ClockIcon,
          onClick: () => setTempUnschedAccount(account),
        })
      }
      if (hasRecoverableState(account)) {
        items.push({
          label: t('admin.accounts.recoverState'),
          icon: ArrowPathRoundedSquareIcon,
          onClick: () => void handleRecoverState(account),
        })
      }
      if (hasQuotaLimit(account)) {
        items.push({
          label: t('admin.accounts.resetQuota'),
          icon: ArrowPathIcon,
          onClick: () => void handleResetQuota(account),
        })
      }
      return items
    },
    [
      t,
      handleTest,
      handleViewStats,
      handleDuplicate,
      handleReAuth,
      handleRefreshToken,
      handleSetPrivacy,
      handleToggleSchedulable,
      handleResetStatus,
      handleRecoverState,
      handleResetQuota,
    ],
  )

  // Handle row selection
  const handleRowSelect = useCallback((id: number, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  // Handle select all
  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedIds(new Set(accounts.map(a => a.id)))
    } else {
      setSelectedIds(new Set())
    }
  }, [accounts])

  // Convert accounts to table rows
  const rows: AccountRow[] = useMemo(
    () =>
      accounts.map(account => ({
        __id: String(account.id),
        ...account,
      })),
    [accounts]
  )

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // Table columns
  const columns: TableColumn<AccountRow>[] = useMemo(() => [
    {
      key: 'select',
      header: (
        <CheckboxInput
          label={t('admin.accounts.bulkActions.selectCurrentPage')}
          isLabelHidden
          value={selectedIds.size === accounts.length && accounts.length > 0}
          onChange={(checked) => handleSelectAll(checked)}
        />
      ),
      renderCell: (row: AccountRow) => (
        <CheckboxInput
          label={row.name}
          isLabelHidden
          value={selectedIds.has(row.id)}
          onChange={(checked) => handleRowSelect(row.id, checked)}
        />
      ),
      width: pixel(48),
    },
    {
      key: 'id',
      header: t('admin.accounts.columns.id'),
      renderCell: (row: AccountRow) => <Text type="code" color="secondary">#{row.id}</Text>,
      width: pixel(80),
    },
    {
      key: 'name',
      header: t('admin.accounts.columns.name'),
      renderCell: (row: AccountRow) => (
        <VStack gap={1}>
          <Text weight="medium">{row.name}</Text>
          {row.extra?.email && (
            <Text color="secondary">{row.extra.email}</Text>
          )}
        </VStack>
      ),
      width: proportional(2),
    },
    {
      key: 'platform',
      header: t('admin.accounts.columns.platformType'),
      renderCell: (row: AccountRow) => (
        <HStack gap={2}>
          <Badge label={platformLabel(row.platform)} variant="info" />
          <Badge label={typeLabel(row.type)} variant="neutral" />
        </HStack>
      ),
      width: proportional(1.5),
    },
    {
      key: 'status',
      header: t('admin.accounts.columns.status'),
      renderCell: (row: AccountRow) => {
        const account = accountById.get(row.id)
        // A temporarily unschedulable account shows its own badge, and clicking it
        // opens the detail dialog (Vue: AccountStatusIndicator show-temp-unsched).
        if (account && isTempUnschedulable(account)) {
          return (
            <VStack gap={0.5}>
              <Button
                label={t('admin.accounts.status.tempUnschedulable')}
                variant="ghost"
                size="sm"
                tooltip={t('admin.accounts.tempUnschedulable.viewDetails')}
                onClick={() => setTempUnschedAccount(account)}
              />
              {account.temp_unschedulable_until && (
                <Text type="supporting" color="secondary">
                  {t('admin.accounts.status.tempUnschedulableUntil', {
                    time: formatDateTime(account.temp_unschedulable_until),
                  })}
                </Text>
              )}
            </VStack>
          )
        }
        const variant = row.status === 'active' ? 'success' : row.status === 'inactive' ? 'neutral' : 'warning'
        const label = STATUS_KEYS[row.status] ? t(STATUS_KEYS[row.status]) : row.status
        return <Badge label={label} variant={variant} />
      },
      width: pixel(140),
    },
    {
      key: 'schedulable',
      header: t('admin.accounts.columns.schedulable'),
      renderCell: (row: AccountRow) => (
        <Badge label={row.schedulable ? t('common.yes') : t('common.no')} variant={row.schedulable ? 'success' : 'neutral'} />
      ),
      width: pixel(100),
    },
    {
      key: 'created_at',
      header: t('admin.accounts.columns.createdAt'),
      renderCell: (row: AccountRow) => (
        <Text color="secondary">
          {formatDateTime(row.created_at)}
        </Text>
      ),
      width: proportional(1.5),
    },
    {
      key: 'actions',
      header: t('admin.accounts.columns.actions'),
      renderCell: (row: AccountRow) => {
        const account = accountById.get(row.id)
        if (!account) return null
        return (
          <HStack gap={1}>
            <IconButton
              icon={<Icon icon={PencilIcon} />}
              label={t('common.edit')}
              variant="ghost"
              onClick={() => openEdit(account)}
            />
            <IconButton
              icon={<Icon icon={TrashIcon} />}
              label={t('common.delete')}
              variant="ghost"
              onClick={() => void handleDelete(account)}
            />
            <MoreMenu label={t('admin.accounts.moreActions')} alignment="end" items={rowMenuItems(account)} />
          </HStack>
        )
      },
      width: pixel(140),
    },
  ], [t, accounts, accountById, selectedIds, handleSelectAll, handleRowSelect, platformLabel, typeLabel, openEdit, handleDelete, rowMenuItems])

  return (
    <Page title={t('admin.accounts.title')} description={t('admin.accounts.description')}>
      <VStack gap={6} hAlign="stretch">
        {/* Header Actions */}
        <HStack gap={2} vAlign="center" hAlign="end">
          <Button
            label={t('common.refresh')}
            icon={<Icon icon={ArrowPathIcon} />}
            variant="secondary"
            onClick={handleRefresh}
            isDisabled={loading}
          />
          <DropdownMenu
            button={{ label: t('admin.accounts.moreActions'), icon: <Icon icon={EllipsisHorizontalIcon} />, variant: 'secondary' }}
            alignment="end"
            items={toolsMenuItems}
          />
          <Button
            label={t('admin.accounts.createAccount')}
            icon={<Icon icon={PlusIcon} />}
            variant="primary"
            onClick={openCreate}
          />
        </HStack>

        {/* Filters */}
        <Card padding={4}>
          <VStack gap={4} hAlign="stretch">
            {/* Search */}
            <TextInput
              label={t('common.search')}
              placeholder={t('admin.accounts.searchAccounts')}
              value={searchQuery}
              onChange={handleSearchChange}
            />

            {/* Filter Row */}
            <HStack gap={3}>
              <StackItem size="fill">
                <Selector
                  label={t('admin.accounts.columns.platform')}
                  value={platformFilter}
                  onChange={handlePlatformChange}
                  options={platformOptions}
                />
              </StackItem>
              <StackItem size="fill">
                <Selector
                  label={t('admin.accounts.columns.status')}
                  value={statusFilter}
                  onChange={handleStatusChange}
                  options={statusOptions}
                />
              </StackItem>
              <StackItem size="fill">
                <Selector
                  label={t('admin.accounts.columns.type')}
                  value={typeFilter}
                  onChange={handleTypeChange}
                  options={typeOptions}
                />
              </StackItem>
              <StackItem size="fill">
                <Selector
                  label={t('admin.accounts.columns.groups')}
                  value={groupFilter}
                  onChange={handleGroupChange}
                  options={groupOptions}
                />
              </StackItem>
            </HStack>
          </VStack>
        </Card>

        {/*
          Bulk actions bar (port of AccountBulkActionsBar.vue). It is always
          visible: the selection-scoped actions appear only with a selection,
          but "edit filtered" applies to every account matching the current
          filters and so is offered even with nothing selected.
        */}
        <Card padding={3}>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <Text weight="medium">
              {selectedIds.size > 0
                ? t('admin.accounts.bulkActions.selected', { count: selectedIds.size })
                : t('admin.accounts.bulkEdit.title')}
            </Text>
            <HStack gap={2} wrap="wrap">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    label={t('admin.accounts.bulkActions.enableScheduling')}
                    variant="secondary"
                    isDisabled={bulkBusy}
                    onClick={() => void handleBulkSchedulable(true)}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.disableScheduling')}
                    variant="secondary"
                    isDisabled={bulkBusy}
                    onClick={() => void handleBulkSchedulable(false)}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.edit')}
                    variant="secondary"
                    isDisabled={bulkBusy}
                    onClick={openBulkEditSelected}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.delete')}
                    variant="secondary"
                    isDisabled={bulkBusy}
                    onClick={() => setConfirmBulkDelete(true)}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.clear')}
                    variant="ghost"
                    onClick={() => setSelectedIds(new Set())}
                  />
                </>
              )}
              <Button
                label={t('admin.accounts.bulkEdit.submit')}
                variant="primary"
                isLoading={bulkEditPreviewing}
                isDisabled={bulkBusy}
                onClick={() => void openBulkEditFiltered()}
              />
            </HStack>
          </HStack>
        </Card>

        {/* Table */}
        <Card padding={0}>
          {loading && accounts.length === 0 ? (
            <Center minHeight={400}>
              <Spinner />
            </Center>
          ) : accounts.length === 0 ? (
            <Center minHeight={400}>
              <EmptyState
                title={t('admin.accounts.noAccountsYet')}
                description={t('astryx.noAccountsDescription')}
              />
            </Center>
          ) : (
            <Table
              data={rows}
              columns={columns}
              idKey="__id"
            />
          )}
        </Card>
      </VStack>

      <AccountFormDialog
        isOpen={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={loadAccounts}
      />

      {/* Bulk edit the current selection */}
      <BulkEditAccountsDialog
        isOpen={!!bulkEditTarget}
        target={bulkEditTarget}
        onClose={() => setBulkEditTarget(null)}
        onUpdated={handleBulkUpdated}
      />

      {/* Toolbar tools: CRS sync, data import and data export */}
      <SyncFromCrsDialog isOpen={showSync} onClose={() => setShowSync(false)} onSynced={loadAccounts} />
      <ImportDataDialog
        isOpen={showImportData}
        onClose={() => setShowImportData(false)}
        onImported={handleDataImported}
      />
      <ExportDataDialog
        isOpen={showExportData}
        onClose={() => setShowExportData(false)}
        selectedIds={selectedIdList}
        filters={exportFilters}
      />

      {/* Gateway tools */}
      <ErrorPassthroughRulesDialog isOpen={showErrorPassthrough} onClose={() => setShowErrorPassthrough(false)} />
      <TlsFingerprintProfilesDialog
        isOpen={showTlsFingerprintProfiles}
        onClose={() => setShowTlsFingerprintProfiles(false)}
      />

      {/* Row dialogs */}
      <AccountTestDialog isOpen={!!testAccount} account={testAccount} onClose={() => setTestAccount(null)} />
      <AccountStatsDialog isOpen={!!statsAccount} account={statsAccount} onClose={() => setStatsAccount(null)} />
      <ScheduledTestsDialog
        isOpen={scheduleAccountId != null}
        accountId={scheduleAccountId}
        onClose={() => setScheduleAccountId(null)}
      />
      <ReauthAccountDialog
        isOpen={!!reauthAccount}
        account={reauthAccount}
        onClose={() => setReauthAccount(null)}
        onReauthorized={() => loadAccounts()}
      />
      <TempUnschedulableStatusDialog
        isOpen={!!tempUnschedAccount}
        account={tempUnschedAccount}
        onClose={() => setTempUnschedAccount(null)}
        onReset={() => loadAccounts()}
      />

      {/* Confirmations */}
      <AlertDialog
        isOpen={!!deletingAccount}
        onOpenChange={(open) => !open && setDeletingAccount(null)}
        title={t('admin.accounts.deleteAccount')}
        description={t('admin.accounts.deleteConfirm', { name: deletingAccount?.name ?? '' })}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void confirmDelete()}
      />
      <AlertDialog
        isOpen={confirmBulkDelete}
        onOpenChange={(open) => !open && setConfirmBulkDelete(false)}
        title={t('admin.accounts.bulkActions.delete')}
        description={t('admin.accounts.bulkActions.confirmDelete', { count: selectedIds.size })}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={bulkBusy}
        onAction={() => void handleBulkDelete()}
      />
      <AlertDialog
        isOpen={!!shadowAccount}
        onOpenChange={(open) => !open && setShadowAccount(null)}
        title={t('admin.accounts.createSparkShadow')}
        description={t('admin.accounts.createSparkShadowConfirm', { name: shadowAccount?.name ?? '' })}
        actionLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        actionVariant="primary"
        isActionLoading={creatingShadow}
        onAction={() => void confirmCreateSparkShadow()}
      />
    </Page>
  )
}
