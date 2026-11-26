import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { DateInput } from '@astryxdesign/core/DateInput'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Badge } from '@astryxdesign/core/Badge'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Table, proportional, pixel, useTablePagination, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Section } from '@astryxdesign/core/Section'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import type { ISODateString } from '@astryxdesign/core/utils'
import {
  RefreshCw,
  Users,
  CheckCircle,
  XCircle,
  Check,
  Filter,
  Settings,
  Shield,
  Globe,
  Pencil,
  Plus,
} from 'lucide-react'
import { adminAPI } from '~/lib/api/admin'
import type { AdminGroup, AdminUser, UserAttributeDefinition } from '@/types'
import { formatDateTime } from '@/utils/format'
import { Page } from '~/components/common/Page'
import { LoadingOverlay } from '~/components/common/LoadingOverlay'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { UserCreateEditDialog } from './users/UserCreateEditDialog'
import { UserBulkEditDialog } from './users/UserBulkEditDialog'
import { UserBulkDeleteDialog } from './users/UserBulkDeleteDialog'
import { UserApiKeysDialog } from './users/UserApiKeysDialog'
import { UserAllowedGroupsDialog } from './users/UserAllowedGroupsDialog'
import { UserBalanceDialog } from './users/UserBalanceDialog'
import { UserBalanceHistoryDialog } from './users/UserBalanceHistoryDialog'
import { UserPlatformQuotaDialog } from './users/UserPlatformQuotaDialog'
import { UserAttributesConfigDialog } from './users/UserAttributesConfigDialog'
import { GroupReplaceDialog } from './users/GroupReplaceDialog'
import { PlusIcon } from '@heroicons/react/24/outline'

const PAGE_SIZE_KEY = 'admin_users_page_size'
// Same localStorage keys as UsersView.vue, so the two frontends stay in sync.
const VISIBLE_FILTERS_KEY = 'user-visible-filters'
const FILTER_VALUES_KEY = 'user-filter-values'

function persistPageSize(size: number) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size))
  } catch {}
}

/** Attribute filter values keyed by attribute definition id. */
type AttributeFilters = Record<number, string>

function loadVisibleFilters(): Set<string> {
  try {
    const saved = localStorage.getItem(VISIBLE_FILTERS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as string[]
      if (Array.isArray(parsed)) return new Set(parsed)
    }
  } catch (error) {
    console.error('Failed to load saved filters:', error)
  }
  return new Set()
}

function loadSavedAttributeFilters(): AttributeFilters {
  try {
    const saved = localStorage.getItem(FILTER_VALUES_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as { attributes?: AttributeFilters }
      if (parsed?.attributes) return { ...parsed.attributes }
    }
  } catch (error) {
    console.error('Failed to load saved filters:', error)
  }
  return {}
}

interface UserRow extends Record<string, unknown> {
  __id: string
  id: number
  email: string
  role: string
  status: 'active' | 'disabled'
  balance: number
  created_at: string
}

