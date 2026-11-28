import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { AccountListItem, UpstreamBillingData } from '@/types'
import { formatDateTime } from '@/utils/format'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import { useMinuteClock } from './useMinuteClock'

export const operationalColumns = {
  groups: 'groups',
  proxy: 'proxy',
  priority: 'priority',
  scheduler_score: 'schedulerScore',
  rate_multiplier: 'billingRateMultiplier',
  upstream_billing_rate: 'upstreamBillingRate',
  last_used_at: 'lastUsed',
  expires_at: 'expiresAt',
  notes: 'notes',
} as const
export const sortable = new Set([
  'id',
  'name',
  'status',
  'schedulable',
  'priority',
  'rate_multiplier',
  'upstream_billing_rate',
  'last_used_at',
  'created_at',
  'expires_at',
])

export function OperationalStatus({ account: a, onDetails }: { account: AccountListItem; onDetails: () => void }) {
  const { t } = useI18n(),
    now = useMinuteClock()
  const future = (s?: string | null) => !!s && Date.parse(s) > now
  const msg = (key: string, time: string, model?: string) =>
    t(`admin.accounts.status.${key}`, { time: formatDateTime(time), model })
  const limits = a.extra?.model_rate_limits ?? {}
  const details: string[] = []
  if (future(a.rate_limit_reset_at)) details.push(msg('rateLimitedUntil', a.rate_limit_reset_at!))
  if (future(a.overload_until)) details.push(msg('overloadedUntil', a.overload_until!))
  for (const [model, info] of Object.entries(limits)) {
    if (!future(info?.rate_limit_reset_at)) continue
    const key =
      model === 'AICredits'
        ? 'creditsExhaustedUntil'
        : a.extra?.allow_overages && !future(limits.AICredits?.rate_limit_reset_at)
          ? 'modelCreditOveragesUntil'
          : 'modelRateLimitedUntil'
    details.push(msg(key, info.rate_limit_reset_at, model))
  }
  return (
    <VStack gap={0.5}>
      {(a.status !== 'active' || (!details.length && !future(a.temp_unschedulable_until))) && (
        <Text>{t(`admin.accounts.status.${a.status}`)}</Text>
      )}
      {future(a.temp_unschedulable_until) && (
        <>
          <Button
            size="sm"
            variant="ghost"
            label={t('admin.accounts.status.tempUnschedulable')}
            onClick={onDetails}
          />
          <Text type="supporting">{msg('tempUnschedulableUntil', a.temp_unschedulable_until!)}</Text>
        </>
      )}
      {a.status === 'error' && a.error_message && (
        <Text type="supporting" maxLines={2} hasTruncateTooltip>
          {a.error_message}
        </Text>
      )}
      {details.map((text, i) => (
        <Text type="supporting" key={i}>
          {text}
        </Text>
      ))}
    </VStack>
  )
}

export function PriorityCell({ account, reload }: { account: AccountListItem; reload: () => void }) {
  const { t } = useI18n(),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<number | null>(null),
    [busy, setBusy] = useState(false)
  const label = t('admin.accounts.priorityQuick.editHint')
  if (!editing)
    return (
      <Button
        variant="ghost"
        size="sm"
        label={String(account.priority)}
        tooltip={label}
        onClick={() => { setDraft(account.priority); setEditing(true) }}
      />
    )
  return (
    <HStack gap={1}>
      <NumberInput
        label={label}
        isLabelHidden
        value={draft}
        min={1}
        max={9999}
        isIntegerOnly
        onChange={setDraft}
        isDisabled={busy}
      />
      <Button
        size="sm"
        label={t('common.save')}
        isLoading={busy}
        onClick={async () => {
          if (draft == null || draft < 1 || draft > 9999) return
          setBusy(true)
          try {
            await adminAPI.accounts.update(account.id, { priority: draft })
            setEditing(false)
            reload()
          } catch (e) {
            toast.error(extractApiErrorMessage(e, t('common.error')))
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        label={t('common.cancel')}
        isDisabled={busy}
        onClick={() => setEditing(false)}
      />
    </HStack>
  )
}

export function ProxyCell({ account: a, reload }: { account: AccountListItem; reload: () => void }) {
  const { t } = useI18n(),
    [busy, setBusy] = useState(false)
  return (
    <VStack gap={0.5}>
      <Text>
        {a.proxy?.name ?? (a.proxy_id ? `#${a.proxy_id}` : '—')}
        {a.proxy?.country_code && ` (${a.proxy.country_code})`}
      </Text>
      {a.proxy?.expires_at && <Text type="supporting">{formatDateTime(a.proxy.expires_at)}</Text>}
      {!!a.proxy_fallback_origin_id && (
        <>
          <Text type="supporting">
            {t('admin.accounts.fallbackActiveTip', {
              origin: a.proxy_fallback_origin_name || `#${a.proxy_fallback_origin_id}`,
            })}
          </Text>
          <Button
            size="sm"
            label={t('admin.accounts.revertProxy')}
            isLoading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await adminAPI.accounts.revertProxyFallback(a.id)
                reload()
              } catch (e) {
                toast.error(extractApiErrorMessage(e, t('admin.accounts.revertProxyFailed')))
              } finally {
                setBusy(false)
              }
            }}
          />
        </>
      )}
    </VStack>
  )
}

