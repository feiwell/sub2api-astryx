import { useEffect, useState, type ReactNode } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { useI18n } from '~/i18n'
import {
  opsAPI,
  type AlertSeverity,
  type EmailNotificationConfig,
  type OpsAdvancedSettings,
  type OpsAlertRuntimeSettings,
} from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import { errorMessage } from './errors'
import {
  AUTO_REFRESH_INTERVALS,
  MAX_EVALUATION_INTERVAL_SECONDS,
  MAX_OPS_RETENTION_DAYS,
  advancedSettingsOf,
  emailConfigOf,
  emailConfigToSave,
  metricThresholdValues,
  opsSettingsProblems,
  quotaPercent,
  quotaShare,
  withRecipient,
  type MetricThresholdValues,
} from './opsSettings'

/** The four groups of settings the dialog edits; each has its own endpoint. */
interface SettingsForm {
  runtime: OpsAlertRuntimeSettings
  email: EmailNotificationConfig
  advanced: OpsAdvancedSettings
  thresholds: MetricThresholdValues
}

// Selector values are strings, so "every severity" needs a value of its own.
const ALL = '__all__'
const SEVERITIES: AlertSeverity[] = ['critical', 'warning', 'info']
const DAILY_SCHEDULE_EXAMPLE = '0 9 * * *'
const WEEKLY_SCHEDULE_EXAMPLE = '0 9 * * 1'
const CLEANUP_SCHEDULE_EXAMPLE = '0 2 * * *'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card variant="muted" padding={4}>
      <VStack gap={3}>
        <VStack gap={0.5}>
          <Heading level={4}>{title}</Heading>
          {hint && (
            <Text type="supporting" color="secondary">
              {hint}
            </Text>
          )}
        </VStack>
        {children}
      </VStack>
    </Card>
  )
}

/** A part of the advanced settings: a smaller heading over its fields. */
function Part({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <VStack gap={3}>
      <VStack gap={0.5}>
        <Heading level={5}>{title}</Heading>
        {hint && (
          <Text type="supporting" color="secondary">
            {hint}
          </Text>
        )}
      </VStack>
      {children}
    </VStack>
  )
}

/** A switch that fills its row, label first, as every on/off setting of the dialog is laid out. */
function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <Switch
      label={label}
      description={hint}
      value={value}
      onChange={onChange}
      labelPosition="start"
      labelSpacing="spread"
      width="100%"
    />
  )
}

/** The addresses a notification goes to: one is typed and added at a time. */
function RecipientsField({
  label,
  recipients,
  onChange,
}: {
  label: string
  recipients: string[]
  onChange: (recipients: string[]) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')

  const add = () => {
    if (!text.trim()) return
    const next = withRecipient(recipients, text)
    if (!next) {
      toast.error(t('common.invalidEmail'))
      return
    }
    onChange(next)
    setText('')
  }

  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="end">
        {/* The address takes the width the button leaves, so the button keeps its own. */}
        <StackItem size="fill">
          <TextInput
            type="email"
            label={label}
            width="100%"
            value={text}
            placeholder={t('admin.ops.settings.emailPlaceholder')}
            onChange={setText}
            onEnter={add}
          />
        </StackItem>
        <Button label={t('common.add')} variant="secondary" onClick={add} />
      </HStack>
      {recipients.length > 0 && (
        <HStack gap={1.5} wrap="wrap">
          {recipients.map((address) => (
            <Token
              key={address}
              label={address}
              onRemove={() => onChange(recipients.filter((item) => item !== address))}
            />
          ))}
        </HStack>
      )}
      <Text type="supporting" color="secondary">
        {t('admin.ops.settings.recipientsHint')}
      </Text>
    </VStack>
  )
}

/**
 * Settings of the ops page: how often alerts are evaluated, who is mailed, the thresholds that colour
 * the overview, and the advanced switches. Mounted only while open, so each opening reads the server anew.
 */