export function AdminUsersPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | 'admin' | 'user'>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'disabled'>('')

  // Custom user attributes (Gap 30)
  const [attributeDefinitions, setAttributeDefinitions] = useState<UserAttributeDefinition[]>([])
  const [userAttributeValues, setUserAttributeValues] = useState<Record<number, Record<number, string>>>({})
  const [visibleFilters, setVisibleFilters] = useState<Set<string>>(loadVisibleFilters)
  // Draft values bound to the inputs; applied on Enter / selector change.
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilters>(loadSavedAttributeFilters)
  const [appliedAttributeFilters, setAppliedAttributeFilters] = useState<AttributeFilters>(loadSavedAttributeFilters)
  const [showAttributesConfig, setShowAttributesConfig] = useState(false)

  // Groups, used by the groups column and group replacement (Gap 32)
  const [allGroups, setAllGroups] = useState<AdminGroup[]>([])
  const [groupReplaceUser, setGroupReplaceUser] = useState<AdminUser | null>(null)
  const [groupReplaceOldGroup, setGroupReplaceOldGroup] = useState<{ id: number; name: string } | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Dialog states
  const [showCreateEdit, setShowCreateEdit] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [showApiKeys, setShowApiKeys] = useState(false)
  const [showAllowedGroups, setShowAllowedGroups] = useState(false)
  const [showBalance, setShowBalance] = useState(false)
  const [balanceOperation, setBalanceOperation] = useState<'add' | 'subtract'>('add')
  const [showBalanceHistory, setShowBalanceHistory] = useState(false)
  const [showPlatformQuota, setShowPlatformQuota] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const paginationPlugin = useTablePagination<UserRow>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: (newSize) => {
      setPageSize(newSize)
      setPage(1)
      persistPageSize(newSize)
    },
    pageSizeOptions: [10, 20, 50, 100],
  })

  // Sorting
  const [sortBy] = useState<string>('id')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const filters: Parameters<typeof adminAPI.users.list>[2] = {
        sort_by: sortBy,
        sort_order: sortOrder,
      }
      if (searchQuery) filters.search = searchQuery
      if (roleFilter) filters.role = roleFilter
      if (statusFilter) filters.status = statusFilter
      const attrFilters: AttributeFilters = {}
      for (const [attrId, value] of Object.entries(appliedAttributeFilters)) {
        if (value) attrFilters[Number(attrId)] = value
      }
      if (Object.keys(attrFilters).length > 0) filters.attributes = attrFilters

      const response = await adminAPI.users.list(page, pageSize, filters)
      setUsers(response.items)
      setTotal(response.total)
      setUserAttributeValues({})
    } catch (error: any) {
      toast.error(t('admin.users.failedToLoad'))
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, roleFilter, statusFilter, sortBy, sortOrder, appliedAttributeFilters, t])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const loadAttributeDefinitions = useCallback(async () => {
    try {
      setAttributeDefinitions(await adminAPI.userAttributes.listEnabledDefinitions())
    } catch (error) {
      console.error('Failed to load attribute definitions:', error)
    }
  }, [])

  const loadAllGroups = useCallback(async () => {
    try {
      setAllGroups(await adminAPI.groups.getAll())
    } catch (error) {
      console.error('Failed to load groups:', error)
    }
  }, [])

  useEffect(() => {
    void loadAttributeDefinitions()
    void loadAllGroups()
  }, [loadAttributeDefinitions, loadAllGroups])

  // Per-user attribute values for the dynamic columns.
  useEffect(() => {
    const enabled = attributeDefinitions.filter((def) => def.enabled)
    if (enabled.length === 0 || users.length === 0) return
    let cancelled = false
    const userIds = users.map((user) => user.id)
    adminAPI.userAttributes
      .getBatchUserAttributes(userIds)
      .then((response) => {
        if (!cancelled) setUserAttributeValues(response.attributes ?? {})
      })
      .catch((error) => console.error('Failed to load user attribute values:', error))
    return () => {
      cancelled = true
    }
  }, [users, attributeDefinitions])

  const persistFilters = useCallback((visible: Set<string>, attributes: AttributeFilters) => {
    try {
      localStorage.setItem(VISIBLE_FILTERS_KEY, JSON.stringify([...visible]))
      const existing = localStorage.getItem(FILTER_VALUES_KEY)
      const parsed = existing ? (JSON.parse(existing) as Record<string, unknown>) : {}
      localStorage.setItem(FILTER_VALUES_KEY, JSON.stringify({ ...parsed, attributes }))
    } catch (error) {
      console.error('Failed to save filters:', error)
    }
  }, [])

  /** Shows / hides one attribute filter input, clearing its value when hidden. */
  const toggleAttributeFilter = useCallback(
    (attr: UserAttributeDefinition) => {
      const key = `attr_${attr.id}`
      const nextVisible = new Set(visibleFilters)
      const nextFilters = { ...attributeFilters }
      if (nextVisible.has(key)) {
        nextVisible.delete(key)
        delete nextFilters[attr.id]
      } else {
        nextVisible.add(key)
        nextFilters[attr.id] = ''
      }
      setVisibleFilters(nextVisible)
      setAttributeFilters(nextFilters)
      setAppliedAttributeFilters(nextFilters)
      persistFilters(nextVisible, nextFilters)
      setPage(1)
    },
    [attributeFilters, persistFilters, visibleFilters]
  )

  const updateAttributeFilter = useCallback((attrId: number, value: string) => {
    setAttributeFilters((prev) => ({ ...prev, [attrId]: value }))
  }, [])

  /** Commits the draft attribute filters (Enter key or selector change). */
  const applyAttributeFilters = useCallback(
    (overrides?: AttributeFilters) => {
      const next = overrides ?? attributeFilters
      setAppliedAttributeFilters(next)
      persistFilters(visibleFilters, next)
      setPage(1)
    },
    [attributeFilters, persistFilters, visibleFilters]
  )

  const getAttributeDefinition = useCallback(
    (attrId: number) => attributeDefinitions.find((def) => def.id === attrId),
    [attributeDefinitions]
  )

  const getAttributeDefinitionName = useCallback(
    (attrId: number) => getAttributeDefinition(attrId)?.name ?? String(attrId),
    [getAttributeDefinition]
  )

  /** Formats a stored attribute value for the table, mapping option values to labels. */
  const getAttributeValue = useCallback(
    (userId: number, attrId: number): string => {
      const value = userAttributeValues[userId]?.[attrId]
      if (!value) return '-'
      const def = getAttributeDefinition(attrId)
      if (!def) return value
      if (def.type === 'multi_select') {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) {
            return parsed
              .map((item) => def.options?.find((option) => option.value === item)?.label || String(item))
              .join(', ')
          }
        } catch {
          return value
        }
      }
      if (def.type === 'select' && def.options) {
        return def.options.find((option) => option.value === value)?.label || value
      }
      return value
    },
    [getAttributeDefinition, userAttributeValues]
  )

  /** Exclusive groups the user is allowed into, plus the public ones everyone gets. */
  const getUserGroups = useCallback(
    (user: AdminUser) => {
      const exclusive: AdminGroup[] = []
      const publicGroups: AdminGroup[] = []
      for (const group of allGroups) {
        if (group.status !== 'active' || group.subscription_type !== 'standard') continue
        if (group.is_exclusive) {
          if (user.allowed_groups?.includes(group.id)) exclusive.push(group)
        } else {
          publicGroups.push(group)
        }
      }
      return { exclusive, publicGroups }
    },
    [allGroups]
  )

  const openGroupReplace = useCallback((user: AdminUser, group: { id: number; name: string }) => {
    setGroupReplaceUser(user)
    setGroupReplaceOldGroup(group)
  }, [])

  const closeGroupReplace = useCallback(() => {
    setGroupReplaceUser(null)
    setGroupReplaceOldGroup(null)
  }, [])

  const handleSearch = useCallback(() => {
    setPage(1)
    applyAttributeFilters()
    loadUsers()
  }, [applyAttributeFilters, loadUsers])

  const handleRefresh = () => {
    loadUsers()
  }

  const handleReset = () => {
    setSearchQuery('')
    setRoleFilter('')
    setStatusFilter('')
    const cleared: AttributeFilters = {}
    for (const key of Object.keys(attributeFilters)) cleared[Number(key)] = ''
    setAttributeFilters(cleared)
    setAppliedAttributeFilters(cleared)
    persistFilters(visibleFilters, cleared)
    setPage(1)
  }

  const handleToggleStatus = async (userId: number, currentStatus: 'active' | 'disabled') => {
    try {
      const newStatus: 'active' | 'disabled' = currentStatus === 'active' ? 'disabled' : 'active'
      await adminAPI.users.update(userId, { status: newStatus })
      toast.success(currentStatus === 'active' ? t('admin.users.userDisabled') : t('admin.users.userEnabled'))
      loadUsers()
    } catch (error: any) {
      toast.error(t('admin.users.failedToUpdateStatus'))
      console.error('Failed to update status:', error)
    }
  }

  const handleDelete = async (userId: number, email: string) => {
    if (!confirm(t('admin.users.deleteConfirm', { email }))) {
      return
    }
    try {
      await adminAPI.users.delete(userId)
      toast.success(t('admin.users.userDeleted'))
      loadUsers()
    } catch (error: any) {
      toast.error(t('admin.users.failedToDelete'))
      console.error('Failed to delete user:', error)
    }
  }

  const rows = useMemo<UserRow[]>(
    () =>
      users.map((user) => ({
        __id: String(user.id),
        id: user.id,
        email: user.email,
        role: user.role,
        status: (user.status as any) === 1 || user.status === 'active' ? 'active' : 'disabled',
        balance: user.balance,
        created_at: user.created_at,
      })),
    [users]
  )

  const enabledAttributes = useMemo(
    () => attributeDefinitions.filter((def) => def.enabled),
    [attributeDefinitions]
  )

  const columns = useMemo<TableColumn<UserRow>[]>(
    () => [
      {
        key: 'id',
        header: 'ID',
        width: pixel(80),
        sortable: true,
        renderCell: (row: UserRow) => <Text type="supporting" hasTabularNumbers>{row.id}</Text>,
      },
      {
        key: 'email',
        header: t('admin.users.email'),
        width: proportional(2),
        sortable: true,
        renderCell: (row: UserRow) => <Text type="supporting">{row.email}</Text>,
      },
      // Dynamic attribute columns (one per enabled definition)
      ...enabledAttributes.map<TableColumn<UserRow>>((def) => ({
        key: `attr_${def.id}`,
        header: def.name,
        width: proportional(1),
        renderCell: (row: UserRow) => (
          <Text type="supporting" maxLines={1}>
            {getAttributeValue(row.id, def.id)}
          </Text>
        ),
      })),
      {
        key: 'role',
        header: t('admin.users.columns.role'),
        width: pixel(100),
        renderCell: (row: UserRow) => (
          <Badge
            variant={row.role === 'admin' ? 'info' : 'neutral'}
            label={t(`admin.users.roles.${row.role}`)}
          />
        ),
      },
      {
        key: 'status',
        header: t('admin.users.columns.status'),
        width: pixel(100),
        renderCell: (row: UserRow) => (
          <HStack gap={2} vAlign="center">
            <StatusDot label="" variant={row.status === 'active' ? 'success' : 'error'} />
            <Text type="supporting" color="secondary">
              {row.status === 'active' ? t('common.active') : t('admin.users.disabled')}
            </Text>
          </HStack>
        ),
      },
      {
        key: 'balance',
        header: t('admin.users.columns.balance'),
        width: pixel(150),
        sortable: true,
        renderCell: (row: UserRow) => {
          const user = users.find((u) => u.id === row.id)
          return (
            <HStack gap={1} vAlign="center">
              <Text type="supporting" hasTabularNumbers>
                ${row.balance.toFixed(4)}
              </Text>
              {user && (
                <Tooltip content={t('admin.users.deposit')}>
                  <IconButton
                    label={t('admin.users.deposit')}
                    icon={<Icon icon={Plus} />}
                    variant="ghost"
                    onClick={() => {
                      setSelectedUser(user)
                      setBalanceOperation('add')
                      setShowBalance(true)
                    }}
                  />
                </Tooltip>
              )}
            </HStack>
          )
        },
      },
      {
        key: 'group',
        header: t('admin.users.groups'),
        width: proportional(1.5),
        renderCell: (row: UserRow) => {
          const user = users.find((u) => u.id === row.id)
          if (!user || allGroups.length === 0) return <Text type="supporting" color="secondary">-</Text>
          const { exclusive, publicGroups } = getUserGroups(user)
          if (exclusive.length === 0 && publicGroups.length === 0) {
            return <Text type="supporting" color="secondary">-</Text>
          }
          return (
            <HStack gap={1} wrap="wrap" vAlign="center">
              {/* Clicking an exclusive group opens group replacement for it. */}
              {exclusive.map((group) => (
                <Tooltip key={group.id} content={t('admin.users.clickToReplace')}>
                  <Token
                    label={group.name}
                    size="sm"
                    color="purple"
                    icon={<Icon icon={Shield} size="xsm" />}
                    onClick={() => openGroupReplace(user, { id: group.id, name: group.name })}
                  />
                </Tooltip>
              ))}
              {/* Public groups are not replaceable, so they stay a single passive count. */}
              {publicGroups.length > 0 && (
                <Tooltip content={publicGroups.map((group) => group.name).join(', ')}>
                  <Token
                    label={`${publicGroups.length} ${t('admin.users.publicLabel')}`}
                    size="sm"
                    color="gray"
                    icon={<Icon icon={Globe} size="xsm" />}
                  />
                </Tooltip>
              )}
            </HStack>
          )
        },
      },
      {
        key: 'created_at',
        header: t('admin.users.createdAt'),
        width: pixel(160),
        sortable: true,
        renderCell: (row: UserRow) => <Text type="supporting">{formatDateTime(row.created_at)}</Text>,
      },
      {
        key: 'select',
        header: (
          <CheckboxInput
            label={t('common.selectAll')}
            isLabelHidden
            value={selectedIds.size === users.length && users.length > 0}
            onChange={(checked) => {
              if (checked) {
                setSelectedIds(new Set(users.map(u => u.id)))
              } else {
                setSelectedIds(new Set())
              }
            }}
          />
        ),
        renderCell: (row: UserRow) => (
          <CheckboxInput
            label={row.email}
            isLabelHidden
            value={selectedIds.has(row.id)}
            onChange={(checked) => {
              setSelectedIds(prev => {
                const next = new Set(prev)
                if (checked) {
                  next.add(row.id)
                } else {
                  next.delete(row.id)
                }
                return next
              })
            }}
          />
        ),
        width: pixel(48),
      },
      {
        key: 'actions',
        header: t('common.actions'),
        width: pixel(180),
        renderCell: (row: UserRow) => {
          const user = users.find(u => u.id === row.id)
          if (!user) return null
          return (
            <HStack gap={1}>
              <Tooltip content={t('common.edit')}>
                <IconButton
                  label={t('common.edit')}
                  icon={<Icon icon={Pencil} />}
                  variant="ghost"
                  onClick={() => {
                    setEditingUser(user)
                    setShowCreateEdit(true)
                  }}
                />
              </Tooltip>
              <Tooltip content={row.status === 'active' ? t('admin.users.disable') : t('admin.users.enable')}>
                <IconButton
                  label={row.status === 'active' ? t('admin.users.disable') : t('admin.users.enable')}
                  icon={<Icon icon={row.status === 'active' ? XCircle : CheckCircle} />}
                  variant="ghost"
                  onClick={() => handleToggleStatus(row.id, row.status)}
                />
              </Tooltip>
              <MoreMenu
                label={t('common.more')}
                alignment="end"
                items={[
                  { label: t('admin.users.viewApiKeys'), onClick: () => {
                    setSelectedUser(user)
                    setShowApiKeys(true)
                  }},
                  { label: t('admin.users.groupConfig'), onClick: () => {
                    setSelectedUser(user)
                    setShowAllowedGroups(true)
                  }},
                  { label: t('admin.users.deposit'), onClick: () => {
                    setSelectedUser(user)
                    setBalanceOperation('add')
                    setShowBalance(true)
                  }},
                  { label: t('admin.users.withdraw'), onClick: () => {
                    setSelectedUser(user)
                    setBalanceOperation('subtract')
                    setShowBalance(true)
                  }},
                  { label: t('admin.users.balanceHistory'), onClick: () => {
                    setSelectedUser(user)
                    setShowBalanceHistory(true)
                  }},
                  { label: t('admin.users.platformQuota.menuItem'), onClick: () => {
                    setSelectedUser(user)
                    setShowPlatformQuota(true)
                  }},
                  { label: t('common.delete'), onClick: () => handleDelete(row.id, row.email) },
                ]}
              />
            </HStack>
          )
        },
      },
    ],
    [
      t,
      users,
      selectedIds,
      handleToggleStatus,
      handleDelete,
      enabledAttributes,
      getAttributeValue,
      allGroups,
      getUserGroups,
      openGroupReplace,
    ]
  )

  const roleOptions = useMemo(
    () => [
      { value: '', label: t('admin.users.allRoles') },
      { value: 'admin', label: t('admin.users.admin') },
      { value: 'user', label: t('admin.users.user') },
    ],
    [t]
  )

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.users.allStatus') },
      { value: 'active', label: t('common.active') },
      { value: 'disabled', label: t('admin.users.disabled') },
    ],
    [t]
  )

  /** "Filter settings" menu: toggles one input per filterable attribute. */
  const filterMenuItems = useMemo(
    () =>
      enabledAttributes.map((attr) => ({
        id: String(attr.id),
        label: attr.name,
        endContent: visibleFilters.has(`attr_${attr.id}`) ? (
          <Icon icon={Check} size="sm" color="accent" />
        ) : undefined,
        onClick: () => toggleAttributeFilter(attr),
      })),
    [enabledAttributes, toggleAttributeFilter, visibleFilters]
  )

  /** One input per visible attribute filter, typed after the definition. */
  const renderAttributeFilter = (def: UserAttributeDefinition) => {
    const value = attributeFilters[def.id] ?? ''
    const name = getAttributeDefinitionName(def.id)
    if (def.type === 'select' || def.type === 'multi_select') {
      return (
        <VStack key={def.id} width={160}>
          <Selector
            label={name}
            isLabelHidden
            placeholder={name}
            value={value}
            options={[{ value: '', label: name }, ...(def.options || []).map((option) => ({
              value: option.value,
              label: option.label,
            }))]}
            onChange={(next) => {
              const merged = { ...attributeFilters, [def.id]: next ?? '' }
              setAttributeFilters(merged)
              applyAttributeFilters(merged)
            }}
          />
        </VStack>
      )
    }
    if (def.type === 'number') {
      return (
        <VStack key={def.id} width={140}>
          <NumberInput
            label={name}
            isLabelHidden
            placeholder={name}
            value={value === '' ? null : Number(value)}
            hasClear
            onChange={(next) => updateAttributeFilter(def.id, next == null ? '' : String(next))}
            onEnter={() => applyAttributeFilters()}
          />
        </VStack>
      )
    }
    if (def.type === 'date') {
      return (
        <VStack key={def.id} width={170}>
          <DateInput
            label={name}
            isLabelHidden
            placeholder={name}
            value={(value || undefined) as ISODateString | undefined}
            hasClear
            onChange={(next) => {
              const merged = { ...attributeFilters, [def.id]: next ?? '' }
              setAttributeFilters(merged)
              applyAttributeFilters(merged)
            }}
          />
        </VStack>
      )
    }
    return (
      <VStack key={def.id} width={150}>
        <TextInput
          label={name}
          isLabelHidden
          placeholder={name}
          type={def.type === 'email' ? 'email' : def.type === 'url' ? 'url' : 'text'}
          value={value}
          hasClear
          onChange={(next) => updateAttributeFilter(def.id, next)}
          onEnter={() => applyAttributeFilters()}
        />
      </VStack>
    )
  }

  const visibleAttributeFilters = useMemo(
    () => enabledAttributes.filter((def) => visibleFilters.has(`attr_${def.id}`)),
    [enabledAttributes, visibleFilters]
  )

  return (
    <Page title={t("admin.users.title")}>
      <Layout>
        <LayoutContent>
          <VStack gap={4} hAlign="stretch">
            {/* Header Actions */}
            <HStack gap={2} vAlign="center" hAlign="end" wrap="wrap">
              <DropdownMenu
                button={{
                  label: t('admin.users.filterSettings'),
                  variant: 'secondary',
                  icon: <Icon icon={Filter} size="sm" />,
                }}
                alignment="end"
                items={
                  filterMenuItems.length > 0
                    ? filterMenuItems
                    : [{ label: t('admin.users.attributes.noAttributes'), isDisabled: true }]
                }
              />
              <Button
                label={t('admin.users.attributes.configButton')}
                icon={<Icon icon={Settings} size="sm" />}
                variant="secondary"
                onClick={() => setShowAttributesConfig(true)}
              />
              <Button
                label={t('common.refresh')}
                icon={<Icon icon={RefreshCw} />}
                variant="secondary"
                onClick={handleRefresh}
                isDisabled={loading}
              />
              <Button
                label={t('admin.users.createUser')}
                icon={<Icon icon={PlusIcon} />}
                variant="primary"
                onClick={() => {
                  setEditingUser(null)
                  setShowCreateEdit(true)
                }}
              />
            </HStack>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <Section padding={3}>
                <HStack gap={3} vAlign="center" hAlign="between">
                  <Text weight="medium">
                    {t('admin.users.bulkLimits.selectedCount', { count: selectedIds.size })}
                  </Text>
                  <HStack gap={2}>
                    <Button
                      label={t('admin.users.bulkLimits.action', { count: selectedIds.size })}
                      variant="secondary"
                      onClick={() => setShowBulkEdit(true)}
                    />
                    <Button
                      label={t('admin.users.bulkDelete.action', { count: selectedIds.size })}
                      variant="secondary"
                      onClick={() => setShowBulkDelete(true)}
                    />
                    <Button
                      label={t('common.clear')}
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                    />
                  </HStack>
                </HStack>
              </Section>
            )}

            {/* Filters */}
            <Section padding={4}>
              <VStack gap={3} hAlign="stretch">
                <HStack gap={3} wrap="wrap" vAlign="end">
                  <StackItem size="fill">
                    <TextInput
                      label={t('common.search')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e)}
                      onEnter={handleSearch}
                      placeholder={t('admin.users.searchUsers')}
                    />
                  </StackItem>
                  <VStack width={150}>
                    <Selector
                      label={t('admin.users.columns.role')}
                      isLabelHidden
                      value={roleFilter}
                      options={roleOptions}
                      onChange={(val) => {
                        setRoleFilter(val as '' | 'admin' | 'user')
                        setPage(1)
                      }}
                    />
                  </VStack>
                  <VStack width={150}>
                    <Selector
                      label={t('admin.users.columns.status')}
                      isLabelHidden
                      value={statusFilter}
                      options={statusOptions}
                      onChange={(val) => {
                        setStatusFilter(val as '' | 'active' | 'disabled')
                        setPage(1)
                      }}
                    />
                  </VStack>
                  {/* Dynamic attribute filters */}
                  {visibleAttributeFilters.map((def) => renderAttributeFilter(def))}
                </HStack>
                <HStack gap={2}>
                  <Button
                    label={t('common.search')}
                    variant="primary"
                    onClick={handleSearch}
                    isLoading={loading}
                  />
                  <Button variant="secondary" onClick={handleReset} label={t('common.reset')} />
                </HStack>
              </VStack>
            </Section>

            {/* Table */}
            <Section padding={0} style={{ position: 'relative' }}>
              {loading && rows.length === 0 ? (
                <Center axis="both" padding={8} minHeight={400}>
                  <Spinner />
                </Center>
              ) : rows.length === 0 ? (
                <Center axis="both" padding={8} minHeight={400}>
                  <EmptyState
                    icon={<Icon icon={Users} />}
                    title={t('admin.users.noUsers')}
                    description={t('admin.users.noUsersDescription')}
                  />
                </Center>
              ) : (
                <Table
                  data={rows}
                  columns={columns}
                  idKey="__id"
                  plugins={{pagination: paginationPlugin}}
                />
              )}
              <LoadingOverlay show={loading && rows.length > 0} />
            </Section>
          </VStack>
        </LayoutContent>
      </Layout>

      {/* Dialogs */}
      <UserCreateEditDialog
        isOpen={showCreateEdit}
        user={editingUser}
        onClose={() => {
          setShowCreateEdit(false)
          setEditingUser(null)
        }}
        onSaved={() => {
          loadUsers()
          setSelectedIds(new Set())
        }}
      />

      <UserBulkEditDialog
        isOpen={showBulkEdit}
        selectedIds={Array.from(selectedIds)}
        onClose={() => setShowBulkEdit(false)}
        onSaved={() => {
          loadUsers()
          setSelectedIds(new Set())
        }}
      />

      <UserBulkDeleteDialog
        isOpen={showBulkDelete}
        selectedIds={Array.from(selectedIds)}
        onClose={() => setShowBulkDelete(false)}
        onSaved={() => {
          loadUsers()
          setSelectedIds(new Set())
        }}
      />

      <UserApiKeysDialog
        isOpen={showApiKeys}
        user={selectedUser}
        onClose={() => {
          setShowApiKeys(false)
          setSelectedUser(null)
        }}
      />

      <UserAllowedGroupsDialog
        isOpen={showAllowedGroups}
        user={selectedUser}
        onClose={() => {
          setShowAllowedGroups(false)
          setSelectedUser(null)
        }}
        onSaved={() => {
          loadUsers()
          setSelectedUser(null)
        }}
      />

      <UserBalanceDialog
        isOpen={showBalance}
        user={selectedUser}
        operation={balanceOperation}
        onClose={() => {
          setShowBalance(false)
          setSelectedUser(null)
        }}
        onSaved={() => {
          loadUsers()
          setSelectedUser(null)
        }}
      />

      <UserBalanceHistoryDialog
        isOpen={showBalanceHistory}
        user={selectedUser}
        onClose={() => {
          setShowBalanceHistory(false)
          setSelectedUser(null)
        }}
        onDeposit={() => {
          setBalanceOperation('add')
          setShowBalanceHistory(false)
          setShowBalance(true)
        }}
        onWithdraw={() => {
          setBalanceOperation('subtract')
          setShowBalanceHistory(false)
          setShowBalance(true)
        }}
      />

      <UserPlatformQuotaDialog
        isOpen={showPlatformQuota}
        user={selectedUser}
        onClose={() => {
          setShowPlatformQuota(false)
          setSelectedUser(null)
        }}
        onSaved={() => {
          loadUsers()
          setSelectedUser(null)
        }}
      />

      {/* Gap 30: custom attribute definitions */}
      <UserAttributesConfigDialog
        isOpen={showAttributesConfig}
        onClose={() => {
          setShowAttributesConfig(false)
          void loadAttributeDefinitions()
          loadUsers()
        }}
      />

      {/* Gap 32: replace one of a user's exclusive groups */}
      <GroupReplaceDialog
        isOpen={groupReplaceUser !== null && groupReplaceOldGroup !== null}
        user={groupReplaceUser}
        oldGroup={groupReplaceOldGroup}
        allGroups={allGroups}
        onClose={closeGroupReplace}
        onSuccess={() => {
          loadUsers()
          void loadAllGroups()
        }}
      />
    </Page>
  )
}
