import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import {
  Table,
  TableSelectionToolbar,
  pixel,
  proportional,
  useTableSelection,
  useTableSelectionState,
  type TableColumn,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Typeahead, TypeaheadItem, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead'
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import {
  affiliatesAPI,
  type AffiliateAdminEntry,
  type BatchSetRateRequest,
  type SimpleUser,
  type UpdateAffiliateUserRequest,
} from '~/lib/api/admin/affiliates'
import type { SystemSettings } from '~/lib/api/admin/settings'
import { toast } from '~/lib/toast'

interface FeaturesSettingsTabProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

type ToggleField =
  | 'registration_enabled'
  | 'email_verify_enabled'
  | 'invitation_code_enabled'
  | 'promo_code_enabled'
  | 'subscription_enabled'
  | 'payment_enabled'
  | 'affiliate_enabled'
  | 'affiliate_admin_recharge_enabled'
  | 'model_plaza_enabled'
  | 'channel_monitor_enabled'
  | 'available_channels_enabled'
  | 'plugin_management_enabled'
  | 'risk_control_enabled'

type NumberField =
  | 'affiliate_rebate_rate'
  | 'affiliate_rebate_freeze_hours'
  | 'affiliate_rebate_duration_days'
  | 'affiliate_rebate_per_invitee_cap'

// A number is null while its field is empty.
type FeaturesFormState = Record<ToggleField, boolean> & Record<NumberField, number | null>

interface ToggleOption {
  field: ToggleField
  label: string
  hint: string
}

interface ListQuery {
  search: string
  page: number
}

interface AffiliateRow extends Record<string, unknown>, AffiliateAdminEntry {
  id: string
}

type UserItem = SearchableItem<SimpleUser>

const REGISTRATION_TOGGLES: ToggleOption[] = [
  {
    field: 'registration_enabled',
    label: 'admin.settings.features.registration.enabled',
    hint: 'admin.settings.features.registration.enabledHint',
  },
  {
    field: 'email_verify_enabled',
    label: 'admin.settings.features.registration.emailVerify',
    hint: 'admin.settings.features.registration.emailVerifyHint',
  },
  {
    field: 'invitation_code_enabled',
    label: 'admin.settings.features.registration.invitationCode',
    hint: 'admin.settings.features.registration.invitationCodeHint',
  },
  {
    field: 'promo_code_enabled',
    label: 'admin.settings.features.registration.promoCode',
    hint: 'admin.settings.features.registration.promoCodeHint',
  },
]

const BUSINESS_TOGGLES: ToggleOption[] = [
  {
    field: 'subscription_enabled',
    label: 'admin.settings.features.business.subscription',
    hint: 'admin.settings.features.business.subscriptionHint',
  },
  {
    field: 'payment_enabled',
    label: 'admin.settings.features.business.payment',
    hint: 'admin.settings.features.business.paymentHint',
  },
  {
    field: 'affiliate_enabled',
    label: 'admin.settings.features.affiliate.enabled',
    hint: 'admin.settings.features.affiliate.enabledHint',
  },
]

const ADMIN_RECHARGE_TOGGLE: ToggleOption = {
  field: 'affiliate_admin_recharge_enabled',
  label: 'admin.settings.features.affiliate.adminRechargeRebate',
  hint: 'admin.settings.features.affiliate.adminRechargeRebateHint',
}

const PLATFORM_TOGGLES: ToggleOption[] = [
  {
    field: 'model_plaza_enabled',
    label: 'admin.settings.features.modelPlaza.enabled',
    hint: 'admin.settings.features.modelPlaza.enabledHint',
  },
  {
    field: 'channel_monitor_enabled',
    label: 'admin.settings.features.channelMonitor.enabled',
    hint: 'admin.settings.features.channelMonitor.enabledHint',
  },
  {
    field: 'available_channels_enabled',
    label: 'admin.settings.features.availableChannels.enabled',
    hint: 'admin.settings.features.availableChannels.enabledHint',
  },
  {
    field: 'plugin_management_enabled',
    label: 'admin.settings.features.pluginManagement.enabled',
    hint: 'admin.settings.features.pluginManagement.enabledHint',
  },
  {
    field: 'risk_control_enabled',
    label: 'admin.settings.features.riskControl.enabled',
    hint: 'admin.settings.features.riskControl.enabledHint',
  },
]

const SECTION_COLUMNS = { minWidth: 320, max: 2 }
const PAIR_COLUMNS = { minWidth: 200, max: 2 }
const RATE_RANGE = { min: 0, max: 100, step: 0.01 }
const PAGE_SIZE = 10
const SEARCH_DELAY_MS = 300

/** An emptied number field is saved as 0. */
const withEmptyAsZero = (form: FeaturesFormState) => ({
  ...form,
  affiliate_rebate_rate: form.affiliate_rebate_rate ?? 0,
  affiliate_rebate_freeze_hours: form.affiliate_rebate_freeze_hours ?? 0,
  affiliate_rebate_duration_days: form.affiliate_rebate_duration_days ?? 0,
  affiliate_rebate_per_invitee_cap: form.affiliate_rebate_per_invitee_cap ?? 0,
})

/** A number field words a rejected entry in English only, so the tab words it. */
const entryErrorMessage = (error: NumberInputEntryError) =>
  error.kind === 'fractional'
    ? 'admin.settings.features.affiliate.wholeNumber'
    : 'admin.settings.features.affiliate.invalidNumber'

const toUserItem = (user: SimpleUser): UserItem => ({ id: String(user.id), label: user.email, auxiliaryData: user })

const userSearch: SearchSource<UserItem> = {
  async search(query) {
    const keyword = query.trim()
    if (!keyword) return []
    try {
      return (await affiliatesAPI.lookupUsers(keyword)).map(toUserItem)
    } catch {
      return []
    }
  },
  bootstrap: () => [],
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Grid columns={SECTION_COLUMNS} gap={10}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting" color="secondary">
          {description}
        </Text>
      </VStack>
      <VStack gap={4} hAlign="stretch">
        {children}
      </VStack>
    </Grid>
  )
}

