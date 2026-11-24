import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { AccountListItem, AccountUsageInfo, GeminiCredentials, UsageProgress } from '@/types'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { UsageProgressBar } from './UsageProgressBar'

export function WindowBar({ label, progress, withStats = true, idle = false, estimate = false }: {
  label: string; progress?: UsageProgress | null; withStats?: boolean; idle?: boolean; estimate?: boolean
}) {
  if (!progress) return null
  const cost = progress.window_stats?.cost ?? 0
  const total = estimate && cost > 0 && progress.utilization > 0 ? 100 * cost / progress.utilization : undefined
  return <UsageProgressBar label={label} utilization={progress.utilization} resetsAt={progress.resets_at}
    windowStats={withStats ? progress.window_stats : null} showNowWhenIdle={idle}
    estimatedTotalCost={Number.isFinite(total) ? total : undefined} />
}

function geminiChannel(account: AccountListItem) {
  const creds: GeminiCredentials = account.credentials ?? {}
  const tier = String(creds.tier_id ?? '').trim().toLowerCase()
  if (account.type === 'service_account') return { channel: 'vertex', level: '', shared: false, policy: '' }
  if (creds.oauth_type === 'google_one') {
    const levels: Record<string, string> = { google_ai_pro: 'pro', ai_premium: 'pro', google_one_standard: 'pro',
      google_ai_ultra: 'ultra', google_one_unlimited: 'ultra', google_one_free: 'free', google_one_basic: 'free',
      google_one_unknown: 'free', free: 'free', '': 'free' }
    const level = levels[tier] ?? ''
    return { channel: 'google one', level, shared: true, policy: `googleOne.limits${level === 'ultra' ? 'Ultra' : level === 'pro' ? 'Pro' : 'Free'}` }
  }
  if (creds.oauth_type === 'code_assist' || (!creds.oauth_type && creds.project_id)) {
    const enterprise = /enterprise|ultra/.test(tier)
    return { channel: 'gcp', level: enterprise ? 'enterprise' : 'standard', shared: true,
      policy: enterprise ? 'gcp.limitsEnterprise' : 'gcp.limitsStandard' }
  }
  const isKey = account.type === 'apikey'
  const client = creds.oauth_type === 'ai_studio'
  const level = (isKey || client) && /paid|pay/.test(tier) ? 'paid' : isKey || (client && tier.includes('free')) ? 'free' : ''
  return { channel: !isKey && client ? 'client' : 'ai studio', level, shared: false, policy: `aiStudio.limits${level === 'paid' ? 'Paid' : 'Free'}` }
}

export function GeminiUsage({ account, usage, settled }: { account: AccountListItem; usage?: AccountUsageInfo; settled: boolean }) {
  const { t } = useI18n()
  const { channel, level, shared, policy } = geminiChannel(account)
  const label = [channel, level].filter(Boolean).join(' ')
  const base = 'admin.accounts.gemini.quotaPolicy'
  const hasData = !!(usage?.gemini_shared_daily || usage?.gemini_pro_daily || usage?.gemini_flash_daily ||
    usage?.gemini_shared_minute || usage?.gemini_pro_minute || usage?.gemini_flash_minute)
  const sharedPool = shared || usage?.gemini_shared_daily || usage?.gemini_shared_minute
  return <>
    {policy ? <Link isExternalLink href={shared ? 'https://developers.google.com/gemini-code-assist/resources/quotas' : 'https://ai.google.dev/pricing'}
      tooltip={[t(`${base}.title`), t(`${base}.note`), t(`${base}.rows.${policy}`)].join('\n')}>{label}</Link> : <Text type="supporting">{label}</Text>}
    {sharedPool ? <WindowBar label="1d" progress={usage?.gemini_shared_daily} /> : <>
      <WindowBar label="pro" progress={usage?.gemini_pro_daily} /><WindowBar label="flash" progress={usage?.gemini_flash_daily} />
    </>}
    {hasData && <Text type="supporting" color="secondary">{t(`${base}.simulatedNote`)}</Text>}
    {settled && !hasData && channel !== 'vertex' && <Text type="supporting" color="secondary">{t('admin.accounts.gemini.rateLimit.unlimited')}</Text>}
  </>
}

