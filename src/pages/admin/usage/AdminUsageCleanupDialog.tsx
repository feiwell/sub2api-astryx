import { Fragment, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Pagination } from '@astryxdesign/core/Pagination'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { UsageCleanupTask } from '@/api/admin/usage'
import { extractApiErrorMessage } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { USAGE_RANGE_PRESETS, latestPickableDate } from '~/pages/user/usage/usageQuery'
import { AdminUsageFilterFields, type FilterTarget } from './AdminUsageFilterBar'
import { buildCleanupRequest, cleanupFiltersOf } from './adminUsageQuery'
import type { AdminUsage } from './useAdminUsage'
import { CLEANUP_TASKS_PER_PAGE, useCleanupTasks } from './useCleanupTasks'

const NOT_SET = '--'

const TASK_STATUSES: Record<string, { variant: BadgeVariant; labelKey: string }> = {
  pending: { variant: 'warning', labelKey: 'admin.usage.cleanup.status.pending' },
  running: { variant: 'info', labelKey: 'admin.usage.cleanup.status.running' },
  succeeded: { variant: 'success', labelKey: 'admin.usage.cleanup.status.succeeded' },
  failed: { variant: 'error', labelKey: 'admin.usage.cleanup.status.failed' },
  canceled: { variant: 'neutral', labelKey: 'admin.usage.cleanup.status.canceled' },
}

// A task that has ended, either way, has nothing left to call off.
const canBeCancelled = (task: UsageCleanupTask) => task.status === 'pending' || task.status === 'running'

/** A server time as the reader's clock shows it; one that is no date is shown as sent. */
const when = (value?: string | null) => (value ? formatDateTime(value) || value : NOT_SET)

/** The time zone the days of a cleanup are days of: the browser's. */
function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function CleanupTaskRow({ task, onCancel }: { task: UsageCleanupTask; onCancel: () => void }) {
  const { t } = useI18n()
  const status = TASK_STATUSES[task.status]
  const range = `${t('admin.usage.cleanup.range')}: ${when(task.filters.start_time)} ~ ${when(task.filters.end_time)}`
  const deleted = `${t('admin.usage.cleanup.deletedRows')}: ${(task.deleted_rows || 0).toLocaleString()}`
  return (
    <VStack gap={1} hAlign="stretch">
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <HStack gap={2} vAlign="center">
          {/* A status this app does not know is shown as the server sent it. */}
          <Badge variant={status?.variant ?? 'neutral'} label={status ? t(status.labelKey) : task.status} />
          <Text type="supporting" color="secondary" hasTabularNumbers>{`#${task.id}`}</Text>
          {canBeCancelled(task) && (
            <Button label={t('admin.usage.cleanup.cancel')} variant="secondary" size="sm" onClick={onCancel} />
          )}
        </HStack>
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {when(task.created_at)}
        </Text>
      </HStack>
      {/* One run of text: a narrow dialog then breaks it like text, not into rows set apart. */}
      <Text type="supporting" color="secondary" hasTabularNumbers>
        {`${range} · ${deleted}`}
      </Text>
      {task.error_message && <FieldStatus type="error" message={task.error_message} variant="detached" />}
    </VStack>
  )
}

/**
 * Deletes usage records for good: the ones of a date range that the filters match. Deleting is a task the
 * server runs in its own time, so the dialog also lists the tasks of late, and a task not yet done can be
 * called off. Port of components/admin/usage/UsageCleanupDialog.vue.
 */
