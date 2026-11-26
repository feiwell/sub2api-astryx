import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { RowActionButton } from '~/components/common/RowActionButton'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Table, proportional, pixel, useTablePagination, type TableColumn } from '@astryxdesign/core/Table'
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
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { adminAPI } from '~/lib/api/admin'
import type { Account, AccountListItem, AccountPlatform, AccountType } from '@/types'
import { listPlatformIds, platformDisplayName } from '@/constants/platformCatalog'
import { hasLocalQuota } from './accounts/usageRules'
import { extractApiErrorMessage } from '@/utils/apiError'
import { Page } from '~/components/common/Page'
import { LoadingOverlay } from '~/components/common/LoadingOverlay'
import { getVersion, useI18n } from '~/i18n'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { ColumnPicker, useHiddenColumns } from '~/components/usage/ColumnPicker'
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
import { AccountUsageCell } from './accounts/AccountUsageCell'
import { AccountCapacity, AccountTodayStats } from './accounts/AccountUsageColumns'
import { AccountUsageStore, type AccountListRevision } from './accounts/useAccountUsageRow'
import type { UpdateAccount } from './accounts/ProviderQuotaCells'
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

import { AccountFormDialog } from './accounts/AccountFormDialog'
import { fetchAllAccountIds } from '@/utils/accountSelection'
import type { AdminGroup } from '@/types'
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

const STATUSES = ['active', 'inactive', 'error', 'rate_limited', 'temp_unschedulable', 'unschedulable'] as const
const TYPES = ['oauth', 'apikey', 'setup-token', 'bedrock', 'service_account', 'upstream'] as const

// Catalog key for each account status value
const STATUS_KEYS: Record<string, string> = {
  active: 'admin.accounts.status.active',
  inactive: 'admin.accounts.status.inactive',
  error: 'admin.accounts.status.error',
  rate_limited: 'admin.accounts.status.rateLimited',
  temp_unschedulable: 'admin.accounts.status.tempUnschedulable',
  unschedulable: 'admin.accounts.status.unschedulable',
}

// Catalog key for each account type value; the backend writes apikey, older data api_key
const TYPE_KEYS: Record<string, string> = {
  oauth: 'admin.accounts.types.oauth',
  apikey: 'admin.accounts.apiKey',
  api_key: 'admin.accounts.apiKey',
  'setup-token': 'admin.accounts.setupToken',
  upstream: 'admin.accounts.types.upstream',
  bedrock: 'admin.accounts.bedrockLabel',
  service_account: 'admin.accounts.vertexLabel',
}

type AccountRow = AccountListItem & { __id: string; [key: string]: unknown }