export function OpsSettingsDialog({
  onSaved,
  onClose,
}: {
  /** Everything was saved: the page behind shows figures judged by the old settings. */
  onSaved: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  // Null until the server's settings are known: there is nothing to edit, or to save, before that.
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [isSaving, setSaving] = useState(false)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    Promise.all([
      opsAPI.getAlertRuntimeSettings(),
      opsAPI.getEmailNotificationConfig(),
      opsAPI.getAdvancedSettings(),
      opsAPI.getMetricThresholds(),
    ])
      .then(([runtime, email, advanced, thresholds]) => {
        if (isStale) return
        setForm({
          runtime,
          email: emailConfigOf(email),
          advanced: advancedSettingsOf(advanced),
          thresholds: metricThresholdValues(thresholds),
        })
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load ops settings', error)
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [reloadTick])

  const edit = (change: (current: SettingsForm) => SettingsForm) => {
    setForm((current) => (current ? change(current) : current))
  }
  const editAlert = (patch: Partial<EmailNotificationConfig['alert']>) => {
    edit((current) => ({ ...current, email: { ...current.email, alert: { ...current.email.alert, ...patch } } }))
  }
  const editReport = (patch: Partial<EmailNotificationConfig['report']>) => {
    edit((current) => ({ ...current, email: { ...current.email, report: { ...current.email.report, ...patch } } }))
  }
  const editAdvanced = (patch: Partial<OpsAdvancedSettings>) => {
    edit((current) => ({ ...current, advanced: { ...current.advanced, ...patch } }))
  }
  const editRetention = (patch: Partial<OpsAdvancedSettings['data_retention']>) => {
    edit((current) => ({
      ...current,
      advanced: { ...current.advanced, data_retention: { ...current.advanced.data_retention, ...patch } },
    }))
  }
  const editQuota = (patch: Partial<OpsAdvancedSettings['openai_account_quota_auto_pause']>) => {
    edit((current) => ({
      ...current,
      advanced: {
        ...current.advanced,
        openai_account_quota_auto_pause: { ...current.advanced.openai_account_quota_auto_pause, ...patch },
      },
    }))
  }
  const editThresholds = (patch: Partial<MetricThresholdValues>) => {
    edit((current) => ({ ...current, thresholds: { ...current.thresholds, ...patch } }))
  }

  const problems = form ? opsSettingsProblems(form.runtime, form.advanced, form.thresholds) : []

  const save = () => {
    if (!form || isLoading || isSaving || problems.length > 0) return
    setSaving(true)
    Promise.all([
      opsAPI.updateAlertRuntimeSettings(form.runtime),
      opsAPI.updateEmailNotificationConfig(emailConfigToSave(form.email)),
      opsAPI.updateAdvancedSettings(form.advanced),
      opsAPI.updateMetricThresholds(form.thresholds),
    ])
      .then(() => {
        toast.success(t('admin.ops.settings.saveSuccess'))
        onSaved()
        onClose()
      })
      .catch((error) => {
        console.error('[ops] failed to save ops settings', error)
        toast.error(errorMessage(error) || t('admin.ops.settings.saveFailed'))
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

  const retentionDays = (label: string, value: number, onChange: (days: number) => void) => (
    <NumberInput
      label={label}
      width="100%"
      value={value}
      min={0}
      max={MAX_OPS_RETENTION_DAYS}
      step={1}
      isIntegerOnly
      onChange={onChange}
    />
  )
  const schedule = (name: string, value: string, example: string, onChange: (value: string) => void) => (
    <TextInput
      label={`${name}: ${t('admin.ops.email.cronPlaceholder')}`}
      isLabelHidden
      width="100%"
      value={value}
      placeholder={example}
      onChange={onChange}
    />
  )

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={760} maxHeight="90dvh" purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.ops.settings.title')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            {failure != null ? (
              <Banner
                status="error"
                title={t('admin.ops.settings.loadFailed')}
                description={failure || undefined}
                endContent={
                  <Button
                    label={t('common.refresh')}
                    variant="secondary"
                    size="sm"
                    onClick={() => setReloadTick((tick) => tick + 1)}
                  />
                }
              />
            ) : !form ? (
              <Center padding={10}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : (
              <VStack gap={4}>
                {problems.length > 0 && (
                  <Banner
                    status="warning"
                    title={t('admin.ops.settings.validation.title')}
                    description={
                      <VStack gap={0.5}>
                        {problems.map((key) => (
                          <Text key={key}>{t(key)}</Text>
                        ))}
                      </VStack>
                    }
                  />
                )}

                <Section title={t('admin.ops.settings.dataCollection')}>
                  <NumberInput
                    label={t('admin.ops.settings.evaluationInterval')}
                    description={t('admin.ops.settings.evaluationIntervalHint')}
                    width="100%"
                    value={form.runtime.evaluation_interval_seconds}
                    min={1}
                    max={MAX_EVALUATION_INTERVAL_SECONDS}
                    step={1}
                    isIntegerOnly
                    onChange={(seconds) =>
                      edit((current) => ({
                        ...current,
                        runtime: { ...current.runtime, evaluation_interval_seconds: seconds },
                      }))
                    }
                  />
                </Section>

                <Section title={t('admin.ops.settings.alertConfig')}>
                  <Toggle
                    label={t('admin.ops.settings.enableAlert')}
                    value={form.email.alert.enabled}
                    onChange={(enabled) => editAlert({ enabled })}
                  />
                  {form.email.alert.enabled && (
                    <>
                      <RecipientsField
                        label={t('admin.ops.settings.alertRecipients')}
                        recipients={form.email.alert.recipients}
                        onChange={(recipients) => editAlert({ recipients })}
                      />
                      <Selector
                        label={t('admin.ops.settings.minSeverity')}
                        width="100%"
                        value={form.email.alert.min_severity || ALL}
                        onChange={(value) =>
                          editAlert({ min_severity: value === ALL ? '' : (value as AlertSeverity) })
                        }
                        options={[
                          { value: ALL, label: t('admin.ops.email.minSeverityAll') },
                          ...SEVERITIES.map((severity) => ({ value: severity, label: t(`common.${severity}`) })),
                        ]}
                      />
                    </>
                  )}
                </Section>

                <Section title={t('admin.ops.settings.reportConfig')}>
                  <Toggle
                    label={t('admin.ops.settings.enableReport')}
                    value={form.email.report.enabled}
                    onChange={(enabled) => editReport({ enabled })}
                  />
                  {form.email.report.enabled && (
                    <>
                      <RecipientsField
                        label={t('admin.ops.settings.reportRecipients')}
                        recipients={form.email.report.recipients}
                        onChange={(recipients) => editReport({ recipients })}
                      />
                      <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
                        <VStack gap={2}>
                          <Toggle
                            label={t('admin.ops.settings.dailySummary')}
                            value={form.email.report.daily_summary_enabled}
                            onChange={(on) => editReport({ daily_summary_enabled: on })}
                          />
                          {form.email.report.daily_summary_enabled &&
                            schedule(
                              t('admin.ops.settings.dailySummary'),
                              form.email.report.daily_summary_schedule,
                              DAILY_SCHEDULE_EXAMPLE,
                              (value) => editReport({ daily_summary_schedule: value }),
                            )}
                        </VStack>
                        <VStack gap={2}>
                          <Toggle
                            label={t('admin.ops.settings.weeklySummary')}
                            value={form.email.report.weekly_summary_enabled}
                            onChange={(on) => editReport({ weekly_summary_enabled: on })}
                          />
                          {form.email.report.weekly_summary_enabled &&
                            schedule(
                              t('admin.ops.settings.weeklySummary'),
                              form.email.report.weekly_summary_schedule,
                              WEEKLY_SCHEDULE_EXAMPLE,
                              (value) => editReport({ weekly_summary_schedule: value }),
                            )}
                        </VStack>
                      </Grid>
                    </>
                  )}
                </Section>

                <Section
                  title={t('admin.ops.settings.metricThresholds')}
                  hint={t('admin.ops.settings.metricThresholdsHint')}
                >
                  <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
                    <NumberInput
                      label={t('admin.ops.settings.slaMinPercent')}
                      description={t('admin.ops.settings.slaMinPercentHint')}
                      width="100%"
                      value={form.thresholds.sla_percent_min}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={(value) => editThresholds({ sla_percent_min: value })}
                    />
                    <NumberInput
                      label={t('admin.ops.settings.ttftP99MaxMs')}
                      description={t('admin.ops.settings.ttftP99MaxMsHint')}
                      width="100%"
                      value={form.thresholds.ttft_p99_ms_max}
                      min={0}
                      step={50}
                      onChange={(value) => editThresholds({ ttft_p99_ms_max: value })}
                    />
                    <NumberInput
                      label={t('admin.ops.settings.requestErrorRateMaxPercent')}
                      description={t('admin.ops.settings.requestErrorRateMaxPercentHint')}
                      width="100%"
                      value={form.thresholds.request_error_rate_percent_max}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={(value) => editThresholds({ request_error_rate_percent_max: value })}
                    />
                    <NumberInput
                      label={t('admin.ops.settings.upstreamErrorRateMaxPercent')}
                      description={t('admin.ops.settings.upstreamErrorRateMaxPercentHint')}
                      width="100%"
                      value={form.thresholds.upstream_error_rate_percent_max}
                      min={0}
                      max={100}
                      step={0.1}
                      onChange={(value) => editThresholds({ upstream_error_rate_percent_max: value })}
                    />
                  </Grid>
                </Section>

                <Card variant="muted" padding={4}>
                  <Collapsible
                    trigger={<Heading level={4}>{t('admin.ops.settings.advancedSettings')}</Heading>}
                    defaultIsOpen={false}
                  >
                    <VStack gap={5} paddingBlockStart={3}>
                      <Part title={t('admin.ops.settings.dataRetention')}>
                        <Toggle
                          label={t('admin.ops.settings.enableCleanup')}
                          value={form.advanced.data_retention.cleanup_enabled}
                          onChange={(on) => editRetention({ cleanup_enabled: on })}
                        />
                        {form.advanced.data_retention.cleanup_enabled && (
                          <TextInput
                            label={t('admin.ops.settings.cleanupSchedule')}
                            description={t('admin.ops.settings.cleanupScheduleHint')}
                            width="100%"
                            value={form.advanced.data_retention.cleanup_schedule}
                            placeholder={CLEANUP_SCHEDULE_EXAMPLE}
                            onChange={(value) => editRetention({ cleanup_schedule: value })}
                          />
                        )}
                        <Grid columns={{ minWidth: 180, max: 3 }} gap={4}>
                          {retentionDays(
                            t('admin.ops.settings.errorLogRetentionDays'),
                            form.advanced.data_retention.error_log_retention_days,
                            (days) => editRetention({ error_log_retention_days: days }),
                          )}
                          {retentionDays(
                            t('admin.ops.settings.minuteMetricsRetentionDays'),
                            form.advanced.data_retention.minute_metrics_retention_days,
                            (days) => editRetention({ minute_metrics_retention_days: days }),
                          )}
                          {retentionDays(
                            t('admin.ops.settings.hourlyMetricsRetentionDays'),
                            form.advanced.data_retention.hourly_metrics_retention_days,
                            (days) => editRetention({ hourly_metrics_retention_days: days }),
                          )}
                        </Grid>
                        <Text type="supporting" color="secondary">
                          {t('admin.ops.settings.retentionDaysHint')}
                        </Text>
                      </Part>

                      <Part title={t('admin.ops.settings.aggregation')}>
                        <Toggle
                          label={t('admin.ops.settings.enableAggregation')}
                          hint={t('admin.ops.settings.aggregationHint')}
                          value={form.advanced.aggregation.aggregation_enabled}
                          onChange={(on) => editAdvanced({ aggregation: { aggregation_enabled: on } })}
                        />
                      </Part>

                      <Part
                        title={t('admin.ops.settings.openaiQuotaAutoPause')}
                        hint={t('admin.ops.settings.openaiQuotaAutoPauseHint')}
                      >
                        <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
                          <NumberInput
                            label={t('admin.ops.settings.openaiQuotaAutoPauseDefault5h')}
                            width="100%"
                            value={quotaPercent(form.advanced.openai_account_quota_auto_pause.default_threshold_5h)}
                            min={0}
                            max={100}
                            step={0.1}
                            hasClear
                            onChange={(percent) => editQuota({ default_threshold_5h: quotaShare(percent) })}
                          />
                          <NumberInput
                            label={t('admin.ops.settings.openaiQuotaAutoPauseDefault7d')}
                            width="100%"
                            value={quotaPercent(form.advanced.openai_account_quota_auto_pause.default_threshold_7d)}
                            min={0}
                            max={100}
                            step={0.1}
                            hasClear
                            onChange={(percent) => editQuota({ default_threshold_7d: quotaShare(percent) })}
                          />
                        </Grid>
                        <Text type="supporting" color="secondary">
                          {t('admin.ops.settings.openaiQuotaAutoPauseThresholdHint')}
                        </Text>
                      </Part>

                      <Part title={t('admin.ops.settings.errorFiltering')}>
                        <Toggle
                          label={t('admin.ops.settings.ignoreCountTokensErrors')}
                          hint={t('admin.ops.settings.ignoreCountTokensErrorsHint')}
                          value={form.advanced.ignore_count_tokens_errors}
                          onChange={(on) => editAdvanced({ ignore_count_tokens_errors: on })}
                        />
                        <Toggle
                          label={t('admin.ops.settings.ignoreContextCanceled')}
                          hint={t('admin.ops.settings.ignoreContextCanceledHint')}
                          value={form.advanced.ignore_context_canceled}
                          onChange={(on) => editAdvanced({ ignore_context_canceled: on })}
                        />
                        <Toggle
                          label={t('admin.ops.settings.ignoreNoAvailableAccounts')}
                          hint={t('admin.ops.settings.ignoreNoAvailableAccountsHint')}
                          value={form.advanced.ignore_no_available_accounts}
                          onChange={(on) => editAdvanced({ ignore_no_available_accounts: on })}
                        />
                        <Toggle
                          label={t('admin.ops.settings.ignoreInsufficientBalanceErrors')}
                          hint={t('admin.ops.settings.ignoreInsufficientBalanceErrorsHint')}
                          value={form.advanced.ignore_insufficient_balance_errors}
                          onChange={(on) => editAdvanced({ ignore_insufficient_balance_errors: on })}
                        />
                      </Part>

                      <Part title={t('admin.ops.settings.autoRefresh')}>
                        <Toggle
                          label={t('admin.ops.settings.enableAutoRefresh')}
                          hint={t('admin.ops.settings.enableAutoRefreshHint')}
                          value={form.advanced.auto_refresh_enabled}
                          onChange={(on) => editAdvanced({ auto_refresh_enabled: on })}
                        />
                        {form.advanced.auto_refresh_enabled && (
                          <Selector
                            label={t('admin.ops.settings.refreshInterval')}
                            width="100%"
                            value={String(form.advanced.auto_refresh_interval_seconds)}
                            onChange={(value) => editAdvanced({ auto_refresh_interval_seconds: Number(value) })}
                            options={[
                              // An interval stored by other means stays selectable until it is changed.
                              ...(AUTO_REFRESH_INTERVALS.includes(form.advanced.auto_refresh_interval_seconds)
                                ? []
                                : [
                                    {
                                      value: String(form.advanced.auto_refresh_interval_seconds),
                                      label: `${form.advanced.auto_refresh_interval_seconds}s`,
                                    },
                                  ]),
                              ...AUTO_REFRESH_INTERVALS.map((seconds) => ({
                                value: String(seconds),
                                label: t(`admin.ops.settings.refreshInterval${seconds}s`),
                              })),
                            ]}
                          />
                        )}
                      </Part>

                      <Part title={t('admin.ops.settings.dashboardCards')}>
                        <Toggle
                          label={t('admin.ops.settings.displayAlertEvents')}
                          hint={t('admin.ops.settings.displayAlertEventsHint')}
                          value={form.advanced.display_alert_events}
                          onChange={(on) => editAdvanced({ display_alert_events: on })}
                        />
                        <Toggle
                          label={t('admin.ops.settings.displayOpenAITokenStats')}
                          hint={t('admin.ops.settings.displayOpenAITokenStatsHint')}
                          value={form.advanced.display_openai_token_stats}
                          onChange={(on) => editAdvanced({ display_openai_token_stats: on })}
                        />
                      </Part>
                    </VStack>
                  </Collapsible>
                </Card>
              </VStack>
            )}
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
                isDisabled={!form || isLoading || problems.length > 0}
                onClick={save}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
