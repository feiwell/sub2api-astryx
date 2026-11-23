import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { EnvelopeIcon, LockClosedIcon, FingerPrintIcon } from '@heroicons/react/24/outline'
import { Icon } from '@astryxdesign/core/Icon'
import {
  buildOAuthLoginStartURL,
  getPublicSettings,
  isTotp2FARequired,
  startOAuthLogin,
  type OAuthLoginStart,
} from '@/api/auth'
import type { ActionCaptchaRequestProof, PublicSettings, TotpLoginResponse } from '@/types'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { clearAllAffiliateReferralCodes } from '@/utils/oauthAffiliate'
import { AuthLayout } from '~/layouts/AuthLayout'
import { OAuthProviders, hasOAuthProviders } from '~/components/auth/OAuthProviders'
import { TotpLoginDialog } from '~/components/auth/TotpLoginDialog'
import { LoginAgreementPrompt, useLoginAgreement } from '~/components/auth/LoginAgreement'
import {
  CaptchaChallenge,
  captchaConfigFromSettings,
  type CaptchaChallengeHandle,
} from '~/components/captcha/CaptchaChallenge'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { toast } from '~/lib/toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** React port of views/auth/LoginView.vue. */
export function LoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const login = useAuthStore((s) => s.login)
  const login2FA = useAuthStore((s) => s.login2FA)
  const loginWithPasskey = useAuthStore((s) => s.loginWithPasskey)
  const applySettings = useAppStore((s) => s.applySettings)

  const [settings, setSettings] = useState<PublicSettings | null>(useAppStore.getState().publicSettings)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({ email: '', password: '', captcha: '' })
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  const captchaRef = useRef<CaptchaChallengeHandle>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaRandstr, setCaptchaRandstr] = useState('')
  const captcha = captchaConfigFromSettings(settings)

  const [totp, setTotp] = useState<{ open: boolean; tempToken: string; emailMasked: string }>({
    open: false,
    tempToken: '',
    emailMasked: '',
  })
  const [totpVerifying, setTotpVerifying] = useState(false)
  const [totpReset, setTotpReset] = useState(0)

  const agreement = useLoginAgreement()
  const authDisabled = isLoading || passkeyLoading || !settingsLoaded || agreement.gateActive
  const showPasskey = settings?.passkey_enabled === true && typeof window.PublicKeyCredential !== 'undefined'
  const redirectTo = query.get('redirect') || '/dashboard'

  useEffect(() => {
    if (sessionStorage.getItem('auth_expired')) {
      sessionStorage.removeItem('auth_expired')
      const message = t('auth.reloginRequired')
      setErrorMessage(message)
      toast.warning(message)
    }
    let cancelled = false
    getPublicSettings()
      .then((data) => {
        if (cancelled) return
        applySettings(data)
        setSettings(data)
        agreement.apply(data)
      })
      .catch((error) => {
        console.error('Failed to load public settings:', error)
        agreement.disable()
      })
      .finally(() => !cancelled && setSettingsLoaded(true))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetCaptcha = () => {
    captchaRef.current?.reset()
    setCaptchaToken('')
    setCaptchaRandstr('')
    setErrors((e) => ({ ...e, captcha: '' }))
  }

  const warnAgreementRequired = () => {
    toast.warning(t('legal.loginAgreementPrompt.loginRequiredWarning'))
    if (agreement.mode !== 'checkbox') agreement.openModal()
  }

  const validate = (): boolean => {
    if (agreement.gateActive) {
      warnAgreementRequired()
      return false
    }
    const next = { email: '', password: '', captcha: '' }
    if (!email.trim()) next.email = t('auth.emailRequired')
    else if (!EMAIL_RE.test(email)) next.email = t('auth.invalidEmail')
    if (!password) next.password = t('auth.passwordRequired')
    else if (password.length < 6) next.password = t('auth.passwordMinLength')
    if (captcha.turnstileEnabled && captcha.turnstileSiteKey && !captchaToken) next.captcha = t('auth.completeVerification')
    setErrors(next)
    const first = next.email || next.password || next.captcha
    if (first) toast.error(first)
    return !first
  }

  /** Pops Tencent/Aliyun captcha when configured; returns the proof or null if dismissed. */
  const acquireActionProof = async (): Promise<{ token: string; randstr: string } | null | 'none'> => {
    if (!captcha.actionEnabled) return 'none'
    const proof = (await captchaRef.current?.verifyAction()) ?? null
    if (proof) {
      setCaptchaToken(proof.token)
      setCaptchaRandstr(proof.randstr)
    }
    return proof
  }

  const finishLogin = async () => {
    clearAllAffiliateReferralCodes()
    toast.success(t('auth.loginSuccess'))
    navigate(redirectTo, { replace: true })
  }

  const handleLogin = async () => {
    setErrorMessage('')
    if (!validate()) return
    const proof = await acquireActionProof()
    if (proof === null) return
    const token = proof === 'none' ? captchaToken : proof.token
    const randstr = proof === 'none' ? captchaRandstr : proof.randstr
    setLoading(true)
    try {
      const response = await login({
        email,
        password,
        turnstile_token: captcha.turnstileEnabled || captcha.aliyunEnabled ? token : undefined,
        tencent_captcha_ticket: captcha.tencentEnabled ? token : undefined,
        tencent_captcha_randstr: captcha.tencentEnabled ? randstr : undefined,
      })
      if (isTotp2FARequired(response)) {
        const r = response as TotpLoginResponse
        setTotp({ open: true, tempToken: r.temp_token || '', emailMasked: r.user_email_masked || '' })
        return
      }
      await finishLogin()
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.loginFailed'))
      setErrorMessage(message)
      toast.error(message)
    } finally {
      if (captcha.enabled) resetCaptcha()
      setLoading(false)
    }
  }

  const handlePasskey = async () => {
    if (agreement.gateActive) {
      warnAgreementRequired()
      return
    }
    setPasskeyLoading(true)
    try {
      let proof: ActionCaptchaRequestProof | undefined
      if (captcha.actionEnabled) {
        const result = await captchaRef.current?.verifyAction()
        if (!result) return
        proof = captcha.tencentEnabled
          ? { tencent_captcha_ticket: result.token, tencent_captcha_randstr: result.randstr }
          : { turnstile_token: result.token }
      }
      await loginWithPasskey(proof)
      await finishLogin()
    } catch (error) {
      const fallback =
        error instanceof DOMException && error.name === 'NotAllowedError' ? t('auth.passkeyCancelled') : t('auth.passkeyFailed')
      const message = extractI18nErrorMessage(error, t, 'auth.errors', fallback)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      if (captcha.actionEnabled) resetCaptcha()
      setPasskeyLoading(false)
    }
  }

  const handleOAuthStart = async (request: OAuthLoginStart) => {
    if (authDisabled) return
    if (!captcha.actionEnabled) {
      window.location.href = buildOAuthLoginStartURL(request)
      return
    }
    setLoading(true)
    try {
      const proof = await captchaRef.current?.verifyAction()
      if (!proof) return
      const result = await startOAuthLogin(
        request,
        captcha.tencentEnabled
          ? { tencent_captcha_ticket: proof.token, tencent_captcha_randstr: proof.randstr }
          : { turnstile_token: proof.token },
      )
      window.location.href = result.authorize_url
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.turnstileFailed'))
      setErrorMessage(message)
      toast.error(message)
    } finally {
      resetCaptcha()
      setLoading(false)
    }
  }

  const handleTotpVerify = async (code: string) => {
    setTotpVerifying(true)
    try {
      await login2FA(totp.tempToken, code)
      setTotp({ open: false, tempToken: '', emailMasked: '' })
      await finishLogin()
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('profile.totp.loginFailed'))
      toast.error(message)
      setTotpReset((n) => n + 1)
    } finally {
      setTotpVerifying(false)
    }
  }

  return (
    <AuthLayout title={t('auth.authentication')} subtitle={t('auth.signInToAccount')}
      footer={
        settings?.registration_enabled ? (
          <Text type="supporting" color="secondary">
            {t('auth.dontHaveAccount')}{' '}
            <Link href={`/register${query.toString() ? `?${query}` : ''}`} type="supporting">
              {t('auth.signUp')}
            </Link>
          </Text>
        ) : undefined
      }>
      <LoginAgreementPrompt
        agreement={agreement}
        onRejected={() => toast.warning(t('legal.loginAgreementPrompt.loginRejectedWarning'))}
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void handleLogin()
        }}>
        <VStack gap={4} hAlign="stretch">
          <TextInput
            label={t('auth.emailLabel')}
            type="email"
            autoComplete="username"
            placeholder={t('auth.emailPlaceholder')}
            startIcon={EnvelopeIcon}
            value={email}
            onChange={(v) => {
              setEmail(v)
              if (errors.email) setErrors((e) => ({ ...e, email: '' }))
            }}
            isDisabled={authDisabled && !isLoading}
            status={errors.email ? { type: 'error', message: errors.email } : undefined}
           
            hasAutoFocus
          />
          <VStack gap={1} hAlign="stretch">
            <TextInput
              label={t('auth.passwordLabel')}
              type="password"
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              startIcon={LockClosedIcon}
              value={password}
              onChange={(v) => {
                setPassword(v)
                if (errors.password) setErrors((e) => ({ ...e, password: '' }))
              }}
              isDisabled={authDisabled && !isLoading}
              status={errors.password ? { type: 'error', message: errors.password } : undefined}
             
            />
            {settings?.password_reset_enabled && !settings.backend_mode_enabled && (
              <HStack justify="end">
                <Link href="/forgot-password" type="supporting" color="secondary">
                  {t('auth.forgotPassword')}
                </Link>
              </HStack>
            )}
          </VStack>

          {captcha.enabled && (
            <VStack gap={1} hAlign="stretch">
              <CaptchaChallenge
                ref={captchaRef}
                config={captcha}
                onVerify={(token, randstr) => {
                  setCaptchaToken(token)
                  setCaptchaRandstr(randstr)
                  setErrors((e) => ({ ...e, captcha: '' }))
                }}
                onExpire={() => {
                  setCaptchaToken('')
                  setErrors((e) => ({ ...e, captcha: t('auth.turnstileExpired') }))
                }}
                onError={() => {
                  setCaptchaToken('')
                  setErrors((e) => ({ ...e, captcha: t('auth.turnstileFailed') }))
                }}
              />
              {errors.captcha && (
                <Text type="supporting" color={"error" as any}>
                  {errors.captcha}
                </Text>
              )}
            </VStack>
          )}

          {errorMessage && <Banner status="error" title={errorMessage} />}

          <Button
            type="submit"
            label={isLoading ? t('auth.signingIn') : t('auth.signIn')}
            variant="primary"
           
            width="100%"
            isLoading={isLoading}
            isDisabled={authDisabled}
          />
          {showPasskey && (
            <Button
              label={passkeyLoading ? t('auth.passkeySigningIn') : t('auth.passkeySignIn')}
              variant="secondary"
             
              width="100%"
              icon={<Icon icon={FingerPrintIcon} />}
              isLoading={passkeyLoading}
              isDisabled={authDisabled}
              onClick={() => void handlePasskey()}
            />
          )}
        </VStack>
      </form>

      {hasOAuthProviders(settings) && (
        <OAuthProviders {...({} as any)} settings={settings} isDisabled={authDisabled} onStart={(r) => void handleOAuthStart(r)} />
      )}

      <TotpLoginDialog
        isOpen={totp.open}
        userEmailMasked={totp.emailMasked}
        isVerifying={totpVerifying}
        resetSignal={totpReset}
        onVerify={(code) => void handleTotpVerify(code)}
        onCancel={() => setTotp({ open: false, tempToken: '', emailMasked: '' })}
      />
    </AuthLayout>
  )
}