function AffiliateUserDialog({
  isOpen,
  entry,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  /** The row being edited; null adds a user. */
  entry: AffiliateAdminEntry | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [user, setUser] = useState<UserItem | null>(null)
  // A system code is left out: sending it back would turn it into a custom code.
  const [code, setCode] = useState(entry?.aff_code_custom ? entry.aff_code : '')
  const [rate, setRate] = useState<number | null>(entry?.aff_rebate_rate_percent ?? null)
  const [rateError, setRateError] = useState<NumberInputEntryError | null>(null)
  const [saving, setSaving] = useState(false)

  const userId = entry ? entry.user_id : user ? Number(user.id) : null
  const hadRate = entry?.aff_rebate_rate_percent != null

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

  const handleSave = async () => {
    if (userId === null) return
    // A rejected entry is not in `rate`, so saving now would send something else than the field shows.
    if (rateError) {
      toast.error(t('admin.settings.features.affiliate.fixNumbers'))
      return
    }
    const trimmedCode = code.trim()
    // Same rule as the Vue page: the form has to change at least one of the two.
    if (!trimmedCode && rate === null && !hadRate) {
      toast.error(t('admin.settings.features.affiliate.modal.errorEmpty'))
      return
    }

    const payload: UpdateAffiliateUserRequest = {}
    if (trimmedCode) payload.aff_code = trimmedCode
    // An emptied rate clears the exclusive rate, which only an edited user can have.
    if (rate !== null) payload.aff_rebate_rate_percent = rate
    else if (hadRate) payload.clear_rebate_rate = true

    setSaving(true)
    try {
      await affiliatesAPI.updateUserSettings(userId, payload)
      toast.success(t('common.saved'))
      onSaved()
    } catch {
      toast.error(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={480} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={
              entry
                ? t('admin.settings.features.affiliate.modal.editTitle')
                : t('admin.settings.features.affiliate.modal.addTitle')
            }
            onOpenChange={handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {entry ? (
                <TextInput
                  label={t('admin.settings.features.affiliate.modal.userLabel')}
                  value={entry.email}
                  onChange={() => undefined}
                  isReadOnly
                />
              ) : (
                <Typeahead
                  label={t('admin.settings.features.affiliate.modal.userLabel')}
                  placeholder={t('admin.settings.features.affiliate.modal.userPlaceholder')}
                  emptySearchText={t('common.noOptionsFound')}
                  searchSource={userSearch}
                  value={user}
                  onChange={setUser}
                  debounceMs={SEARCH_DELAY_MS}
                  renderItem={item => <TypeaheadItem item={item} description={item.auxiliaryData?.username} />}
                />
              )}
              <TextInput
                label={t('admin.settings.features.affiliate.modal.codeLabel')}
                description={t('admin.settings.features.affiliate.modal.codeHint')}
                value={code}
                onChange={setCode}
                placeholder={t('admin.settings.features.affiliate.modal.codePlaceholder')}
              />
              <NumberInput
                label={t('admin.settings.features.affiliate.modal.rateLabel')}
                description={t('admin.settings.features.affiliate.modal.rateHint')}
                value={rate}
                onChange={(value: number | null) => setRate(value)}
                onEntryErrorChange={setRateError}
                status={rateError ? { type: 'error', message: t(entryErrorMessage(rateError)) } : undefined}
                {...RATE_RANGE}
                units="%"
                hasClear
                isWheelEnabled={false}
                placeholder={t('admin.settings.features.affiliate.modal.ratePlaceholder')}
              />
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
                isDisabled={userId === null}
                onClick={() => void handleSave()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

function AffiliateBatchRateDialog({
  isOpen,
  userIds,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  userIds: number[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [rate, setRate] = useState<number | null>(null)
  const [rateError, setRateError] = useState<NumberInputEntryError | null>(null)
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

  const handleSave = async () => {
    // A rejected entry leaves `rate` empty, and an empty rate would clear every selected user's rate.
    if (rateError) {
      toast.error(t('admin.settings.features.affiliate.fixNumbers'))
      return
    }
    // An empty rate clears the exclusive rate of every selected user.
    const payload: BatchSetRateRequest =
      rate === null ? { user_ids: userIds, clear: true } : { user_ids: userIds, aff_rebate_rate_percent: rate }

    setSaving(true)
    try {
      await affiliatesAPI.batchSetRate(payload)
      toast.success(t('common.saved'))
      onSaved()
    } catch {
      toast.error(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={480} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={t('admin.settings.features.affiliate.batchModal.title', { count: userIds.length })}
            onOpenChange={handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Text type="supporting" color="secondary">
                {t('admin.settings.features.affiliate.batchModal.hint')}
              </Text>
              <NumberInput
                label={t('admin.settings.features.affiliate.customUsers.col.rate')}
                description={t('admin.settings.features.affiliate.batchModal.clearHint')}
                value={rate}
                onChange={(value: number | null) => setRate(value)}
                onEntryErrorChange={setRateError}
                status={rateError ? { type: 'error', message: t(entryErrorMessage(rateError)) } : undefined}
                {...RATE_RANGE}
                units="%"
                hasClear
                isWheelEnabled={false}
                placeholder={t('admin.settings.features.affiliate.batchModal.placeholder')}
              />
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
                onClick={() => void handleSave()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

function AffiliateCustomUsers() {
  const { t } = useI18n()
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState<ListQuery>({ search: '', page: 1 })
  const [entries, setEntries] = useState<AffiliateAdminEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  // A new session remounts the dialog, so every opening starts from a clean form.
  const [editor, setEditor] = useState<{ isOpen: boolean; entry: AffiliateAdminEntry | null; session: number }>({
    isOpen: false,
    entry: null,
    session: 0,
  })
  const [batch, setBatch] = useState<{ isOpen: boolean; userIds: number[]; session: number }>({
    isOpen: false,
    userIds: [],
    session: 0,
  })
  const [reset, setReset] = useState<{ isOpen: boolean; entry: AffiliateAdminEntry | null }>({
    isOpen: false,
    entry: null,
  })
  const [resetting, setResetting] = useState(false)
  const latestRequest = useRef(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async ({ search, page }: ListQuery) => {
      const request = ++latestRequest.current
      setLoading(true)
      try {
        const response = await affiliatesAPI.listUsers({ page, page_size: PAGE_SIZE, search })
        // Only the latest answer is shown; an older one may arrive late.
        if (request !== latestRequest.current) return
        const items = response.items || []
        setEntries(items)
        setTotal(response.total || 0)
        // A batch change must only touch rows that are on screen.
        const visible = new Set(items.map(entry => String(entry.user_id)))
        setSelectedKeys(prev => {
          const kept = [...prev].filter(key => visible.has(key))
          return kept.length === prev.size ? prev : new Set(kept)
        })
      } catch {
        if (request === latestRequest.current) {
          toast.error(t('admin.settings.features.affiliate.customUsers.loadError'))
        }
      } finally {
        if (request === latestRequest.current) setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void load(query)
  }, [load, query])

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      // Answers that arrive after the list is gone are dropped.
      latestRequest.current++
    },
    [],
  )

  const handleSearch = (value: string) => {
    setSearchText(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setQuery({ search: value, page: 1 }), SEARCH_DELAY_MS)
  }

  const openEditor = useCallback(
    (entry: AffiliateAdminEntry | null) =>
      setEditor(prev => ({ isOpen: true, entry, session: prev.session + 1 })),
    [],
  )
  const closeEditor = () => setEditor(prev => ({ ...prev, isOpen: false }))
  const askReset = useCallback((entry: AffiliateAdminEntry) => setReset({ isOpen: true, entry }), [])

  const openBatch = () =>
    setBatch(prev => ({
      isOpen: true,
      userIds: entries.filter(entry => selectedKeys.has(String(entry.user_id))).map(entry => entry.user_id),
      session: prev.session + 1,
    }))
  const closeBatch = () => setBatch(prev => ({ ...prev, isOpen: false }))

  const handleUserSaved = () => {
    closeEditor()
    void load(query)
  }

  const handleBatchSaved = () => {
    closeBatch()
    setSelectedKeys(new Set())
    void load(query)
  }

  const confirmReset = async () => {
    if (!reset.entry) return
    setResetting(true)
    try {
      await affiliatesAPI.clearUserSettings(reset.entry.user_id)
      toast.success(t('common.deleted'))
      setReset(prev => ({ ...prev, isOpen: false }))
      // The only row of a later page is gone: step back instead of showing an empty page.
      if (entries.length === 1 && query.page > 1) setQuery(prev => ({ ...prev, page: prev.page - 1 }))
      else await load(query)
    } catch {
      toast.error(t('common.deleteFailed'))
    } finally {
      setResetting(false)
    }
  }

  const rows = useMemo<AffiliateRow[]>(
    () => entries.map(entry => ({ ...entry, id: String(entry.user_id) })),
    [entries],
  )

  const { selectionConfig, selectionState } = useTableSelectionState<AffiliateRow>({
    data: rows,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  })
  const selectionPlugin = useTableSelection<AffiliateRow>({ ...selectionConfig, getRowLabel: row => row.email })

  const columns = useMemo<TableColumn<AffiliateRow>[]>(
    () => [
      {
        key: 'email',
        header: t('admin.settings.features.affiliate.customUsers.col.email'),
        width: proportional(2, { minWidth: 200 }),
      },
      {
        key: 'username',
        header: t('admin.settings.features.affiliate.customUsers.col.username'),
        width: proportional(1, { minWidth: 110 }),
      },
      {
        key: 'aff_code',
        header: t('admin.settings.features.affiliate.customUsers.col.code'),
        width: proportional(1.5, { minWidth: 180 }),
        renderCell: row => (
          <HStack gap={2} vAlign="center">
            <Text type="code">{row.aff_code}</Text>
            {row.aff_code_custom && (
              <Badge label={t('admin.settings.features.affiliate.customUsers.customBadge')} variant="info" />
            )}
          </HStack>
        ),
      },
      {
        key: 'aff_rebate_rate_percent',
        header: t('admin.settings.features.affiliate.customUsers.col.rate'),
        width: proportional(1, { minWidth: 100 }),
        renderCell: row =>
          row.aff_rebate_rate_percent != null ? (
            <Text>{`${row.aff_rebate_rate_percent}%`}</Text>
          ) : (
            <Text color="secondary">{t('admin.settings.features.affiliate.customUsers.useGlobal')}</Text>
          ),
      },
      {
        key: 'actions',
        header: t('admin.settings.features.affiliate.customUsers.col.actions'),
        width: pixel(96),
        renderCell: row => (
          <HStack gap={1}>
            <IconButton
              variant="ghost"
              size="sm"
              label={t('common.edit')}
              tooltip={t('common.edit')}
              icon={<Icon icon={PencilIcon} />}
              onClick={() => openEditor(row)}
            />
            <IconButton
              variant="ghost"
              size="sm"
              label={t('common.delete')}
              tooltip={t('common.delete')}
              icon={<Icon icon={TrashIcon} />}
              onClick={() => askReset(row)}
            />
          </HStack>
        ),
      },
    ],
    [t, openEditor, askReset],
  )

  return (
    <>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1} hAlign="stretch">
          <HStack gap={4} vAlign="center">
            <StackItem size="fill">
              <Heading level={3}>{t('admin.settings.features.affiliate.customUsers.title')}</Heading>
            </StackItem>
            <Button
              icon={<Icon icon={PlusIcon} />}
              label={t('admin.settings.features.affiliate.customUsers.addButton')}
              onClick={() => openEditor(null)}
            />
          </HStack>
          <Text type="supporting" color="secondary">
            {t('admin.settings.features.affiliate.customUsers.description')}
          </Text>
        </VStack>

        <TextInput
          label={t('admin.settings.features.affiliate.customUsers.searchPlaceholder')}
          isLabelHidden
          value={searchText}
          onChange={handleSearch}
          placeholder={t('admin.settings.features.affiliate.customUsers.searchPlaceholder')}
          startIcon="search"
          hasClear
          width={320}
        />

        <TableSelectionToolbar
          selection={selectionState}
          label={t('admin.settings.features.affiliate.customUsers.title')}
          renderSelectionLabel={count => t('admin.settings.features.affiliate.customUsers.selectedCount', { count })}
          clearLabel={t('admin.settings.features.affiliate.customUsers.clearSelection')}
          startContent={
            <Button
              label={t('admin.settings.features.affiliate.customUsers.batchRate')}
              variant="ghost"
              onClick={openBatch}
            />
          }
        />

        {rows.length > 0 ? (
          <Table data={rows} columns={columns} idKey="id" hasHover plugins={{ selection: selectionPlugin }} />
        ) : loading ? (
          <Center minHeight={160}>
            <Spinner />
          </Center>
        ) : (
          <EmptyState isCompact title={t('admin.settings.features.affiliate.customUsers.empty')} />
        )}

        {total > PAGE_SIZE && (
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <Text type="supporting" color="secondary">
                {t('admin.settings.features.affiliate.customUsers.totalLabel', { total })}
              </Text>
            </StackItem>
            <Pagination
              page={query.page}
              onChange={page => setQuery(prev => ({ ...prev, page }))}
              totalItems={total}
              pageSize={PAGE_SIZE}
              size="sm"
              label={t('admin.settings.features.affiliate.customUsers.title')}
            />
          </HStack>
        )}
      </VStack>

      <AffiliateUserDialog
        key={`user-${editor.session}`}
        isOpen={editor.isOpen}
        entry={editor.entry}
        onClose={closeEditor}
        onSaved={handleUserSaved}
      />
      <AffiliateBatchRateDialog
        key={`batch-${batch.session}`}
        isOpen={batch.isOpen}
        userIds={batch.userIds}
        onClose={closeBatch}
        onSaved={handleBatchSaved}
      />
      <AlertDialog
        isOpen={reset.isOpen}
        onOpenChange={open => {
          if (!open && !resetting) setReset(prev => ({ ...prev, isOpen: false }))
        }}
        title={t('admin.settings.features.affiliate.customUsers.resetTitle')}
        description={
          reset.entry
            ? t('admin.settings.features.affiliate.customUsers.resetMessage', { email: reset.entry.email })
            : ''
        }
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={resetting}
        onAction={() => void confirmReset()}
      />
    </>
  )
}

export function FeaturesSettingsTab({ settings, onSave, saving }: FeaturesSettingsTabProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<FeaturesFormState>(() => ({
    registration_enabled: settings.registration_enabled ?? true,
    email_verify_enabled: settings.email_verify_enabled ?? false,
    invitation_code_enabled: settings.invitation_code_enabled ?? false,
    promo_code_enabled: settings.promo_code_enabled ?? false,

    subscription_enabled: settings.subscription_enabled ?? false,
    payment_enabled: settings.payment_enabled ?? false,
    affiliate_enabled: settings.affiliate_enabled ?? false,
    affiliate_admin_recharge_enabled: settings.affiliate_admin_recharge_enabled ?? false,
    affiliate_rebate_rate: settings.affiliate_rebate_rate ?? 20,
    affiliate_rebate_freeze_hours: settings.affiliate_rebate_freeze_hours ?? 72,
    affiliate_rebate_duration_days: settings.affiliate_rebate_duration_days ?? 365,
    affiliate_rebate_per_invitee_cap: settings.affiliate_rebate_per_invitee_cap ?? 0,

    model_plaza_enabled: settings.model_plaza_enabled ?? false,
    channel_monitor_enabled: settings.channel_monitor_enabled ?? false,
    available_channels_enabled: settings.available_channels_enabled ?? false,
    plugin_management_enabled: settings.plugin_management_enabled ?? false,
    risk_control_enabled: settings.risk_control_enabled ?? false,
  }))
  // Entries the number fields reject: such a field shows text that is not in `form`.
  const [entryErrors, setEntryErrors] = useState<Partial<Record<NumberField, NumberInputEntryError>>>({})

  const setToggle = (field: ToggleField) => (checked: boolean) => setForm(prev => ({ ...prev, [field]: checked }))

  const numberProps = (field: NumberField) => {
    const entryError = entryErrors[field]
    return {
      value: form[field],
      onChange: (value: number | null) => setForm(prev => ({ ...prev, [field]: value })),
      onEntryErrorChange: (error: NumberInputEntryError | null) =>
        setEntryErrors(prev => ({ ...prev, [field]: error ?? undefined })),
      status: entryError ? { type: 'error' as const, message: t(entryErrorMessage(entryError)) } : undefined,
      hasClear: true as const,
      isWheelEnabled: false,
    }
  }

  const handleSave = async () => {
    // Saving now would send the last accepted number, not the text a rejecting field shows.
    if (Object.values(entryErrors).some(Boolean)) {
      toast.error(t('admin.settings.features.affiliate.fixNumbers'))
      return
    }
    if (await onSave(withEmptyAsZero(form))) setForm(withEmptyAsZero)
  }

  const renderToggle = ({ field, label, hint }: ToggleOption) => (
    <CheckboxInput key={field} label={t(label)} description={t(hint)} value={form[field]} onChange={setToggle(field)} />
  )

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.features.registration.title')}
        description={t('admin.settings.features.registration.description')}
      >
        {REGISTRATION_TOGGLES.map(renderToggle)}
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.features.business.title')}
        description={t('admin.settings.features.business.description')}
      >
        {BUSINESS_TOGGLES.map(renderToggle)}
      </SettingsSection>

      {form.affiliate_enabled && (
        <>
          <Divider />

          <SettingsSection
            title={t('admin.settings.features.affiliate.title')}
            description={t('admin.settings.features.affiliate.description')}
          >
            {renderToggle(ADMIN_RECHARGE_TOGGLE)}
            <Grid columns={PAIR_COLUMNS} gap={4}>
              <NumberInput
                label={t('admin.settings.features.affiliate.rebateRate')}
                description={t('admin.settings.features.affiliate.rebateRateHint')}
                {...numberProps('affiliate_rebate_rate')}
                {...RATE_RANGE}
                units="%"
                placeholder="20"
              />
              <NumberInput
                label={t('admin.settings.features.affiliate.freezeHours')}
                description={t('admin.settings.features.affiliate.freezeHoursDesc')}
                {...numberProps('affiliate_rebate_freeze_hours')}
                min={0}
                max={720}
                isIntegerOnly
              />
              <NumberInput
                label={t('admin.settings.features.affiliate.durationDays')}
                description={t('admin.settings.features.affiliate.durationDaysDesc')}
                {...numberProps('affiliate_rebate_duration_days')}
                min={0}
                max={3650}
                isIntegerOnly
              />
              <NumberInput
                label={t('admin.settings.features.affiliate.perInviteeCap')}
                description={t('admin.settings.features.affiliate.perInviteeCapDesc')}
                {...numberProps('affiliate_rebate_per_invitee_cap')}
                min={0}
                step={0.01}
              />
            </Grid>
          </SettingsSection>

          <AffiliateCustomUsers />
        </>
      )}

      <Divider />

      <SettingsSection
        title={t('admin.settings.features.platform.title')}
        description={t('admin.settings.features.platform.description')}
      >
        {PLATFORM_TOGGLES.map(renderToggle)}
      </SettingsSection>

      <Divider />

      <HStack>
        <Button
          variant="primary"
          label={saving ? t('common.saving') : t('common.save')}
          isLoading={saving}
          onClick={() => void handleSave()}
        />
      </HStack>
    </VStack>
  )
}
