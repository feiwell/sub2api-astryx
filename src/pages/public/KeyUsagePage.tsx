import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import {
  CalendarIcon,
  ClockIcon,
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { formatDateLocalInput } from '@/utils/format'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { PublicPageFrame } from '~/components/common/PublicPageFrame'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { buildGatewayUrl } from '~/lib/api/client'
import { toast } from '~/lib/toast'

interface UsageWindow {
  window: string
  used: number
  limit: number
  reset_at?: string | null
}

interface DailyUsageRow extends Record<string, unknown> {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost: number
  actual_cost?: number | null
}

interface ModelStatRow extends Record<string, unknown> {
  model?: string
  requests?: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
  cost?: number
  actual_cost?: number | null
}

interface UsageData {
  mode?: string
  isValid?: boolean
  status?: string
  planName?: string
  balance?: number
  remaining?: number | null
  quota?: { used: number; limit: number; remaining: number }
  rate_limits?: UsageWindow[]
  subscription?: {
    daily_usage_usd: number
    daily_limit_usd: number
    weekly_usage_usd: number
    weekly_limit_usd: number
    monthly_usage_usd: number
    monthly_limit_usd: number
    expires_at?: string
  }
  expires_at?: string
  days_until_expiry?: number | null
  usage?: {
    today?: Record<string, number>
    total?: Record<string, number>
    rpm?: number
    tpm?: number
    average_duration_ms?: number
  }
  model_stats?: ModelStatRow[]
  daily_usage?: DailyUsageRow[]
}

type DateRangeKey = 'today' | '7d' | '30d' | 'custom'
type DailyUsageDays = 7 | 30 | 90

interface UsageRing {
  title: string
  pct: number
  amount: string
  isBalance?: boolean
  icon: typeof ClockIcon
  resetAt?: string | null
}

interface DetailRow {
  label: string
  value: string
  icon: typeof ClockIcon
  tone?: 'success' | 'warning' | 'error'
}

const DAY_MS = 86400000

function usd(value: number | null | undefined): string {
  if (value == null || value < 0) return '-'
  return '$' + Number(value).toFixed(2)
}

function fmtNum(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString()
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function usageTone(pct: number): 'success' | 'warning' | 'error' {
  if (pct > 90) return 'error'
  if (pct > 70) return 'warning'
  return 'success'
}

/**
 * Public API key usage lookup (port of views/KeyUsageView.vue): query a key's
 * quota/subscription state over a date range, with token statistics, a daily
 * usage breakdown and per-model statistics. No login required.
 */
export function KeyUsagePage() {
  const { t, locale } = useI18n()
  const publicSettings = useAppStore((s) => s.publicSettings)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)

  const [apiKey, setApiKey] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [resultData, setResultData] = useState<UsageData | null>(null)
  const [currentRange, setCurrentRange] = useState<DateRangeKey>('today')
  const [customRange, setCustomRange] = useState<DateRange | null>(null)
  const [dailyUsageDays, setDailyUsageDays] = useState<DailyUsageDays>(30)
  const [now, setNow] = useState(() => new Date())

  const subscriptionFeatureEnabled = resolveFeatureFlag(publicSettings, FeatureFlags.subscription)

  useEffect(() => {
    void fetchPublicSettings()
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [fetchPublicSettings])

  const dateParams = (range: DateRangeKey, days: DailyUsageDays): string => {
    const params = new URLSearchParams()
    const today = new Date()
    if (range === 'custom') {
      if (customRange?.start && customRange?.end) {
        params.set('start_date', customRange.start)
        params.set('end_date', customRange.end)
      }
    } else {
      const end = formatDateLocalInput(today)
      const start =
        range === 'today'
          ? end
          : formatDateLocalInput(new Date(today.getTime() - (range === '7d' ? 7 : 30) * DAY_MS))
      params.set('start_date', start)
      params.set('end_date', end)
    }
    params.set('days', String(days))
    params.set('timezone', browserTimezone())
    return params.toString()
  }

  const queryKey = async (range = currentRange, days = dailyUsageDays) => {
    if (isQuerying) return
    const key = apiKey.trim()
    if (!key) {
      setKeyError(t('keyUsage.enterApiKey'))
      return
    }
    setKeyError('')
    setIsQuerying(true)
    setShowResults(true)
    setShowLoading(true)
    setResultData(null)
    try {
      const res = await fetch(`${buildGatewayUrl('/v1/usage')}?${dateParams(range, days)}`, {
        headers: { Authorization: 'Bearer ' + key },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message || body?.message || `${t('keyUsage.queryFailed')} (${res.status})`)
      }
      setResultData(await res.json())
      setShowLoading(false)
      setShowDatePicker(true)
      toast.success(t('keyUsage.querySuccess'))
    } catch (err) {
      setShowResults(false)
      setShowLoading(false)
      toast.error((err as Error).message || t('keyUsage.queryFailedRetry'))
    } finally {
      setIsQuerying(false)
    }
  }

  const handleRangeChange = (value: string) => {
    const range = value as DateRangeKey
    setCurrentRange(range)
    if (range !== 'custom') void queryKey(range)
  }

  const handleDailyDaysChange = (value: string) => {
    const days = Number(value) as DailyUsageDays
    if (days === dailyUsageDays) return
    setDailyUsageDays(days)
    if (resultData && apiKey.trim()) void queryKey(currentRange, days)
  }

  const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatResetTime = (resetAt: string | null | undefined): string => {
    if (!resetAt) return ''
    const diff = new Date(resetAt).getTime() - now.getTime()
    if (diff <= 0) return t('keyUsage.resetNow')
    const d = Math.floor(diff / DAY_MS)
    const h = Math.floor((diff % DAY_MS) / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (d > 0) return t('astryx.keyUsage.resetIn.days', { d, h })
    if (h > 0) return t('astryx.keyUsage.resetIn.hours', { h, m })
    return t('astryx.keyUsage.resetIn.minutes', { m })
  }

  const windowShortLabel = (window: string) => {
    const keys: Record<string, string> = { '5h': 'fiveHours', '1d': 'daily', '7d': 'sevenDays' }
    return keys[window] ? t(`astryx.keyUsage.window.${keys[window]}`) : window
  }

  // ---- derived sections (same rules as the Vue page) ----

  const data = resultData
  const statusInfo = (() => {
    if (!data) return null
    if (data.mode === 'quota_limited') {
      const statusKeys: Record<string, string> = { active: 'active', quota_exhausted: 'quotaExhausted', expired: 'expired' }
      const statusKey = data.status ? statusKeys[data.status] : undefined
      return {
        label: t('keyUsage.quotaMode'),
        statusText: statusKey ? t(`astryx.keyUsage.status.${statusKey}`) : data.status || t('astryx.keyUsage.status.unknown'),
        isActive: data.isValid !== false && data.status === 'active',
      }
    }
    return { label: data.planName || t('keyUsage.walletBalance'), statusText: t('astryx.keyUsage.status.active'), isActive: true }
  })()

  const rings: UsageRing[] = []
  if (data?.mode === 'quota_limited') {
    if (data.quota) {
      const pct = data.quota.limit > 0 ? Math.min(Math.round((data.quota.used / data.quota.limit) * 100), 100) : 0
      rings.push({ title: t('keyUsage.totalQuota'), pct, amount: `${usd(data.quota.used)} / ${usd(data.quota.limit)}`, icon: CurrencyDollarIcon })
    }
    const windowTitles: Record<string, string> = { '5h': t('keyUsage.limit5h'), '1d': t('keyUsage.limitDaily'), '7d': t('keyUsage.limit7d') }
    for (const rl of data.rate_limits || []) {
      rings.push({
        title: windowTitles[rl.window] || rl.window,
        pct: rl.limit > 0 ? Math.min(Math.round((rl.used / rl.limit) * 100), 100) : 0,
        amount: `${usd(rl.used)} / ${usd(rl.limit)}`,
        icon: rl.window === '5h' ? ClockIcon : CalendarIcon,
        resetAt: rl.reset_at,
      })
    }
  } else if (data) {
    if (data.subscription) {
      const sub = data.subscription
      const limits = [
        { title: t('keyUsage.limitDaily'), usage: sub.daily_usage_usd, limit: sub.daily_limit_usd },
        { title: t('keyUsage.limitWeekly'), usage: sub.weekly_usage_usd, limit: sub.weekly_limit_usd },
        { title: t('keyUsage.limitMonthly'), usage: sub.monthly_usage_usd, limit: sub.monthly_limit_usd },
      ]
      for (const l of limits) {
        if (l.limit != null && l.limit > 0) {
          rings.push({
            title: l.title,
            pct: Math.min(Math.round((l.usage / l.limit) * 100), 100),
            amount: `${usd(l.usage)} / ${usd(l.limit)}`,
            icon: CalendarIcon,
          })
        }
      }
    } else if (data.balance != null) {
      rings.push({ title: t('keyUsage.walletBalance'), pct: 0, amount: usd(data.balance), isBalance: true, icon: CurrencyDollarIcon })
    }
  }

  const detailRows: DetailRow[] = []
  if (data?.mode === 'quota_limited') {
    if (data.quota) {
      detailRows.push({
        label: t('keyUsage.remainingQuota'),
        value: usd(data.quota.remaining),
        icon: LockClosedIcon,
        tone: data.quota.remaining <= 0 ? 'error' : data.quota.remaining < data.quota.limit * 0.1 ? 'warning' : 'success',
      })
    }
    if (data.expires_at) {
      const daysLeft = data.days_until_expiry
      let expiry = formatDate(data.expires_at)
      if (daysLeft != null) {
        expiry += daysLeft > 0 ? ` ${t('keyUsage.daysLeft', { days: daysLeft })}` : daysLeft === 0 ? ` ${t('keyUsage.todayExpires')}` : ''
      }
      detailRows.push({ label: t('keyUsage.expiresAt'), value: expiry, icon: CalendarIcon })
    }
    for (const rl of data.rate_limits || []) {
      const reset = formatResetTime(rl.reset_at)
      detailRows.push({
        label: `${t('keyUsage.usedQuota')} (${windowShortLabel(rl.window)})`,
        value: `${usd(rl.used)} / ${usd(rl.limit)}${reset ? ` (⟳ ${reset})` : ''}`,
        icon: CurrencyDollarIcon,
        tone: usageTone(rl.limit > 0 ? (rl.used / rl.limit) * 100 : 0),
      })
    }
  } else if (data) {
    // With subscriptions turned off this row can only be the wallet, so it is labelled "billing type".
    detailRows.push({
      label: subscriptionFeatureEnabled ? t('keyUsage.subscriptionType') : t('keyUsage.billingType'),
      value: data.planName || t('keyUsage.walletBalance'),
      icon: CalendarIcon,
    })
    if (data.subscription) {
      const sub = data.subscription
      const windows = [
        { key: 'daily', usage: sub.daily_usage_usd, limit: sub.daily_limit_usd },
        { key: 'weekly', usage: sub.weekly_usage_usd, limit: sub.weekly_limit_usd },
        { key: 'monthly', usage: sub.monthly_usage_usd, limit: sub.monthly_limit_usd },
      ]
      for (const w of windows) {
        if (w.limit > 0) {
          detailRows.push({
            label: `${t('keyUsage.usedQuota')} (${t(`astryx.keyUsage.window.${w.key}`)})`,
            value: `${usd(w.usage)} / ${usd(w.limit)}`,
            icon: CurrencyDollarIcon,
            tone: usageTone((w.usage / w.limit) * 100),
          })
        }
      }
      if (sub.expires_at) {
        detailRows.push({ label: t('keyUsage.subscriptionExpires'), value: formatDate(sub.expires_at), icon: CalendarIcon })
      }
    }
    detailRows.push({
      label: t('keyUsage.remainingQuota'),
      value: data.remaining != null ? usd(data.remaining) : '-',
      icon: LockClosedIcon,
      tone: data.remaining != null ? (data.remaining <= 0 ? 'error' : data.remaining < 10 ? 'warning' : 'success') : undefined,
    })
  }

  const usage = data?.usage
  const today = usage?.today || {}
  const total = usage?.total || {}
  const statCells = usage
    ? [
        { label: t('keyUsage.todayRequests'), value: fmtNum(today.requests) },
        { label: t('keyUsage.todayInputTokens'), value: fmtNum(today.input_tokens) },
        { label: t('keyUsage.todayOutputTokens'), value: fmtNum(today.output_tokens) },
        { label: t('keyUsage.todayTokens'), value: fmtNum(today.total_tokens) },
        { label: t('keyUsage.todayCacheCreation'), value: fmtNum(today.cache_creation_tokens) },
        { label: t('keyUsage.todayCacheRead'), value: fmtNum(today.cache_read_tokens) },
        { label: t('keyUsage.todayCost'), value: usd(today.actual_cost) },
        { label: t('keyUsage.rpmTpm'), value: `${usage.rpm || 0} / ${usage.tpm || 0}` },
        { label: t('keyUsage.totalRequests'), value: fmtNum(total.requests) },
        { label: t('keyUsage.totalInputTokens'), value: fmtNum(total.input_tokens) },
        { label: t('keyUsage.totalOutputTokens'), value: fmtNum(total.output_tokens) },
        { label: t('keyUsage.totalTokensLabel'), value: fmtNum(total.total_tokens) },
        { label: t('keyUsage.totalCacheCreation'), value: fmtNum(total.cache_creation_tokens) },
        { label: t('keyUsage.totalCacheRead'), value: fmtNum(total.cache_read_tokens) },
        { label: t('keyUsage.totalCost'), value: usd(total.actual_cost) },
        {
          label: t('keyUsage.avgDuration'),
          value: usage.average_duration_ms
            ? t('astryx.keyUsage.durationMs', { ms: Math.round(usage.average_duration_ms) })
            : '-',
        },
      ]
    : []

  const showDailyUsage = Boolean(data && Array.isArray(data.daily_usage))
  const dailyRows = Array.isArray(data?.daily_usage) ? data.daily_usage : []
  const modelStats = data?.model_stats || []

  const dailyColumns: TableColumn<DailyUsageRow>[] = [
    { key: 'date', header: t('keyUsage.date'), width: proportional(1, { minWidth: 110 }) },
    { key: 'requests', header: t('keyUsage.requests'), align: 'end', renderCell: (row) => fmtNum(row.requests) },
    { key: 'input_tokens', header: t('keyUsage.inputTokens'), align: 'end', renderCell: (row) => fmtNum(row.input_tokens) },
    { key: 'output_tokens', header: t('keyUsage.outputTokens'), align: 'end', renderCell: (row) => fmtNum(row.output_tokens) },
    { key: 'cache_read_tokens', header: t('keyUsage.cacheReadTokens'), align: 'end', renderCell: (row) => fmtNum(row.cache_read_tokens) },
    { key: 'cache_write_tokens', header: t('keyUsage.cacheWriteTokens'), align: 'end', renderCell: (row) => fmtNum(row.cache_write_tokens) },
    {
      key: 'cost',
      header: t('keyUsage.cost'),
      align: 'end',
      renderCell: (row) => (
        <Text weight="medium" hasTabularNumbers>
          {usd(row.actual_cost != null ? row.actual_cost : row.cost)}
        </Text>
      ),
    },
  ]

  const modelColumns: TableColumn<ModelStatRow>[] = [
    { key: 'model', header: t('keyUsage.model'), width: proportional(2, { minWidth: 160 }), renderCell: (row) => row.model || '-' },
    { key: 'requests', header: t('keyUsage.requests'), align: 'end', renderCell: (row) => fmtNum(row.requests) },
    { key: 'input_tokens', header: t('keyUsage.inputTokens'), align: 'end', renderCell: (row) => fmtNum(row.input_tokens) },
    { key: 'output_tokens', header: t('keyUsage.outputTokens'), align: 'end', renderCell: (row) => fmtNum(row.output_tokens) },
    { key: 'cache_creation_tokens', header: t('keyUsage.cacheCreationTokens'), align: 'end', renderCell: (row) => fmtNum(row.cache_creation_tokens) },
    { key: 'cache_read_tokens', header: t('keyUsage.cacheReadTokens'), align: 'end', renderCell: (row) => fmtNum(row.cache_read_tokens) },
    { key: 'total_tokens', header: t('keyUsage.totalTokens'), align: 'end', renderCell: (row) => fmtNum(row.total_tokens) },
    {
      key: 'cost',
      header: t('keyUsage.cost'),
      align: 'end',
      renderCell: (row) => (
        <Text weight="medium" hasTabularNumbers>
          {usd(row.actual_cost != null ? row.actual_cost : row.cost)}
        </Text>
      ),
    },
  ]

  return (
    <PublicPageFrame>
      <HStack hAlign="center">
        <VStack gap={10} padding={6} width="100%" maxWidth={1040}>
          {/* Hero */}
          <VStack gap={3} hAlign="center">
            <Heading level={1} justify="center">
              {t('keyUsage.title')}
            </Heading>
            <Text color="secondary" justify="center">
              {t('keyUsage.subtitle')}
            </Text>
          </VStack>

          {/* Key input and date range */}
          <VStack gap={4} hAlign="center">
            <HStack gap={2} vAlign="start" width="100%" maxWidth={600}>
              <TextInput
                label={t('keyUsage.placeholder')}
                isLabelHidden
                type={keyVisible ? 'text' : 'password'}
                value={apiKey}
                onChange={(value) => {
                  setApiKey(value)
                  if (keyError) setKeyError('')
                }}
                onEnter={() => void queryKey()}
                placeholder={t('keyUsage.placeholder')}
                startIcon={LockClosedIcon}
                size="lg"
                width="100%"
                autoComplete="off"
                status={keyError ? { type: 'warning', message: keyError } : undefined}
              />
              <IconButton
                size="lg"
                variant="secondary"
                icon={<Icon icon={keyVisible ? EyeSlashIcon : EyeIcon} />}
                label={keyVisible ? t('astryx.keyUsage.hideKey') : t('astryx.keyUsage.showKey')}
                onClick={() => setKeyVisible((v) => !v)}
              />
              <Button
                size="lg"
                variant="primary"
                icon={<Icon icon={MagnifyingGlassIcon} />}
                label={isQuerying ? t('keyUsage.querying') : t('keyUsage.query')}
                isLoading={isQuerying}
                onClick={() => void queryKey()}
              />
            </HStack>
            <Text type="supporting" justify="center">
              {t('keyUsage.privacyNote')}
            </Text>

            {showDatePicker && (
              <HStack gap={3} vAlign="center" hAlign="center" wrap="wrap">
                <Text type="supporting">{t('keyUsage.dateRange')}</Text>
                <SegmentedControl label={t('keyUsage.dateRange')} size="sm" value={currentRange} onChange={handleRangeChange}>
                  <SegmentedControlItem value="today" label={t('keyUsage.dateRangeToday')} />
                  <SegmentedControlItem value="7d" label={t('keyUsage.dateRange7d')} />
                  <SegmentedControlItem value="30d" label={t('keyUsage.dateRange30d')} />
                  <SegmentedControlItem value="custom" label={t('keyUsage.dateRangeCustom')} />
                </SegmentedControl>
                {currentRange === 'custom' && (
                  <HStack gap={2} vAlign="center">
                    <DateRangeInput
                      label={t('keyUsage.dateRangeCustom')}
                      isLabelHidden
                      size="sm"
                      value={customRange}
                      onChange={setCustomRange}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      label={t('keyUsage.apply')}
                      isDisabled={!customRange?.start || !customRange?.end}
                      onClick={() => void queryKey('custom')}
                    />
                  </HStack>
                )}
              </HStack>
            )}
          </VStack>

          {/* Results */}
          {showResults &&
            (showLoading ? (
              <Center padding={8}>
                <Spinner />
              </Center>
            ) : data ? (
              <VStack gap={6}>
                {statusInfo && (
                  <HStack gap={2} vAlign="center" hAlign="center">
                    <StatusDot
                      variant={statusInfo.isActive ? 'success' : 'error'}
                      label={statusInfo.statusText}
                      isPulsing={statusInfo.isActive}
                    />
                    <Text weight="medium">{statusInfo.label}</Text>
                    <Text type="supporting">|</Text>
                    <Text type="supporting">{statusInfo.statusText}</Text>
                  </HStack>
                )}

                {rings.length > 0 && (
                  <Grid columns={{ minWidth: 260, repeat: 'fit' }} gap={6}>
                    {rings.map((ring) => (
                      <Card key={ring.title} padding={6}>
                        <VStack gap={4}>
                          <HStack gap={2} vAlign="center" hAlign="between">
                            <Text type="label" color="secondary">
                              {ring.title}
                            </Text>
                            <Icon icon={ring.icon} color="tertiary" />
                          </HStack>
                          {ring.isBalance ? (
                            <Heading level={2}>{ring.amount}</Heading>
                          ) : (
                            <VStack gap={2}>
                              <HStack gap={2} vAlign="end" hAlign="between">
                                <Heading level={2}>{`${ring.pct}%`}</Heading>
                                <Text type="supporting">{t('keyUsage.used')}</Text>
                              </HStack>
                              <ProgressBar
                                label={ring.title}
                                isLabelHidden
                                value={ring.pct}
                                variant={usageTone(ring.pct)}
                              />
                              <HStack gap={2} vAlign="center" hAlign="between">
                                <Text weight="semibold" hasTabularNumbers>
                                  {ring.amount}
                                </Text>
                                {ring.resetAt && formatResetTime(ring.resetAt) && (
                                  <Text type="supporting" hasTabularNumbers>
                                    ⟳ {formatResetTime(ring.resetAt)}
                                  </Text>
                                )}
                              </HStack>
                            </VStack>
                          )}
                        </VStack>
                      </Card>
                    ))}
                  </Grid>
                )}

                {detailRows.length > 0 && (
                  <Card padding={6}>
                    <VStack gap={4}>
                      <Text type="label" color="secondary">
                        {t('keyUsage.detailInfo')}
                      </Text>
                      <MetadataList>
                        {detailRows.map((row) => (
                          <MetadataListItem key={row.label} label={row.label}>
                            <HStack gap={2} vAlign="center">
                              {row.tone && <StatusDot variant={row.tone} label={row.label} />}
                              <Text weight="semibold" hasTabularNumbers>
                                {row.value}
                              </Text>
                            </HStack>
                          </MetadataListItem>
                        ))}
                      </MetadataList>
                    </VStack>
                  </Card>
                )}

                {statCells.length > 0 && (
                  <Card padding={6}>
                    <VStack gap={4}>
                      <Text type="label" color="secondary">
                        {t('keyUsage.tokenStats')}
                      </Text>
                      <Grid columns={{ minWidth: 180, repeat: 'fill' }} gap={4}>
                        {statCells.map((cell) => (
                          <VStack key={cell.label} gap={1}>
                            <Text type="supporting">{cell.label}</Text>
                            <Text weight="semibold" hasTabularNumbers>
                              {cell.value}
                            </Text>
                          </VStack>
                        ))}
                      </Grid>
                    </VStack>
                  </Card>
                )}

                {showDailyUsage && (
                  <Card padding={6}>
                    <VStack gap={4}>
                      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                        <Text type="label" color="secondary">
                          {t('keyUsage.dailyDetail')}
                        </Text>
                        <SegmentedControl
                          label={t('keyUsage.dailyDetail')}
                          size="sm"
                          value={String(dailyUsageDays)}
                          onChange={handleDailyDaysChange}
                        >
                          <SegmentedControlItem value="7" label={t('keyUsage.dateRange7d')} />
                          <SegmentedControlItem value="30" label={t('keyUsage.dateRange30d')} />
                          <SegmentedControlItem value="90" label={t('keyUsage.dateRange90d')} />
                        </SegmentedControl>
                      </HStack>
                      {dailyRows.length > 0 ? (
                        <Table data={dailyRows} columns={dailyColumns} idKey="date" density="compact" />
                      ) : (
                        <EmptyState isCompact title={t('keyUsage.noDailyUsage')} />
                      )}
                    </VStack>
                  </Card>
                )}

                {modelStats.length > 0 && (
                  <Card padding={6}>
                    <VStack gap={4}>
                      <Text type="label" color="secondary">
                        {t('keyUsage.modelStats')}
                      </Text>
                      <Table data={modelStats} columns={modelColumns} density="compact" />
                    </VStack>
                  </Card>
                )}
              </VStack>
            ) : null)}
        </VStack>
      </HStack>
    </PublicPageFrame>
  )
}