export function AdminUsageCleanupDialog({ usage, onClose }: { usage: AdminUsage; onClose: () => void }) {
  const { t } = useI18n()
  // The cleanup starts from what the page is narrowed to, and is narrowed on its own from there.
  const [filters, setFilters] = useState(usage.filters)
  const tasks = useCleanupTasks()
  const [isConfirming, setConfirming] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [taskToCancel, setTaskToCancel] = useState<UsageCleanupTask | null>(null)
  const [isCancelling, setCancelling] = useState(false)

  const target: FilterTarget = {
    filters,
    changeFilters: (patch) => setFilters((current) => ({ ...current, ...patch })),
    modelNames: usage.modelNames,
    groups: usage.groups,
  }

  const submit = () => {
    setSubmitting(true)
    adminAPI.usage
      .createCleanupTask(buildCleanupRequest(cleanupFiltersOf(filters), browserTimezone()))
      .then(() => {
        toast.success(t('admin.usage.cleanup.submitSuccess'))
        // The new task is the first of the first page.
        tasks.reload(1)
      })
      .catch((error) => {
        console.error('[admin-usage] failed to create a cleanup task', error)
        toast.error(extractApiErrorMessage(error, t('admin.usage.cleanup.submitFailed')))
      })
      .finally(() => {
        setSubmitting(false)
        setConfirming(false)
      })
  }

  const cancelTask = () => {
    if (!taskToCancel) return
    setCancelling(true)
    adminAPI.usage
      .cancelCleanupTask(taskToCancel.id)
      .then(() => {
        toast.success(t('admin.usage.cleanup.cancelSuccess'))
        tasks.reload()
      })
      .catch((error) => {
        console.error('[admin-usage] failed to cancel a cleanup task', error)
        toast.error(extractApiErrorMessage(error, t('admin.usage.cleanup.cancelFailed')))
      })
      .finally(() => {
        setCancelling(false)
        setTaskToCancel(null)
      })
  }

  const close = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }
  const range = `${t('admin.usage.cleanup.range')}: ${filters.range.start} ~ ${filters.range.end}`

  return (
    <>
      <Dialog isOpen onOpenChange={close} width={960} maxHeight="90dvh" purpose="form">
        <Layout
          header={<DialogHeader title={t('admin.usage.cleanup.title')} onOpenChange={close} />}
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <DateRangeInput
                  label={t('admin.usage.cleanup.range')}
                  width={280}
                  value={filters.range}
                  // A cleanup always has a range; there is nothing to clear it to.
                  hasClear={false}
                  max={latestPickableDate()}
                  presets={USAGE_RANGE_PRESETS.map((preset) => ({
                    label: t(preset.labelKey),
                    getRange: () => preset.range(),
                  }))}
                  onChange={(picked) => {
                    if (picked) target.changeFilters({ range: picked })
                  }}
                />
                <AdminUsageFilterFields target={target} scope="cleanup" />

                <Banner status="warning" title={t('admin.usage.cleanup.warning')} />

                <Card padding={4}>
                  <VStack gap={3} hAlign="stretch">
                    <HStack gap={3} hAlign="between" vAlign="center">
                      <Heading level={4}>{t('admin.usage.cleanup.recentTasks')}</Heading>
                      <Button
                        label={t('common.refresh')}
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon={ArrowPathIcon} />}
                        isLoading={tasks.isLoading}
                        onClick={() => tasks.reload()}
                      />
                    </HStack>

                    {tasks.tasks.length > 0 ? (
                      <VStack gap={3} hAlign="stretch">
                        {tasks.tasks.map((task, index) => (
                          <Fragment key={task.id}>
                            {index > 0 && <Divider />}
                            <CleanupTaskRow task={task} onCancel={() => setTaskToCancel(task)} />
                          </Fragment>
                        ))}
                      </VStack>
                    ) : tasks.hasFailed && !tasks.isLoading ? (
                      // Not "no tasks": there may well be some.
                      <Banner status="error" title={t('admin.usage.cleanup.loadFailed')} />
                    ) : (
                      <Text type="supporting" color="secondary">
                        {tasks.isLoading ? t('admin.usage.cleanup.loadingTasks') : t('admin.usage.cleanup.noTasks')}
                      </Text>
                    )}

                    {tasks.total > CLEANUP_TASKS_PER_PAGE && (
                      <HStack hAlign="end">
                        <Pagination
                          page={tasks.page}
                          onChange={tasks.setPage}
                          totalItems={tasks.total}
                          pageSize={CLEANUP_TASKS_PER_PAGE}
                          variant="input"
                          size="sm"
                        />
                      </HStack>
                    )}
                  </VStack>
                </Card>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
                <Button
                  label={isSubmitting ? t('admin.usage.cleanup.submitting') : t('admin.usage.cleanup.submit')}
                  variant="destructive"
                  isLoading={isSubmitting}
                  onClick={() => setConfirming(true)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {isConfirming && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen && !isSubmitting) setConfirming(false)
          }}
          title={t('admin.usage.cleanup.confirmTitle')}
          // The days about to be emptied are said once more, where they are agreed to.
          description={`${t('admin.usage.cleanup.confirmMessage')} (${range})`}
          actionLabel={t('admin.usage.cleanup.confirmSubmit')}
          cancelLabel={t('common.cancel')}
          isActionLoading={isSubmitting}
          onAction={submit}
        />
      )}

      {taskToCancel && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen && !isCancelling) setTaskToCancel(null)
          }}
          title={t('admin.usage.cleanup.cancelConfirmTitle')}
          description={`${t('admin.usage.cleanup.cancelConfirmMessage')} (#${taskToCancel.id})`}
          actionLabel={t('admin.usage.cleanup.cancelConfirm')}
          // "Cancel" beside "confirm cancelling" would read as the same thing.
          cancelLabel={t('common.close')}
          isActionLoading={isCancelling}
          onAction={cancelTask}
        />
      )}
    </>
  )
}
