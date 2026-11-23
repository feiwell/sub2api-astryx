import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { EnvelopeIcon, LockClosedIcon, KeyIcon } from '@heroicons/react/24/outline'
import {
  completeLinuxDoOAuthRegistration,
  completeOIDCOAuthRegistration,
  completeWeChatOAuthRegistration,
  exchangePendingOAuthCompletion,
  getAuthToken,
  getOAuthCompletionKind,
  getPublicSettings,
  hasExplicitWeChatOAuthCapabilities,
  isOAuthLoginCompletion,
  login2FA,
  persistOAuthTokenContext,
  prepareOAuthBindAccessTokenCookie,
  resolveWeChatOAuthStartStrict,
  type OAuthAdoptionDecision,
  type OAuthTokenResponse,
  type PendingOAuthExchangeResponse,
} from '@/api/auth'
import { clearAllAffiliateReferralCodes, loadOAuthAffiliateCode, oauthAffiliatePayload } from '@/utils/oauthAffiliate'
import { apiClient } from '~/lib/api/client'
import { getAPIBaseURL } from '~/lib/api/url'
import { AuthLayout } from '~/layouts/AuthLayout'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { toast } from '~/lib/toast'
import { PendingOAuthCreateAccountForm, type PendingOAuthCreateAccountPayload } from './PendingOAuthCreateAccountForm'

export type PendingOAuthProvider = 'linuxdo' | 'dingtalk' | 'oidc' | 'wechat'
type AccountAction = 'none' | 'choose_account_action' | 'create_account' | 'bind_login'

type PendingCompletion = PendingOAuthExchangeResponse & {
  step?: string
  status?: string
  state?: string
  intent?: string
  email?: string
  resolved_email?: string
  pending_email?: string
  existing_account_email?: string
  suggested_email?: string
  compat_email?: string
  requires_email_completion?: boolean
}

export function sanitizeRedirectPath(path: string | null | undefined): string {
  if (!path) return '/dashboard'
  if (!path.startsWith('/')) return '/dashboard'
  if (path.startsWith('//')) return '/dashboard'
  if (path.includes('://')) return '/dashboard'
  if (path.includes('\n') || path.includes('\r')) return '/dashboard'
  return path
}

export function requestErrorMessage(error: unknown, fallback: string): string {
  const err = error as { message?: string; response?: { data?: { detail?: string; message?: string } } }
  return err.response?.data?.detail || err.response?.data?.message || err.message || fallback
}

function parseFragmentParams(): URLSearchParams {
  const raw = typeof window !== 'undefined' ? window.location.hash : ''
  return new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw)
}

function readLegacyFragmentLogin(params: URLSearchParams): OAuthTokenResponse | null {
  const accessToken = params.get('access_token')?.trim() || ''
  if (!accessToken) return null
  const completion: OAuthTokenResponse = { access_token: accessToken }
  const refreshToken = params.get('refresh_token')?.trim() || ''
  if (refreshToken) completion.refresh_token = refreshToken
  const expiresIn = Number.parseInt(params.get('expires_in')?.trim() || '', 10)
  if (Number.isFinite(expiresIn) && expiresIn > 0) completion.expires_in = expiresIn
  const tokenType = params.get('token_type')?.trim() || ''
  if (tokenType) completion.token_type = tokenType
  return completion
}

function serializeAdoptionDecision(decision: OAuthAdoptionDecision): Record<string, boolean> {
  const payload: Record<string, boolean> = {}
  if (typeof decision.adoptDisplayName === 'boolean') payload.adopt_display_name = decision.adoptDisplayName
  if (typeof decision.adoptAvatar === 'boolean') payload.adopt_avatar = decision.adoptAvatar
  return payload
}

function resolveAccountAction(completion: PendingCompletion, provider: PendingOAuthProvider): AccountAction {
  const source =
    provider === 'wechat'
      ? completion.step || completion.status || completion.state || completion.error || completion.intent
      : completion.step || completion.error || completion.intent
  const raw = source?.trim().toLowerCase() || ''
  if (['choice', 'choose_account_action_required', 'choose_account_action', 'choose_account', 'choose'].includes(raw)) {
    return 'choose_account_action'
  }
  if (['email_required', 'create_account_required', 'create_account'].includes(raw)) return 'create_account'
  const bindStates = [
    'bind_login_required',
    'bind_login',
    'existing_account_required',
    'existing_account_binding_required',
    'adopt_existing_user_by_email',
  ]
  if (provider !== 'oidc') bindStates.push('existing_account')
  return bindStates.includes(raw) ? 'bind_login' : 'none'
}

