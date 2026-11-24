import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/Stack'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Text } from '@astryxdesign/core/Text'
import type { AccountListItem } from '@/types'
import { extractApiErrorCode } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import { useI18n, t } from '~/i18n'
import { getClaudeResetCredits, redeemClaudeResetCredit, type ClaudeResetOutcome } from '~/lib/api/admin/claudeResetCredits'
import { adminAPI } from '~/lib/api/admin'
import { useMinuteClock } from './useMinuteClock'
import { useCreditAction, type CreditAction } from './useQuotaAction'

const claude = 'admin.accounts.claudeResetCredits'
const openai = 'admin.accounts.openaiQuotaReset'
const windowKeys: Record<string, string> = { five_hour: 'fiveHour', seven_day: 'sevenDay', seven_day_overage_included: 'sevenDayOverage' }
const windowLabels = (windows?: string[]) => windows?.map(w => windowKeys[w] ? t(`${claude}.windows.${windowKeys[w]}`) : w).join(', ') || '—'
const preClaimErrors: Record<string, string> = { CLAUDE_RESET_BUSY: 'busy', CLAUDE_RESET_NOT_AVAILABLE: 'notAvailable',
  CLAUDE_RESET_UNRESOLVED: 'unknown', CLAUDE_RESET_UPSTREAM_UNAVAILABLE: 'unavailable' }

function claudeOutcome(result: ClaudeResetOutcome) {
  const base = `${claude}.outcome`
  switch (result.outcome) {
    case 'reset': return t(`${base}.reset`, { windows: windowLabels(result.cleared) })
    case 'already_used': return t(`${base}.alreadyUsed`)
    case 'not_limited': return t(`${base}.notLimited`)
    case 'cooldown': return result.cooldown_until ? t(`${base}.cooldownUntil`, { time: formatDateTime(result.cooldown_until) }) : t(`${base}.cooldown`)
    case 'ineligible': return t(`${base}.ineligible`)
    default: return t(`${base}.${result.reason === 'upstream_unavailable' ? 'unavailable' : 'unknown'}`)
  }
}

function expiryTime(value?: string) {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : Infinity
}

