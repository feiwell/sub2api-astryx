import type {
  EmailNotificationConfig,
  OpsAdvancedSettings,
  OpsAlertRuntimeSettings,
  OpsMetricThresholds,
} from '~/lib/api/admin/ops'

/** The four thresholds of the overview as the form holds them: every one a number. */
export interface MetricThresholdValues {
  sla_percent_min: number
  ttft_p99_ms_max: number
  request_error_rate_percent_max: number
  upstream_error_rate_percent_max: number
}

/** What the form shows for a threshold the server has not stored. */
export const DEFAULT_METRIC_THRESHOLDS: MetricThresholdValues = {
  sla_percent_min: 99.5,
  ttft_p99_ms_max: 500,
  request_error_rate_percent_max: 5,
  upstream_error_rate_percent_max: 5,
}

export const MAX_EVALUATION_INTERVAL_SECONDS = 86400
/** The longest the ops tables keep their rows; 0 empties them on every cleanup. */
export const MAX_OPS_RETENTION_DAYS = 365
export const AUTO_REFRESH_INTERVALS: readonly number[] = [15, 30, 60]

export function metricThresholdValues(answer: OpsMetricThresholds | null | undefined): MetricThresholdValues {
  return {
    sla_percent_min: answer?.sla_percent_min ?? DEFAULT_METRIC_THRESHOLDS.sla_percent_min,
    ttft_p99_ms_max: answer?.ttft_p99_ms_max ?? DEFAULT_METRIC_THRESHOLDS.ttft_p99_ms_max,
    request_error_rate_percent_max:
      answer?.request_error_rate_percent_max ?? DEFAULT_METRIC_THRESHOLDS.request_error_rate_percent_max,
    upstream_error_rate_percent_max:
      answer?.upstream_error_rate_percent_max ?? DEFAULT_METRIC_THRESHOLDS.upstream_error_rate_percent_max,
  }
}

/** An older server answers without the quota thresholds; the form needs them present. */
export function advancedSettingsOf(answer: OpsAdvancedSettings): OpsAdvancedSettings {
  if (answer.openai_account_quota_auto_pause) return answer
  return { ...answer, openai_account_quota_auto_pause: { default_threshold_5h: 0, default_threshold_7d: 0 } }
}

/** A server with no recipients stored may answer `null` for the lists; the form needs lists. */
export function emailConfigOf(answer: EmailNotificationConfig): EmailNotificationConfig {
  return {
    alert: { ...answer.alert, recipients: answer.alert.recipients ?? [] },
    report: { ...answer.report, recipients: answer.report.recipients ?? [] },
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isEmailAddress = (text: string): boolean => EMAIL_PATTERN.test(text)

/**
 * The recipients with one more address, in lower case. An address already listed gives the same
 * list back; text that is no address gives null.
 */
export function withRecipient(recipients: string[], text: string): string[] | null {
  const address = text.trim()
  if (!isEmailAddress(address)) return null
  const normalized = address.toLowerCase()
  return recipients.includes(normalized) ? recipients : [...recipients, normalized]
}

/** The server keeps a quota threshold as a share of 1; the form shows percent, empty for "none". */
export const quotaPercent = (share: number | null | undefined): number | null =>
  share && share > 0 ? Math.round(share * 1000) / 10 : null

export const quotaShare = (percent: number | null): number => (percent != null && percent > 0 ? percent / 100 : 0)

const isWithin = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max

/** Text keys of what keeps the settings from being saved; empty when nothing does. */
export function opsSettingsProblems(
  runtime: OpsAlertRuntimeSettings,
  advanced: OpsAdvancedSettings,
  thresholds: MetricThresholdValues,
): string[] {
  const problems: string[] = []
  if (!isWithin(runtime.evaluation_interval_seconds, 1, MAX_EVALUATION_INTERVAL_SECONDS)) {
    problems.push('admin.ops.runtime.validation.evalIntervalRange')
  }
  const retention = advanced.data_retention
  const days = [
    retention.error_log_retention_days,
    retention.minute_metrics_retention_days,
    retention.hourly_metrics_retention_days,
  ]
  if (days.some((value) => !isWithin(value, 0, MAX_OPS_RETENTION_DAYS))) {
    problems.push('admin.ops.settings.validation.retentionDaysRange')
  }
  const quota = advanced.openai_account_quota_auto_pause
  if (!isWithin(quota.default_threshold_5h, 0, 1) || !isWithin(quota.default_threshold_7d, 0, 1)) {
    problems.push('admin.ops.settings.validation.openaiQuotaAutoPauseRange')
  }
  if (!isWithin(thresholds.sla_percent_min, 0, 100)) {
    problems.push('admin.ops.settings.validation.slaMinPercentRange')
  }
  if (!isWithin(thresholds.ttft_p99_ms_max, 0, Number.POSITIVE_INFINITY)) {
    problems.push('admin.ops.settings.validation.ttftP99MaxRange')
  }
  if (!isWithin(thresholds.request_error_rate_percent_max, 0, 100)) {
    problems.push('admin.ops.settings.validation.requestErrorRateMaxRange')
  }
  if (!isWithin(thresholds.upstream_error_rate_percent_max, 0, 100)) {
    problems.push('admin.ops.settings.validation.upstreamErrorRateMaxRange')
  }
  return problems
}

/** A notification switched on with nobody to send it to is saved switched off, as the Vue page saves it. */
export function emailConfigToSave(config: EmailNotificationConfig): EmailNotificationConfig {
  return {
    alert: { ...config.alert, enabled: config.alert.enabled && config.alert.recipients.length > 0 },
    report: { ...config.report, enabled: config.report.enabled && config.report.recipients.length > 0 },
  }
}
