import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { InfoTip } from '@astryxdesign/core/InfoTip'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Switch } from '@astryxdesign/core/Switch'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type { ClaudeModel, ScheduledTestPlan, ScheduledTestResult } from '@/types'
import { formatDateTime } from '@/utils/format'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const RESULT_BLOCK_MAX_HEIGHT = 'calc(var(--spacing-8) * 4)'
const RESULTS_LIST_MAX_HEIGHT = 'calc(var(--spacing-12) * 5)'
const DEFAULT_MAX_RESULTS = 100
const CRON_PLACEHOLDER = '*/30 * * * *'

interface PlanForm {
  model_id: string
  cron_expression: string
  max_results: number | null
  enabled: boolean
  auto_recover: boolean
}

const EMPTY_FORM: PlanForm = {
  model_id: '',
  cron_expression: '',
  max_results: DEFAULT_MAX_RESULTS,
  enabled: true,
  auto_recover: false,
}

interface ScheduledTestsDialogProps {
  isOpen: boolean
  accountId: number | null
  onClose: () => void
}

/**
 * Port of components/admin/account/ScheduledTestsPanel.vue: lists the scheduled
 * connectivity-test plans of one account, creates/edits/deletes them and shows
 * the recent results of an expanded plan. Model choices come from the account's
 * available models.
 */
