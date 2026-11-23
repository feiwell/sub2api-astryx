import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import {
  Table,
  TableSelectionToolbar,
  proportional,
  pixel,
  useTablePagination,
  useTableSelection,
  useTableSortable,
  type TableColumn,
} from '@astryxdesign/core/Table'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Card } from '@astryxdesign/core/Card'
import {
  RefreshCw,
  Plus,
  Trash2,
  Ticket,
  Copy,
  Check,
  CircleCheck,
  Download,
  FileDown,
  PencilLine,
} from 'lucide-react'
import type { BatchUpdateRedeemCodeFields, Group, RedeemCode, RedeemCodeType } from '@/types'
import { formatDateTime, getBrowserTimeZone, parseDateTimeLocalInput } from '@/utils/format'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import { copyToClipboard } from '~/lib/clipboard'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

interface RedeemRow extends Record<string, unknown> {
  __id: string
  id: number
  code: string
  type: string
  value: number
  status: string
  used_by: number | null
  used_at: string | null
  user_email: string | null
  expires_at: string | null
  validity_days?: number
  group_name?: string
}

type RedeemStatusFilter = 'all' | 'unused' | 'used' | 'expired' | 'disabled'
type ExpiryOption = 'never' | '1' | '3' | '7' | 'custom'
type SortDirection = 'ascending' | 'descending'

const GENERATED_CODES_MAX_HEIGHT = 'calc(var(--spacing-12) * 5)'

const errorDetail = (error: unknown): string | undefined =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail

const toDatetimeLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------------- */
/* Generate dialog                                                           */
/* ------------------------------------------------------------------------- */

interface GenerateForm {
  type: RedeemCodeType
  value: number
  count: number
  group_id: string
  validity_days: number
  expiry_option: ExpiryOption
  custom_expiry_days: number
}

const DEFAULT_GENERATE_FORM: GenerateForm = {
  type: 'balance',
  value: 10,
  count: 1,
  group_id: '',
  validity_days: 30,
  expiry_option: 'never',
  custom_expiry_days: 7,
}

