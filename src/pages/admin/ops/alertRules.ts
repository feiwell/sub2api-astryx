import type { AlertRule, MetricType, Operator } from '~/lib/api/admin/ops'

export type AlertMetricScope = 'system' | 'group' | 'account'

export interface AlertMetric {
  type: MetricType
  /** What the metric measures: the whole service, one group, or the accounts. */
  scope: AlertMetricScope
  /** Last segment of the metric's two text keys, `metrics.<name>` and `metricDescriptions.<name>`. */
  name: string
  /** The comparison and threshold suggested for the metric; shown as a hint, never applied. */
  operator: Operator
  threshold: number
  unit: string
}

export const ALERT_METRIC_SCOPES: readonly AlertMetricScope[] = ['system', 'group', 'account']

export const ALERT_METRICS: readonly AlertMetric[] = [
  { type: 'success_rate', scope: 'system', name: 'successRate', operator: '<', threshold: 99, unit: '%' },
  { type: 'error_rate', scope: 'system', name: 'errorRate', operator: '>', threshold: 1, unit: '%' },
  { type: 'upstream_error_rate', scope: 'system', name: 'upstreamErrorRate', operator: '>', threshold: 1, unit: '%' },
  { type: 'cpu_usage_percent', scope: 'system', name: 'cpu', operator: '>', threshold: 80, unit: '%' },
  { type: 'memory_usage_percent', scope: 'system', name: 'memory', operator: '>', threshold: 80, unit: '%' },
  { type: 'concurrency_queue_depth', scope: 'system', name: 'queueDepth', operator: '>', threshold: 10, unit: '' },
  { type: 'group_available_accounts', scope: 'group', name: 'groupAvailableAccounts', operator: '<', threshold: 1, unit: '' },
  { type: 'group_available_ratio', scope: 'group', name: 'groupAvailableRatio', operator: '<', threshold: 50, unit: '%' },
  { type: 'group_rate_limit_ratio', scope: 'group', name: 'groupRateLimitRatio', operator: '>', threshold: 10, unit: '%' },
  { type: 'account_rate_limited_count', scope: 'account', name: 'accountRateLimitedCount', operator: '>', threshold: 0, unit: '' },
  { type: 'account_error_count', scope: 'account', name: 'accountErrorCount', operator: '>', threshold: 0, unit: '' },
  { type: 'account_error_ratio', scope: 'account', name: 'accountErrorRatio', operator: '>', threshold: 5, unit: '%' },
  {
    type: 'account_temp_unscheduled_count',
    scope: 'account',
    name: 'accountTempUnscheduledCount',
    operator: '>',
    threshold: 0,
    unit: '',
  },
  { type: 'overload_account_count', scope: 'account', name: 'overloadAccountCount', operator: '>', threshold: 0, unit: '' },
]

export const ALERT_OPERATORS: readonly Operator[] = ['>', '>=', '<', '<=', '==', '!=']
export const ALERT_SEVERITIES: readonly string[] = ['P0', 'P1', 'P2', 'P3']
/** The windows, in minutes, the server evaluates a rule over. */
export const ALERT_WINDOWS: readonly number[] = [1, 5, 60]
/** A day in minutes: the longest a rule may ask its condition to hold, or stay quiet after firing. */
export const MAX_ALERT_MINUTES = 1440

/** The metric a rule watches; null for a type this page does not know. */
export const alertMetric = (type: string | undefined): AlertMetric | null =>
  ALERT_METRICS.find((metric) => metric.type === type) ?? null

/** A group metric measures one group, so its rule has to name that group. */
export const needsGroup = (type: string | undefined): boolean => alertMetric(type)?.scope === 'group'

/** The group a rule is limited to; null when it covers every group. */
export function ruleGroupId(rule: Pick<AlertRule, 'filters'>): number | null {
  const value: unknown = rule.filters?.group_id
  if (value == null || typeof value === 'boolean') return null
  const id = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

/** A copy of the rule limited to one group, or to none. Filters left empty are dropped from the copy. */
export function withRuleGroup(rule: AlertRule, groupId: number | null): AlertRule {
  const filters: Record<string, unknown> = { ...rule.filters }
  delete filters.group_id
  if (groupId != null) filters.group_id = groupId
  const next: AlertRule = { ...rule }
  if (Object.keys(filters).length > 0) next.filters = filters
  else delete next.filters
  return next
}

/** What the "new rule" form starts from. */
export function newAlertRule(): AlertRule {
  return {
    name: '',
    description: '',
    enabled: true,
    metric_type: 'error_rate',
    operator: '>',
    threshold: 1,
    window_minutes: 1,
    sustained_minutes: 2,
    severity: 'P1',
    cooldown_minutes: 10,
    notify_email: true,
  }
}

const isWholeBetween = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** Text keys of what keeps a rule from being saved; empty for a rule that can be. */
export function alertRuleProblems(rule: AlertRule): string[] {
  const problems: string[] = []
  if (!rule.name || !rule.name.trim()) problems.push('nameRequired')
  if (!rule.metric_type) problems.push('metricRequired')
  if (needsGroup(rule.metric_type) && ruleGroupId(rule) == null) problems.push('groupIdRequired')
  if (!rule.operator) problems.push('operatorRequired')
  if (!(typeof rule.threshold === 'number' && Number.isFinite(rule.threshold))) problems.push('thresholdRequired')
  if (!ALERT_WINDOWS.includes(rule.window_minutes)) problems.push('windowRange')
  if (!isWholeBetween(rule.sustained_minutes, 1, MAX_ALERT_MINUTES)) problems.push('sustainedRange')
  if (!isWholeBetween(rule.cooldown_minutes, 0, MAX_ALERT_MINUTES)) problems.push('cooldownRange')
  return problems.map((name) => `admin.ops.alertRules.validation.${name}`)
}

/** Newest rule first: ids grow with each rule created. */
export function sortAlertRules<T extends Pick<AlertRule, 'id'>>(rules: readonly T[]): T[] {
  return [...rules].sort((a, b) => (b.id || 0) - (a.id || 0))
}

/** `> 1`: the comparison a rule makes, without the metric's name. */
export const alertRuleComparison = (rule: Pick<AlertRule, 'operator' | 'threshold'>): string =>
  `${rule.operator} ${rule.threshold}`
