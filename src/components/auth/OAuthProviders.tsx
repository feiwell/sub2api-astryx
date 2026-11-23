import { useSearchParams } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { resolveWeChatOAuthStart, isWeChatWebOAuthEnabled, type OAuthLoginStart } from '@/api/auth'
import type { PublicSettings } from '@/types'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/utils/oauthAffiliate'
import { useI18n } from '~/i18n'

const EMAIL_OAUTH_PENDING_PROVIDER_KEY = 'email_oauth_pending_provider'

export interface OAuthProvidersProps {
  settings: PublicSettings | null
  disabled?: boolean
  /** Affiliate code from the form (register page). */
  affCode?: string
  promoCode?: string
  /** Hide providers that only support login (DingTalk) on the register page. */
  mode?: 'login' | 'register'
  onStart: (request: OAuthLoginStart) => void
}

export function hasOAuthProviders(settings: PublicSettings | null, mode: 'login' | 'register' = 'login'): boolean {
  if (!settings || settings.backend_mode_enabled) return false
  return !!(
    settings.linuxdo_oauth_enabled ||
    (mode === 'login' && settings.dingtalk_oauth_enabled) ||
    isWeChatWebOAuthEnabled(settings) ||
    settings.oidc_oauth_enabled ||
    settings.github_oauth_enabled ||
    settings.google_oauth_enabled
  )
}

/** All third-party sign-in buttons, ported from the Vue *OAuthSection components. */
export function OAuthProviders({ settings, disabled, affCode, promoCode, mode = 'login', onStart }: OAuthProvidersProps) {
  const { t, locale } = useI18n()
  const [query] = useSearchParams()
  if (!settings || !hasOAuthProviders(settings, mode)) return null

  const redirect = query.get('redirect') || '/dashboard'
  const storeAffiliate = () =>
    resolveAffiliateReferralCode(affCode, query.get('aff') ?? undefined, query.get('aff_code') ?? undefined)

  const start = (provider: OAuthLoginStart['provider'], extra: Record<string, string> = {}) => {
    const code = storeAffiliate()
    storeOAuthAffiliateCode(code)
    const params: Record<string, string> = { redirect, ...extra }
    const promo = promoCode?.trim()
    if (promo && (provider === 'linuxdo' || provider === 'github' || provider === 'google')) params.promo_code = promo
    if (code && (provider === 'github' || provider === 'google')) params.aff_code = code
    if (provider === 'github' || provider === 'google') {
      window.sessionStorage.setItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY, provider)
    }
    onStart({ provider, params })
  }

  const wechat = resolveWeChatOAuthStart(settings)
  let wechatHint = ''
  switch (wechat.unavailableReason) {
    case 'external_browser_required':
      wechatHint = t('auth.oauthFlow.wechatSystemBrowserOnly')
      break
    case 'wechat_browser_required':
      wechatHint = t('auth.oauthFlow.wechatBrowserOnly')
      break
    case 'native_app_required':
      wechatHint = locale === 'zh'
        ? '当前仅配置微信移动应用登录，需要在原生 App 中通过微信 SDK 发起授权。'
        : 'This site only has WeChat mobile app login configured. Continue from the native app through the WeChat SDK.'
      break
    case 'not_configured':
      wechatHint = t('auth.oauthFlow.wechatNotConfigured')
      break
  }

  const emailProviders = [
    settings.github_oauth_enabled ? ('github' as const) : null,
    settings.google_oauth_enabled ? ('google' as const) : null,
  ].filter((p): p is 'github' | 'google' => p !== null)
  const oidcName = settings.oidc_oauth_provider_name?.trim() || 'OIDC'

  return (
    <VStack gap={3} hAlign="stretch">
      <Divider label={t('auth.oauthOrContinue')} />
      {settings.linuxdo_oauth_enabled && (
        <Button
          label={t('auth.linuxdo.signIn')}
          variant="secondary"
          size="lg"
          isDisabled={disabled}
          onClick={() => start('linuxdo')}
        />
      )}
      {mode === 'login' && settings.dingtalk_oauth_enabled && (
        <Button
          label={t('auth.dingtalk.signIn')}
          variant="secondary"
          size="lg"
          isDisabled={disabled}
          onClick={() => start('dingtalk')}
        />
      )}
      {isWeChatWebOAuthEnabled(settings) && (
        <VStack gap={1} hAlign="stretch">
          <Button
            label={t('auth.oidc.signIn', { providerName: t('auth.wechatProviderName') })}
            variant="secondary"
            size="lg"
            isDisabled={disabled || wechat.mode === null}
            onClick={() => wechat.mode && start('wechat', { mode: wechat.mode })}
          />
          {wechatHint && !disabled && (
            <Text type="supporting" color="secondary" justify="center">
              {wechatHint}
            </Text>
          )}
        </VStack>
      )}
      {settings.oidc_oauth_enabled && (
        <Button
          label={t('auth.oidc.signIn', { providerName: oidcName })}
          variant="secondary"
          size="lg"
          isDisabled={disabled}
          onClick={() => start('oidc')}
        />
      )}
      {emailProviders.length > 0 && (
        <div className={emailProviders.length > 1 ? 'oauth-email-grid' : undefined}>
          {emailProviders.map((p) => {
            const name = p === 'github' ? 'GitHub' : 'Google'
            return (
              <Button
                key={p}
                label={emailProviders.length > 1 ? name : t('auth.emailOAuth.signIn', { providerName: name })}
                variant="secondary"
                size="lg"
                width="100%"
                isDisabled={disabled}
                onClick={() => start(p)}
              />
            )
          })}
        </div>
      )}
    </VStack>
  )
}