export function ScheduledTestsDialog({ isOpen, accountId, onClose }: ScheduledTestsDialogProps) {
  const { t } = useI18n()
  const [plans, setPlans] = useState<ScheduledTestPlan[]>([])
  const [models, setModels] = useState<ClaudeModel[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPlan, setNewPlan] = useState<PlanForm>(EMPTY_FORM)
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<PlanForm>(EMPTY_FORM)
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null)
  const [results, setResults] = useState<ScheduledTestResult[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [expandedResultIds, setExpandedResultIds] = useState<Set<number>>(new Set())
  const [deletingPlan, setDeletingPlan] = useState<ScheduledTestPlan | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Drops results that arrive after the expanded plan changed
  const resultsRequestId = useRef(0)

  const loadPlans = useCallback(async () => {
    if (accountId == null) return
    setLoading(true)
    try {
      setPlans(await adminAPI.scheduledTests.listByAccount(accountId))
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.accounts.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [accountId, t])

  useEffect(() => {
    if (!isOpen || accountId == null) {
      setPlans([])
      setResults([])
      setModels([])
      setExpandedPlanId(null)
      setExpandedResultIds(new Set())
      setShowAddForm(false)
      setEditingPlanId(null)
      setDeletingPlan(null)
      resultsRequestId.current++
      return
    }
    setNewPlan(EMPTY_FORM)
    void loadPlans()
    // Model choices are best-effort: the plan form still accepts a typed cron
    void adminAPI.accounts
      .getAvailableModels(accountId)
      .then(setModels)
      .catch(() => setModels([]))
  }, [isOpen, accountId, loadPlans])

  const modelOptions = useMemo(
    () => models.map((model) => ({ value: model.id, label: model.display_name || model.id })),
    [models],
  )

  const cronHelp = useMemo(
    () =>
      [
        t('admin.scheduledTests.cronTooltipTitle'),
        t('admin.scheduledTests.cronTooltipMeaning'),
        t('admin.scheduledTests.cronTooltipExampleEvery30Min'),
        t('admin.scheduledTests.cronTooltipExampleHourly'),
        t('admin.scheduledTests.cronTooltipExampleDaily'),
        t('admin.scheduledTests.cronTooltipExampleWeekly'),
        t('admin.scheduledTests.cronTooltipRange'),
      ].join('\n'),
    [t],
  )

  const maxResultsHelp = useMemo(
    () =>
      [
        t('admin.scheduledTests.maxResultsTooltipTitle'),
        t('admin.scheduledTests.maxResultsTooltipMeaning'),
        t('admin.scheduledTests.maxResultsTooltipBody'),
        t('admin.scheduledTests.maxResultsTooltipExample'),
        t('admin.scheduledTests.maxResultsTooltipRange'),
      ].join('\n'),
    [t],
  )

  const handleCreate = async () => {
    if (accountId == null || !newPlan.model_id || !newPlan.cron_expression.trim()) return
    setSaving(true)
    try {
      await adminAPI.scheduledTests.create({
        account_id: accountId,
        model_id: newPlan.model_id,
        cron_expression: newPlan.cron_expression.trim(),
        enabled: newPlan.enabled,
        max_results: newPlan.max_results || DEFAULT_MAX_RESULTS,
        auto_recover: newPlan.auto_recover,
      })
      toast.success(t('admin.scheduledTests.createSuccess'))
      setShowAddForm(false)
      setNewPlan(EMPTY_FORM)
      await loadPlans()
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEnabled = async (plan: ScheduledTestPlan, enabled: boolean) => {
    try {
      const updated = await adminAPI.scheduledTests.update(plan.id, { enabled })
      setPlans((prev) => prev.map((item) => (item.id === plan.id ? updated : item)))
      toast.success(t('admin.scheduledTests.updateSuccess'))
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('common.saveFailed'))
    }
  }

  const startEdit = (plan: ScheduledTestPlan) => {
    setEditingPlanId(plan.id)
    setEditForm({
      model_id: plan.model_id,
      cron_expression: plan.cron_expression,
      max_results: plan.max_results,
      enabled: plan.enabled,
      auto_recover: plan.auto_recover,
    })
  }

  const handleUpdate = async () => {
    if (editingPlanId == null || !editForm.model_id || !editForm.cron_expression.trim()) return
    setSaving(true)
    try {
      const updated = await adminAPI.scheduledTests.update(editingPlanId, {
        model_id: editForm.model_id,
        cron_expression: editForm.cron_expression.trim(),
        max_results: editForm.max_results || DEFAULT_MAX_RESULTS,
        enabled: editForm.enabled,
        auto_recover: editForm.auto_recover,
      })
      setPlans((prev) => prev.map((item) => (item.id === editingPlanId ? updated : item)))
      toast.success(t('admin.scheduledTests.updateSuccess'))
      setEditingPlanId(null)
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingPlan) return
    setDeleting(true)
    try {
      await adminAPI.scheduledTests.delete(deletingPlan.id)
      toast.success(t('admin.scheduledTests.deleteSuccess'))
      setPlans((prev) => prev.filter((item) => item.id !== deletingPlan.id))
      if (expandedPlanId === deletingPlan.id) {
        setExpandedPlanId(null)
        setResults([])
      }
      setDeletingPlan(null)
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('common.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  const toggleExpand = async (planId: number) => {
    resultsRequestId.current++
    setExpandedResultIds(new Set())
    if (expandedPlanId === planId) {
      setExpandedPlanId(null)
      setResults([])
      return
    }
    setExpandedPlanId(planId)
    setResults([])
    setLoadingResults(true)
    const requestId = resultsRequestId.current
    try {
      const data = await adminAPI.scheduledTests.listResults(planId, 20)
      if (requestId !== resultsRequestId.current) return
      setResults(data)
    } catch (error) {
      if (requestId !== resultsRequestId.current) return
      toast.error((error as { message?: string })?.message || t('admin.accounts.failedToLoad'))
      setResults([])
    } finally {
      if (requestId === resultsRequestId.current) setLoadingResults(false)
    }
  }

  const toggleResultDetail = (resultId: number) => {
    setExpandedResultIds((prev) => {
      const next = new Set(prev)
      if (next.has(resultId)) next.delete(resultId)
      else next.add(resultId)
      return next
    })
  }

  const renderForm = (form: PlanForm, setForm: (next: PlanForm) => void, onSubmit: () => void, onCancel: () => void) => (
    <VStack gap={3} hAlign="stretch">
      <HStack gap={3} wrap="wrap">
        <StackItem size="fill">
          <Selector
            label={t('admin.scheduledTests.model')}
            placeholder={t('admin.scheduledTests.model')}
            options={modelOptions}
            hasSearch={modelOptions.length > 5}
            value={form.model_id}
            onChange={(model_id) => setForm({ ...form, model_id })}
          />
        </StackItem>
        <StackItem size="fill">
          <TextInput
            label={t('admin.scheduledTests.cronExpression')}
            labelTooltip={cronHelp}
            description={t('admin.scheduledTests.cronHelp')}
            placeholder={CRON_PLACEHOLDER}
            value={form.cron_expression}
            onChange={(cron_expression) => setForm({ ...form, cron_expression })}
          />
        </StackItem>
      </HStack>
      <HStack gap={3} wrap="wrap" vAlign="center">
        <StackItem size="fill">
          <NumberInput
            label={t('admin.scheduledTests.maxResults')}
            labelTooltip={maxResultsHelp}
            value={form.max_results}
            onChange={(max_results) => setForm({ ...form, max_results })}
            hasClear
            min={1}
            isIntegerOnly
          />
        </StackItem>
        <StackItem size="fill">
          <VStack gap={2} hAlign="stretch">
            <Switch
              label={t('admin.scheduledTests.enabled')}
              value={form.enabled}
              onChange={(enabled) => setForm({ ...form, enabled })}
            />
            <Switch
              label={t('admin.scheduledTests.autoRecover')}
              description={t('admin.scheduledTests.autoRecoverHelp')}
              value={form.auto_recover}
              onChange={(auto_recover) => setForm({ ...form, auto_recover })}
            />
          </VStack>
        </StackItem>
      </HStack>
      <HStack gap={2} hAlign="end">
        <Button label={t('common.cancel')} variant="secondary" size="sm" isDisabled={saving} onClick={onCancel} />
        <Button
          label={t('common.save')}
          variant="primary"
          size="sm"
          isLoading={saving}
          isDisabled={!form.model_id || !form.cron_expression.trim()}
          onClick={onSubmit}
        />
      </HStack>
    </VStack>
  )

  const renderResults = () => {
    if (loadingResults) {
      return (
        <Center padding={4}>
          <Spinner size="sm" label={t('common.loading')} />
        </Center>
      )
    }
    if (results.length === 0) {
      return (
        <Text type="supporting" color="secondary" justify="center" display="block">
          {t('admin.scheduledTests.noResults')}
        </Text>
      )
    }
    return (
      <VStack gap={2} hAlign="stretch" isScrollable style={{ maxHeight: RESULTS_LIST_MAX_HEIGHT }}>
        {results.map((result) => {
          const detail = result.error_message || result.response_text
          const isExpanded = expandedResultIds.has(result.id)
          return (
            <Card key={result.id} variant="muted" padding={3}>
              <VStack gap={2} hAlign="stretch">
                <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                  <HStack gap={2} vAlign="center">
                    <Badge
                      label={
                        result.status === 'success'
                          ? t('admin.scheduledTests.success')
                          : result.status === 'running'
                            ? t('admin.scheduledTests.running')
                            : t('admin.scheduledTests.failed')
                      }
                      variant={result.status === 'success' ? 'success' : result.status === 'running' ? 'info' : 'error'}
                    />
                    {result.latency_ms > 0 && (
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {result.latency_ms}ms
                      </Text>
                    )}
                  </HStack>
                  <Text type="supporting" color="secondary">
                    {formatDateTime(result.started_at)}
                  </Text>
                </HStack>
                {detail && (
                  <VStack gap={1} hAlign="stretch">
                    <Button
                      label={
                        result.error_message
                          ? t('admin.scheduledTests.errorMessage')
                          : t('admin.scheduledTests.responseText')
                      }
                      variant="ghost"
                      size="sm"
                      endContent={<Icon icon={isExpanded ? ChevronUpIcon : ChevronDownIcon} size="xsm" />}
                      onClick={() => toggleResultDetail(result.id)}
                    />
                    {isExpanded && (
                      <CodeBlock
                        code={detail}
                        isWrapped
                        hasCopyButton={false}
                        maxHeight={RESULT_BLOCK_MAX_HEIGHT}
                        width="100%"
                        size="sm"
                        container="section"
                      />
                    )}
                  </VStack>
                )}
              </VStack>
            </Card>
          )
        })}
      </VStack>
    )
  }

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={720} purpose="form">
        <Layout
          header={
            <DialogHeader
              title={t('admin.scheduledTests.title')}
              onOpenChange={(open) => !open && onClose()}
              endContent={
                <Button
                  label={t('admin.scheduledTests.addPlan')}
                  icon={<Icon icon={PlusIcon} size="sm" />}
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddForm((prev) => !prev)}
                />
              }
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                {showAddForm && (
                  <Card padding={4}>
                    <VStack gap={3} hAlign="stretch">
                      <Text weight="medium">{t('admin.scheduledTests.addPlan')}</Text>
                      {renderForm(newPlan, setNewPlan, () => void handleCreate(), () => {
                        setShowAddForm(false)
                        setNewPlan(EMPTY_FORM)
                      })}
                    </VStack>
                  </Card>
                )}

                {loading ? (
                  <Center minHeight={160}>
                    <Spinner label={t('common.loading')} />
                  </Center>
                ) : plans.length === 0 ? (
                  <EmptyState
                    title={t('admin.scheduledTests.noPlans')}
                    icon={<Icon icon={CalendarDaysIcon} size="lg" />}
                    isCompact
                  />
                ) : (
                  plans.map((plan) => (
                    <Card key={plan.id} padding={0}>
                      <VStack gap={0} hAlign="stretch">
                        <HStack gap={3} vAlign="center" wrap="wrap" padding={3}>
                          <StackItem size="fill">
                            <VStack gap={0.5}>
                              <Text weight="medium">{plan.model_id}</Text>
                              <Text type="code" color="secondary">
                                {plan.cron_expression}
                              </Text>
                            </VStack>
                          </StackItem>
                          <Switch
                            label={t('admin.scheduledTests.enabled')}
                            size="sm"
                            value={plan.enabled}
                            onChange={(enabled) => void handleToggleEnabled(plan, enabled)}
                          />
                          {plan.auto_recover && <Badge label={t('admin.scheduledTests.autoRecover')} variant="success" />}
                          {plan.last_run_at && (
                            <VStack gap={0.5}>
                              <Text type="supporting" color="secondary">
                                {t('admin.scheduledTests.lastRun')}
                              </Text>
                              <Text type="supporting" color="secondary">
                                {formatDateTime(plan.last_run_at)}
                              </Text>
                            </VStack>
                          )}
                          {plan.next_run_at && (
                            <VStack gap={0.5}>
                              <Text type="supporting" color="secondary">
                                {t('admin.scheduledTests.nextRun')}
                              </Text>
                              <Text type="supporting" color="secondary">
                                {formatDateTime(plan.next_run_at)}
                              </Text>
                            </VStack>
                          )}
                          <HStack gap={1} vAlign="center">
                            <IconButton
                              icon={<Icon icon={PencilIcon} />}
                              label={t('admin.scheduledTests.editPlan')}
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(plan)}
                            />
                            <IconButton
                              icon={<Icon icon={TrashIcon} />}
                              label={t('admin.scheduledTests.deletePlan')}
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingPlan(plan)}
                            />
                            <IconButton
                              icon={<Icon icon={expandedPlanId === plan.id ? ChevronUpIcon : ChevronDownIcon} />}
                              label={t('admin.scheduledTests.results')}
                              variant="ghost"
                              size="sm"
                              onClick={() => void toggleExpand(plan.id)}
                            />
                          </HStack>
                        </HStack>

                        {editingPlanId === plan.id && (
                          <VStack gap={3} hAlign="stretch" padding={3}>
                            <Text type="supporting" color="secondary">
                              {t('admin.scheduledTests.editPlan')}
                            </Text>
                            {renderForm(editForm, setEditForm, () => void handleUpdate(), () => setEditingPlanId(null))}
                          </VStack>
                        )}

                        {expandedPlanId === plan.id && (
                          <VStack gap={2} hAlign="stretch" padding={3}>
                            <HStack gap={1} vAlign="center">
                              <Text type="supporting" color="secondary">
                                {t('admin.scheduledTests.results')}
                              </Text>
                              <InfoTip content={t('admin.scheduledTests.maxResultsTooltipMeaning')} />
                            </HStack>
                            {renderResults()}
                          </VStack>
                        )}
                      </VStack>
                    </Card>
                  ))
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.close')} variant="secondary" onClick={onClose} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={!!deletingPlan}
        onOpenChange={(open) => !open && setDeletingPlan(null)}
        title={t('admin.scheduledTests.deletePlan')}
        description={t('admin.scheduledTests.confirmDelete')}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void handleDelete()}
      />
    </>
  )
}