export function AdminAccountsPage() {
  const { t } = useI18n()
  const [accounts, setAccounts] = useState<AccountListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [privacyFilter, setPrivacyFilter] = useState('')
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const filters = useMemo(() => ({ platform: platformFilter, type: typeFilter, status: statusFilter,
    group: groupFilter, privacy_mode: privacyFilter, search: searchQuery }),
    [platformFilter, typeFilter, statusFilter, groupFilter, privacyFilter, searchQuery])
  const selecting = useRef<AbortController | null>(null)
  const [selectingAll, setSelectingAll] = useState(false)
  const selectionMetadata = useRef(new Map<number, Pick<Account, 'type' | 'platform'>>())
  const [batchAction, setBatchAction] = useState<'refreshToken' | 'resetStatus' | 'probeUpstreamBilling' | null>(null)
  const [refreshSeconds, setRefreshSeconds] = useState(() => {
    const seconds = Number(localStorage.getItem('astryx-account-refresh-seconds'))
    return [5, 10, 15, 30].includes(seconds) ? seconds : 0
  })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
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
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const pagination = useTablePagination<AccountRow>({ page, pageSize, totalItems: total, onPageChange: setPage,
    onPageSizeChange: size => { setPageSize(size); setPage(1) }, pageSizeOptions: [10, 20, 50, 100] })
  const [usageStore] = useState(() => new AccountUsageStore())
  const [lastProbe] = useState(() => new Map<number, number>())
  const [revision, setRevision] = useState<AccountListRevision>({ version: 0, force: false })
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns('account-hidden-columns', ['today_stats', 'proxy', 'notes', 'scheduler_score', 'rate_multiplier'])
  const catalogVersion = getVersion()
  const listRequest = useRef<AbortController | null>(null)
  const updateAccount = useCallback<UpdateAccount>((id, patch) => {
    setAccounts(current => current.map(account => account.id === id ? { ...account, ...patch,
      extra: patch.extra ? { ...account.extra, ...patch.extra } : account.extra } : account))
  }, [])

  // Load accounts
  const loadAccounts = useCallback(async (force = false) => {
    listRequest.current?.abort()
    const request = new AbortController()
    listRequest.current = request
    setLoading(true)
    try {
      const response = await adminAPI.accounts.list(page, pageSize, {
        ...filters, lite: '1',
      }, { signal: request.signal })
      if (request.signal.aborted) return
      setAccounts(response.items ?? [])
      setTotal(response.total ?? 0)
      setRevision(current => ({ version: current.version + 1, force }))
    } catch (error) {
      if (!request.signal.aborted) toast.error(extractApiErrorMessage(error, t('admin.accounts.failedToLoad')))
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }, [page, pageSize, filters, t])

  useEffect(() => {
    void loadAccounts()
    return () => listRequest.current?.abort()
  }, [loadAccounts])

  const platformLabel = useCallback(
    (platform: string) => {
      const key = `admin.accounts.platforms.${platform}`
      const label = t(key)
      return label === key ? platformDisplayName(platform) : label
    },
    [t],
  )
  const typeLabel = useCallback((type: string) => (TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : type), [t])

  const platformOptions = useMemo(
    () => [{ value: '', label: t('admin.accounts.allPlatforms') }, ...listPlatformIds().map((p) => ({ value: p, label: platformLabel(p) }))],
    [t, platformLabel, catalogVersion],
  )
  const statusOptions = useMemo(
    () => [{ value: '', label: t('admin.accounts.allStatus') }, ...STATUSES.map((s) => ({ value: s, label: t(STATUS_KEYS[s]) }))],
    [t, catalogVersion],
  )
  const typeOptions = useMemo(
    () => [{ value: '', label: t('admin.accounts.allTypes') }, ...TYPES.map((v) => ({ value: v, label: typeLabel(v) }))],
    [t, typeLabel, catalogVersion],
  )

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

  // Handle refresh
  const handleRefresh = useCallback(() => {
    void loadAccounts(true)
  }, [loadAccounts])

  const handleDataImported = useCallback(() => {
    setShowImportData(false)
    loadAccounts()
  }, [loadAccounts])

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

  const editRequest = useRef(0)
  const openCreate = useCallback(() => {
    ++editRequest.current
    setEditing(null)
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

  const openEdit = useCallback(async (row: AccountListItem) => {
    const request = ++editRequest.current
    const detail = await loadAccountDetails(row)
    if (detail && request === editRequest.current) {
      setEditing(detail)
      setDialogOpen(true)
    }
  }, [loadAccountDetails])

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
    const selected = [...selectedIds].flatMap(id => selectionMetadata.current.get(id) ?? [])
    setBulkEditTarget({
      mode: 'selected',
      accountIds: [...selectedIds],
      selectedPlatforms: [...new Set(selected.map((account) => account.platform))] as AccountPlatform[],
      selectedTypes: [...new Set(selected.map((account) => account.type))] as AccountType[],
    })
  }, [selectedIds])

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
      const preview = await adminAPI.accounts.list(1, 100, filters)
      const items = preview.items ?? []
      setBulkEditTarget({
        mode: 'filtered',
        filters,
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
  }, [bulkEditPreviewing, filters, t])

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
      if (hasLocalQuota(account)) {
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

  useEffect(() => {
    let active = true
    adminAPI.groups.getAll().then(items => { if (active) setGroups(items) })
      .catch(err => { if (active) toast.error(extractApiErrorMessage(err, t('common.error'))) })
    return () => { active = false }
  }, [t])

  useEffect(() => {
    selectionMetadata.current.clear()
    setSelectedIds(new Set())
    setSelectingAll(false)
    return () => selecting.current?.abort()
  }, [filters])

  const paused = loading || bulkBusy || selectingAll || dialogOpen || !!(bulkEditTarget || testAccount || statsAccount ||
    reauthAccount || scheduleAccountId || tempUnschedAccount || deletingAccount || shadowAccount || confirmBulkDelete ||
    batchAction || showSync || showImportData || showExportData || showErrorPassthrough || showTlsFingerprintProfiles)
  useEffect(() => {
    if (!refreshSeconds || paused) return
    const timer = window.setInterval(() => { if (!document.hidden) void loadAccounts() }, refreshSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [loadAccounts, refreshSeconds, paused])

  const selectAllResults = async () => {
    selecting.current?.abort()
    const request = new AbortController()
    selecting.current = request
    setSelectingAll(true)
    const metadata = new Map<number, Pick<Account, 'type' | 'platform'>>()
    try {
      const ids = await fetchAllAccountIds(async (page, size, params) => {
        const result = await adminAPI.accounts.list(page, size, params, { signal: request.signal })
        for (const { id, platform, type } of result.items) metadata.set(id, { platform, type })
        return result
      }, filters)
      if (request.signal.aborted) return
      selectionMetadata.current = metadata
      setSelectedIds(new Set(ids))
    } catch {
      if (!request.signal.aborted) toast.error(t('admin.accounts.bulkActions.selectAllFailed'))
    } finally {
      if (!request.signal.aborted) setSelectingAll(false)
    }
  }

  const runBatch = async () => {
    if (!batchAction || bulkBusy) return
    const ids = [...selectedIds]
    setBulkBusy(true)
    try {
      if (batchAction === 'probeUpstreamBilling') {
        if (ids.length > 20) { toast.error(t('admin.accounts.upstreamBilling.batchLimit')); return }
        const results = await adminAPI.accounts.probeUpstreamBillingBatch(ids)
        const failed = results.filter(row => row.error).map(row => row.account_id)
        if (failed.length) {
          toast.error(t('admin.accounts.upstreamBilling.batchPartial', { success: results.length - failed.length, failed: failed.length }))
          setSelectedIds(new Set(failed))
        } else toast.success(t('admin.accounts.upstreamBilling.batchCompleted', { count: results.length }))
      } else {
        const result = batchAction === 'refreshToken' ? await adminAPI.accounts.batchRefresh(ids) : await adminAPI.accounts.batchClearError(ids)
        if (result.failed) {
          const failed = result.failed_ids ?? result.errors?.map(item => item.account_id)
          setSelectedIds(new Set(failed?.length ? failed : ids))
          toast.error(t('admin.accounts.bulkActions.partialSuccess', { success: result.success, failed: result.failed }))
        } else {
          setSelectedIds(new Set())
          toast.success(t(`admin.accounts.bulkActions.${batchAction}Success`, { count: result.success }))
        }
        for (const warning of result.warnings ?? []) toast.warning(`#${warning.account_id} 路 ${warning.warning}`)
      }
      void loadAccounts()
    } catch (err) { toast.error(extractApiErrorMessage(err, t('common.error'))) }
    finally { setBulkBusy(false); setBatchAction(null) }
  }

  const handleRowSelect = useCallback((id: number, selected: boolean) => {
    const row = accounts.find(item => item.id === id)
    if (selected && row) selectionMetadata.current.set(id, { platform: row.platform, type: row.type })
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [accounts])

  const handleSelectAll = useCallback((checked: boolean) => {
    for (const { id, platform, type } of accounts) selectionMetadata.current.set(id, { platform, type })
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const row of accounts) { if (checked) next.add(row.id); else next.delete(row.id) }
      return next
    })
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
          isDisabled={selectingAll || bulkBusy}
          value={accounts.length > 0 && accounts.every(account => selectedIds.has(account.id))}
          onChange={(checked) => handleSelectAll(checked)}
        />
      ),
      renderCell: (row: AccountRow) => (
        <CheckboxInput
          label={row.name}
          isDisabled={selectingAll || bulkBusy}
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
          {typeof row.extra?.email === 'string' && row.extra.email && (
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
      key: 'capacity', header: t('admin.accounts.columns.capacity'),
      renderCell: (row: AccountRow) => <AccountCapacity account={row} />, width: proportional(1.5),
    },
    {
      key: 'today_stats', header: t('admin.accounts.columns.todayStats'),
      renderCell: (row: AccountRow) => <AccountTodayStats key={row.id} account={row} store={usageStore} revision={revision} />, width: proportional(1.5),
    },
    {
      key: 'usage', header: <Tooltip content={t('admin.accounts.usageWindowsHint')}><Text>{t('admin.accounts.columns.usageWindows')}</Text></Tooltip>,
      renderCell: (row: AccountRow) => <AccountUsageCell key={`${row.id}-${row.platform}-${row.type}`} account={row} store={usageStore}
        revision={revision} update={updateAccount} lastProbe={lastProbe} />, width: proportional(2, { minWidth: 200 }),
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
            <RowActionButton action="edit" onClick={() => openEdit(account)} />
            <RowActionButton action="delete" onClick={() => void handleDelete(account)} />
            <MoreMenu label={t('admin.accounts.moreActions')} alignment="end" items={rowMenuItems(account)} />
          </HStack>
        )
      },
      width: pixel(140),
    },
  ], [selectingAll, bulkBusy, t, accounts, accountById, selectedIds, handleSelectAll, handleRowSelect, platformLabel, typeLabel, openEdit, handleDelete, rowMenuItems, usageStore, revision, updateAccount, lastProbe, catalogVersion])

  const columnChoices = [
    { key: 'capacity', label: t('admin.accounts.columns.capacity') },
    { key: 'today_stats', label: t('admin.accounts.columns.todayStats') },
    { key: 'usage', label: t('admin.accounts.columns.usageWindows') },
  ]
  const optionalColumns = columnChoices.map(column => column.key)

  return (
    <Page title={t('admin.accounts.title')} description={t('admin.accounts.description')}>
      <VStack gap={6} hAlign="stretch">
        {/* Header Actions */}
        <HStack gap={2} vAlign="center" hAlign="end" wrap="wrap">
          <ColumnPicker columns={columnChoices} hidden={hiddenColumns}
            onChange={next => setHiddenColumns([...hiddenColumns.filter(key => !optionalColumns.includes(key)), ...next])} />
          <Button
            label={t('common.refresh')}
            icon={<Icon icon={ArrowPathIcon} />}
            variant="secondary"
            onClick={handleRefresh}
            isDisabled={loading}
          />
          <Selector label={t('admin.accounts.autoRefresh')} value={String(refreshSeconds)}
            options={[{ value: '0', label: t('common.disabled') }, ...[5, 10, 15, 30].map(n => ({ value: String(n), label: t(`admin.accounts.refreshInterval${n}s`) }))]}
            onChange={value => { localStorage.setItem('astryx-account-refresh-seconds', value); setRefreshSeconds(Number(value)) }} />
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
            <HStack gap={3} wrap="wrap">
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
              <Selector label={t('admin.accounts.allGroups')} value={groupFilter}
                onChange={value => { setGroupFilter(value); setPage(1) }} options={[
                  { value: '', label: t('admin.accounts.allGroups') }, { value: 'ungrouped', label: t('admin.accounts.ungroupedGroup') },
                  ...groups.map(group => ({ value: String(group.id), label: group.name }))]} />
              <Selector label={t('admin.accounts.allPrivacyModes')} value={privacyFilter}
                onChange={value => { setPrivacyFilter(value); setPage(1) }} options={[
                  { value: '', label: t('admin.accounts.allPrivacyModes') }, { value: '__unset__', label: t('admin.accounts.privacyUnset') },
                  { value: 'training_off', label: 'Privacy' }, { value: 'training_set_cf_blocked', label: 'CF' },
                  { value: 'training_set_failed', label: t('admin.accounts.privacyFailed') }]} />
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
              <Button label={t('admin.accounts.bulkActions.selectAllResults', { count: total })}
                isDisabled={!total || bulkBusy || loading || selectingAll} isLoading={selectingAll} onClick={() => void selectAllResults()} />
              {selectedIds.size > 0 && (
                <>
                  {(['resetStatus', 'refreshToken', 'probeUpstreamBilling'] as const).map(action => (
                    <Button key={action} label={t(`admin.accounts.bulkActions.${action}`)}
                      isDisabled={bulkBusy || selectingAll} onClick={() => setBatchAction(action)} />
                  ))}
                  <Button
                    label={t('admin.accounts.bulkActions.enableScheduling')}
                    variant="secondary"
                    isDisabled={bulkBusy || selectingAll}
                    onClick={() => void handleBulkSchedulable(true)}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.disableScheduling')}
                    variant="secondary"
                    isDisabled={bulkBusy || selectingAll}
                    onClick={() => void handleBulkSchedulable(false)}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.edit')}
                    variant="secondary"
                    isDisabled={bulkBusy || selectingAll}
                    onClick={openBulkEditSelected}
                  />
                  <Button
                    label={t('admin.accounts.bulkActions.delete')}
                    variant="secondary"
                    isDisabled={bulkBusy || selectingAll}
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
                isDisabled={bulkBusy || selectingAll}
                onClick={() => void openBulkEditFiltered()}
              />
            </HStack>
          </HStack>
        </Card>

        {/* Table */}
        <Card padding={0} style={{ position: 'relative' }}>
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
              columns={columns.filter(column => !optionalColumns.includes(column.key) || !hiddenColumns.includes(column.key))}
              plugins={{ pagination }}
              idKey="__id"
            />
          )}
          {/* Refreshing or filtering keeps the rows on screen, so the busy state
              has to be drawn over them. */}
          <LoadingOverlay show={loading && accounts.length > 0} />
        </Card>
      </VStack>

      <AlertDialog isOpen={!!batchAction} onOpenChange={open => { if (!open && !bulkBusy) setBatchAction(null) }}
        title={batchAction ? t(`admin.accounts.bulkActions.${batchAction}`) : ''}
        description={t('admin.accounts.bulkActions.selected', { count: selectedIds.size })} actionLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')} isActionLoading={bulkBusy} onAction={() => void runBatch()} />
      {dialogOpen && <AccountFormDialog groups={groups}
        isOpen={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={loadAccounts}
      />}

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
        filters={filters}
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