const modelGroups: Record<string, string[]> = {
  gemini3Pro: ['gemini-3-pro-low', 'gemini-3-pro-high', 'gemini-3-pro-preview'],
  gemini3Flash: ['gemini-3-flash'],
  gemini3Image: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image'],
  claude: ['claude-fable-5-1', 'claude-fable-5', 'claude-sonnet-4-5', 'claude-opus-4-5-thinking', 'claude-sonnet-4-6',
    'claude-opus-4-6', 'claude-opus-4-6-thinking', 'claude-opus-4-7', 'claude-opus-4-8'],
}

export function AntigravityUsage({ account, usage }: { account: AccountListItem; usage?: AccountUsageInfo }) {
  const { t } = useI18n()
  const assist = account.extra?.load_code_assist as { paidTier?: { id?: string }; currentTier?: { id?: string }; ineligibleTiers?: unknown[] } | undefined
  const tiers: Record<string, string> = { 'g1-pro-tier': 'pro', 'g1-ultra-tier': 'ultra', 'free-tier': 'free' }
  const tier = tiers[assist?.paidTier?.id ?? assist?.currentTier?.id ?? '']
  const credits = usage?.ai_credits?.reduce((sum, credit) => sum + (credit.amount ?? 0), 0) ?? 0
  const groupBars = (usage?.antigravity_quota_groups ?? []).flatMap(group => (group.windows ?? []).map(window => {
    const family = group.key === 'gemini' ? 'Gemini' : group.key.startsWith('gemini-argon') ? 'Argon' : 'Other'
    const label = t(`admin.accounts.usageWindow.antigravity${family}${window.window === 'weekly' ? 'Weekly' : '5h'}`)
    return <UsageProgressBar key={`${group.key}-${window.window}`} label={label} hint={group.name}
      utilization={window.utilization} resetsAt={window.resets_at} />
  }))
  const modelBars = !groupBars.length && Object.entries(modelGroups).map(([key, models]) => {
    const quotas = models.flatMap(model => usage?.antigravity_quota?.[model] ?? [])
    if (!quotas.length) return null
    const resets = quotas.map(q => q.reset_time).filter(Boolean).sort()
    return <UsageProgressBar key={key} label={t(`admin.accounts.usageWindow.${key}`)}
      utilization={Math.max(...quotas.map(q => q.utilization))} resetsAt={resets[0]} />
  })
  const verification = usage?.validation_url && /^https?:\/\//i.test(usage.validation_url) ? usage.validation_url : null
  const forbidden = usage?.forbidden_type === 'validation' ? 'forbiddenValidation' : usage?.forbidden_type === 'violation' ? 'forbiddenViolation' : 'forbidden'
  const blocked = usage?.is_forbidden || usage?.needs_reauth || usage?.error
  return <>
    {tier && <HStack><Token size="sm" color={tier === 'ultra' ? 'purple' : tier === 'pro' ? 'blue' : 'gray'} label={t(`admin.accounts.tier.${tier}`)} /></HStack>}
    {!!assist?.ineligibleTiers?.length && <Text type="supporting">{t('admin.accounts.ineligibleWarning')}</Text>}
    {usage?.is_forbidden && <>
      <Text type="supporting">{t(`admin.accounts.${forbidden}`)}</Text>
      {verification && <HStack gap={1} wrap="wrap"><Link href={verification} isExternalLink>{t('admin.accounts.openVerification')}</Link>
        <Button size="sm" variant="ghost" label={t('admin.accounts.copyLink')} onClick={() => void copyToClipboard(verification, t('admin.accounts.linkCopied'))} /></HStack>}
    </>}
    {!usage?.is_forbidden && usage?.needs_reauth && <Text type="supporting">{t('admin.accounts.needsReauth')}</Text>}
    {!blocked && <>{groupBars.length ? groupBars : modelBars}
      {credits > 0 && <Text type="supporting">{t('admin.accounts.aiCreditsBalance')} {credits.toFixed(0)}</Text>}</>}
  </>
}

export function UsageWarning({ usage, platform }: { usage: AccountUsageInfo; platform: string }) {
  const { t } = useI18n()
  if (usage.is_forbidden || usage.needs_reauth) {
    if (platform === 'antigravity' || platform === 'grok') return null
    return <Text type="supporting" role="alert">{usage.error || t(usage.needs_reauth ? 'admin.accounts.needsReauth' : 'admin.accounts.forbidden')}</Text>
  }
  if (!usage.error) return null
  return <Tooltip content={usage.error}><Text type="supporting" role="status">
    {usage.error_code ? t(usage.error_code === 'rate_limited' ? 'admin.accounts.rateLimited' : 'admin.accounts.usageError') : usage.error}
  </Text></Tooltip>
}
