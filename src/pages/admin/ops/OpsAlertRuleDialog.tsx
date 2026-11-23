import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid, GridSpan } from '@astryxdesign/core/Grid'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import { opsAPI, type AlertRule, type MetricType, type Operator } from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import {
  ALERT_METRICS,
  ALERT_METRIC_SCOPES,
  ALERT_OPERATORS,
  ALERT_SEVERITIES,
  ALERT_WINDOWS,
  MAX_ALERT_MINUTES,
  alertMetric,
  alertRuleProblems,
  needsGroup,
  newAlertRule,
  ruleGroupId,
  withRuleGroup,
} from './alertRules'
import { errorMessage } from './errors'

export interface AlertRuleGroupOption {
  id: number
  name: string
}

// Selector values are strings, so "every group" needs a value of its own.
const ALL = '__all__'

/** The form of one alert rule: what it watches, when it fires, and how loudly. */
export function OpsAlertRuleDialog({
  rule,
  groups,
  onSaved,
  onClose,
}: {
  /** The rule to change; null for a new one. */
  rule: AlertRule | null
  groups: AlertRuleGroupOption[]
  /** The server has the rule: the list behind the form is out of date. */
  onSaved: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  // A copy: the list keeps its rule as it is until the server has the change.
  const [draft, setDraft] = useState<AlertRule>(() => (rule ? { ...rule } : newAlertRule()))
  const [isSaving, setSaving] = useState(false)
  const editingId = rule?.id ?? null

  const change = (patch: Partial<AlertRule>) => setDraft((current) => ({ ...current, ...patch }))

  const metric = alertMetric(draft.metric_type)
  const isGroupRequired = needsGroup(draft.metric_type)
  const groupId = ruleGroupId(draft)
  const problems = alertRuleProblems(draft)

  const save = () => {
    if (isSaving || problems.length > 0) return
    setSaving(true)
    const request = editingId ? opsAPI.updateAlertRule(editingId, draft) : opsAPI.createAlertRule(draft)
    request
      .then(() => onSaved())
      .catch((error) => {
        console.error('[ops] failed to save alert rule', error)
        toast.error(errorMessage(error) || t('admin.ops.alertRules.saveFailed'))
        setSaving(false)
      })
  }

  // A save on its way is not abandoned by closing: its outcome still has to be told.
  const close = () => {
    if (!isSaving) onClose()
  }
  const reportOpen = (open: boolean) => {
    if (!open) close()
  }

  const metricOptions = [
    // A metric this page does not know stays selected until it is changed.
    ...(metric ? [] : [{ value: draft.metric_type as string, label: draft.metric_type as string }]),
    ...ALERT_METRIC_SCOPES.map((scope) => ({
      type: 'section' as const,
      title: t(`admin.ops.alertRules.metricGroups.${scope}`),
      options: ALERT_METRICS.filter((item) => item.scope === scope).map((item) => ({
        value: item.type as string,
        label: t(`admin.ops.alertRules.metrics.${item.name}`),
      })),
    })),
  ]

  const groupOptions = [
    ...(isGroupRequired ? [] : [{ value: ALL, label: t('admin.ops.alertRules.form.allGroups') }]),
    // A group that is gone from the list (or a list that failed to load) still shows what the rule holds.
    ...(groupId != null && !groups.some((group) => group.id === groupId)
      ? [{ value: String(groupId), label: `#${groupId}` }]
      : []),
    ...groups.map((group) => ({ value: String(group.id), label: group.name })),
  ]

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={720} maxHeight="90dvh" purpose="form">
      <Layout
        header={
          <DialogHeader
            title={editingId ? t('admin.ops.alertRules.editTitle') : t('admin.ops.alertRules.createTitle')}
            onOpenChange={reportOpen}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {problems.length > 0 && (
                <Banner
                  status="warning"
                  title={t('admin.ops.alertRules.validation.title')}
                  description={
                    <VStack gap={0.5}>
                      {problems.map((key) => (
                        <Text key={key}>{t(key)}</Text>
                      ))}
                    </VStack>
                  }
                />
              )}

              <Grid columns={{ minWidth: 240, max: 2 }} gap={4}>
                <GridSpan columns="full">
                  <TextInput
                    label={t('admin.ops.alertRules.form.name')}
                    isRequired
                    width="100%"
                    value={draft.name}
                    onChange={(name) => change({ name })}
                  />
                </GridSpan>
                <GridSpan columns="full">
                  <TextInput
                    label={t('admin.ops.alertRules.form.description')}
                    width="100%"
                    value={draft.description ?? ''}
                    onChange={(description) => change({ description })}
                  />
                </GridSpan>

                <VStack gap={1}>
                  <Selector
                    label={t('admin.ops.alertRules.form.metric')}
                    width="100%"
                    value={draft.metric_type}
                    onChange={(value) => change({ metric_type: value as MetricType })}
                    options={metricOptions}
                  />
                  {metric && (
                    <VStack gap={0.5}>
                      <Text type="supporting" color="secondary">
                        {t(`admin.ops.alertRules.metricDescriptions.${metric.name}`)}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {t('admin.ops.alertRules.hints.recommended', {
                          operator: metric.operator,
                          threshold: metric.threshold,
                          unit: metric.unit,
                        })}
                      </Text>
                    </VStack>
                  )}
                </VStack>
                <Selector
                  label={t('admin.ops.alertRules.form.operator')}
                  width="100%"
                  value={draft.operator}
                  onChange={(value) => change({ operator: value as Operator })}
                  options={ALERT_OPERATORS.map((operator) => ({ value: operator as string, label: operator as string }))}
                />

                <GridSpan columns="full">
                  <VStack gap={1}>
                    <Selector
                      label={t('admin.ops.alertRules.form.groupId')}
                      isRequired={isGroupRequired}
                      hasSearch
                      width="100%"
                      placeholder={t('admin.ops.alertRules.form.groupPlaceholder')}
                      value={groupId != null ? String(groupId) : isGroupRequired ? undefined : ALL}
                      onChange={(value) =>
                        setDraft((current) => withRuleGroup(current, value === ALL ? null : Number(value)))
                      }
                      status={isGroupRequired && groupId == null ? { type: 'error' } : undefined}
                      options={groupOptions}
                    />
                    <Text type="supporting" color="secondary">
                      {isGroupRequired
                        ? t('admin.ops.alertRules.hints.groupRequired')
                        : t('admin.ops.alertRules.hints.groupOptional')}
                    </Text>
                  </VStack>
                </GridSpan>

                <NumberInput
                  label={t('admin.ops.alertRules.form.threshold')}
                  width="100%"
                  value={draft.threshold}
                  onChange={(threshold) => change({ threshold })}
                />
                <Selector
                  label={t('admin.ops.alertRules.form.severity')}
                  width="100%"
                  value={draft.severity}
                  onChange={(severity) => change({ severity })}
                  options={ALERT_SEVERITIES.map((severity) => ({ value: severity, label: severity }))}
                />

                <Selector
                  label={t('admin.ops.alertRules.form.window')}
                  width="100%"
                  value={String(draft.window_minutes)}
                  onChange={(value) => change({ window_minutes: Number(value) })}
                  options={ALERT_WINDOWS.map((minutes) => ({ value: String(minutes), label: `${minutes}m` }))}
                />
                <NumberInput
                  label={t('admin.ops.alertRules.form.sustained')}
                  width="100%"
                  value={draft.sustained_minutes}
                  min={1}
                  max={MAX_ALERT_MINUTES}
                  step={1}
                  isIntegerOnly
                  onChange={(minutes) => change({ sustained_minutes: minutes })}
                />

                <NumberInput
                  label={t('admin.ops.alertRules.form.cooldown')}
                  width="100%"
                  value={draft.cooldown_minutes}
                  min={0}
                  max={MAX_ALERT_MINUTES}
                  step={1}
                  isIntegerOnly
                  onChange={(minutes) => change({ cooldown_minutes: minutes })}
                />
              </Grid>

              <VStack gap={3}>
                <Switch
                  label={t('admin.ops.alertRules.form.enabled')}
                  value={draft.enabled}
                  onChange={(enabled) => change({ enabled })}
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                />
                <Switch
                  label={t('admin.ops.alertRules.form.notifyEmail')}
                  value={draft.notify_email}
                  onChange={(notify) => change({ notify_email: notify })}
                  labelPosition="start"
                  labelSpacing="spread"
                  width="100%"
                />
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={isSaving} onClick={close} />
              <Button
                label={t('common.save')}
                variant="primary"
                isLoading={isSaving}
                isDisabled={problems.length > 0}
                onClick={save}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
