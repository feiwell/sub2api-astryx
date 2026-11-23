import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import {
  Table,
  proportional,
  pixel,
  useTablePagination,
  useTableSelection,
  useTableSortable,
  type TableColumn,
} from '@astryxdesign/core/Table'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Section } from '@astryxdesign/core/Section'
import {
  RefreshCw,
  Plus,
  Calendar,
  XCircle,
  CalendarClock,
  RotateCcw,
  Undo2,
  CircleHelp,
  ArrowRight,
} from 'lucide-react'
import type { UserSubscription } from '@/types'
import type { SubscriptionBulkAction, SubscriptionBulkActionResult } from '@/api/admin/subscriptions'
import {
  completeBulkSubscriptionOperation,
  prepareBulkSubscriptionOperation,
  type BulkSubscriptionOperation,
} from '@/components/admin/subscription/bulkSubscriptionOperation'
import { formatDateTime, formatDateTimeToMinute } from '@/utils/format'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

interface SubscriptionRow extends Record<string, unknown> {
  __id: string
  id: number
  user_id: number
  user_email: string
  group_name: string
  status: string
  created_at: string
  expires_at: string | null
}

type SortDirection = 'ascending' | 'descending'

const BULK_ACTIONS: SubscriptionBulkAction[] = ['extend', 'reset_quota', 'revoke', 'restore']
const QUOTA_WINDOWS = ['daily', 'weekly', 'monthly'] as const
const MAX_BULK_TARGETS = 100

const errorDetail = (error: unknown): string | undefined =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail

const getDaysRemaining = (expiresAt: string): number | null => {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff < 0) return null
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const subscriptionUserLabel = (sub: UserSubscription | null) => sub?.user?.email || (sub ? `#${sub.user_id}` : '')

/* ------------------------------------------------------------------------- */
/* Generic confirmation dialog for non-destructive actions                   */
/* ------------------------------------------------------------------------- */

function ConfirmActionDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  isLoading,
  onConfirm,
  onClose,
}: {
  isOpen: boolean
  title: string
  message: string
  confirmLabel: string
  isLoading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()} width={440}>
      <Layout
        header={<DialogHeader title={title} onOpenChange={(open) => !open && !isLoading && onClose()} />}
        content={
          <LayoutContent>
            <Text color="secondary">{message}</Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isLoading} onClick={onClose} />
              <Button label={confirmLabel} variant="primary" isLoading={isLoading} onClick={onConfirm} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Adjust (extend / shorten) dialog                                          */
/* ------------------------------------------------------------------------- */

