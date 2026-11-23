import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Selector } from '@astryxdesign/core/Selector'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import {
  Table,
  TableSelectionToolbar,
  pixel,
  proportional,
  useTablePagination,
  useTableSelection,
  useTableSortable,
  useTableStickyColumns,
  type TableColumn,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import {
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react'
import { authAPI, keysAPI, usageAPI, userGroupsAPI } from '@/api'
import type { BatchApiKeyUsageStats } from '@/api/usage'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import type { ApiKey, Group, PublicSettings } from '@/types'
import { formatDateTime } from '@/utils/format'
import { maskApiKey } from '@/utils/maskApiKey'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { Page } from '~/components/common/Page'
import { BulkEditKeysModal } from '~/components/keys/BulkEditKeysModal'
import { useCcSwitchImport } from '~/components/keys/CcSwitchImport'
import { DeleteKeyDialog } from '~/components/keys/DeleteKeyDialog'
import { EndpointPopover } from '~/components/keys/EndpointPopover'
import { KeyFormDialog } from '~/components/keys/KeyFormDialog'
import { KeyGroupSelector } from '~/components/keys/KeyGroupSelector'
import { UseKeyModal } from '~/components/keys/UseKeyModal'
import {
  ALWAYS_VISIBLE_COLUMNS,
  loadHiddenKeyColumns,
  saveHiddenKeyColumns,
  type KeyColumnKey,
} from '~/components/keys/keyColumns'
import { formatResetTime, serverDetail, usageLevel, usd, type UsageLevel } from '~/components/keys/keyFormat'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { toast } from '~/lib/toast'

interface KeyRow extends Record<string, unknown> {
  __id: string
  apiKey: ApiKey
}

interface KeyQuery {
  page: number
  pageSize: number
  search: string
  status: string
  groupId: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

// Filter value for "no filter"; never sent to the server.
const ALL = 'all'
// The server reads group_id=0 as "keys without a group".
const NO_GROUP = '0'
const DEFAULT_SORT = { sortBy: 'created_at', sortOrder: 'desc' } as const
const SEARCH_DEBOUNCE_MS = 300
const COPIED_FEEDBACK_MS = 800

const STATUS_BADGE: Record<ApiKey['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  quota_exhausted: 'warning',
  expired: 'error',
  inactive: 'neutral',
}

const QUOTA_BAR: Record<UsageLevel, 'accent' | 'warning' | 'error'> = { ok: 'accent', near: 'warning', full: 'error' }
const RATE_LIMIT_BAR: Record<UsageLevel, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  near: 'warning',
  full: 'error',
}

const isAbortError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || code === 'ERR_CANCELED'
}

export function KeysPage() {
  const { t } = useI18n()

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [usageStats, setUsageStats] = useState<Record<string, BatchApiKeyUsageStats>>({})
  const [usageLoading, setUsageLoading] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [userGroupRates, setUserGroupRates] = useState<Record<number, number>>({})
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null)
  // Ticks once a minute so reset countdowns and "expired" marks stay current.
  const [now, setNow] = useState(() => new Date())

  const [query, setQuery] = useState<KeyQuery>(() => ({
    page: 1,
    pageSize: getPersistedPageSize(),
    search: '',
    status: ALL,
    groupId: ALL,
    ...DEFAULT_SORT,
  }))
  const [reloadToken, setReloadToken] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<number | undefined>(undefined)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(loadHiddenKeyColumns)

  const [formOpen, setFormOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null)
  const [resetRateLimitOpen, setResetRateLimitOpen] = useState(false)
  const [resetRateLimitKey, setResetRateLimitKey] = useState<ApiKey | null>(null)
  const [useKeyOpen, setUseKeyOpen] = useState(false)
  const [useKeyTarget, setUseKeyTarget] = useState<ApiKey | null>(null)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
  const copiedTimer = useRef<number | undefined>(undefined)

  const ccSwitch = useCcSwitchImport(publicSettings)
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const isWideScreen = useMediaQuery('(min-width: 1024px)', true)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    // Usage is summed over 30 days of logs and can be much slower than the
    // list, so it loads on its own and never holds the table back.
    const loadUsageStats = async (keyIds: number[]) => {
      try {
        const response = await usageAPI.getDashboardApiKeysUsage(keyIds, { signal })
        if (signal.aborted) return
        setUsageStats(response.stats)
      } catch (error) {
        if (!isAbortError(error)) console.error('Failed to load usage stats:', error)
      } finally {
        if (!signal.aborted) setUsageLoading(false)
      }
    }

    const loadApiKeys = async () => {
      setLoading(true)
      setUsageLoading(false)
      try {
        const filters: Parameters<typeof keysAPI.list>[2] = {
          sort_by: query.sortBy,
          sort_order: query.sortOrder,
        }
        if (query.search) filters.search = query.search
        if (query.status !== ALL) filters.status = query.status
        if (query.groupId !== ALL) filters.group_id = Number(query.groupId)

        const response = await keysAPI.list(query.page, query.pageSize, filters, { signal })
        if (signal.aborted) return

        if (response.items.length === 0 && response.total > 0 && query.page > 1) {
          // The page emptied out (its last key was deleted): step back to the last page that has keys.
          const lastPage = Math.max(1, Math.ceil(response.total / query.pageSize))
          setQuery((current) => ({ ...current, page: Math.min(current.page - 1, lastPage) }))
          return
        }

        const visibleIds = new Set(response.items.map((key) => key.id))
        setApiKeys(response.items)
        setTotal(response.total)
        setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))))
        setUsageLoading(response.items.length > 0)
        if (response.items.length > 0) void loadUsageStats(response.items.map((key) => key.id))
      } catch (error) {
        if (isAbortError(error)) return
        toast.error(t('keys.failedToLoad'))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    }

    void loadApiKeys()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the query or a mutation asks for it
  }, [query, reloadToken])

  useEffect(() => {
    userGroupsAPI
      .getAvailable()
      .then((available) => setGroups(available ?? []))
      .catch((error) => console.error('Failed to load groups:', error))
    userGroupsAPI
      .getUserGroupRates()
      .then((rates) => setUserGroupRates(rates ?? {}))
      .catch((error) => console.error('Failed to load user group rates:', error))
    authAPI
      .getPublicSettings()
      .then(setPublicSettings)
      .catch((error) => console.error('Failed to load public settings:', error))

    const clock = window.setInterval(() => setNow(new Date()), 60000)
    return () => {
      window.clearInterval(clock)
      window.clearTimeout(searchTimer.current)
      window.clearTimeout(copiedTimer.current)
    }
  }, [])

  const reload = () => setReloadToken((token) => token + 1)

  // Any change of filter, sort or page starts from a clean selection; all but a page change go back to page 1.
  const changeQuery = (changes: Partial<KeyQuery>) => {
    setSelectedIds(new Set())
    setQuery((current) => ({ ...current, page: 1, ...changes }))
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => changeQuery({ search: value }), SEARCH_DEBOUNCE_MS)
  }

  const openCreate = () => {
    setEditingKey(null)
    setFormOpen(true)
  }

  const openEdit = (key: ApiKey) => {
    setEditingKey(key)
    setFormOpen(true)
  }

  const copyKey = async (key: ApiKey) => {
    const success = await copyToClipboard(key.key, t('keys.copied'))
    if (!success) return
    setCopiedKeyId(key.id)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopiedKeyId(null), COPIED_FEEDBACK_MS)
  }

  const toggleKeyStatus = async (key: ApiKey) => {
    const newStatus = key.status === 'active' ? 'inactive' : 'active'
    setTogglingId(key.id)
    try {
      await keysAPI.toggleStatus(key.id, newStatus)
      toast.success(newStatus === 'active' ? t('keys.keyEnabledSuccess') : t('keys.keyDisabledSuccess'))
      reload()
    } catch {
      toast.error(t('keys.failedToUpdateStatus'))
    } finally {
      setTogglingId(null)
    }
  }

  const askResetRateLimit = (key: ApiKey) => {
    setResetRateLimitKey(key)
    setResetRateLimitOpen(true)
  }

  const resetRateLimitUsage = async () => {
    if (!resetRateLimitKey) return
    setResetRateLimitOpen(false)
    try {
      await keysAPI.update(resetRateLimitKey.id, { reset_rate_limit_usage: true })
      toast.success(t('keys.rateLimitResetSuccess'))
      reload()
    } catch (error) {
      toast.error(serverDetail(error) || t('keys.failedToResetRateLimit'))
    }
  }

  const patchKey = (id: number, patch: Partial<ApiKey>) => {
    setApiKeys((keys) => keys.map((key) => (key.id === id ? { ...key, ...patch } : key)))
    setEditingKey((key) => (key && key.id === id ? { ...key, ...patch } : key))
  }

  const toggleColumns = (visible: string[]) => {
    const hidden = new Set(toggleableColumns.map((column) => column.key).filter((key) => !visible.includes(key)))
    setHiddenColumns(hidden)
    saveHiddenKeyColumns(hidden)
  }

  const rows = useMemo<KeyRow[]>(() => apiKeys.map((apiKey) => ({ __id: String(apiKey.id), apiKey })), [apiKeys])
  const selectedKeys = apiKeys.filter((key) => selectedIds.has(key.id))
  // The form shows live usage figures, so hand it the freshest copy of the key it edits.
  const liveEditingKey = editingKey ? (apiKeys.find((key) => key.id === editingKey.id) ?? editingKey) : null
  const hasFilters = query.search !== '' || query.status !== ALL || query.groupId !== ALL

  const supportingDash = (
    <Text type="body" color="placeholder">
      -
    </Text>
  )

  const dateCell = (value: string | null) =>
    value ? (
      <Text type="body" color="secondary" hasTabularNumbers>
        {formatDateTime(value)}
      </Text>
    ) : (
      supportingDash
    )

  const usageAmount = (key: ApiKey, amount: number | undefined) =>
    usageLoading && !usageStats[key.id] ? (
      <Skeleton width={56} height={12} />
    ) : (
      <Text type="supporting" color="primary" weight="medium" hasTabularNumbers>
        {usd(amount, 4)}
      </Text>
    )

  const allColumns: Array<TableColumn<KeyRow> & { key: KeyColumnKey; header: string }> = [
    {
      key: 'name',
      header: t('common.name'),
      width: proportional(1.5, { minWidth: 150 }),
      sortable: true,
      renderCell: ({ apiKey }) => (
        <HStack gap={1.5} vAlign="center">
          <Text type="label" wordBreak="break-word">
            {apiKey.name}
          </Text>
          {(apiKey.ip_whitelist?.length > 0 || apiKey.ip_blacklist?.length > 0) && (
            <Tooltip content={t('keys.ipRestrictionEnabled')}>
              <Icon icon={ShieldCheck} size="sm" color="info" label={t('keys.ipRestrictionEnabled')} />
            </Tooltip>
          )}
        </HStack>
      ),
    },
    {
      key: 'id',
      header: t('keys.id'),
      width: pixel(80),
      sortable: true,
      renderCell: ({ apiKey }) => (
        <Text type="code" color="secondary">
          #{apiKey.id}
        </Text>
      ),
    },
    {
      key: 'key',
      header: t('keys.apiKey'),
      width: pixel(164),
      renderCell: ({ apiKey }) => {
        const isCopied = copiedKeyId === apiKey.id
        const copyLabel = isCopied ? t('keys.copied') : t('keys.copyToClipboard')
        return (
          <HStack gap={1} vAlign="center">
            <Text type="code">{maskApiKey(apiKey.key)}</Text>
            <IconButton
              variant="ghost"
              size="sm"
              label={copyLabel}
              tooltip={copyLabel}
              icon={<Icon icon={isCopied ? Check : Copy} color={isCopied ? 'success' : 'inherit'} />}
              onClick={() => void copyKey(apiKey)}
            />
          </HStack>
        )
      },
    },
    {
      key: 'group',
      header: t('keys.group'),
      width: proportional(2.4, { minWidth: 240 }),
      sortable: true,
      renderCell: ({ apiKey }) => (
        <KeyGroupSelector apiKey={apiKey} groups={groups} userGroupRates={userGroupRates} onChanged={reload} />
      ),
    },
    {
      key: 'current_concurrency',
      header: t('keys.currentConcurrency'),
      width: pixel(100),
      sortable: true,
      renderCell: ({ apiKey }) => {
        const value = apiKey.current_concurrency ?? 0
        return <Badge variant={value > 0 ? 'success' : 'neutral'} label={String(value)} />
      },
    },
    {
      key: 'usage',
      header: t('keys.usage'),
      width: pixel(176),
      renderCell: ({ apiKey }) => (
        <VStack gap={0.5} hAlign="stretch">
          <HStack gap={1.5} vAlign="center">
            <Text type="supporting">{t('keys.today')}:</Text>
            {usageAmount(apiKey, usageStats[apiKey.id]?.today_actual_cost)}
          </HStack>
          <HStack gap={1.5} vAlign="center">
            <Text type="supporting">{t('keys.total')}:</Text>
            {usageAmount(apiKey, usageStats[apiKey.id]?.total_actual_cost)}
          </HStack>
          {apiKey.quota > 0 && (
            <VStack gap={1} hAlign="stretch">
              <HStack gap={1.5} vAlign="center">
                <Text type="supporting">{t('keys.quota')}:</Text>
                <Text type="supporting" color="primary" weight="medium" hasTabularNumbers>
                  {usd(apiKey.quota_used, 2)} / {usd(apiKey.quota, 2)}
                </Text>
              </HStack>
              <ProgressBar
                label={t('keys.quota')}
                isLabelHidden
                value={Math.min(apiKey.quota_used, apiKey.quota)}
                max={apiKey.quota}
                variant={QUOTA_BAR[usageLevel(apiKey.quota_used, apiKey.quota)]}
              />
            </VStack>
          )}
        </VStack>
      ),
    },
    {
      key: 'rate_limit',
      header: t('keys.rateLimitColumn'),
      width: pixel(180),
      renderCell: ({ apiKey }) => {
        const windows = [
          { label: '5h', limit: apiKey.rate_limit_5h, used: apiKey.usage_5h, resetAt: apiKey.reset_5h_at },
          { label: '1d', limit: apiKey.rate_limit_1d, used: apiKey.usage_1d, resetAt: apiKey.reset_1d_at },
          { label: '7d', limit: apiKey.rate_limit_7d, used: apiKey.usage_7d, resetAt: apiKey.reset_7d_at },
        ].filter((limitWindow) => limitWindow.limit > 0)
        if (windows.length === 0) return supportingDash
        return (
          <VStack gap={1.5} hAlign="stretch">
            {windows.map((limitWindow) => {
              const resetIn = formatResetTime(limitWindow.resetAt, now)
              return (
                <VStack key={limitWindow.label} gap={0.5} hAlign="stretch">
                  <HStack gap={2} vAlign="center" justify="between">
                    <Text type="supporting">{limitWindow.label}</Text>
                    <Text type="supporting" color="primary" weight="medium" hasTabularNumbers>
                      {usd(limitWindow.used, 2)}/{usd(limitWindow.limit, 2)}
                    </Text>
                  </HStack>
                  <ProgressBar
                    label={limitWindow.label}
                    isLabelHidden
                    value={Math.min(limitWindow.used, limitWindow.limit)}
                    max={limitWindow.limit}
                    variant={RATE_LIMIT_BAR[usageLevel(limitWindow.used, limitWindow.limit)]}
                  />
                  {resetIn && (
                    <Text type="supporting" hasTabularNumbers>
                      ⟳ {resetIn}
                    </Text>
                  )}
                </VStack>
              )
            })}
            {(apiKey.usage_5h > 0 || apiKey.usage_1d > 0 || apiKey.usage_7d > 0) && (
              <HStack>
                <Button
                  variant="ghost"
                  size="sm"
                  label={t('keys.resetUsage')}
                  tooltip={t('keys.resetRateLimitUsage')}
                  icon={<Icon icon={RotateCw} />}
                  onClick={() => askResetRateLimit(apiKey)}
                />
              </HStack>
            )}
          </VStack>
        )
      },
    },
    {
      key: 'expires_at',
      header: t('keys.expiresAt'),
      width: pixel(124),
      sortable: true,
      renderCell: ({ apiKey }) => {
        if (!apiKey.expires_at) {
          return (
            <Text type="body" color="placeholder">
              {t('keys.noExpiration')}
            </Text>
          )
        }
        const isPast = new Date(apiKey.expires_at) < now
        return (
          <HStack gap={1} vAlign="center">
            {isPast && <Icon icon={CircleAlert} size="sm" color="error" />}
            <Text type="body" color={isPast ? 'primary' : 'secondary'} hasTabularNumbers>
              {formatDateTime(apiKey.expires_at)}
            </Text>
          </HStack>
        )
      },
    },
    {
      key: 'status',
      header: t('common.status'),
      width: pixel(104),
      sortable: true,
      renderCell: ({ apiKey }) => (
        <Badge variant={STATUS_BADGE[apiKey.status] ?? 'neutral'} label={t(`keys.status.${apiKey.status}`)} />
      ),
    },
    {
      key: 'last_used_at',
      header: t('keys.lastUsedAt'),
      width: pixel(116),
      sortable: true,
      renderCell: ({ apiKey }) => dateCell(apiKey.last_used_at),
    },
    {
      key: 'last_used_ip',
      header: t('keys.lastUsedIP'),
      width: pixel(140),
      renderCell: ({ apiKey }) =>
        apiKey.last_used_ip ? (
          <Text type="body" color="secondary">
            {apiKey.last_used_ip}
          </Text>
        ) : (
          supportingDash
        ),
    },
    {
      key: 'created_at',
      header: t('keys.created'),
      width: pixel(116),
      sortable: true,
      renderCell: ({ apiKey }) => dateCell(apiKey.created_at),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: pixel(publicSettings?.hide_ccs_import_button ? 148 : 176),
      renderCell: ({ apiKey }) => {
        const isActive = apiKey.status === 'active'
        return (
          <HStack gap={0.5} vAlign="center">
            <IconButton
              variant="ghost"
              size="sm"
              label={t('keys.useKey')}
              tooltip={t('keys.useKey')}
              icon={<Icon icon={Terminal} />}
              onClick={() => {
                setUseKeyTarget(apiKey)
                setUseKeyOpen(true)
              }}
            />
            {!publicSettings?.hide_ccs_import_button && (
              <IconButton
                variant="ghost"
                size="sm"
                label={t('keys.importToCcSwitch')}
                tooltip={t('keys.importToCcSwitch')}
                icon={<Icon icon={Upload} />}
                onClick={() => ccSwitch.importKey(apiKey)}
              />
            )}
            <IconButton
              variant="ghost"
              size="sm"
              label={isActive ? t('keys.disable') : t('keys.enable')}
              tooltip={isActive ? t('keys.disable') : t('keys.enable')}
              icon={<Icon icon={isActive ? Ban : CircleCheck} />}
              isLoading={togglingId === apiKey.id}
              onClick={() => void toggleKeyStatus(apiKey)}
            />
            <IconButton
              variant="ghost"
              size="sm"
              label={t('common.edit')}
              tooltip={t('common.edit')}
              icon={<Icon icon={Pencil} />}
              onClick={() => openEdit(apiKey)}
            />
            <IconButton
              variant="ghost"
              size="sm"
              label={t('common.delete')}
              tooltip={t('common.delete')}
              icon={<Icon icon={Trash2} />}
              onClick={() => {
                setDeletingKey(apiKey)
                setDeleteOpen(true)
              }}
            />
          </HStack>
        )
      },
    },
  ]

  const toggleableColumns = allColumns.filter((column) => !ALWAYS_VISIBLE_COLUMNS.has(column.key))
  const columns = allColumns.filter(
    (column) => ALWAYS_VISIBLE_COLUMNS.has(column.key) || !hiddenColumns.has(column.key),
  )

  const selectionPlugin = useTableSelection<KeyRow>({
    getIsItemSelected: (row) => selectedIds.has(row.apiKey.id),
    onSelectItem: ({ item, isSelected }) =>
      setSelectedIds((current) => {
        const next = new Set(current)
        if (isSelected) next.add(item.apiKey.id)
        else next.delete(item.apiKey.id)
        return next
      }),
    onSelectAll: ({ isAllSelected }) =>
      setSelectedIds(isAllSelected ? new Set(apiKeys.map((key) => key.id)) : new Set()),
    getIsAllSelected: () => apiKeys.length > 0 && selectedIds.size === apiKeys.length,
    getIsIndeterminate: () => selectedIds.size > 0 && selectedIds.size < apiKeys.length,
    getRowLabel: (row) => row.apiKey.name,
  })

  const sortPlugin = useTableSortable<KeyRow>({
    sort: [{ sortKey: query.sortBy, direction: query.sortOrder === 'asc' ? 'ascending' : 'descending' }],
    allowUnsortedState: false,
    onSortChange: (next) =>
      changeQuery(
        next.length > 0
          ? { sortBy: next[0].sortKey, sortOrder: next[0].direction === 'ascending' ? 'asc' : 'desc' }
          : DEFAULT_SORT,
      ),
  })

  const pagination = useTablePagination<KeyRow>({
    page: query.page,
    onPageChange: (page) => changeQuery({ page }),
    totalItems: total,
    pageSize: query.pageSize,
    onPageSizeChange: (pageSize) => {
      setPersistedPageSize(pageSize)
      changeQuery({ pageSize })
    },
    pageSizeOptions,
  })

  // Same as the Vue table: the name and the actions stay in view while the middle columns scroll.
  // On a narrow screen the pinned columns would leave no room for the rest, so nothing is pinned there.
  const stickyColumns = useTableStickyColumns<KeyRow>(
    isWideScreen ? { startKeys: ['name'], endKeys: ['actions'] } : {},
  )

  const hasEndpoints = Boolean(publicSettings?.api_base_url) || (publicSettings?.custom_endpoints?.length ?? 0) > 0

  return (
    <Page
      title={t('keys.title')}
      description={t('keys.description')}
      actions={
        <>
          <IconButton
            label={t('common.refresh')}
            tooltip={t('common.refresh')}
            icon={<Icon icon={RefreshCw} />}
            isLoading={loading}
            onClick={reload}
          />
          <MultiSelector
            label={t('keys.columnSettings')}
            isLabelHidden
            variant="secondary"
            startIcon={<Icon icon={SlidersHorizontal} />}
            triggerDisplay="labels"
            formatValue={() => t('keys.columnSettings')}
            placeholder={t('keys.columnSettings')}
            options={toggleableColumns.map((column) => ({ value: column.key, label: column.header }))}
            value={toggleableColumns.map((column) => column.key).filter((key) => !hiddenColumns.has(key))}
            onChange={toggleColumns}
          />
          <Button label={t('keys.createKey')} variant="primary" icon={<Icon icon={Plus} />} onClick={openCreate} />
        </>
      }
    >
      <VStack gap={4} hAlign="stretch">
        <HStack gap={3} wrap="wrap" vAlign="center">
          <StackItem size="fill">
            <TextInput
              type="search"
              label={t('keys.searchPlaceholder')}
              isLabelHidden
              startIcon={Search}
              value={searchInput}
              onChange={handleSearchChange}
              placeholder={t('keys.searchPlaceholder')}
              hasClear
            />
          </StackItem>
          <Selector
            label={t('keys.group')}
            isLabelHidden
            value={query.groupId}
            onChange={(groupId) => changeQuery({ groupId })}
            options={[
              { value: ALL, label: t('keys.allGroups') },
              { value: NO_GROUP, label: t('keys.noGroup') },
              ...groups.map((group) => ({ value: String(group.id), label: group.name })),
            ]}
            width={180}
          />
          <Selector
            label={t('common.status')}
            isLabelHidden
            value={query.status}
            onChange={(status) => changeQuery({ status })}
            options={[
              { value: ALL, label: t('keys.allStatus') },
              { value: 'active', label: t('keys.status.active') },
              { value: 'inactive', label: t('keys.status.inactive') },
              { value: 'quota_exhausted', label: t('keys.status.quota_exhausted') },
              { value: 'expired', label: t('keys.status.expired') },
            ]}
            width={180}
          />
        </HStack>

        {hasEndpoints && (
          <EndpointPopover
            apiBaseUrl={publicSettings?.api_base_url || ''}
            customEndpoints={publicSettings?.custom_endpoints || []}
          />
        )}

        <TableSelectionToolbar
          selection={{
            selectedKeys: new Set(Array.from(selectedIds, String)),
            selectedCount: selectedIds.size,
            hasSelection: selectedIds.size > 0,
            clearSelection: () => setSelectedIds(new Set()),
          }}
          renderSelectionLabel={(count) => t('keys.bulkEdit.selectedCount', { count })}
          clearLabel={t('keys.bulkEdit.clearSelection')}
          startContent={
            <Button
              size="sm"
              variant="primary"
              label={t('keys.bulkEdit.title')}
              isDisabled={loading}
              onClick={() => setBulkEditOpen(true)}
            />
          }
        />

        <Card padding={0}>
          {loading && rows.length === 0 ? (
            <Center padding={8} minHeight={400}>
              <Spinner />
            </Center>
          ) : rows.length === 0 ? (
            <Center padding={8} minHeight={400}>
              {hasFilters ? (
                <EmptyState
                  icon={<Icon icon={Search} />}
                  title={t('keys.noResultsTitle')}
                  description={t('keys.noResultsDescription')}
                />
              ) : (
                <EmptyState
                  icon={<Icon icon={KeyRound} />}
                  title={t('keys.noKeysYet')}
                  description={t('keys.createFirstKey')}
                  actions={
                    <Button
                      label={t('keys.createKey')}
                      variant="primary"
                      icon={<Icon icon={Plus} />}
                      onClick={openCreate}
                    />
                  }
                />
              )}
            </Center>
          ) : (
            <Table
              data={rows}
              columns={columns}
              idKey="__id"
              hasHover
              plugins={{ selection: selectionPlugin, sort: sortPlugin, stickyColumns, pagination }}
            />
          )}
        </Card>
      </VStack>

      <KeyFormDialog
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={reload}
        editKey={liveEditingKey}
        groups={groups}
        userGroupRates={userGroupRates}
        onKeyPatched={patchKey}
        onResetRateLimit={askResetRateLimit}
      />

      {bulkEditOpen && (
        <BulkEditKeysModal
          isOpen
          onClose={() => setBulkEditOpen(false)}
          onSuccess={(updatedIds) => {
            const updated = new Set(updatedIds)
            setSelectedIds((current) => new Set([...current].filter((id) => !updated.has(id))))
            reload()
          }}
          selectedKeys={selectedKeys}
          groups={groups}
        />
      )}

      <DeleteKeyDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onSuccess={reload}
        apiKey={deletingKey}
      />

      <AlertDialog
        isOpen={resetRateLimitOpen}
        onOpenChange={setResetRateLimitOpen}
        title={t('keys.resetRateLimitTitle')}
        description={t('keys.resetRateLimitConfirmMessage', { name: resetRateLimitKey?.name ?? '' })}
        actionLabel={t('keys.reset')}
        cancelLabel={t('common.cancel')}
        onAction={() => void resetRateLimitUsage()}
      />

      <UseKeyModal
        isOpen={useKeyOpen}
        onClose={() => setUseKeyOpen(false)}
        apiKey={useKeyTarget}
        apiBaseUrl={publicSettings?.api_base_url || ''}
      />

      {ccSwitch.clientSelectDialog}
    </Page>
  )
}