function GenerateCodesDialog({
  isOpen,
  groups,
  onClose,
  onGenerated,
}: {
  isOpen: boolean
  groups: Group[]
  onClose: () => void
  onGenerated: (codes: RedeemCode[]) => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<GenerateForm>(DEFAULT_GENERATE_FORM)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (isOpen) setForm(DEFAULT_GENERATE_FORM)
  }, [isOpen])

  const subscriptionGroupOptions = useMemo(
    () =>
      groups
        .filter((g) => g.subscription_type === 'subscription')
        .map((g) => ({ value: String(g.id), label: g.name, description: g.description || undefined })),
    [groups],
  )

  const setType = (type: RedeemCodeType) =>
    // Invitation codes carry no value; restore a default when leaving that type
    setForm((prev) => ({
      ...prev,
      type,
      value: type === 'invitation' ? 0 : prev.value === 0 ? 10 : prev.value,
    }))

  const expiresInDays = (): number | null | undefined => {
    if (form.expiry_option === 'never') return undefined
    if (form.expiry_option === 'custom') {
      if (!Number.isFinite(form.custom_expiry_days) || form.custom_expiry_days < 1) return null
      return Math.floor(form.custom_expiry_days)
    }
    return Number(form.expiry_option)
  }

  const handleClose = () => {
    if (!generating) onClose()
  }

  const handleGenerate = async () => {
    if (form.type === 'subscription' && !form.group_id) {
      toast.error(t('admin.redeem.groupRequired'))
      return
    }
    const expiry = expiresInDays()
    if (expiry === null) {
      toast.error(t('admin.redeem.expiryDaysRequired'))
      return
    }
    if (!Number.isInteger(form.count) || form.count < 1 || form.count > 100) {
      toast.error(t('admin.redeem.form.countHint'))
      return
    }
    setGenerating(true)
    try {
      const result = await adminAPI.redeem.generate(
        form.count,
        form.type,
        form.value,
        form.type === 'subscription' ? Number(form.group_id) : undefined,
        form.type === 'subscription' ? form.validity_days : undefined,
        expiry,
      )
      onGenerated(result)
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.redeem.failedToGenerate'))
      console.error('Error generating codes:', error)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={480} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.redeem.generateCodesTitle')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Selector
                label={t('admin.redeem.codeType')}
                value={form.type}
                onChange={(val) => setType(val as RedeemCodeType)}
                options={[
                  { value: 'balance', label: t('admin.redeem.balance') },
                  { value: 'concurrency', label: t('admin.redeem.concurrency') },
                  { value: 'subscription', label: t('admin.redeem.subscription') },
                  { value: 'invitation', label: t('admin.redeem.invitation') },
                ]}
              />
              {form.type !== 'subscription' && form.type !== 'invitation' && (
                <NumberInput
                  label={form.type === 'balance' ? t('admin.redeem.amount') : t('admin.redeem.columns.value')}
                  value={form.value}
                  onChange={(value) => setForm((prev) => ({ ...prev, value }))}
                  min={form.type === 'balance' ? 0.01 : 1}
                  step={form.type === 'balance' ? 0.01 : 1}
                  isIntegerOnly={form.type !== 'balance'}
                  isRequired
                />
              )}
              {form.type === 'invitation' && <Banner status="info" title={t('admin.redeem.invitationHint')} />}
              {form.type === 'subscription' && (
                <>
                  <Selector
                    label={t('admin.redeem.selectGroup')}
                    value={form.group_id}
                    onChange={(group_id) => setForm((prev) => ({ ...prev, group_id }))}
                    options={subscriptionGroupOptions}
                    placeholder={t('admin.redeem.selectGroupPlaceholder')}
                    hasSearch
                    isRequired
                  />
                  <NumberInput
                    label={t('admin.redeem.validityDays')}
                    value={form.validity_days}
                    onChange={(validity_days) => setForm((prev) => ({ ...prev, validity_days }))}
                    min={1}
                    max={36500}
                    isIntegerOnly
                    isRequired
                  />
                </>
              )}
              <VStack gap={2} hAlign="stretch">
                <Text type="label">{t('admin.redeem.codeExpiry')}</Text>
                <SegmentedControl
                  label={t('admin.redeem.codeExpiry')}
                  value={form.expiry_option}
                  onChange={(value) => setForm((prev) => ({ ...prev, expiry_option: value as ExpiryOption }))}
                  layout="fill"
                >
                  <SegmentedControlItem value="never" label={t('admin.redeem.neverExpires')} />
                  {(['1', '3', '7'] as const).map((days) => (
                    <SegmentedControlItem key={days} value={days} label={t('admin.redeem.expiryPresetDays', { days })} />
                  ))}
                  <SegmentedControlItem value="custom" label={t('admin.redeem.customExpiry')} />
                </SegmentedControl>
                {form.expiry_option === 'custom' && (
                  <NumberInput
                    label={t('admin.redeem.customExpiryDays')}
                    isLabelHidden
                    placeholder={t('admin.redeem.customExpiryDays')}
                    value={form.custom_expiry_days}
                    onChange={(custom_expiry_days) => setForm((prev) => ({ ...prev, custom_expiry_days }))}
                    min={1}
                    max={3650}
                    isIntegerOnly
                  />
                )}
              </VStack>
              <NumberInput
                label={t('admin.redeem.count')}
                value={form.count}
                onChange={(count) => setForm((prev) => ({ ...prev, count }))}
                min={1}
                max={100}
                isIntegerOnly
                isRequired
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={generating} onClick={handleClose} />
              <Button
                label={generating ? t('admin.redeem.generating') : t('admin.redeem.generate')}
                variant="primary"
                isLoading={generating}
                onClick={() => void handleGenerate()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Generated codes result dialog                                             */
/* ------------------------------------------------------------------------- */

function GeneratedCodesDialog({ codes, onClose }: { codes: RedeemCode[] | null; onClose: () => void }) {
  const { t } = useI18n()
  const [copiedAll, setCopiedAll] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)
  const text = (codes || []).map((code) => code.code).join('\n')

  useEffect(() => {
    setCopiedAll(false)
  }, [codes])
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const handleCopyAll = async () => {
    if (await copyToClipboard(text, t('admin.redeem.copied'))) {
      setCopiedAll(true)
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopiedAll(false), 2000)
    }
  }

  const handleDownload = () => {
    downloadBlob(new Blob([text], { type: 'text/plain' }), `redeem-codes-${new Date().toISOString().split('T')[0]}.txt`)
  }

  return (
    <Dialog isOpen={codes !== null} onOpenChange={(open) => !open && onClose()} width={520}>
      <Layout
        header={
          <DialogHeader
            title={t('admin.redeem.generatedSuccessfully')}
            subtitle={t('admin.redeem.codesCreated', { count: codes?.length ?? 0 })}
            startContent={<Icon icon={CircleCheck} color="success" />}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <CodeBlock
              code={text}
              hasCopyButton={false}
              maxHeight={GENERATED_CODES_MAX_HEIGHT}
              width="100%"
              size="sm"
            />
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button
                label={copiedAll ? t('admin.redeem.copied') : t('admin.redeem.copyAll')}
                icon={<Icon icon={copiedAll ? Check : Copy} />}
                onClick={() => void handleCopyAll()}
              />
              <Button
                label={t('admin.redeem.download')}
                variant="primary"
                icon={<Icon icon={Download} />}
                onClick={handleDownload}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Batch update dialog                                                       */
/* ------------------------------------------------------------------------- */

interface BatchUpdateForm {
  update_status: boolean
  status: 'unused' | 'disabled'
  update_expires_at: boolean
  expires_mode: 'clear' | 'custom'
  expires_at_local: string
  update_notes: boolean
  notes: string
  update_group_id: boolean
  group_id: string
}

const freshBatchForm = (): BatchUpdateForm => ({
  update_status: false,
  status: 'disabled',
  update_expires_at: false,
  expires_mode: 'clear',
  expires_at_local: toDatetimeLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  update_notes: false,
  notes: '',
  update_group_id: false,
  group_id: '',
})

function BatchUpdateDialog({
  isOpen,
  selectedIds,
  groups,
  onClose,
  onUpdated,
}: {
  isOpen: boolean
  selectedIds: number[]
  groups: Group[]
  onClose: () => void
  onUpdated: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<BatchUpdateForm>(freshBatchForm)
  const [updating, setUpdating] = useState(false)
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), [])

  useEffect(() => {
    if (isOpen) setForm(freshBatchForm())
  }, [isOpen])

  const patch = (next: Partial<BatchUpdateForm>) => setForm((prev) => ({ ...prev, ...next }))
  const groupOptions = useMemo(
    () => [
      { value: '', label: t('admin.redeem.clearGroup') },
      ...groups
        .filter((g) => g.subscription_type === 'subscription')
        .map((g) => ({ value: String(g.id), label: g.name })),
    ],
    [groups, t],
  )

  const handleClose = () => {
    if (!updating) onClose()
  }

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.error(t('admin.redeem.selectCodesFirst'))
      return
    }
    if (!form.update_status && !form.update_expires_at && !form.update_notes && !form.update_group_id) {
      toast.error(t('admin.redeem.noBatchFieldsSelected'))
      return
    }
    const fields: BatchUpdateRedeemCodeFields = {}
    if (form.update_status) fields.status = form.status
    if (form.update_expires_at) {
      if (form.expires_mode === 'clear') {
        fields.expires_at = null
      } else {
        const expiresAt = parseDateTimeLocalInput(form.expires_at_local)
        if (expiresAt === null) {
          toast.error(t('admin.redeem.expiryDateRequired'))
          return
        }
        fields.expires_at = new Date(expiresAt * 1000).toISOString()
      }
    }
    if (form.update_notes) fields.notes = form.notes
    if (form.update_group_id) fields.group_id = form.group_id ? Number(form.group_id) : null

    setUpdating(true)
    try {
      const result = await adminAPI.redeem.batchUpdate(selectedIds, fields)
      toast.success(t('admin.redeem.batchUpdateSuccess', { count: result.updated }))
      onUpdated()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.redeem.failedToBatchUpdate'))
      console.error('Error batch updating codes:', error)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={520} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={t('admin.redeem.batchUpdateTitle')}
            subtitle={t('admin.redeem.selectedCount', { count: selectedIds.length })}
            onOpenChange={(open) => !open && handleClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={5} hAlign="stretch">
              <VStack gap={2} hAlign="stretch">
                <CheckboxInput
                  label={t('admin.redeem.batchFields.status')}
                  value={form.update_status}
                  onChange={(update_status) => patch({ update_status })}
                />
                {form.update_status && (
                  <Selector
                    label={t('admin.redeem.batchFields.status')}
                    isLabelHidden
                    value={form.status}
                    onChange={(status) => patch({ status: status as 'unused' | 'disabled' })}
                    options={[
                      { value: 'unused', label: t('admin.redeem.status.unused') },
                      { value: 'disabled', label: t('admin.redeem.status.disabled') },
                    ]}
                  />
                )}
              </VStack>

              <VStack gap={2} hAlign="stretch">
                <CheckboxInput
                  label={t('admin.redeem.batchFields.expiresAt')}
                  value={form.update_expires_at}
                  onChange={(update_expires_at) => patch({ update_expires_at })}
                />
                {form.update_expires_at && (
                  <>
                    <Selector
                      label={t('admin.redeem.batchFields.expiresAt')}
                      isLabelHidden
                      value={form.expires_mode}
                      onChange={(mode) => patch({ expires_mode: mode as 'clear' | 'custom' })}
                      options={[
                        { value: 'clear', label: t('admin.redeem.neverExpires') },
                        { value: 'custom', label: t('admin.redeem.customExpiry') },
                      ]}
                    />
                    {form.expires_mode === 'custom' && (
                      <DateTimeInput
                        label={t('admin.redeem.batchFields.expiresAt')}
                        isLabelHidden
                        description={t('admin.redeem.localTimeZoneHint', { timezone: browserTimeZone })}
                        value={(form.expires_at_local || undefined) as ISODateTimeString | undefined}
                        onChange={(value) => patch({ expires_at_local: value ?? '' })}
                      />
                    )}
                  </>
                )}
              </VStack>

              <VStack gap={2} hAlign="stretch">
                <CheckboxInput
                  label={t('admin.redeem.batchFields.notes')}
                  value={form.update_notes}
                  onChange={(update_notes) => patch({ update_notes })}
                />
                {form.update_notes && (
                  <TextArea
                    label={t('admin.redeem.batchFields.notes')}
                    isLabelHidden
                    value={form.notes}
                    onChange={(notes) => patch({ notes })}
                    rows={3}
                    placeholder={t('admin.redeem.batchNotesPlaceholder')}
                  />
                )}
              </VStack>

              <VStack gap={2} hAlign="stretch">
                <CheckboxInput
                  label={t('admin.redeem.batchFields.group')}
                  value={form.update_group_id}
                  onChange={(update_group_id) => patch({ update_group_id })}
                />
                {form.update_group_id && (
                  <Selector
                    label={t('admin.redeem.batchFields.group')}
                    isLabelHidden
                    value={form.group_id}
                    onChange={(group_id) => patch({ group_id })}
                    options={groupOptions}
                    placeholder={t('admin.redeem.selectGroupPlaceholder')}
                    hasSearch
                  />
                )}
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={updating} onClick={handleClose} />
              <Button
                label={updating ? t('common.submitting') : t('admin.redeem.batchUpdate')}
                variant="primary"
                isLoading={updating}
                onClick={() => void handleSubmit()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Page                                                                      */
/* ------------------------------------------------------------------------- */

export function AdminRedeemPage() {
  const { t } = useI18n()
  const translateOr = useCallback(
    (key: string, fallback: string) => {
      const label = t(key)
      return label === key ? fallback : label
    },
    [t],
  )
  const [loading, setLoading] = useState(false)
  const [codes, setCodes] = useState<RedeemCode[]>([])
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState<Group[]>([])

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<RedeemStatusFilter>('all')

  // Pagination / sorting
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])
  const [sort, setSort] = useState<Array<{ sortKey: string; direction: SortDirection }>>([
    { sortKey: 'id', direction: 'descending' },
  ])

  // Selection and dialogs
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [generatedCodes, setGeneratedCodes] = useState<RedeemCode[] | null>(null)
  const [showBatchUpdate, setShowBatchUpdate] = useState(false)
  const [deletingCode, setDeletingCode] = useState<RedeemRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteUnused, setShowDeleteUnused] = useState(false)
  const [deletingUnused, setDeletingUnused] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const copiedTimerRef = useRef<number | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const queryFilters = useMemo(
    () => ({
      type: typeFilter !== 'all' ? (typeFilter as RedeemCodeType) : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      search: searchQuery || undefined,
      sort_by: sort[0]?.sortKey || 'id',
      sort_order: (sort[0]?.direction === 'ascending' ? 'asc' : 'desc') as 'asc' | 'desc',
    }),
    [typeFilter, statusFilter, searchQuery, sort],
  )

  const loadCodes = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const response = await adminAPI.redeem.list(page, pageSize, queryFilters, { signal: controller.signal })
      if (controller.signal.aborted) return
      setCodes(response.items)
      setTotal(response.total)
    } catch (error) {
      const e = error as { name?: string; code?: string }
      if (controller.signal.aborted || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return
      toast.error(t('admin.redeem.failedToLoad'))
      console.error('Failed to load codes:', error)
    } finally {
      if (abortRef.current === controller) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }, [page, pageSize, queryFilters, t])

  useEffect(() => {
    void loadCodes()
  }, [loadCodes])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      window.clearTimeout(copiedTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    adminAPI.groups
      .getAll()
      .then(setGroups)
      .catch((error) => console.error('Error loading subscription groups:', error))
  }, [])

  const handleReset = () => {
    setSearchInput('')
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setPage(1)
  }

  const handleCopyCode = useCallback(
    async (code: string) => {
      if (await copyToClipboard(code, t('admin.redeem.copied'))) {
        setCopiedCode(code)
        window.clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = window.setTimeout(() => setCopiedCode(null), 2000)
      }
    },
    [t],
  )

  const handleExportCodes = async () => {
    setExporting(true)
    try {
      const blob = await adminAPI.redeem.exportCodes(queryFilters)
      downloadBlob(blob, `redeem-codes-${new Date().toISOString().split('T')[0]}.csv`)
      toast.success(t('admin.redeem.codesExported'))
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.redeem.failedToExport'))
      console.error('Error exporting codes:', error)
    } finally {
      setExporting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingCode) return
    setDeleting(true)
    try {
      await adminAPI.redeem.delete(deletingCode.id)
      toast.success(t('admin.redeem.codeDeleted'))
      const deletedId = deletingCode.id
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletedId)
        return next
      })
      setDeletingCode(null)
      void loadCodes()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.redeem.failedToDelete'))
      console.error('Failed to delete code:', error)
    } finally {
      setDeleting(false)
    }
  }

  const confirmDeleteUnused = async () => {
    setDeletingUnused(true)
    try {
      const unusedCodesResponse = await adminAPI.redeem.list(1, 1000, { status: 'unused' })
      const unusedCodeIds = unusedCodesResponse.items.map((code) => code.id)
      if (unusedCodeIds.length === 0) {
        toast.info(t('admin.redeem.noUnusedCodes'))
        setShowDeleteUnused(false)
        return
      }
      const result = await adminAPI.redeem.batchDelete(unusedCodeIds)
      toast.success(t('admin.redeem.codesDeleted', { count: result.deleted }))
      setShowDeleteUnused(false)
      setSelectedIds(new Set())
      void loadCodes()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.redeem.failedToDeleteUnused'))
      console.error('Error deleting unused codes:', error)
    } finally {
      setDeletingUnused(false)
    }
  }

  const openBatchUpdate = () => {
    if (selectedIds.size === 0) {
      toast.error(t('admin.redeem.selectCodesFirst'))
      return
    }
    setShowBatchUpdate(true)
  }

  const rows = useMemo<RedeemRow[]>(
    () =>
      codes.map((code) => ({
        __id: String(code.id),
        id: code.id,
        code: code.code,
        type: code.type,
        value: code.value,
        status: code.status,
        used_by: code.used_by,
        used_at: code.used_at ?? null,
        user_email: code.user?.email || null,
        expires_at: code.expires_at ?? null,
        validity_days: code.validity_days,
        group_name: code.group?.name,
      })),
    [codes],
  )

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id))
  const selectionPlugin = useTableSelection<RedeemRow>({
    getIsItemSelected: (row) => selectedIds.has(row.id),
    onSelectItem: ({ item, isSelected }) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (isSelected) next.add(item.id)
        else next.delete(item.id)
        return next
      }),
    onSelectAll: ({ isAllSelected }) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const row of rows) {
          if (isAllSelected) next.add(row.id)
          else next.delete(row.id)
        }
        return next
      }),
    getIsAllSelected: () => allVisibleSelected,
    getIsIndeterminate: () => !allVisibleSelected && rows.some((row) => selectedIds.has(row.id)),
    getRowLabel: (row) => row.code,
  })

  const sortPlugin = useTableSortable<RedeemRow>({
    sort,
    onSortChange: (next) => {
      setSort(next.length > 0 ? next : [{ sortKey: 'id', direction: 'descending' }])
      setPage(1)
    },
  })

  const pagination = useTablePagination<RedeemRow>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: (size) => {
      setPageSize(size)
      setPage(1)
      setPersistedPageSize(size)
    },
    pageSizeOptions,
  })

  const columns = useMemo<TableColumn<RedeemRow>[]>(
    () => [
      {
        key: 'code',
        header: t('admin.redeem.columns.code'),
        width: proportional(1.5, { minWidth: 180 }),
        renderCell: (row) => (
          <HStack gap={1} vAlign="center">
            <Text type="code">{row.code}</Text>
            <IconButton
              label={copiedCode === row.code ? t('admin.redeem.copied') : t('keys.copyToClipboard')}
              tooltip={copiedCode === row.code ? t('admin.redeem.copied') : t('keys.copyToClipboard')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={copiedCode === row.code ? Check : Copy} color={copiedCode === row.code ? 'success' : 'inherit'} />}
              onClick={() => void handleCopyCode(row.code)}
            />
          </HStack>
        ),
      },
      {
        key: 'type',
        header: t('admin.redeem.columns.type'),
        width: pixel(130),
        sortable: true,
        renderCell: (row) => (
          <Badge
            variant={row.type === 'balance' ? 'success' : row.type === 'subscription' ? 'warning' : 'info'}
            label={translateOr(`admin.redeem.types.${row.type}`, row.type)}
          />
        ),
      },
      {
        key: 'value',
        header: t('admin.redeem.columns.value'),
        width: proportional(1, { minWidth: 120 }),
        sortable: true,
        renderCell: (row) => (
          <Text type="supporting" color="primary" hasTabularNumbers>
            {row.type === 'balance'
              ? `$${row.value.toFixed(2)}`
              : row.type === 'subscription'
                ? `${row.validity_days || 30}${t('admin.redeem.days')}${row.group_name ? ` (${row.group_name})` : ''}`
                : row.value}
          </Text>
        ),
      },
      {
        key: 'status',
        header: t('admin.redeem.columns.status'),
        width: pixel(100),
        sortable: true,
        renderCell: (row) => (
          <Badge
            variant={row.status === 'unused' ? 'success' : row.status === 'used' ? 'neutral' : 'error'}
            label={translateOr(`admin.redeem.status.${row.status}`, row.status)}
          />
        ),
      },
      {
        key: 'user_email',
        header: t('admin.redeem.columns.usedBy'),
        width: proportional(1.5),
        renderCell: (row) => (
          <Text type="supporting">
            {row.user_email || (row.used_by ? t('admin.redeem.userPrefix', { id: row.used_by }) : '-')}
          </Text>
        ),
      },
      {
        key: 'used_at',
        header: t('admin.redeem.columns.usedAt'),
        width: pixel(160),
        sortable: true,
        renderCell: (row) => <Text type="supporting">{row.used_at ? formatDateTime(row.used_at) : '-'}</Text>,
      },
      {
        key: 'expires_at',
        header: t('admin.redeem.columns.expiresAt'),
        width: pixel(160),
        sortable: true,
        renderCell: (row) => (
          <Text type="supporting">
            {row.expires_at ? formatDateTime(row.expires_at) : t('admin.redeem.neverExpires')}
          </Text>
        ),
      },
      {
        key: 'actions',
        header: t('admin.redeem.columns.actions'),
        width: pixel(90),
        renderCell: (row) =>
          row.status === 'unused' ? (
            <IconButton
              label={t('common.delete')}
              tooltip={t('common.delete')}
              icon={<Icon icon={Trash2} />}
              variant="ghost"
              onClick={() => setDeletingCode(row)}
            />
          ) : (
            <Text color="secondary">-</Text>
          ),
      },
    ],
    [t, translateOr, copiedCode, handleCopyCode],
  )

  const typeOptions = useMemo(
    () => [
      { value: 'all', label: t('admin.redeem.allTypes') },
      { value: 'balance', label: t('admin.redeem.balance') },
      { value: 'concurrency', label: t('admin.redeem.concurrency') },
      { value: 'subscription', label: t('admin.redeem.subscription') },
      { value: 'invitation', label: t('admin.redeem.invitation') },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('admin.redeem.allStatus') },
      { value: 'unused', label: t('admin.redeem.unused') },
      { value: 'used', label: t('admin.redeem.used') },
      { value: 'expired', label: t('admin.redeem.status.expired') },
      { value: 'disabled', label: t('admin.redeem.status.disabled') },
    ],
    [t],
  )

  return (
    <Page title={t('admin.redeem.title')} description={t('admin.redeem.description')}>
      <VStack gap={4} hAlign="stretch">
        {/* Filters */}
        <Card padding={4}>
          <VStack gap={3} hAlign="stretch">
            <HStack gap={3} wrap="wrap" vAlign="end">
              <StackItem size="fill">
                <TextInput
                  label={t('admin.redeem.filters.search')}
                  value={searchInput}
                  onChange={setSearchInput}
                  placeholder={t('admin.redeem.searchCodes')}
                  hasClear
                />
              </StackItem>
              <Selector
                label={t('admin.redeem.filters.type')}
                value={typeFilter}
                onChange={(val) => {
                  setTypeFilter(val)
                  setPage(1)
                }}
                options={typeOptions}
                width={180}
              />
              <Selector
                label={t('admin.redeem.filters.status')}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val as RedeemStatusFilter)
                  setPage(1)
                }}
                options={statusOptions}
                width={180}
              />
            </HStack>
            <HStack gap={2} wrap="wrap" hAlign="end">
              <IconButton
                label={t('common.refresh')}
                tooltip={t('common.refresh')}
                icon={<Icon icon={RefreshCw} />}
                onClick={() => void loadCodes()}
                isLoading={loading}
              />
              <Button label={t('common.reset')} variant="secondary" onClick={handleReset} />
              <Button
                label={t('admin.redeem.exportCsv')}
                icon={<Icon icon={FileDown} />}
                isLoading={exporting}
                onClick={() => void handleExportCodes()}
              />
              <Button
                label={t('admin.redeem.batchUpdate')}
                icon={<Icon icon={PencilLine} />}
                isDisabled={selectedIds.size === 0}
                onClick={openBatchUpdate}
              />
              <Button
                label={t('admin.redeem.generateCodes')}
                variant="primary"
                icon={<Icon icon={Plus} />}
                onClick={() => setShowGenerateDialog(true)}
              />
            </HStack>
          </VStack>
        </Card>

        <TableSelectionToolbar
          selection={{
            selectedKeys: new Set(Array.from(selectedIds, String)),
            selectedCount: selectedIds.size,
            hasSelection: selectedIds.size > 0,
            clearSelection: () => setSelectedIds(new Set()),
          }}
          renderSelectionLabel={(count) => t('admin.redeem.selectedCount', { count })}
          clearLabel={t('admin.redeem.clearSelection')}
          startContent={<Button size="sm" variant="primary" label={t('admin.redeem.batchUpdate')} onClick={openBatchUpdate} />}
        />

        {/* Table */}
        <Card padding={0}>
          {loading && rows.length === 0 ? (
            <Center padding={8} minHeight={400}>
              <Spinner />
            </Center>
          ) : rows.length === 0 ? (
            <Center padding={8} minHeight={400}>
              <EmptyState
                icon={<Icon icon={Ticket} />}
                title={t('admin.redeem.noCodes')}
                description={t('admin.redeem.noCodesDescription')}
              />
            </Center>
          ) : (
            <Table
              data={rows}
              columns={columns}
              idKey="__id"
              plugins={{ selection: selectionPlugin, sort: sortPlugin, pagination }}
            />
          )}
        </Card>

        {/* Bulk delete is offered while viewing unused codes */}
        {statusFilter === 'unused' && (
          <HStack hAlign="end">
            <Button
              label={t('admin.redeem.deleteAllUnused')}
              variant="destructive"
              icon={<Icon icon={Trash2} />}
              onClick={() => setShowDeleteUnused(true)}
            />
          </HStack>
        )}
      </VStack>

      <GenerateCodesDialog
        isOpen={showGenerateDialog}
        groups={groups}
        onClose={() => setShowGenerateDialog(false)}
        onGenerated={(result) => {
          setShowGenerateDialog(false)
          setGeneratedCodes(result)
          void loadCodes()
        }}
      />

      <GeneratedCodesDialog codes={generatedCodes} onClose={() => setGeneratedCodes(null)} />

      <BatchUpdateDialog
        isOpen={showBatchUpdate}
        selectedIds={Array.from(selectedIds)}
        groups={groups}
        onClose={() => setShowBatchUpdate(false)}
        onUpdated={() => {
          setShowBatchUpdate(false)
          setSelectedIds(new Set())
          void loadCodes()
        }}
      />

      <AlertDialog
        isOpen={deletingCode !== null}
        onOpenChange={(open) => !open && !deleting && setDeletingCode(null)}
        title={t('admin.redeem.deleteCode')}
        description={t('admin.redeem.deleteCodeConfirm')}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void confirmDelete()}
      />

      <AlertDialog
        isOpen={showDeleteUnused}
        onOpenChange={(open) => !open && !deletingUnused && setShowDeleteUnused(false)}
        title={t('admin.redeem.deleteAllUnused')}
        description={t('admin.redeem.deleteAllUnusedConfirm')}
        actionLabel={t('admin.redeem.deleteAll')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deletingUnused}
        onAction={() => void confirmDeleteUnused()}
      />
    </Page>
  )
}