export function ScoreCell({ account: a }: { account: AccountListItem }) {
  const { t } = useI18n()
  const groups = a.scheduler_scores?.filter((s) => s.group_id != null) ?? []
  const scores = groups.length
    ? groups
    : a.scheduler_score
      ? [{ ...a.scheduler_score, group_id: null, group_name: '' }]
      : []
  const scoreText = (v?: number) => (v == null ? '—' : Number(v.toFixed(6)))
  return (
    <VStack gap={0.5}>
      {scores.length ? (
        scores.map((s, i) => (
          <Text type="supporting" key={i}>
            {s.group_name ||
              (s.group_id != null ? `#${s.group_id}` : t('admin.accounts.schedulerScore.ungrouped'))}
            : {scoreText(s.base_score)}
            {s.sticky_weighted_enabled && ` / ${s.sticky_score_infinity ? '+∞' : scoreText(s.sticky_score)}`}
          </Text>
        ))
      ) : (
        <Text>—</Text>
      )}
    </VStack>
  )
}

const parseMinute = (value?: string) => {
  if (typeof value !== 'string') return null
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}
const minuteInTimeZone = (timestamp: number, timeZone?: string) => {
  if (!timeZone) return null
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null
  } catch {
    return null
  }
}
function effectiveRate(billing: UpstreamBillingData | undefined, now: number) {
  if (!billing) return null
  if (billing.billing_scope !== 'token') return null
  const base = billing.resolved_rate_multiplier
  if (typeof base !== 'number' || !Number.isFinite(base) || base < 0) return null
  if (typeof billing.peak_rate_enabled !== 'boolean') return null
  if (!billing.peak_rate_enabled) return base
  const start = parseMinute(billing.peak_start)
  const end = parseMinute(billing.peak_end)
  const minute = minuteInTimeZone(now, billing.timezone)
  const peak = billing.peak_rate_multiplier
  if (
    start == null ||
    end == null ||
    minute == null ||
    start >= end ||
    typeof peak !== 'number' ||
    !Number.isFinite(peak) ||
    peak < 0
  )
    return null
  const value = minute >= start && minute < end ? base * peak : base
  return Number.isFinite(value) ? value : null
}
export function UpstreamRateCell({ account: a, reload }: { account: AccountListItem; reload: () => void }) {
  const { t } = useI18n(),
    now = useMinuteClock(),
    [busy, setBusy] = useState(false)
  if (a.type !== 'apikey') return <Text>—</Text>
  const snap = a.extra?.upstream_billing_probe
  const at = Date.parse(snap?.received_at ?? '')
  const until = snap?.fresh_until
    ? Date.parse(snap.fresh_until)
    : snap?.status === 'ok'
      ? at + 2 * (Date.parse(snap.next_probe_at) - at)
      : NaN
  const fresh = at <= now + 300000 && until > at && now <= until
  const rate = fresh && (snap?.status === 'ok' || snap?.status === 'failed') ? effectiveRate(snap.data, now) : null
  const status = !snap
    ? 'notProbed'
    : snap.status === 'unsupported'
      ? 'unsupported'
      : snap.status === 'failed'
        ? 'failed'
        : !fresh
          ? 'stale'
          : null
  return (
    <VStack gap={0.5}>
      {rate != null && <Text>{Number(rate.toPrecision(12))}×</Text>}
      {status && <Text type="supporting">{t(`admin.accounts.upstreamBilling.${status}`)}</Text>}
      <Button
        size="sm"
        variant="ghost"
        label={t('admin.accounts.upstreamBilling.manualProbe')}
        isLoading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const result = await adminAPI.accounts.probeUpstreamBilling(a.id)
            if (result.error) toast.error(result.error)
            reload()
          } catch (e) {
            toast.error(extractApiErrorMessage(e, t('common.error')))
          } finally {
            setBusy(false)
          }
        }}
      />
    </VStack>
  )
}