export function ClaudeCredits({ id, operation, refresh }: { id: number; operation: CreditAction; refresh: () => Promise<void> }) {
  const { t } = useI18n()
  const now = useMinuteClock()
  const { claude: status, busy, error, message, errorKey } = useCreditAction(operation)
  const [confirm, setConfirm] = useState(false)
  const total = status?.credits.reduce((sum, credit) => sum + credit.resets_left, 0) ?? 0
  const canReset = (status?.available_count ?? 0) > 0
  const primary = status?.credits.find(credit => credit.redeemable)
    ?? status?.credits.slice().sort((a, b) => expiryTime(a.expires_at) - expiryTime(b.expires_at))[0]
  function query() {
    operation.update({ message: '', errorKey: '' })
    void operation.run(() => getClaudeResetCredits(id), claude => operation.update({ claude }), () => operation.update({ claude: null }))
  }
  function redeem() {
    setConfirm(false)
    if (!canReset || operation.getSnapshot().busy) return
    const key = operation.getSnapshot().data.pendingKey
      ?? `claude-reset-${id}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
    operation.update({ pendingKey: key, message: '', errorKey: '' })
    void operation.run(() => redeemClaudeResetCredit(id, key), async result => {
      operation.update({ pendingKey: undefined, claude: result.credits ?? null, message: claudeOutcome(result) })
      void refresh()
      operation.update({ claude: await getClaudeResetCredits(id) })
    }, cause => {
      const reason = extractApiErrorCode(cause) ?? ''
      if (preClaimErrors[reason]) operation.update({ pendingKey: undefined, errorKey: preClaimErrors[reason] })
      if (reason === 'IDEMPOTENCY_IN_PROGRESS') operation.update({ errorKey: 'inProgress' })
      if (reason === 'IDEMPOTENCY_RETRY_BACKOFF') operation.update({ errorKey: 'retryBackoff' })
    })
  }
  return <>
    <HStack gap={1} wrap="wrap">
      <Button size="sm" variant="ghost" label={`${t(`${claude}.count`)}${status ? ` ${total}` : ''}`} tooltip={t(`${claude}.${status ? 'countTooltipRefresh' : 'countTooltipLoad'}`)} isDisabled={busy} onClick={query} />
      <Button size="sm" variant="ghost" label={t(`${claude}.reset`)} isDisabled={busy || !canReset}
        tooltip={t(`${claude}.${canReset ? 'resetTooltipReady' : status ? 'resetTooltipNone' : 'resetTooltipNeedQuery'}`)} onClick={() => setConfirm(true)} />
    </HStack>
    {primary?.expires_at && <Text type="supporting">{t(`${claude}.expiresAt`, { time: formatDateTime(primary.expires_at) })}</Text>}
    {status?.cooldown_until && Date.parse(status.cooldown_until) > now && <Text type="supporting">{t(`${claude}.cooldown`, { time: formatDateTime(status.cooldown_until) })}</Text>}
    {status?.eligible === false && <Text type="supporting">{t(`${claude}.ineligible`)}</Text>}
    {message && <Text type="supporting" role="status">{message}</Text>}
    {error && <Text type="supporting" role="alert">{errorKey ? t(`${claude}.outcome.${errorKey}`) : error}</Text>}
    <AlertDialog isOpen={confirm} onOpenChange={setConfirm} title={t(`${claude}.confirmTitle`)}
      description={t(`${claude}.confirmMessage`, { count: Math.max(0, total - 1), windows: windowLabels(primary?.clears) })}
      actionLabel={t(`${claude}.reset`)} cancelLabel={t('common.cancel')} onAction={redeem} />
  </>
}

const warningKeys = {
  reset_credit_cache_refresh_failed: 'resetCacheRefreshFailed', account_state_recovery_failed: 'resetAccountRecoveryFailed',
  account_state_refresh_failed: 'resetAccountRefreshFailed',
} as const

function expiryList(credits: { expires_at?: string }[] | undefined, now: number) {
  if (!Array.isArray(credits)) return []
  return credits.map(c => c?.expires_at).filter((at): at is string =>
    typeof at === 'string' && !!at.trim() && expiryTime(at) > now).sort((a, b) => expiryTime(a) - expiryTime(b))
}

function availableCredits(snapshot: { available_count?: number; credits?: { expires_at?: string }[] } | null | undefined, valid: number, cached: boolean) {
  const count = snapshot?.available_count
  if (typeof count !== 'number' || !Number.isFinite(count)) return null
  if (count <= 0) return 0
  if (cached) return valid ? Math.min(count, valid) : null
  const dated = Array.isArray(snapshot?.credits) ? snapshot.credits.filter(c => c?.expires_at).length : 0
  return Math.max(0, count - Math.max(0, dated - valid))
}

type OpenAICreditProps = { account: AccountListItem; operation: CreditAction; updated: (account: AccountListItem) => void; refresh: (account?: AccountListItem) => Promise<void> }

export function OpenAICredits({ account, operation, updated, refresh }: OpenAICreditProps) {
  const { t } = useI18n()
  const now = useMinuteClock()
  const state = useCreditAction(operation)
  const { busy, error, message } = state
  const [confirm, setConfirm] = useState(false)
  const cached = account.extra?.codex_reset_credit_snapshot
  const snapshotKey = JSON.stringify([cached, account.extra?.codex_credits_snapshot])
  // A failed consumption stays unknown across remounts until a successful live query.
  const live = state.openAI === null || state.snapshotKey === snapshotKey ? state.openAI : undefined
  const snapshot = live === undefined ? cached : live?.rate_limit_reset_credits
  const validExpirations = expiryList(snapshot?.credits, now)
  const count = availableCredits(snapshot, validExpirations.length, live === undefined)
  const expirations = live && !validExpirations.length && (count ?? 0) > 0 ? expiryList(cached?.credits, now) : validExpirations
  const canReset = (count ?? 0) > 0 && account.parent_account_id == null
  const credits = live === undefined ? account.extra?.codex_credits_snapshot?.credits : live?.credits
  const raw = typeof credits?.balance === 'string' ? credits.balance.trim() : ''
  let points = '—'
  if (credits && typeof credits.has_credits === 'boolean' && typeof credits.unlimited === 'boolean') {
    if (credits.unlimited) points = t(`${openai}.pointsUnlimited`)
    else if (!credits.has_credits) points = '0'
    else points = raw && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? raw : t(`${openai}.pointsAvailable`)
  }
  function query() {
    operation.update({ message: '' })
    void operation.run(() => adminAPI.accounts.refreshOpenAIQuota(account.id), quota => {
      const warnings = [!quota.cache_persisted && t(`${openai}.refreshCachePersistFailed`),
        quota.credits_cache_persisted === false && t(`${openai}.pointsCachePersistFailed`)]
      operation.update({ openAI: quota, snapshotKey, message: warnings.filter(Boolean).join(' ') })
    })
  }
  function reset() {
    setConfirm(false)
    if (!canReset || operation.getSnapshot().busy) return
    operation.update({ message: '', openAI: null })
    void operation.run(() => adminAPI.accounts.resetOpenAIQuota(account.id), result => {
      const next = result.account ?? account
      operation.update({ openAI: result.cache_refreshed ? result.quota ?? null : null,
        snapshotKey: JSON.stringify([next.extra?.codex_reset_credit_snapshot, next.extra?.codex_credits_snapshot]),
        message: result.warning_code ? t(`${openai}.${warningKeys[result.warning_code]}`) : t(`${openai}.resetSuccess`, { windows: result.windows_reset }) })
      if (result.account) updated(result.account)
      void refresh(result.account ?? undefined)
    })
  }
  const fetchedAt = live === undefined ? account.extra?.codex_credits_snapshot?.fetched_at : live?.fetched_at
  const checkedAt = new Date((fetchedAt ?? 0) * 1000)
  const pointsHint = fetchedAt && Number.isFinite(checkedAt.getTime())
    ? [t(`${openai}.pointsTooltip`), t(`${openai}.pointsUpdatedAt`, { time: formatDateTime(checkedAt.toISOString()) })].join('\n')
    : t(`${openai}.pointsTooltip`)
  const auto = account.extra?.auto_reset_credit_enabled === true && account.extra.codex_auto_reset_credit_state
  const resetHint = account.parent_account_id != null ? 'resetTooltipShadow' : canReset ? 'resetTooltipReady' : count == null ? 'resetTooltipNeedQuery' : 'resetTooltipNoCredits'
  return <>
    <HStack gap={1} wrap="wrap">
      <Button size="sm" variant="ghost" label={`${t(`${openai}.count`)}${count == null ? '' : ` ${count}`}`} tooltip={t(`${openai}.${count == null ? 'countTooltipLoad' : 'countTooltipRefresh'}`)} isDisabled={busy} onClick={query} />
      <Button size="sm" variant="ghost" label={t(`${openai}.reset`)} tooltip={t(`${openai}.${resetHint}`)} isDisabled={busy || !canReset} onClick={() => setConfirm(true)} />
      <Button size="sm" variant="ghost" label={`${t(`${openai}.points`)} ${points}`} tooltip={pointsHint} isDisabled={busy} onClick={query} />
    </HStack>
    {expirations.length > 0 && <Tooltip content={expirations.map(at => formatDateTime(at)).join('\n')}><Text type="supporting">{t(`${openai}.expiresAt`, { time: formatDateTime(expirations[0]) })}</Text></Tooltip>}
    {auto && auto.status && <Text type="supporting">{t(`${openai}.autoStatus.${auto.status === 'no_credit' ? 'noCredit' : auto.status}`)} {auto.trigger_window} {auto.checked_at && formatDateTime(auto.checked_at)} {auto.error_code}</Text>}
    {message && <Text type="supporting" role="status">{message}</Text>}
    {error && <Text type="supporting" role="alert">{error}</Text>}
    <AlertDialog isOpen={confirm} onOpenChange={setConfirm} title={t(`${openai}.confirmTitle`)} description={t(`${openai}.confirmMessage`, { count: Math.max(0, (count ?? 0) - 1) })}
      actionLabel={t(`${openai}.reset`)} cancelLabel={t('common.cancel')} onAction={reset} />
  </>
}
