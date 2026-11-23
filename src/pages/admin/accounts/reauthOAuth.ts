/**
 * Framework-free pieces of the account re-authorization flow, ported from the
 * Vue OAuth composables (useAccountOAuth / useOpenAIOAuth / useGeminiOAuth /
 * useAntigravityOAuth / useGrokOAuth) and OAuthAuthorizationFlow.vue: token →
 * credentials/extra builders, the callback-URL parser and i18n key routing.
 */
import type { AntigravityTokenInfo } from '~/lib/api/admin/antigravity'
import type { GeminiTokenInfo } from '~/lib/api/admin/gemini'
import type { GrokTokenInfo } from '~/lib/api/admin/grok'

export type ReAuthPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok'
export type AddMethod = 'oauth' | 'setup-token'
/** The input methods ReAuthAccountModal.vue enables (no email/password, no batch imports). */
export type AuthInputMethod = 'manual' | 'cookie' | 'refresh_token' | 'sso_cookie'
export type GeminiOAuthType = 'code_assist' | 'google_one' | 'ai_studio'

export interface OpenAITokenInfo {
  access_token?: string
  refresh_token?: string
  client_id?: string
  id_token?: string
  expires_at?: number
  email?: string
  name?: string
  plan_type?: string
  subscription_expires_at?: string
  privacy_mode?: string
  chatgpt_account_id?: string
  chatgpt_user_id?: string
  organization_id?: string
  [key: string]: unknown
}

export function reAuthPlatformOf(platform: string): ReAuthPlatform {
  return platform === 'openai' || platform === 'gemini' || platform === 'antigravity' || platform === 'grok'
    ? platform
    : 'anthropic'
}

/** Flow strings live under `admin.accounts.oauth.<platform>`; Claude uses the root block. */
export function oauthKey(platform: ReAuthPlatform, key: string): string {
  return platform === 'anthropic' ? `admin.accounts.oauth.${key}` : `admin.accounts.oauth.${platform}.${key}`
}

/** Re-authorization updates one account, so only the first non-empty line is used. */
export function firstLine(input: string): string {
  return (
    input
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? ''
  )
}

/**
 * Pulls `code` / `state` out of a pasted callback URL or query string
 * (e.g. http://localhost:8085/callback?code=...&state=...). Returns null when
 * the input does not look like one.
 */
export function parseCallbackInput(input: string): { code?: string; state?: string } | null {
  const trimmed = input.trim()
  if (!trimmed.includes('code=')) return null
  try {
    const url = trimmed.includes('?')
      ? new URL(trimmed)
      : new URL(`http://localhost/callback?${trimmed.replace(/^\?/, '')}`)
    return { code: url.searchParams.get('code') ?? undefined, state: url.searchParams.get('state') ?? undefined }
  } catch {
    const match = trimmed.match(/[?&]code=([^&]+)/)
    const stateMatch = trimmed.match(/[?&]state=([^&]+)/)
    return { code: match?.[1], state: stateMatch?.[1] }
  }
}

/** Claude token response → account extra (org / account uuid, email). */
export function buildClaudeExtra(tokenInfo: Record<string, unknown>): Record<string, string> | undefined {
  const extra: Record<string, string> = {}
  for (const key of ['org_uuid', 'account_uuid', 'email_address']) {
    const value = tokenInfo[key]
    if (typeof value === 'string' && value) extra[key] = value
  }
  return Object.keys(extra).length > 0 ? extra : undefined
}

/** Aligned with the backend BuildAccountCredentials; never overwrites a stored refresh token with an empty one. */
export function buildOpenAICredentials(tokenInfo: OpenAITokenInfo): Record<string, unknown> {
  const creds: Record<string, unknown> = {
    access_token: tokenInfo.access_token,
    expires_at: tokenInfo.expires_at,
  }
  const optional = [
    'refresh_token',
    'id_token',
    'email',
    'chatgpt_account_id',
    'chatgpt_user_id',
    'organization_id',
    'plan_type',
    'subscription_expires_at',
    'client_id',
  ] as const
  for (const key of optional) {
    if (tokenInfo[key]) creds[key] = tokenInfo[key]
  }
  return creds
}

export function buildOpenAIExtra(tokenInfo: OpenAITokenInfo): Record<string, string> | undefined {
  const extra: Record<string, string> = {}
  if (tokenInfo.email) extra.email = tokenInfo.email
  if (tokenInfo.name) extra.name = tokenInfo.name
  if (tokenInfo.privacy_mode) extra.privacy_mode = tokenInfo.privacy_mode
  return Object.keys(extra).length > 0 ? extra : undefined
}

/** Google token expiry arrives as a number or string; credentials store it as a string. */
function normalizeExpiresAt(value: number | string | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value).toString()
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function buildGeminiCredentials(tokenInfo: GeminiTokenInfo): Record<string, unknown> {
  return {
    access_token: tokenInfo.access_token,
    refresh_token: tokenInfo.refresh_token,
    token_type: tokenInfo.token_type,
    expires_at: normalizeExpiresAt(tokenInfo.expires_at),
    scope: tokenInfo.scope,
    project_id: tokenInfo.project_id,
    oauth_type: tokenInfo.oauth_type,
    tier_id: tokenInfo.tier_id,
  }
}

export function buildAntigravityCredentials(
  tokenInfo: AntigravityTokenInfo,
  fallbackRefreshToken?: string,
): Record<string, unknown> {
  return {
    access_token: tokenInfo.access_token,
    refresh_token: tokenInfo.refresh_token?.trim() ? tokenInfo.refresh_token : fallbackRefreshToken,
    token_type: tokenInfo.token_type,
    expires_at: normalizeExpiresAt(tokenInfo.expires_at),
    project_id: tokenInfo.project_id,
    email: tokenInfo.email,
    ...(tokenInfo.plan_type ? { plan_type: tokenInfo.plan_type } : {}),
  }
}

/**
 * Grok Build OAuth credentials. Raw SSO cookies and passwords exist only for
 * the one-shot authorize call and are never persisted.
 */
export function buildGrokCredentials(tokenInfo: GrokTokenInfo): Record<string, unknown> {
  const credentials: Record<string, unknown> = {
    access_token: tokenInfo.access_token,
    token_type: tokenInfo.token_type,
    expires_at: tokenInfo.expires_at,
    client_id: tokenInfo.client_id,
    scope: tokenInfo.scope,
    email: tokenInfo.email,
    sub: tokenInfo.sub,
    team_id: tokenInfo.team_id,
    subscription_tier: tokenInfo.subscription_tier,
    entitlement_status: tokenInfo.entitlement_status,
    // base_url stays unset so system/CLI mode can choose the correct host.
  }
  if (tokenInfo.refresh_token) credentials.refresh_token = tokenInfo.refresh_token
  if (tokenInfo.id_token) credentials.id_token = tokenInfo.id_token
  const blocked = new Set(['sso_token', 'password', 'sso', 'sso-rw'])
  return Object.fromEntries(
    Object.entries(credentials).filter(([key, value]) => !blocked.has(key) && value !== undefined && value !== ''),
  )
}

export function buildGrokExtra(tokenInfo: GrokTokenInfo): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  if (tokenInfo.email) extra.email = tokenInfo.email
  if (tokenInfo.subscription_tier) extra.subscription_tier = tokenInfo.subscription_tier
  if (tokenInfo.entitlement_status) extra.entitlement_status = tokenInfo.entitlement_status
  return extra
}
