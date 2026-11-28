import { buildModelMappingObject, isValidWildcardPattern } from '@/composables/useModelWhitelist'
import { applyHeaderOverride, isHeaderOverrideCapable, splitHeaderOverridesObject, validateHeaderOverrideRows, providerRoutesByModel, defaultProviderProtocolRules, applyOpenCodeGoProtocolRules, parseOpenCodeGoProtocolRules, type OpenCodeGoProtocolRule, type CnApiProtocol, type CnNativeApiProtocol, providerNativeProtocols } from '@/components/account/credentialsBuilder'
import { applyOpenAIImageSizeTiersToExtra, readOpenAIImageSizeTiers } from '@/components/account/openaiImageSizeTiers'
import { formatDateTimeLocalInput, parseDateTimeLocalInput } from '@/utils/format'
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
  const endpoints = Object.fromEntries(Object.entries((c.api_base_urls ?? {}) as Record<string,unknown>).filter(([,v]) => typeof v === 'string')) as Partial<Record<CnNativeApiProtocol,string>>
  const legacyProtocol = c.api_protocol === 'anthropic' || c.api_protocol === 'responses' ? c.api_protocol : 'chat_completions'
  if (field('base_url') && !endpoints[legacyProtocol]) endpoints[legacyProtocol] = field('base_url')
  const models = Object.entries((c.model_mapping ?? {}) as Record<string,string>)
  const limit = (key: Limit) => Number(a?.extra?.[key] ?? a?.[key] ?? 0)
  return {
    name: a?.name ?? '', notes: a?.notes ?? '', platform: a?.platform ?? 'anthropic', type: a?.type ?? 'apikey',
    expires: formatDateTimeLocalInput(a?.expires_at ?? null), autoPause: a ? !!a.auto_pause_on_expired : true,
    loadFactor: a?.load_factor ?? null, rate: a?.rate_multiplier ?? 1, overages: a?.extra?.allow_overages === true,
    probe: a?.extra?.upstream_billing_probe_enabled === true, syncRate: a?.extra?.upstream_billing_rate_sync_enabled === true,
    syncGroup: a?.extra?.upstream_billing_group_sync_enabled === true,
    headerEnabled: c.header_override_enabled === true, headerRows: splitHeaderOverridesObject(c.header_overrides).map((row,i) => ({...row,key: -1-i})),
    providerMode: a ? resolveProviderAccountMode(a.platform, c.account_mode) : '',
    protocol: (a ? field('api_protocol','chat_completions') : 'adaptive') as CnApiProtocol,
    endpoints,
    tiers: readOpenAIImageSizeTiers(a?.extra), rules: parseOpenCodeGoProtocolRules(c.protocol_rules) as OpenCodeGoProtocolRule[] | null,
    priority: a?.priority ?? 1, concurrency: a?.concurrency ?? 3, status: a?.status ?? 'active', schedulable: a?.schedulable ?? true,
    mixedScheduling: a?.extra?.mixed_scheduling === true,
    proxy: a?.proxy_id ?? null, groups: a?.group_ids ?? [], baseUrl: field('base_url'), key: '',
    authMode: field('auth_mode', a?.type === 'bedrock' ? 'sigv4' : 'service_account'), region: field('aws_region', 'us-east-1'),
    accessId: field('aws_access_key_id'), secret: '', session: '', location: field('location', 'global'), project: field('project_id'), json: '',
    quota: { daily: quotaSettings(a, 'daily'), weekly: quotaSettings(a, 'weekly'), total: quotaSettings(a, 'total') },
    day: Number(a?.extra?.quota_weekly_reset_day ?? 1), timezone: String(a?.extra?.quota_reset_timezone ?? 'UTC'),
    whitelist: models.filter(([from,to]) => from === to).map(([from]) => from),
    aliases: models.filter(([from,to]) => from !== to).map(([from,to],i) => ({key:-1-i,from,to})),
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

  if (f.expires !== initial.expires) {
    const timestamp = parseDateTimeLocalInput(f.expires)
    if (f.expires && timestamp == null) invalid('expiresAtHint')
    update.expires_at = timestamp ?? 0
  }
  if (!a || f.autoPause !== initial.autoPause) update.auto_pause_on_expired = f.autoPause
  if (f.loadFactor !== initial.loadFactor) update.load_factor = f.loadFactor ?? 0
  if (f.rate !== initial.rate && !f.syncRate) update.rate_multiplier = f.rate
  if (f.type === 'apikey') {
    if (f.probe !== initial.probe) update.upstream_billing_probe_enabled = f.probe
    if (f.syncGroup !== initial.syncGroup) update.upstream_billing_group_sync_enabled = f.syncGroup
    if (a && f.syncRate !== initial.syncRate) update.upstream_billing_rate_sync_enabled = f.syncRate
  }
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
      if (isMultiProtocolApiKeyPlatform(f.platform) && (!a || f.providerMode !== initial.providerMode || f.protocol !== initial.protocol || JSON.stringify(f.endpoints) !== JSON.stringify(initial.endpoints))) {
        const mode = resolveProviderAccountMode(f.platform, f.providerMode)
        credentials.account_mode = mode
        credentials.api_protocol = f.protocol
        if (f.protocol === 'adaptive') {
          const defaults = defaultCNAdaptiveBaseUrls(f.platform, mode)
          const urls = Object.fromEntries(providerNativeProtocols(f.platform, mode).map(key => [key, f.endpoints[key]?.trim() || defaults[key]]))
          credentials.api_base_urls = urls
          credentials.base_url = urls.chat_completions || defaultCNBaseUrl(f.platform,mode)
        } else {
          delete credentials.api_base_urls
          credentials.base_url = f.baseUrl.trim() || defaultCNBaseUrl(f.platform,mode,f.protocol)
        }
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
    if (isHeaderOverrideCapable(f.platform, f.type) && (f.headerEnabled !== initial.headerEnabled || JSON.stringify(f.headerRows) !== JSON.stringify(initial.headerRows))) {
      const error = f.headerEnabled && validateHeaderOverrideRows(f.headerRows, {allowVariables: f.type === 'apikey'})
      if (error) invalid(`headerOverride.${error}`)
      applyHeaderOverride(credentials, f.headerEnabled, f.headerRows, a ? 'edit' : 'create')
    }
    if (f.type === 'apikey' && providerRoutesByModel(f.platform) && f.protocol === 'adaptive' && (!a || JSON.stringify(f.rules) !== JSON.stringify(initial.rules))) {
      applyOpenCodeGoProtocolRules(credentials, f.rules ?? defaultProviderProtocolRules(f.platform, resolveProviderAccountMode(f.platform, f.providerMode)), a ? 'edit' : 'create')
    }
    if (JSON.stringify(f.aliases) !== JSON.stringify(initial.aliases) || JSON.stringify(f.whitelist) !== JSON.stringify(initial.whitelist)) {
      const seen = new Set(f.whitelist)
      if (f.whitelist.some(model => model.includes('*'))) throw new Error(t('astryx.accountMappingInvalid'))
      for (const row of f.aliases) {
        const from = row.from.trim(), to = row.to.trim()
        if (!from && !to) continue
        if (!from || !to || !isValidWildcardPattern(from) || to.includes('*') || seen.has(from)) throw new Error(t('astryx.accountMappingInvalid'))
        seen.add(from)
      }
      const mapping = buildModelMappingObject('combined', f.whitelist, f.aliases)
      if (mapping) credentials.model_mapping = mapping
      else delete credentials.model_mapping
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

  }
  if (f.platform === 'antigravity' && f.mixedScheduling !== initial.mixedScheduling) {
    const extra = update.extra ??= { ...a?.extra }
    if (f.mixedScheduling) extra.mixed_scheduling = true
    else delete extra.mixed_scheduling
  }
  if (f.platform === 'antigravity' && f.overages !== initial.overages) {
    const extra = update.extra ??= { ...a?.extra }
    if (f.overages) extra.allow_overages = true
    else delete extra.allow_overages
  }
  if (f.platform === 'openai' && f.tiers.join() !== initial.tiers.join()) applyOpenAIImageSizeTiersToExtra(update.extra ??= { ...a?.extra }, f.tiers)
  if (f.type === 'apikey' && update.extra) {
    // The backend owns probe state and accepts these switches only at the top level.
    delete update.extra.upstream_billing_probe
    delete update.extra.upstream_billing_probe_enabled
    delete update.extra.upstream_billing_rate_sync_enabled
    delete update.extra.upstream_billing_group_sync_enabled
  }
  if (a) return { update }
  return { create: { ...update, name: f.name.trim(), platform: f.platform, type: authorization?.type ?? f.type,
    credentials: { ...credentials, ...authorization?.credentials }, extra: { ...update.extra, ...authorization?.extra } } }
}
