import type { Account, AccountType, CreateAccountRequest, UpdateAccountRequest } from '@/types'
import { defaultCNAdaptiveBaseUrls, defaultCNBaseUrl, isMultiProtocolApiKeyPlatform, resolveProviderAccountMode } from '@/components/account/credentialsBuilder'
import { supportsAccountQuota } from '@/utils/accountQuota'
import type { AuthorizedCredentials } from './ReauthAccountDialog'

export const limits = { quota_limit: 'quotaTotalLimit', quota_daily_limit: 'quotaDailyLimit', quota_weekly_limit: 'quotaWeeklyLimit' } as const
export type Limit = keyof typeof limits
export function typesFor(platform: string): AccountType[] {
  switch (platform) {
    case 'anthropic': return ['apikey', 'oauth', 'setup-token', 'bedrock', 'service_account']
    case 'gemini': return ['apikey', 'oauth', 'service_account']
    case 'openai': case 'grok': case 'antigravity': return ['apikey', 'oauth']
    default: return ['apikey']
  }
}
export const quotaDims = ['daily', 'weekly', 'total'] as const
export type QuotaDim = typeof quotaDims[number]
function quotaSettings(account: Account | null, dim: QuotaDim) {
  const extra = account?.extra ?? {}
  return {
    fixed: extra[`quota_${dim}_reset_mode`] === 'fixed', hour: Number(extra[`quota_${dim}_reset_hour`] ?? 0),
    notify: extra[`quota_notify_${dim}_enabled`] === true, threshold: Number(extra[`quota_notify_${dim}_threshold`] ?? 0),
    percentage: extra[`quota_notify_${dim}_threshold_type`] === 'percentage',
  }
}
export function initialForm(a: Account | null) {
  const c = a?.credentials ?? {}
  const field = (key: string, fallback = '') => typeof c[key] === 'string' ? c[key] : fallback
  const limit = (key: Limit) => Number(a?.extra?.[key] ?? a?.[key] ?? 0)
  return {
    name: a?.name ?? '', notes: a?.notes ?? '', platform: a?.platform ?? 'anthropic', type: a?.type ?? 'apikey',
    priority: a?.priority ?? 1, concurrency: a?.concurrency ?? 3, status: a?.status ?? 'active', schedulable: a?.schedulable ?? true,
    mixedScheduling: a?.extra?.mixed_scheduling === true,
    proxy: a?.proxy_id ?? null, groups: a?.group_ids ?? [], baseUrl: field('base_url'), key: '',
    authMode: field('auth_mode', a?.type === 'bedrock' ? 'sigv4' : 'service_account'), region: field('aws_region', 'us-east-1'),
    accessId: field('aws_access_key_id'), secret: '', session: '', location: field('location', 'global'), project: field('project_id'), json: '',
    quota: { daily: quotaSettings(a, 'daily'), weekly: quotaSettings(a, 'weekly'), total: quotaSettings(a, 'total') },
    day: Number(a?.extra?.quota_weekly_reset_day ?? 1), timezone: String(a?.extra?.quota_reset_timezone ?? 'UTC'),
    mapping: c.model_mapping ? JSON.stringify(c.model_mapping, null, 2) : '',
    quota_limit: limit('quota_limit'), quota_daily_limit: limit('quota_daily_limit'), quota_weekly_limit: limit('quota_weekly_limit'),
  }
}
export type AccountForm = ReturnType<typeof initialForm>