function AdjustSubscriptionDialog({
  subscription,
  onClose,
  onAdjusted,
}: {
  subscription: UserSubscription | null
  onClose: () => void
  onAdjusted: () => void
}) {
  const { t } = useI18n()
  const [days, setDays] = useState<number | null>(30)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (subscription) setDays(30)
  }, [subscription])

  const handleClose = () => {
    if (!submitting) onClose()
  }

  const handleSubmit = async () => {
    if (!subscription) return
    const value = Number(days)
    if (!Number.isInteger(value) || value === 0 || Math.abs(value) > 36500) {
      toast.error(t('admin.subscriptions.adjustOutOfRange'))
      return
    }
    // The adjusted expiration must stay in the future
    if (subscription.expires_at) {
      const newExpiresAt = new Date(new Date(subscription.expires_at).getTime() + value * 24 * 60 * 60 * 1000)
      if (newExpiresAt <= new Date()) {
        toast.error(t('admin.subscriptions.adjustWouldExpire'))
        return
      }
    }
    setSubmitting(true)
    try {
      await adminAPI.subscriptions.extend(subscription.id, { days: value })
      toast.success(t('admin.subscriptions.subscriptionAdjusted'))
      onClose()
      onAdjusted()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.subscriptions.failedToAdjust'))
      console.error('Error adjusting subscription:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog isOpen={subscription !== null} onOpenChange={(open) => !open && handleClose()} width={440} purpose="form">
      <Layout
        header={
          <DialogHeader title={t('admin.subscriptions.adjustSubscription')} onOpenChange={(open) => !open && handleClose()} />
        }
        content={
          <LayoutContent>
            {subscription && (
              <VStack gap={4} hAlign="stretch">
                <Card variant="muted" padding={4}>
                  <MetadataList>
                    <MetadataListItem label={t('admin.subscriptions.adjustingFor')}>
                      <Text weight="medium">{subscriptionUserLabel(subscription)}</Text>
                    </MetadataListItem>
                    <MetadataListItem label={t('admin.subscriptions.currentExpiration')}>
                      <Text weight="medium">
                        {subscription.expires_at
                          ? formatDateTimeToMinute(subscription.expires_at)
                          : t('admin.subscriptions.noExpiration')}
                      </Text>
                    </MetadataListItem>
                    {subscription.expires_at && (
                      <MetadataListItem label={t('admin.subscriptions.remainingDays')}>
                        <Text weight="medium" hasTabularNumbers>
                          {getDaysRemaining(subscription.expires_at) ?? 0}
                        </Text>
                      </MetadataListItem>
                    )}
                  </MetadataList>
                </Card>
                <NumberInput
                  label={t('admin.subscriptions.form.adjustDays')}
                  value={days}
                  onChange={setDays}
                  min={-36500}
                  max={36500}
                  isIntegerOnly
                  isRequired
                  placeholder={t('admin.subscriptions.adjustDaysPlaceholder')}
                  description={t('admin.subscriptions.adjustHint')}
                  onEnter={() => void handleSubmit()}
                />
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={submitting} onClick={handleClose} />
              <Button
                label={submitting ? t('admin.subscriptions.adjusting') : t('admin.subscriptions.adjust')}
                variant="primary"
                isLoading={submitting}
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
/* Bulk action dialog (port of BulkSubscriptionActionDialog.vue)             */
/* ------------------------------------------------------------------------- */

interface BulkTarget {
  id: number
  email?: string
  group?: string
  groupId: number
}

function BulkSubscriptionActionDialog({
  action,
  subscriptions,
  onClose,
  onCompleted,
}: {
  action: SubscriptionBulkAction | null
  subscriptions: UserSubscription[]
  onClose: () => void
  onCompleted: (result: SubscriptionBulkActionResult) => void
}) {
  const { t } = useI18n()
  const [days, setDays] = useState<number | null>(30)
  const [windows, setWindows] = useState({ daily: true, weekly: true, monthly: true })
  const [submitting, setSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [result, setResult] = useState<SubscriptionBulkActionResult | null>(null)
  const [pendingOperation, setPendingOperation] = useState<BulkSubscriptionOperation | null>(null)
  const [submittedAction, setSubmittedAction] = useState<SubscriptionBulkAction | null>(null)
  const [targets, setTargets] = useState<BulkTarget[]>([])

  // Fresh state each time the dialog opens for an action
  useEffect(() => {
    if (!action) return
    setDays(30)
    setWindows({ daily: true, weekly: true, monthly: true })
    setSubmitting(false)
    setRequestError('')
    setResult(null)
    setPendingOperation(null)
    setSubmittedAction(null)
    setTargets(
      subscriptions.map((subscription) => ({
        id: subscription.id,
        email: subscription.user?.email,
        group: subscription.group?.name,
        groupId: subscription.group_id,
      })),
    )
    // Targets are frozen when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  const currentAction = submittedAction ?? action ?? 'extend'
  const parametersLocked = submitting || !!pendingOperation || !!result
  const canClose = !submitting
  const failedResults = result?.results.filter((item) => !item.success) ?? []

  const validationError = (() => {
    if (targets.length === 0) return t('admin.subscriptions.bulk.selectionRequired')
    if (targets.length > MAX_BULK_TARGETS) return t('admin.subscriptions.bulk.selectionLimit')
    if (currentAction === 'extend') {
      const value = Number(days)
      if (!Number.isInteger(value) || value === 0 || Math.abs(value) > 36500) {
        return t('admin.subscriptions.bulk.invalidDays')
      }
    }
    if (currentAction === 'reset_quota' && !QUOTA_WINDOWS.some((w) => windows[w])) {
      return t('admin.subscriptions.bulk.selectWindow')
    }
    return ''
  })()

  const handleClose = () => {
    if (canClose) onClose()
  }

  const failedTargetLabel = (id: number) => {
    const target = targets.find((item) => item.id === id)
    return target?.email ? `${target.email} · #${id}` : `#${id}`
  }

  const submit = async () => {
    if (submitting || result || !action) return
    let operation = pendingOperation
    if (!operation) {
      if (validationError) return
      operation = prepareBulkSubscriptionOperation({
        subscription_ids: targets.map((target) => target.id),
        action,
        ...(action === 'extend' ? { days: Number(days) } : {}),
        ...(action === 'reset_quota' ? windows : {}),
      })
      setPendingOperation(operation)
      setSubmittedAction(action)
    }
    setSubmitting(true)
    setRequestError('')
    try {
      const res = await adminAPI.subscriptions.bulkAction(operation.request, operation.key)
      completeBulkSubscriptionOperation(operation)
      setPendingOperation(null)
      setResult(res)
      onCompleted(res)
    } catch (error) {
      const failure = error as {
        status?: number
        message?: string
        response?: { status?: number; data?: { message?: string } }
      }
      setRequestError(failure?.message || failure?.response?.data?.message || t('admin.subscriptions.bulk.requestFailed'))
      const status = failure?.status ?? failure?.response?.status
      // A timeout, server error or in-progress conflict may arrive after writes.
      // Keep the frozen payload and key so a retry continues the same operation.
      if (!operation.outcomeUncertain && status && status >= 400 && status < 500 && status !== 408 && status !== 409) {
        completeBulkSubscriptionOperation(operation)
        setPendingOperation(null)
        setSubmittedAction(null)
      } else {
        operation.outcomeUncertain = true
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog isOpen={action !== null} onOpenChange={(open) => !open && handleClose()} width={560} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={t(`admin.subscriptions.bulk.${currentAction}`)}
            onOpenChange={canClose ? (open) => !open && handleClose() : undefined}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <VStack gap={2} hAlign="stretch">
                <Text weight="medium">{t('admin.subscriptions.bulk.confirmTargets', { count: targets.length })}</Text>
                <Card padding={0}>
                  <List hasDividers density="compact">
                    {targets.map((target) => (
                      <ListItem
                        key={target.id}
                        label={target.email || `#${target.id}`}
                        description={`${target.group || t('admin.subscriptions.bulk.groupFallback', { id: target.groupId })}${
                          target.email ? ` · #${target.id}` : ''
                        }`}
                      />
                    ))}
                  </List>
                </Card>
              </VStack>

              {currentAction === 'extend' ? (
                <NumberInput
                  label={t('admin.subscriptions.form.adjustDays')}
                  value={days}
                  onChange={setDays}
                  min={-36500}
                  max={36500}
                  isIntegerOnly
                  isDisabled={parametersLocked}
                  placeholder={t('admin.subscriptions.adjustDaysPlaceholder')}
                  description={t('admin.subscriptions.bulk.extendHint')}
                />
              ) : currentAction === 'reset_quota' ? (
                <VStack gap={2} hAlign="stretch">
                  <Text type="label">{t('admin.subscriptions.bulk.resetWindows')}</Text>
                  <HStack gap={5} wrap="wrap">
                    {QUOTA_WINDOWS.map((window) => (
                      <CheckboxInput
                        key={window}
                        label={t(`admin.subscriptions.${window}`)}
                        value={windows[window]}
                        isDisabled={parametersLocked}
                        onChange={(checked) => setWindows((prev) => ({ ...prev, [window]: checked }))}
                      />
                    ))}
                  </HStack>
                  <Text type="supporting">{t('admin.subscriptions.bulk.resetHint')}</Text>
                </VStack>
              ) : (
                <Banner status="warning" title={t(`admin.subscriptions.bulk.${currentAction}Hint`)} />
              )}

              {validationError && !parametersLocked && (
                <Banner status="error" title={validationError} />
              )}

              {requestError && (
                <Banner
                  status="error"
                  title={requestError}
                  description={pendingOperation ? t('admin.subscriptions.bulk.retryHint') : undefined}
                />
              )}

              {result && (
                <VStack gap={3} hAlign="stretch">
                  <Card variant="muted" padding={3}>
                    <Text weight="medium">
                      {t('admin.subscriptions.bulk.result', { success: result.success_count, failed: result.failed_count })}
                    </Text>
                  </Card>
                  {failedResults.map((item) => (
                    <Banner
                      key={item.subscription_id}
                      status="error"
                      title={failedTargetLabel(item.subscription_id)}
                      description={item.error || t('admin.subscriptions.bulk.itemFailed')}
                    />
                  ))}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button
                label={result ? t('common.close') : t('common.cancel')}
                variant="secondary"
                isDisabled={!canClose}
                onClick={handleClose}
              />
              {!result && (
                <Button
                  label={
                    submitting
                      ? t('common.processing')
                      : pendingOperation
                        ? t('admin.subscriptions.bulk.retry')
                        : t('admin.subscriptions.bulk.confirm')
                  }
                  variant={currentAction === 'revoke' ? 'destructive' : 'primary'}
                  isLoading={submitting}
                  isDisabled={!pendingOperation && !!validationError}
                  onClick={() => void submit()}
                />
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Usage guide dialog                                                        */
/* ------------------------------------------------------------------------- */

interface GuideActionRow extends Record<string, unknown> {
  __id: string
  action: string
  desc: string
}

function SubscriptionGuideDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const actionRows: GuideActionRow[] = [
    { __id: 'adjust', action: t('admin.subscriptions.guide.actions.adjust'), desc: t('admin.subscriptions.guide.actions.adjustDesc') },
    {
      __id: 'resetQuota',
      action: t('admin.subscriptions.guide.actions.resetQuota'),
      desc: t('admin.subscriptions.guide.actions.resetQuotaDesc'),
    },
    { __id: 'revoke', action: t('admin.subscriptions.guide.actions.revoke'), desc: t('admin.subscriptions.guide.actions.revokeDesc') },
  ]
  const actionColumns: TableColumn<GuideActionRow>[] = [
    { key: 'action', header: t('admin.subscriptions.columns.actions'), width: pixel(140), renderCell: (row) => <Text weight="medium">{row.action}</Text> },
    { key: 'desc', header: t('astryx.subscriptionsAdmin.guideDescColumn'), width: proportional(1), renderCell: (row) => <Text color="secondary">{row.desc}</Text> },
  ]
  const steps = [
    {
      title: t('admin.subscriptions.guide.step1.title'),
      lines: [t('admin.subscriptions.guide.step1.line1'), t('admin.subscriptions.guide.step1.line2'), t('admin.subscriptions.guide.step1.line3')],
    },
    {
      title: t('admin.subscriptions.guide.step2.title'),
      lines: [t('admin.subscriptions.guide.step2.line1'), t('admin.subscriptions.guide.step2.line2'), t('admin.subscriptions.guide.step2.line3')],
    },
  ]

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={672} maxHeight="85dvh">
      <Layout
        header={
          <DialogHeader
            title={t('admin.subscriptions.guide.title')}
            subtitle={t('admin.subscriptions.guide.subtitle')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={5} hAlign="stretch">
              {steps.map((step, index) => (
                <VStack key={step.title} gap={2} hAlign="stretch">
                  <HStack gap={2} vAlign="center">
                    <Badge variant="info" label={String(index + 1)} />
                    <Heading level={3}>{step.title}</Heading>
                  </HStack>
                  <List listStyle="decimal" density="compact">
                    {step.lines.map((line) => (
                      <ListItem key={line} label={<Text color="secondary">{line}</Text>} />
                    ))}
                  </List>
                  {index === 0 && (
                    <HStack gap={1} vAlign="center">
                      <Link href="/admin/groups" onClick={onClose}>
                        {t('admin.subscriptions.guide.step1.link')}
                      </Link>
                      <Icon icon={ArrowRight} size="xsm" color="accent" />
                    </HStack>
                  )}
                </VStack>
              ))}
              <VStack gap={2} hAlign="stretch">
                <HStack gap={2} vAlign="center">
                  <Badge variant="info" label="3" />
                  <Heading level={3}>{t('admin.subscriptions.guide.step3.title')}</Heading>
                </HStack>
                <Card padding={0}>
                  <Table columns={actionColumns} data={actionRows} idKey="__id" density="compact" />
                </Card>
              </VStack>
              <Banner status="info" title={t('admin.subscriptions.guide.tip')} />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="primary" onClick={onClose} />
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

export function AdminSubscriptionsPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [total, setTotal] = useState(0)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])

  // Sorting
  const [sort, setSort] = useState<Array<{ sortKey: string; direction: SortDirection }>>([
    { sortKey: 'created_at', direction: 'descending' },
  ])
  const sortBy = sort[0]?.sortKey || 'created_at'
  const sortOrder: 'asc' | 'desc' = sort[0]?.direction === 'ascending' ? 'asc' : 'desc'

  // Selection is limited to the current page and cleared on page/filter/sort changes
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // Dialogs
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignForm, setAssignForm] = useState({ user_id: '', group_id: '', validity_days: 30 })
  const [showGuide, setShowGuide] = useState(false)
  const [extendingSubscription, setExtendingSubscription] = useState<UserSubscription | null>(null)
  const [revokingSubscription, setRevokingSubscription] = useState<UserSubscription | null>(null)
  const [restoringSubscription, setRestoringSubscription] = useState<UserSubscription | null>(null)
  const [resettingSubscription, setResettingSubscription] = useState<UserSubscription | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [bulkAction, setBulkAction] = useState<SubscriptionBulkAction | null>(null)
  const [bulkSubscriptions, setBulkSubscriptions] = useState<UserSubscription[]>([])

  const loadSubscriptions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await adminAPI.subscriptions.list(page, pageSize, {
        status: statusFilter !== 'all' ? (statusFilter as 'active' | 'expired' | 'revoked') : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      setSubscriptions(response.items)
      setTotal(response.total)
      const visibleIds = new Set(response.items.map((subscription) => subscription.id))
      setSelectedIds((prev) => new Set([...prev].filter((id) => visibleIds.has(id))))
    } catch (error) {
      toast.error(t('admin.subscriptions.failedToLoad'))
      console.error('Failed to load subscriptions:', error)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, sortBy, sortOrder, t])

  useEffect(() => {
    void loadSubscriptions()
  }, [loadSubscriptions])

  const handleReset = () => {
    setStatusFilter('all')
    setPage(1)
    clearSelection()
  }

  const handleAssign = async () => {
    if (!assignForm.user_id || !assignForm.group_id) {
      toast.error(t('admin.subscriptions.fillRequired'))
      return
    }
    setAssigning(true)
    try {
      await adminAPI.subscriptions.assign({
        user_id: Number(assignForm.user_id),
        group_id: Number(assignForm.group_id),
        validity_days: assignForm.validity_days,
      })
      toast.success(t('admin.subscriptions.subscriptionAssigned'))
      setShowAssignDialog(false)
      setAssignForm({ user_id: '', group_id: '', validity_days: 30 })
      void loadSubscriptions()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.subscriptions.failedToAssign'))
      console.error('Failed to assign subscription:', error)
    } finally {
      setAssigning(false)
    }
  }

  const confirmRevoke = async () => {
    if (!revokingSubscription) return
    setActionBusy(true)
    try {
      await adminAPI.subscriptions.revoke(revokingSubscription.id)
      toast.success(t('admin.subscriptions.subscriptionRevoked'))
      setRevokingSubscription(null)
      void loadSubscriptions()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.subscriptions.failedToRevoke'))
      console.error('Failed to revoke subscription:', error)
    } finally {
      setActionBusy(false)
    }
  }

  const confirmRestore = async () => {
    if (!restoringSubscription) return
    setActionBusy(true)
    try {
      await adminAPI.subscriptions.restore(restoringSubscription.id)
      toast.success(t('admin.subscriptions.subscriptionRestored'))
      setRestoringSubscription(null)
      void loadSubscriptions()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.subscriptions.failedToRestore'))
      console.error('Error restoring subscription:', error)
    } finally {
      setActionBusy(false)
    }
  }

  const confirmResetQuota = async () => {
    if (!resettingSubscription || actionBusy) return
    setActionBusy(true)
    try {
      await adminAPI.subscriptions.resetQuota(resettingSubscription.id, { daily: true, weekly: true, monthly: true })
      toast.success(t('admin.subscriptions.quotaResetSuccess'))
      setResettingSubscription(null)
      await loadSubscriptions()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.subscriptions.failedToResetQuota'))
      console.error('Error resetting quota:', error)
    } finally {
      setActionBusy(false)
    }
  }

  // Each bulk action only processes selected subscriptions with an applicable status
  const bulkTargets = useMemo(() => {
    const selected = subscriptions.filter((subscription) => selectedIds.has(subscription.id))
    return {
      extend: selected.filter((s) => s.status === 'active' || s.status === 'expired'),
      reset_quota: selected.filter((s) => s.status === 'active'),
      revoke: selected.filter((s) => s.status === 'active'),
      restore: selected.filter((s) => s.status === 'revoked'),
    } satisfies Record<SubscriptionBulkAction, UserSubscription[]>
  }, [subscriptions, selectedIds])

  const openBulkAction = (action: SubscriptionBulkAction) => {
    if (loading || bulkTargets[action].length === 0) return
    setBulkSubscriptions([...bulkTargets[action]])
    setBulkAction(action)
  }

  const handleBulkCompleted = (result: SubscriptionBulkActionResult) => {
    const succeeded = new Set(result.results.filter((item) => item.success).map((item) => item.subscription_id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => !succeeded.has(id))))
    void loadSubscriptions()
  }

  const subscriptionById = useMemo(() => new Map(subscriptions.map((s) => [s.id, s])), [subscriptions])

  const rows = useMemo<SubscriptionRow[]>(
    () =>
      subscriptions.map((sub) => ({
        __id: String(sub.id),
        id: sub.id,
        user_id: sub.user_id,
        user_email: sub.user?.email || sub.user?.username || t('astryx.userFallback', { id: sub.user_id }),
        group_name: sub.group?.name || '-',
        status: sub.status,
        created_at: sub.created_at,
        expires_at: sub.expires_at,
      })),
    [subscriptions, t],
  )

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id))
  const selectionPlugin = useTableSelection<SubscriptionRow>({
    getIsItemSelected: (row) => selectedIds.has(row.id),
    onSelectItem: ({ item, isSelected }) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (isSelected) next.add(item.id)
        else next.delete(item.id)
        return next
      }),
    onSelectAll: ({ isAllSelected }) => setSelectedIds(isAllSelected ? new Set(rows.map((row) => row.id)) : new Set()),
    getIsAllSelected: () => allVisibleSelected,
    getIsIndeterminate: () => !allVisibleSelected && rows.some((row) => selectedIds.has(row.id)),
    getRowLabel: (row) => t('admin.subscriptions.bulk.selectSubscription', { id: row.id }),
  })

  const sortPlugin = useTableSortable<SubscriptionRow>({
    sort,
    onSortChange: (next) => {
      setSort(next.length > 0 ? next : [{ sortKey: 'created_at', direction: 'descending' }])
      setPage(1)
      clearSelection()
    },
  })

  const paginationPlugin = useTablePagination<SubscriptionRow>({
    page,
    onPageChange: (next) => {
      setPage(next)
      clearSelection()
    },
    totalItems: total,
    pageSize,
    onPageSizeChange: (newSize) => {
      setPageSize(newSize)
      setPage(1)
      setPersistedPageSize(newSize)
      clearSelection()
    },
    pageSizeOptions,
  })

  const columns = useMemo<TableColumn<SubscriptionRow>[]>(
    () => [
      {
        key: 'id',
        header: 'ID',
        width: pixel(80),
        renderCell: (row) => (
          <Text type="supporting" hasTabularNumbers>
            {row.id}
          </Text>
        ),
      },
      {
        key: 'user_email',
        header: t('admin.subscriptions.columns.user'),
        width: proportional(2),
        renderCell: (row) => <Link href={`/admin/usage?user_id=${row.user_id}`}>{row.user_email}</Link>,
      },
      {
        key: 'group_name',
        header: t('admin.subscriptions.columns.group'),
        width: proportional(1.5),
        renderCell: (row) => <Text type="supporting">{row.group_name}</Text>,
      },
      {
        key: 'status',
        header: t('admin.subscriptions.columns.status'),
        width: pixel(120),
        sortable: true,
        renderCell: (row) => (
          <Badge
            variant={row.status === 'active' ? 'success' : row.status === 'expired' ? 'warning' : 'error'}
            label={t(`admin.subscriptions.status.${row.status}`)}
          />
        ),
      },
      {
        key: 'created_at',
        header: t('admin.subscriptions.columns.createdAt'),
        width: pixel(160),
        sortable: true,
        renderCell: (row) => <Text type="supporting">{formatDateTime(row.created_at)}</Text>,
      },
      {
        key: 'expires_at',
        header: t('admin.subscriptions.columns.expires'),
        width: pixel(170),
        sortable: true,
        renderCell: (row) => {
          if (!row.expires_at) return <Text type="supporting">{t('admin.subscriptions.noExpiration')}</Text>
          const remaining = getDaysRemaining(row.expires_at)
          return (
            <VStack gap={0.5}>
              <Text type="supporting" color="primary">
                {formatDateTimeToMinute(row.expires_at)}
              </Text>
              {remaining !== null && (
                <Text type="supporting">{t('admin.subscriptions.daysRemaining', { days: remaining })}</Text>
              )}
            </VStack>
          )
        },
      },
      {
        key: 'actions',
        header: t('admin.subscriptions.columns.actions'),
        width: pixel(160),
        renderCell: (row) => {
          const subscription = subscriptionById.get(row.id)
          if (!subscription) return null
          return (
            <HStack gap={1}>
              {(row.status === 'active' || row.status === 'expired') && (
                <IconButton
                  label={t('admin.subscriptions.adjust')}
                  tooltip={t('admin.subscriptions.adjust')}
                  icon={<Icon icon={CalendarClock} />}
                  variant="ghost"
                  onClick={() => setExtendingSubscription(subscription)}
                />
              )}
              {row.status === 'active' && (
                <IconButton
                  label={t('admin.subscriptions.resetQuota')}
                  tooltip={t('admin.subscriptions.resetQuota')}
                  icon={<Icon icon={RotateCcw} />}
                  variant="ghost"
                  isLoading={actionBusy && resettingSubscription?.id === row.id}
                  onClick={() => setResettingSubscription(subscription)}
                />
              )}
              {row.status === 'active' && (
                <IconButton
                  label={t('admin.subscriptions.revoke')}
                  tooltip={t('admin.subscriptions.revoke')}
                  icon={<Icon icon={XCircle} />}
                  variant="ghost"
                  onClick={() => setRevokingSubscription(subscription)}
                />
              )}
              {row.status === 'revoked' && (
                <IconButton
                  label={t('admin.subscriptions.restore')}
                  tooltip={t('admin.subscriptions.restore')}
                  icon={<Icon icon={Undo2} />}
                  variant="ghost"
                  onClick={() => setRestoringSubscription(subscription)}
                />
              )}
            </HStack>
          )
        },
      },
    ],
    [t, subscriptionById, actionBusy, resettingSubscription],
  )

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('admin.subscriptions.allStatus') },
      { value: 'active', label: t('admin.subscriptions.status.active') },
      { value: 'expired', label: t('admin.subscriptions.status.expired') },
      { value: 'revoked', label: t('admin.subscriptions.status.revoked') },
    ],
    [t],
  )

  return (
    <Page
      title={t('admin.subscriptions.title')}
      description={t('admin.subscriptions.description')}
      actions={
        <>
          <IconButton
            label={t('common.refresh')}
            tooltip={t('common.refresh')}
            icon={<Icon icon={RefreshCw} />}
            isLoading={loading}
            onClick={() => void loadSubscriptions()}
          />
          <IconButton
            label={t('admin.subscriptions.guide.showGuide')}
            tooltip={t('admin.subscriptions.guide.showGuide')}
            icon={<Icon icon={CircleHelp} />}
            onClick={() => setShowGuide(true)}
          />
          <Button
            variant="primary"
            label={t('admin.subscriptions.assignSubscription')}
            icon={<Icon icon={Plus} />}
            onClick={() => setShowAssignDialog(true)}
          />
        </>
      }
    >
      <VStack gap={4} hAlign="stretch">
        {/* Filters */}
        <Section padding={4}>
          <HStack gap={3} vAlign="end" wrap="wrap">
            <Selector
              label={t('admin.subscriptions.columns.status')}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val)
                setPage(1)
                clearSelection()
              }}
              options={statusOptions}
              width={200}
            />
            <Button variant="secondary" onClick={handleReset} label={t('common.reset')} />
          </HStack>
        </Section>

        {/* Bulk actions for the selected subscriptions */}
        {selectedIds.size > 0 && (
          <Card variant="blue" padding={3}>
            <VStack gap={2} hAlign="stretch">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Text weight="medium">{t('admin.subscriptions.bulk.selected', { count: selectedIds.size })}</Text>
                {BULK_ACTIONS.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={action === 'revoke' ? 'destructive' : 'secondary'}
                    label={`${t(`admin.subscriptions.bulk.${action}`)} (${bulkTargets[action].length})`}
                    isDisabled={loading || bulkTargets[action].length === 0}
                    onClick={() => openBulkAction(action)}
                  />
                ))}
                <Button size="sm" variant="ghost" label={t('admin.subscriptions.bulk.clearSelection')} onClick={clearSelection} />
              </HStack>
              <Text type="supporting">{t('admin.subscriptions.bulk.selectionHint')}</Text>
            </VStack>
          </Card>
        )}

        {/* Table */}
        <Section padding={0}>
          {loading && rows.length === 0 ? (
            <Center padding={8} minHeight={400}>
              <Spinner />
            </Center>
          ) : rows.length === 0 ? (
            <Center padding={8} minHeight={400}>
              <EmptyState
                icon={<Icon icon={Calendar} />}
                title={t('admin.subscriptions.noSubscriptionsYet')}
                description={t('admin.subscriptions.assignFirstSubscription')}
                actions={
                  <Button
                    variant="primary"
                    label={t('admin.subscriptions.assignSubscription')}
                    onClick={() => setShowAssignDialog(true)}
                  />
                }
              />
            </Center>
          ) : (
            <Table
              data={rows}
              columns={columns}
              idKey="__id"
              plugins={{ selection: selectionPlugin, sort: sortPlugin, pagination: paginationPlugin }}
            />
          )}
        </Section>
      </VStack>

      {/* Assign Dialog */}
      <Dialog isOpen={showAssignDialog} onOpenChange={(open) => !open && !assigning && setShowAssignDialog(false)} width={440} purpose="form">
        <Layout
          header={
            <DialogHeader
              title={t('admin.subscriptions.assignSubscription')}
              onOpenChange={(open) => !open && !assigning && setShowAssignDialog(false)}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <TextInput
                  label={t('admin.subscriptions.form.userId')}
                  inputMode="numeric"
                  value={assignForm.user_id}
                  onChange={(value) => setAssignForm((prev) => ({ ...prev, user_id: value }))}
                  placeholder={t('admin.subscriptions.form.userIdPlaceholder')}
                  isRequired
                />
                <TextInput
                  label={t('admin.subscriptions.form.groupId')}
                  inputMode="numeric"
                  value={assignForm.group_id}
                  onChange={(value) => setAssignForm((prev) => ({ ...prev, group_id: value }))}
                  placeholder={t('admin.subscriptions.form.groupIdPlaceholder')}
                  description={t('admin.subscriptions.groupHint')}
                  isRequired
                />
                <NumberInput
                  label={t('admin.subscriptions.form.validityDays')}
                  value={assignForm.validity_days}
                  onChange={(value) => setAssignForm((prev) => ({ ...prev, validity_days: value }))}
                  min={1}
                  max={36500}
                  isIntegerOnly
                  description={t('admin.subscriptions.validityHint')}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  variant="secondary"
                  isDisabled={assigning}
                  onClick={() => setShowAssignDialog(false)}
                  label={t('common.cancel')}
                />
                <Button
                  variant="primary"
                  onClick={() => void handleAssign()}
                  isLoading={assigning}
                  label={assigning ? t('admin.subscriptions.assigning') : t('admin.subscriptions.assign')}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AdjustSubscriptionDialog
        subscription={extendingSubscription}
        onClose={() => setExtendingSubscription(null)}
        onAdjusted={() => void loadSubscriptions()}
      />

      <AlertDialog
        isOpen={revokingSubscription !== null}
        onOpenChange={(open) => !open && !actionBusy && setRevokingSubscription(null)}
        title={t('admin.subscriptions.revokeSubscription')}
        description={t('admin.subscriptions.revokeConfirm', { user: subscriptionUserLabel(revokingSubscription) })}
        actionLabel={t('admin.subscriptions.revoke')}
        cancelLabel={t('common.cancel')}
        isActionLoading={actionBusy}
        onAction={() => void confirmRevoke()}
      />

      <ConfirmActionDialog
        isOpen={restoringSubscription !== null}
        title={t('admin.subscriptions.restoreSubscription')}
        message={t('admin.subscriptions.restoreConfirm', { user: subscriptionUserLabel(restoringSubscription) })}
        confirmLabel={t('admin.subscriptions.restore')}
        isLoading={actionBusy}
        onConfirm={() => void confirmRestore()}
        onClose={() => setRestoringSubscription(null)}
      />

      <ConfirmActionDialog
        isOpen={resettingSubscription !== null}
        title={t('admin.subscriptions.resetQuotaTitle')}
        message={t('admin.subscriptions.resetQuotaConfirm', { user: subscriptionUserLabel(resettingSubscription) })}
        confirmLabel={t('admin.subscriptions.resetQuota')}
        isLoading={actionBusy}
        onConfirm={() => void confirmResetQuota()}
        onClose={() => setResettingSubscription(null)}
      />

      <BulkSubscriptionActionDialog
        action={bulkAction}
        subscriptions={bulkSubscriptions}
        onClose={() => setBulkAction(null)}
        onCompleted={handleBulkCompleted}
      />

      <SubscriptionGuideDialog isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </Page>
  )
}