function isCreateAccountRecoveryError(error: unknown): boolean {
  const data = (error as { response?: { data?: Record<string, string | undefined> } }).response?.data
  const states = [data?.reason, data?.error, data?.code, data?.step, data?.intent]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
  return [
    'email_exists',
    'bind_login_required',
    'bind_login',
    'adopt_existing_user_by_email',
    'existing_account_required',
    'existing_account_binding_required',
  ].some((s) => states.includes(s))
}

function needsEmailCompletion(completion: PendingCompletion): boolean {
  return completion.step === 'email_completion' || completion.requires_email_completion === true
}

/**
 * Shared port of LinuxDoCallbackView / DingTalkCallbackView / OidcCallbackView /
 * WechatCallbackView: pending OAuth exchange with invitation, profile adoption,
 * account chooser, create-account, bind-login and TOTP branches.
 */
export function PendingOAuthCallback({ provider }: { provider: PendingOAuthProvider }) {
  const { t, te } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const setToken = useAuthStore((s) => s.setToken)
  const setPendingAuthSession = useAuthStore((s) => s.setPendingAuthSession)
  const clearPendingAuthSession = useAuthStore((s) => s.clearPendingAuthSession)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)

  const isWechat = provider === 'wechat'
  const keyNs = provider === 'linuxdo' || provider === 'dingtalk' ? provider : 'oidc'
  const [oidcName, setOidcName] = useState('OIDC')
  const providerName =
    provider === 'linuxdo'
      ? 'LinuxDo'
      : provider === 'dingtalk'
        ? t('auth.dingtalkProviderName')
        : provider === 'wechat'
          ? t('auth.wechatProviderName')
          : oidcName

  const [isProcessing, setProcessing] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [needsInvitation, setNeedsInvitation] = useState(false)
  const [invitationCode, setInvitationCode] = useState('')
  const [needsAdoptionConfirmation, setNeedsAdoptionConfirmation] = useState(false)
  const [adoptionRequired, setAdoptionRequired] = useState(false)
  const [suggestedDisplayName, setSuggestedDisplayName] = useState('')
  const [suggestedAvatarUrl, setSuggestedAvatarUrl] = useState('')
  const [adoptDisplayName, setAdoptDisplayName] = useState(true)
  const [adoptAvatar, setAdoptAvatar] = useState(true)
  const [accountAction, setAccountAction] = useState<AccountAction>('none')
  const [pendingAccountEmail, setPendingAccountEmail] = useState('')
  const [bindLoginEmail, setBindLoginEmail] = useState('')
  const [bindLoginPassword, setBindLoginPassword] = useState('')
  const [existingAccountEmail, setExistingAccountEmail] = useState('')
  const [canReturnToCreateAccount, setCanReturnToCreateAccount] = useState(false)
  const [accountActionError, setAccountActionError] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [totpTempToken, setTotpTempToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpUserEmailMasked, setTotpUserEmailMasked] = useState('')

  const legacyTokenRef = useRef('')
  const redirectRef = useRef('/dashboard')
  // Adoption choices are read inside async handlers, so mirror them in a ref.
  const decisionRef = useRef<OAuthAdoptionDecision>({ adoptDisplayName: true, adoptAvatar: true })
  decisionRef.current = { adoptDisplayName, adoptAvatar }

  const hasCurrentAuthToken = Boolean(getAuthToken())
  const resumeEmail = (query.get('email') || '').trim()

  useEffect(() => {
    if (errorMessage) toast.error(errorMessage)
  }, [errorMessage])
  useEffect(() => {
    if (accountActionError) toast.error(accountActionError)
  }, [accountActionError])

  function persistPending(redirect?: string) {
    setPendingAuthSession({
      token: '',
      token_field: 'pending_oauth_token',
      provider,
      redirect: sanitizeRedirectPath(redirect || redirectRef.current),
    })
  }

  function applyAdoptionSuggestion(completion: PendingCompletion) {
    setAdoptionRequired(completion.adoption_required === true)
    setSuggestedDisplayName(completion.suggested_display_name || '')
    setSuggestedAvatarUrl(completion.suggested_avatar_url || '')
    if (!completion.suggested_display_name) setAdoptDisplayName(false)
    if (!completion.suggested_avatar_url) setAdoptAvatar(false)
    decisionRef.current = {
      adoptDisplayName: completion.suggested_display_name ? decisionRef.current.adoptDisplayName : false,
      adoptAvatar: completion.suggested_avatar_url ? decisionRef.current.adoptAvatar : false,
    }
  }

  function extractEmail(c: PendingCompletion): string {
    return (
      c.pending_email ||
      c.existing_account_email ||
      c.compat_email ||
      c.email ||
      c.resolved_email ||
      c.suggested_email ||
      (isWechat ? resumeEmail : '') ||
      ''
    ).trim()
  }

  function applyAccountAction(completion: PendingCompletion): AccountAction {
    const action = resolveAccountAction(completion, provider)
    setAccountAction(action)
    setAccountActionError('')
    setNeedsTotp(false)
    setTotpTempToken('')
    setTotpCode('')
    setTotpUserEmailMasked('')
    const email = extractEmail(completion)
    if (action === 'choose_account_action') {
      setPendingAccountEmail(email)
      setBindLoginEmail(email)
      setBindLoginPassword('')
      setCanReturnToCreateAccount(false)
    } else if (action === 'create_account') {
      setPendingAccountEmail(email)
      setCanReturnToCreateAccount(true)
    } else if (action === 'bind_login') {
      setBindLoginEmail(email)
      setBindLoginPassword('')
      setCanReturnToCreateAccount(false)
    } else {
      setCanReturnToCreateAccount(false)
    }
    return action
  }

  function applyTotpChallenge(completion: PendingCompletion): boolean {
    if (completion.requires_2fa !== true || !completion.temp_token) return false
    setAccountAction('none')
    setNeedsInvitation(false)
    setNeedsAdoptionConfirmation(false)
    setNeedsTotp(true)
    setTotpTempToken(completion.temp_token)
    setTotpCode('')
    setTotpUserEmailMasked(completion.user_email_masked || '')
    setProcessing(false)
    return true
  }

  async function finishLogin(tokens: OAuthTokenResponse, redirect: string) {
    persistOAuthTokenContext(tokens)
    await setToken(tokens.access_token)
    clearAllAffiliateReferralCodes()
    toast.success(t('auth.loginSuccess'))
    navigate(redirect, { replace: true })
  }

  async function finalizeCompletion(completion: PendingCompletion, redirect: string) {
    if (getOAuthCompletionKind(completion) === 'bind') {
      clearPendingAuthSession()
      clearAllAffiliateReferralCodes()
      toast.success(t('profile.authBindings.bindSuccess'))
      navigate(sanitizeRedirectPath(completion.redirect || '/profile'), { replace: true })
      return
    }
    if (!isOAuthLoginCompletion(completion)) throw new Error(t(`auth.${keyNs}.callbackMissingToken`))
    await finishLogin(completion, redirect)
  }

  function goToEmailCompletion(redirect: string) {
    navigate(`/auth/dingtalk/email-completion?redirect=${encodeURIComponent(redirect)}`, { replace: true })
  }

  async function finalizePendingResponse(completion: PendingCompletion) {
    applyAdoptionSuggestion(completion)
    const redirect = sanitizeRedirectPath(completion.redirect || redirectRef.current)
    if (provider === 'dingtalk' && needsEmailCompletion(completion)) {
      goToEmailCompletion(redirect)
      return
    }
    if (completion.error === 'invitation_required') {
      setAccountAction('none')
      setNeedsInvitation(true)
      setNeedsAdoptionConfirmation(false)
      setProcessing(false)
      persistPending(redirect)
      return
    }
    if (applyTotpChallenge(completion)) {
      persistPending(redirect)
      return
    }
    if (applyAccountAction(completion) !== 'none' || completion.auth_result === 'pending_session') {
      setNeedsInvitation(false)
      setNeedsAdoptionConfirmation(false)
      setProcessing(false)
      persistPending(redirect)
      return
    }
    await finalizeCompletion(completion, redirect)
  }

  async function handleSubmitInvitation() {
    const code = invitationCode.trim()
    if (!code) return
    setSubmitting(true)
    try {
      const affCode = loadOAuthAffiliateCode()
      const decision = decisionRef.current
      let completion: PendingCompletion
      if (legacyTokenRef.current || provider === 'dingtalk') {
        const { data } = await apiClient.post<PendingCompletion>(`/auth/oauth/${provider}/complete-registration`, {
          pending_oauth_token: legacyTokenRef.current || undefined,
          invitation_code: code,
          ...oauthAffiliatePayload(affCode),
          ...serializeAdoptionDecision(decision),
        })
        completion = data
      } else {
        const complete =
          provider === 'linuxdo'
            ? completeLinuxDoOAuthRegistration
            : provider === 'wechat'
              ? completeWeChatOAuthRegistration
              : completeOIDCOAuthRegistration
        completion = affCode ? await complete(code, decision, affCode) : await complete(code, decision)
      }
      await finalizePendingResponse(completion)
    } catch (e) {
      toast.error(requestErrorMessage(e, t(`auth.${keyNs}.completeRegistrationFailed`)))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleContinueLogin() {
    setSubmitting(true)
    try {
      await finalizePendingResponse((await exchangePendingOAuthCompletion(decisionRef.current)) as PendingCompletion)
    } catch (e) {
      setErrorMessage(requestErrorMessage(e, t('auth.loginFailed')))
      setNeedsAdoptionConfirmation(false)
    } finally {
      setSubmitting(false)
    }
  }

  function switchToBindLogin(nextEmail?: string) {
    setAccountAction('bind_login')
    setBindLoginEmail((current) => current.trim() || nextEmail?.trim() || pendingAccountEmail.trim())
    setBindLoginPassword('')
    setAccountActionError('')
    setCanReturnToCreateAccount(true)
  }

  function switchToCreateAccount() {
    setAccountAction('create_account')
    setPendingAccountEmail((current) => current.trim() || bindLoginEmail.trim())
    setAccountActionError('')
  }

  async function handleCreateAccount(payload: PendingOAuthCreateAccountPayload) {
    setAccountActionError('')
    if (!payload.email || !payload.password) return
    setSubmitting(true)
    try {
      const { data } = await apiClient.post<PendingCompletion>('/auth/oauth/pending/create-account', {
        email: payload.email,
        password: payload.password,
        verify_code: payload.verifyCode || undefined,
        ...(payload.turnstileToken ? { turnstile_token: payload.turnstileToken } : {}),
        ...(payload.tencentCaptchaTicket
          ? { tencent_captcha_ticket: payload.tencentCaptchaTicket, tencent_captcha_randstr: payload.tencentCaptchaRandstr }
          : {}),
        invitation_code: payload.invitationCode || undefined,
        ...oauthAffiliatePayload(loadOAuthAffiliateCode()),
        ...serializeAdoptionDecision(decisionRef.current),
      })
      await finalizePendingResponse(data)
    } catch (e) {
      if (isCreateAccountRecoveryError(e)) {
        switchToBindLogin(payload.email.trim())
        return
      }
      setAccountActionError(requestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBindLogin() {
    setAccountActionError('')
    const email = bindLoginEmail.trim()
    if (!email || !bindLoginPassword) return
    setSubmitting(true)
    try {
      const { data } = await apiClient.post<PendingCompletion>('/auth/oauth/pending/bind-login', {
        email,
        password: bindLoginPassword,
        ...serializeAdoptionDecision(decisionRef.current),
      })
      await finalizePendingResponse(data)
    } catch (e) {
      setAccountActionError(requestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitTotp() {
    const code = totpCode.trim()
    if (!totpTempToken || code.length !== 6) return
    setSubmitting(true)
    try {
      const completion = await login2FA({ temp_token: totpTempToken, totp_code: code })
      await finishLogin(completion as OAuthTokenResponse, redirectRef.current)
    } catch (e) {
      toast.error(requestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // ---- WeChat: bind the signed-in account / resume after signing in ----
  function wechatSettings() {
    return useAppStore.getState().publicSettings
  }

  function configuredWeChatMode(): 'open' | 'mp' | null {
    const settings = wechatSettings()
    if (!hasExplicitWeChatOAuthCapabilities(settings)) return null
    return resolveWeChatOAuthStartStrict(settings).mode
  }

  function wechatUnavailableMessage(): string {
    switch (resolveWeChatOAuthStartStrict(wechatSettings()).unavailableReason) {
      case 'capability_unknown':
        return t('auth.oauthFlow.wechatAvailabilityUnknown')
      case 'external_browser_required':
        return t('auth.oauthFlow.wechatSystemBrowserOnly')
      case 'wechat_browser_required':
        return t('auth.oauthFlow.wechatBrowserOnly')
      case 'native_app_required':
        return t('astryx.oauth.wechatNativeAppOnly')
      case 'not_configured':
        return t('auth.oauthFlow.wechatNotConfigured')
      default:
        return t('auth.loginFailed')
    }
  }

  function requestedWeChatMode(): 'open' | 'mp' | null {
    const configured = configuredWeChatMode()
    if (configured) return configured
    const queryMode = query.get('mode')
    if (queryMode === 'open' || queryMode === 'mp') return queryMode
    return typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent) ? 'mp' : 'open'
  }

  function redirectTarget(): string {
    return sanitizeRedirectPath(query.get('redirect') || redirectRef.current || '/dashboard')
  }

  function wechatStartURL(intent: 'bind_current_user' | 'adopt_existing_user_by_email'): string | null {
    const mode = requestedWeChatMode()
    if (!mode) return null
    const params = new URLSearchParams({ mode, redirect: redirectTarget(), intent })
    return `${getAPIBaseURL().replace(/\/$/, '')}/auth/oauth/wechat/bind/start?${params}`
  }

  function existingAccountResumePath(email: string): string | null {
    const mode = requestedWeChatMode()
    if (!mode) return null
    const params = new URLSearchParams({ wechat_bind_existing: '1', redirect: redirectTarget(), mode })
    if (email) params.set('email', email)
    return `/auth/wechat/callback?${params}`
  }

  async function handleBindCurrentAccount() {
    const unavailable = configuredWeChatMode() === null ? wechatUnavailableMessage() : ''
    const startURL = wechatStartURL('bind_current_user')
    if (!startURL) {
      setErrorMessage(unavailable || wechatUnavailableMessage())
      return
    }
    try {
      await prepareOAuthBindAccessTokenCookie()
      window.location.href = startURL
    } catch (e) {
      setErrorMessage(requestErrorMessage(e, t('auth.loginFailed')))
    }
  }

  async function redirectToLoginThenBind(email: string): Promise<boolean> {
    const resumePath = existingAccountResumePath(email)
    if (!resumePath) {
      setErrorMessage(wechatUnavailableMessage())
      return false
    }
    const params = new URLSearchParams({ redirect: resumePath })
    if (email) params.set('email', email)
    navigate(`/login?${params}`, { replace: true })
    return true
  }

  async function handleExistingAccountBinding() {
    if (getAuthToken()) {
      await handleBindCurrentAccount()
      return
    }
    await redirectToLoginThenBind(existingAccountEmail.trim())
  }

  useEffect(() => {
    void (async () => {
      if (provider === 'oidc') {
        getPublicSettings()
          .then((s) => {
            const name = s.oidc_oauth_provider_name?.trim()
            if (name) setOidcName(name)
          })
          .catch(() => undefined)
      }

      if (isWechat) {
        try {
          if (!hasExplicitWeChatOAuthCapabilities(wechatSettings()) && !useAppStore.getState().publicSettingsLoaded) {
            await fetchPublicSettings()
          }
        } catch {
          // Binding recovery requires confirmed capability flags; the strict guard handles it.
        }
        if (resumeEmail) {
          setExistingAccountEmail(resumeEmail)
          setBindLoginEmail(resumeEmail)
          setPendingAccountEmail(resumeEmail)
        }
        if (query.get('wechat_bind_existing') === '1') {
          if (getAuthToken()) {
            await handleBindCurrentAccount()
            return
          }
          if (!(await redirectToLoginThenBind(resumeEmail))) setProcessing(false)
          return
        }
      }

      const params = parseFragmentParams()
      const legacyLogin = readLegacyFragmentLogin(params)
      const legacyPendingToken = params.get('pending_oauth_token')?.trim() || ''
      const error = params.get('error')
      const errorDesc = params.get('error_description') || params.get('error_message') || ''
      const redirect = sanitizeRedirectPath(params.get('redirect') || query.get('redirect') || '/dashboard')

      try {
        if (legacyLogin) {
          await finishLogin(legacyLogin, redirect)
          return
        }
        if (error === 'invitation_required' && legacyPendingToken) {
          legacyTokenRef.current = legacyPendingToken
          redirectRef.current = redirect
          setNeedsInvitation(true)
          setProcessing(false)
          return
        }
        if (error) {
          const i18nKey = `auth.dingtalk.error.${error}`
          setErrorMessage(provider === 'dingtalk' && te(i18nKey) ? t(i18nKey) : errorDesc || error)
          setProcessing(false)
          return
        }

        const completion = (await exchangePendingOAuthCompletion()) as PendingCompletion
        const completionRedirect = sanitizeRedirectPath(completion.redirect || query.get('redirect') || '/dashboard')
        applyAdoptionSuggestion(completion)
        redirectRef.current = completionRedirect

        if (provider === 'dingtalk' && needsEmailCompletion(completion)) {
          // Coming back from the email-completion page with bind=1 goes straight to bind-login.
          if (query.get('bind') === '1') {
            setAccountAction('bind_login')
            setBindLoginEmail(resumeEmail)
            setBindLoginPassword('')
            setCanReturnToCreateAccount(true)
            setProcessing(false)
            persistPending(completionRedirect)
            return
          }
          goToEmailCompletion(completionRedirect)
          return
        }
        if (completion.error === 'invitation_required') {
          setNeedsInvitation(true)
          setProcessing(false)
          persistPending(completionRedirect)
          return
        }
        if (applyTotpChallenge(completion)) {
          persistPending(completionRedirect)
          return
        }
        if (applyAccountAction(completion) !== 'none') {
          setProcessing(false)
          persistPending(completionRedirect)
          return
        }
        if (completion.adoption_required === true && (completion.suggested_display_name || completion.suggested_avatar_url)) {
          setNeedsAdoptionConfirmation(true)
          setProcessing(false)
          persistPending(completionRedirect)
          return
        }
        await finalizeCompletion(completion, completionRedirect)
      } catch (e) {
        clearPendingAuthSession()
        setErrorMessage(requestErrorMessage(e, t('auth.loginFailed')))
        setProcessing(false)
      }
    })()
    // Runs once per callback visit, like the Vue onMounted hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = keyNs === 'oidc' ? t('auth.oidc.callbackTitle', { providerName }) : t(`auth.${keyNs}.callbackTitle`)
  const subtitle = isProcessing
    ? keyNs === 'oidc'
      ? t('auth.oidc.callbackProcessing', { providerName })
      : t(`auth.${keyNs}.callbackProcessing`)
    : t(`auth.${keyNs}.callbackHint`)
  const invitationText =
    keyNs === 'oidc' ? t('auth.oidc.invitationRequired', { providerName }) : t(`auth.${keyNs}.invitationRequired`)
  const showBackToChooser = isWechat && (accountAction === 'create_account' || accountAction === 'bind_login')
  const hasFlow = needsInvitation || needsAdoptionConfirmation || accountAction !== 'none' || needsTotp

  const adoptionCard = adoptionRequired && (suggestedDisplayName || suggestedAvatarUrl) && (
    <Card padding={4} width="100%">
      <VStack gap={3} hAlign="stretch">
        <VStack gap={1}>
          <Text weight="medium">{t('auth.oauthFlow.profileDetailsTitle', { providerName })}</Text>
          <Text type="supporting">{t('auth.oauthFlow.profileDetailsDescription', { providerName })}</Text>
        </VStack>
        {suggestedDisplayName && (
          <CheckboxInput
            label={t('auth.oauthFlow.useDisplayName')}
            description={suggestedDisplayName}
            value={adoptDisplayName}
            onChange={setAdoptDisplayName}
          />
        )}
        {suggestedAvatarUrl && (
          <HStack gap={3} vAlign="center">
            <Avatar src={suggestedAvatarUrl} name={t('auth.oauthFlow.avatarAlt', { providerName })} size="md" />
            <CheckboxInput
              label={t('auth.oauthFlow.useAvatar')}
              description={suggestedAvatarUrl}
              value={adoptAvatar}
              onChange={setAdoptAvatar}
            />
          </HStack>
        )}
      </VStack>
    </Card>
  )

  const wechatExistingAccountCard = (
    <Card padding={4} width="100%">
      <VStack gap={3} hAlign="stretch">
        <VStack gap={1}>
          <Text weight="medium">{t('auth.alreadyHaveAccount')}</Text>
          <Text type="supporting">
            {hasCurrentAuthToken
              ? t('auth.oauthFlow.bindCurrentAccountDescription', { providerName })
              : t('auth.oauthFlow.signInThenBindDescription', { providerName })}
          </Text>
        </VStack>
        {!hasCurrentAuthToken && (
          <TextInput
            label={t('auth.emailLabel')}
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            startIcon={EnvelopeIcon}
            value={existingAccountEmail}
            onChange={setExistingAccountEmail}
            isDisabled={isSubmitting}
          />
        )}
        <Button
          label={hasCurrentAuthToken ? t('auth.oauthFlow.bindCurrentAccount') : t('auth.signIn')}
          variant="secondary"
          width="100%"
          isDisabled={isSubmitting}
          onClick={() => void handleExistingAccountBinding()}
        />
      </VStack>
    </Card>
  )

  const backToChooserButton = showBackToChooser && (
    <Button
      label={t('auth.oauthFlow.createNewAccount')}
      variant="secondary"
      width="100%"
      isDisabled={isSubmitting}
      onClick={switchToCreateAccount}
    />
  )

  let body: React.ReactNode = null
  if (needsInvitation) {
    body = (
      <VStack gap={3} hAlign="stretch">
        <Text>{invitationText}</Text>
        <TextInput
          label={t('auth.invitationCodeLabel')}
          placeholder={t('auth.invitationCodePlaceholder')}
          startIcon={KeyIcon}
          value={invitationCode}
          onChange={setInvitationCode}
          onEnter={() => void handleSubmitInvitation()}
          isDisabled={isSubmitting}
        />
        <Button
          label={isSubmitting ? t(`auth.${keyNs}.completing`) : t(`auth.${keyNs}.completeRegistration`)}
          variant="primary"
          width="100%"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !invitationCode.trim()}
          onClick={() => void handleSubmitInvitation()}
        />
        {isWechat && wechatExistingAccountCard}
      </VStack>
    )
  } else if (!isWechat && needsAdoptionConfirmation) {
    body = (
      <VStack gap={3} hAlign="stretch">
        <Text>{t('auth.oauthFlow.reviewProfileBeforeContinue', { providerName })}</Text>
        <Button
          label={isSubmitting ? t('common.processing') : t('auth.continue')}
          variant="primary"
          width="100%"
          isLoading={isSubmitting}
          onClick={() => void handleContinueLogin()}
        />
      </VStack>
    )
  } else if (accountAction === 'choose_account_action') {
    const bindButton = (
      <Button
        label={t('auth.oauthFlow.bindExistingAccount')}
        variant={isWechat ? 'primary' : 'secondary'}
        width="100%"
        isDisabled={isSubmitting}
        onClick={() => switchToBindLogin()}
      />
    )
    const createButton = (
      <Button
        label={t('auth.oauthFlow.createNewAccount')}
        variant={isWechat ? 'secondary' : 'primary'}
        width="100%"
        isDisabled={isSubmitting}
        onClick={switchToCreateAccount}
      />
    )
    body = (
      <Card padding={4} width="100%">
        <VStack gap={4} hAlign="stretch">
          <VStack gap={1}>
            <Text weight="medium">{t('auth.oauthFlow.chooseHowToContinue')}</Text>
            <Text type="supporting">
              {!isWechat && pendingAccountEmail
                ? t('auth.oauthFlow.suggestedEmail', { email: pendingAccountEmail })
                : t('auth.oauthFlow.chooseAccountActionHint')}
            </Text>
          </VStack>
          {isWechat ? (
            <VStack gap={3} hAlign="stretch">
              {bindButton}
              {createButton}
            </VStack>
          ) : (
            <Grid columns={{ minWidth: 160 }} gap={3}>
              {bindButton}
              {createButton}
            </Grid>
          )}
        </VStack>
      </Card>
    )
  } else if (isWechat && needsAdoptionConfirmation) {
    body = (
      <VStack gap={3} hAlign="stretch">
        <Text>{t('auth.oauthFlow.reviewProfileBeforeContinue', { providerName })}</Text>
        <Button
          label={isSubmitting ? t('common.processing') : t('auth.continue')}
          variant="primary"
          width="100%"
          isLoading={isSubmitting}
          onClick={() => void handleContinueLogin()}
        />
      </VStack>
    )
  } else if (accountAction === 'create_account') {
    body = (
      <VStack gap={3} hAlign="stretch">
        <Text>{t('auth.oauthFlow.createAccountHint')}</Text>
        <PendingOAuthCreateAccountForm
          initialEmail={pendingAccountEmail}
          isSubmitting={isSubmitting}
          errorMessage={accountActionError}
          onSubmit={(payload) => void handleCreateAccount(payload)}
          onSwitchToBind={(email) => switchToBindLogin(email)}
        />
        {backToChooserButton}
      </VStack>
    )
  } else if (accountAction === 'bind_login') {
    body = (
      <VStack gap={3} hAlign="stretch">
        <Text>
          {isWechat
            ? t('auth.oauthFlow.bindSignInToExistingAccount', { providerName })
            : t('auth.oauthFlow.bindLoginHint', { providerName })}
        </Text>
        {isWechat && hasCurrentAuthToken ? (
          <Card padding={4} width="100%">
            <VStack gap={3} hAlign="stretch">
              <VStack gap={1}>
                <Text weight="medium">{t('auth.oauthFlow.bindCurrentAccountTitle')}</Text>
                <Text type="supporting">{t('auth.oauthFlow.bindCurrentAccountDescription', { providerName })}</Text>
              </VStack>
              <Button
                label={isSubmitting ? t('common.processing') : t('auth.oauthFlow.bindCurrentAccount')}
                variant="primary"
                width="100%"
                isDisabled={isSubmitting}
                onClick={() => void handleBindCurrentAccount()}
              />
            </VStack>
          </Card>
        ) : (
          <VStack gap={3} hAlign="stretch">
            <TextInput
              label={t('auth.emailLabel')}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              startIcon={EnvelopeIcon}
              value={bindLoginEmail}
              onChange={setBindLoginEmail}
              onEnter={() => void handleBindLogin()}
              isDisabled={isSubmitting}
            />
            <TextInput
              label={t('auth.passwordLabel')}
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              startIcon={LockClosedIcon}
              value={bindLoginPassword}
              onChange={setBindLoginPassword}
              onEnter={() => void handleBindLogin()}
              isDisabled={isSubmitting}
            />
            <Button
              label={isSubmitting ? t('common.processing') : t('auth.oauthFlow.logInAndBind')}
              variant="primary"
              width="100%"
              isLoading={isSubmitting}
              isDisabled={isSubmitting || !bindLoginEmail.trim() || !bindLoginPassword}
              onClick={() => void handleBindLogin()}
            />
            {!isWechat && canReturnToCreateAccount && (
              <Button
                label={t('auth.oauthFlow.useDifferentEmail')}
                variant="secondary"
                width="100%"
                isDisabled={isSubmitting}
                onClick={switchToCreateAccount}
              />
            )}
          </VStack>
        )}
        {backToChooserButton}
      </VStack>
    )
  } else if (needsTotp) {
    body = (
      <VStack gap={3} hAlign="stretch">
        <Text>
          {t('auth.oauthFlow.totpHint', {
            providerName,
            account: totpUserEmailMasked || t('auth.oauthFlow.yourAccount'),
          })}
        </Text>
        <TextInput
          label={t('auth.oauthFlow.verifyAndContinue')}
          isLabelHidden
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={totpCode}
          onChange={(v) => setTotpCode(v.replace(/\D/g, '').slice(0, 6))}
          onEnter={() => void handleSubmitTotp()}
          isDisabled={isSubmitting}
        />
        <Button
          label={isSubmitting ? t('common.processing') : t('auth.oauthFlow.verifyAndContinue')}
          variant="primary"
          width="100%"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || totpCode.trim().length !== 6}
          onClick={() => void handleSubmitTotp()}
        />
      </VStack>
    )
  }

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      {isProcessing && !hasFlow ? (
        <VStack gap={4} hAlign="center">
          <Spinner />
        </VStack>
      ) : hasFlow ? (
        <VStack gap={4} hAlign="stretch">
          {adoptionCard}
          {body}
        </VStack>
      ) : errorMessage ? (
        <VStack gap={4} hAlign="stretch">
          <Banner status="error" title={errorMessage} />
          <Button label={t('auth.backToLogin')} variant="primary" width="100%" href="/login" />
        </VStack>
      ) : null}
    </AuthLayout>
  )
}