export function buildAccountRequest(f: AccountForm, a: Account | null, authorization: AuthorizedCredentials | null,
  t: (key: string) => string): { create?: CreateAccountRequest; update?: UpdateAccountRequest } {
  const initial = initialForm(a)
  const invalid = (key: string): never => { throw new Error(t(`admin.accounts.${key}`)) }
  if (!f.name.trim()) invalid('pleaseEnterAccountName')
  const update: UpdateAccountRequest = {}
  if (!a || f.name !== initial.name) update.name = f.name.trim()
  if (!a || f.notes !== initial.notes) update.notes = f.notes.trim()
  if (!a || f.concurrency !== initial.concurrency) update.concurrency = f.concurrency
  if (!a || f.priority !== initial.priority) update.priority = f.priority
  if (!a || f.groups.join() !== initial.groups.join()) update.group_ids = f.groups
  if ((!a && f.proxy) || f.proxy !== initial.proxy) update.proxy_id = f.proxy ?? 0
  if (a && f.status !== initial.status) update.status = f.status
  if (a && f.schedulable !== initial.schedulable) update.schedulable = f.schedulable

  const credentials = { ...a?.credentials }
  const oauth = f.type === 'oauth' || f.type === 'setup-token'
  if (oauth && !a && !authorization) invalid('oauth.completeAuth')
  if (!a?.parent_account_id) {
    if (f.type === 'apikey' || f.type === 'upstream') {
      if (!a && f.platform === 'antigravity' && !f.baseUrl.trim()) invalid('upstream.pleaseEnterBaseUrl')
      if (!a || f.baseUrl !== initial.baseUrl) {
        if (f.baseUrl.trim()) credentials.base_url = f.baseUrl.trim()
        else delete credentials.base_url
      }
      if (!a && isMultiProtocolApiKeyPlatform(f.platform)) {
        const mode = resolveProviderAccountMode(f.platform, '')
        credentials.account_mode = mode
        credentials.api_protocol = f.baseUrl.trim() ? 'chat_completions' : 'adaptive'
        if (!f.baseUrl.trim()) credentials.api_base_urls = defaultCNAdaptiveBaseUrls(f.platform, mode)
        credentials.base_url = f.baseUrl.trim() || defaultCNBaseUrl(f.platform, mode)
      }
    }
    if (f.type === 'apikey' || f.type === 'upstream' || (['bedrock', 'service_account'].includes(f.type) && f.authMode === 'apikey')) {
      if (f.key.trim()) credentials.api_key = f.key.trim()
      else if (!a) invalid('pleaseEnterApiKey')
    }
    if (f.type === 'bedrock') {
      if (!a || f.region !== initial.region) credentials.aws_region = f.region.trim() || 'us-east-1'
      if (!a) credentials.auth_mode = f.authMode
      if (f.authMode === 'sigv4') {
        if (!f.accessId.trim() && !a) invalid('bedrockAccessKeyIdRequired')
        if (!f.secret.trim() && !a) invalid('bedrockSecretAccessKeyRequired')
        if (f.accessId !== initial.accessId) credentials.aws_access_key_id = f.accessId.trim()
        if (f.secret.trim()) credentials.aws_secret_access_key = f.secret.trim()
        if (f.session.trim()) credentials.aws_session_token = f.session.trim()
      }
    }
    if (f.type === 'service_account') {
      if (!f.location.trim()) invalid('vertexLocationRequired')
      if (!a || f.location !== initial.location) credentials.location = f.location.trim()
      if (!a) credentials.tier_id = 'vertex'
      if (f.authMode === 'apikey') {
        if (!a) credentials.auth_mode = 'apikey'
        if (f.project !== initial.project) credentials.project_id = f.project.trim()
      } else if (f.json.trim() || !a) {
        let sa
        try { sa = JSON.parse(f.json) } catch { invalid('vertexSaJsonInvalid') }
        if (![sa?.project_id, sa?.client_email, sa?.private_key].every(v => typeof v === 'string' && v.trim())) invalid('vertexSaJsonMissingFields')
        Object.assign(credentials, { service_account_json: f.json.trim(), client_email: sa.client_email, project_id: sa.project_id })
      }
    }
    if (f.mapping !== initial.mapping) {
      if (!f.mapping.trim()) delete credentials.model_mapping
      else {
        let mapping
        try { mapping = JSON.parse(f.mapping) } catch { throw new Error(t('astryx.accountMappingInvalid')) }
        if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.entries(mapping).some(([k,v]) => !k.trim() || typeof v !== 'string' || !v.trim())) throw new Error(t('astryx.accountMappingInvalid'))
        credentials.model_mapping = mapping
      }
    }
  }
  if (JSON.stringify(credentials) !== JSON.stringify(a?.credentials ?? {})) update.credentials = credentials
  if (supportsAccountQuota(f.type)) {
    for (const key of Object.keys(limits) as Limit[]) {
      if (f[key] === initial[key]) continue
      const extra = update.extra ??= { ...a?.extra }
      if (f[key] > 0) extra[key] = f[key]
      else delete extra[key]
    }
    for (const dim of quotaDims) {
      const next = f.quota[dim], prev = initial.quota[dim]
      if (dim !== 'total' && (next.fixed !== prev.fixed || (next.fixed && (next.hour !== prev.hour || (dim === 'weekly' && f.day !== initial.day))))) {
        const extra = update.extra ??= { ...a?.extra }
        if (next.fixed) {
          extra[`quota_${dim}_reset_mode`] = 'fixed'
          extra[`quota_${dim}_reset_hour`] = next.hour
          if (dim === 'weekly') extra.quota_weekly_reset_day = f.day
        } else {
          delete extra[`quota_${dim}_reset_mode`]
          delete extra[`quota_${dim}_reset_hour`]
          if (dim === 'weekly') delete extra.quota_weekly_reset_day
        }
      }
      if (next.notify !== prev.notify || (next.notify && (next.threshold !== prev.threshold || next.percentage !== prev.percentage))) {
        const extra = update.extra ??= { ...a?.extra }
        const prefix = `quota_notify_${dim}`
        if (next.notify) {
          extra[`${prefix}_enabled`] = true
          extra[`${prefix}_threshold_type`] = next.percentage ? 'percentage' : 'fixed'
          if (next.threshold > 0) extra[`${prefix}_threshold`] = next.threshold
          else delete extra[`${prefix}_threshold`]
        } else {
          delete extra[`${prefix}_enabled`]
          delete extra[`${prefix}_threshold_type`]
          delete extra[`${prefix}_threshold`]
        }
      }
    }
    const fixed = f.quota.daily.fixed || f.quota.weekly.fixed
    if (fixed !== (initial.quota.daily.fixed || initial.quota.weekly.fixed) || (fixed && f.timezone !== initial.timezone)) {
      const extra = update.extra ??= { ...a?.extra }
      if (fixed) {
        try { new Intl.DateTimeFormat('en', { timeZone: f.timezone }) } catch { invalid('quotaResetTimezone') }
        extra.quota_reset_timezone = f.timezone
      } else delete extra.quota_reset_timezone
    }
    if (update.extra) {
      delete update.extra.upstream_billing_probe_enabled
      delete update.extra.upstream_billing_rate_sync_enabled
    }
  }
  if (f.platform === 'antigravity' && f.mixedScheduling !== initial.mixedScheduling) {
    const extra = update.extra ??= { ...a?.extra }
    if (f.mixedScheduling) extra.mixed_scheduling = true
    else delete extra.mixed_scheduling
  }
  if (a) return { update }
  return { create: { ...update, name: f.name.trim(), platform: f.platform, type: authorization?.type ?? f.type,
    credentials: { ...credentials, ...authorization?.credentials }, extra: { ...update.extra, ...authorization?.extra } } }
}
