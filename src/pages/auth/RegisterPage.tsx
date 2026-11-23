import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { EnvelopeIcon, LockClosedIcon, KeyIcon, GiftIcon } from '@heroicons/react/24/outline'
import {
  getPublicSettings,
  buildOAuthLoginStartURL,
  startOAuthLogin,
  validatePromoCode,
  type OAuthLoginStart,
} from '@/api/auth'
import { validateInvitationCode } from '~/lib/api/invitation'
import type { PublicSettings, RegisterRequest } from '@/types'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { AuthLayout } from '~/layouts/AuthLayout'
import { OAuthProviders, hasOAuthProviders } from '~/components/auth/OAuthProviders'
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

const PROMO_ERROR_KEYS: Record<string, string> = {
  PROMO_CODE_NOT_FOUND: 'auth.promoCodeNotFound',
  PROMO_CODE_EXPIRED: 'auth.promoCodeExpired',
  PROMO_CODE_DISABLED: 'auth.promoCodeDisabled',
  PROMO_CODE_MAX_USED: 'auth.promoCodeMaxUsed',
  PROMO_CODE_ALREADY_USED: 'auth.promoCodeAlreadyUsed',
}

type PromoValidation = { valid: boolean; invalid: boolean; bonusAmount: number | null; message: string }
const EMPTY_PROMO_VALIDATION: PromoValidation = { valid: false, invalid: false, bonusAmount: null, message: '' }

/** React port of views/auth/RegisterView.vue. */
export function RegisterPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const register = useAuthStore((s) => s.register)
  const applySettings = useAppStore((s) => s.applySettings)

  const [settings, setSettings] = useState<PublicSettings | null>(useAppStore.getState().publicSettings)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState(query.get('invitation_code') || '')
  // Promo code; a ?promo= link pre-fills it once promo codes are known to be enabled.
  const [promoCode, setPromoCode] = useState('')
  const [promoValidating, setPromoValidating] = useState(false)
  const [promoValidation, setPromoValidation] = useState<PromoValidation>(EMPTY_PROMO_VALIDATION)
  const promoRequestSeq = useRef(0)

  const [errors, setErrors] = useState({ email: '', password: '', confirmPassword: '', invitationCode: '', captcha: '' })
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setLoading] = useState(false)
  const [showPassword, _setShowPassword] = useState(false)
  const [showConfirmPassword, _setShowConfirmPassword] = useState(false)

  const captchaRef = useRef<CaptchaChallengeHandle>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaRandstr, setCaptchaRandstr] = useState('')
  const captcha = captchaConfigFromSettings(settings)

  const [_invitationValidating, setInvitationValidating] = useState(false)
  const [invitationValid, setInvitationValid] = useState(false)
  const [invitationInvalid, setInvitationInvalid] = useState(false)

  const agreement = useLoginAgreement()
  const authDisabled = isLoading || !settingsLoaded || agreement.gateActive
  const siteName = useAppStore((s) => s.siteName) || 'Sub2API'
  const redirectTo = query.get('redirect') || '/dashboard'
  const registrationEnabled = settings?.registration_enabled === true
  const invitationCodeEnabled = settings?.invitation_code_enabled === true
  const promoCodeEnabled = settings?.promo_code_enabled === true

  useEffect(() => {
    let cancelled = false
    getPublicSettings()
      .then((data) => {
        if (cancelled) return
        applySettings(data)
        setSettings(data)
        agreement.apply(data)
        const promoParam = query.get('promo')
        if (data.promo_code_enabled && promoParam) {
          setPromoCode(promoParam)
          void validatePromo(promoParam)
        }
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

  useEffect(() => {
    if (invitationCode && invitationCodeEnabled) {
      const timer = setTimeout(() => {
        void validateInvitation(invitationCode)
      }, 500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationCode, invitationCodeEnabled])

  const validateInvitation = async (code: string) => {
    if (!code.trim()) {
      setInvitationValid(false)
      setInvitationInvalid(false)
      return
    }
    setInvitationValidating(true)
    try {
      const result = await validateInvitationCode(code)
      setInvitationValid(result.valid === true)
      setInvitationInvalid(result.valid === false)
      if (result.valid === false) {
        setErrors((e) => ({ ...e, invitationCode: t('auth.invalidInvitationCode') }))
      } else {
        setErrors((e) => ({ ...e, invitationCode: '' }))
      }
    } catch {
      setInvitationValid(false)
      setInvitationInvalid(false)
    } finally {
      setInvitationValidating(false)
    }
  }

  const validatePromo = async (code: string) => {
    if (!code.trim()) return
    const requestID = ++promoRequestSeq.current
    setPromoValidating(true)
    try {
      const result = await validatePromoCode(code)
      if (requestID !== promoRequestSeq.current) return
      setPromoValidation(
        result.valid
          ? { valid: true, invalid: false, bonusAmount: result.bonus_amount || 0, message: '' }
          : {
              valid: false,
              invalid: true,
              bonusAmount: null,
              message: t(PROMO_ERROR_KEYS[result.error_code || ''] || 'auth.promoCodeInvalid'),
            },
      )
    } catch (error) {
      if (requestID !== promoRequestSeq.current) return
      console.error('Failed to validate promo code:', error)
      setPromoValidation({ valid: false, invalid: true, bonusAmount: null, message: t('auth.promoCodeInvalid') })
    } finally {
      if (requestID === promoRequestSeq.current) setPromoValidating(false)
    }
  }

  // Re-validate 500ms after the user stops typing.
  const promoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (promoTimer.current) clearTimeout(promoTimer.current)
  }, [])

  const handlePromoCodeChange = (value: string) => {
    setPromoCode(value)
    setPromoValidation(EMPTY_PROMO_VALIDATION)
    if (promoTimer.current) clearTimeout(promoTimer.current)
    const code = value.trim()
    if (!code) {
      promoRequestSeq.current++
      setPromoValidating(false)
      return
    }
    promoTimer.current = setTimeout(() => void validatePromo(code), 500)
  }

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
    const next = { email: '', password: '', confirmPassword: '', invitationCode: '', captcha: '' }
    if (!email.trim()) next.email = t('auth.emailRequired')
    else if (!EMAIL_RE.test(email)) next.email = t('auth.invalidEmail')
    if (!password) next.password = t('auth.passwordRequired')
    else if (password.length < 6) next.password = t('auth.passwordMinLength')
    if (!confirmPassword) next.confirmPassword = t('auth.confirmPasswordRequired')
    else if (password !== confirmPassword) next.confirmPassword = t('auth.passwordMismatch')
    if (invitationCodeEnabled) {
      if (!invitationCode.trim()) next.invitationCode = t('auth.invitationCodeRequired')
      else if (invitationInvalid) next.invitationCode = t('auth.invalidInvitationCode')
    }
    if (captcha.turnstileEnabled && captcha.turnstileSiteKey && !captchaToken) next.captcha = t('auth.completeVerification')
    setErrors(next)
    const first = next.email || next.password || next.confirmPassword || next.invitationCode || next.captcha
    if (first) toast.error(first)
    return !first
  }

  const acquireActionProof = async (): Promise<{ token: string; randstr: string } | null | 'none'> => {
    if (!captcha.actionEnabled) return 'none'
    const proof = (await captchaRef.current?.verifyAction()) ?? null
    if (proof) {
      setCaptchaToken(proof.token)
      setCaptchaRandstr(proof.randstr)
    }
    return proof
  }

  const handleRegister = async () => {
    setErrorMessage('')
    if (!validate()) return
    if (promoCodeEnabled && promoCode.trim()) {
      if (promoValidating) {
        setErrorMessage(t('auth.promoCodeValidating'))
        return
      }
      if (promoValidation.invalid) {
        setErrorMessage(t('auth.promoCodeInvalidCannotRegister'))
        return
      }
    }
    const proof = await acquireActionProof()
    if (proof === null) return
    const token = proof === 'none' ? captchaToken : proof.token
    const randstr = proof === 'none' ? captchaRandstr : proof.randstr

    setLoading(true)
    try {
      const payload: RegisterRequest = {
        email,
        password,
        turnstile_token: captcha.turnstileEnabled || captcha.aliyunEnabled ? token : undefined,
        tencent_captcha_ticket: captcha.tencentEnabled ? token : undefined,
        tencent_captcha_randstr: captcha.tencentEnabled ? randstr : undefined,
      }
      if (invitationCodeEnabled && invitationCode) {
        payload.invitation_code = invitationCode
      }
      if (promoCodeEnabled && promoCode.trim()) {
        payload.promo_code = promoCode.trim()
      }
      await register(payload)
      toast.success(t('auth.registerSuccess'))
      navigate(redirectTo, { replace: true })
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.registerFailed'))
      setErrorMessage(message)
      toast.error(message)
    } finally {
      if (captcha.enabled) resetCaptcha()
      setLoading(false)
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

  if (!registrationEnabled && settingsLoaded) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.signUpToStart', { siteName })}>
        <Banner status="warning" title={t('auth.registrationDisabled')} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Authentication" subtitle={t('auth.signUpToStart', { siteName })}
      footer={
        <Text type="supporting" color="secondary">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link href={`/login${query.toString() ? `?${query}` : ''}`} type="supporting">
            {t('auth.signIn')}
          </Link>
        </Text>
      }>
      <LoginAgreementPrompt
        agreement={agreement}
        onRejected={() => toast.warning(t('legal.loginAgreementPrompt.loginRejectedWarning'))}
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void handleRegister()
        }}>
        <VStack gap={4} hAlign="stretch">
          <TextInput
            label={t('auth.emailLabel')}
            type="email"
            autoComplete="email"
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
          <TextInput
            label={t('auth.passwordLabel')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('auth.createPasswordPlaceholder')}
            startIcon={LockClosedIcon}
           
           
            value={password}
            onChange={(v) => {
              setPassword(v)
              if (errors.password) setErrors((e) => ({ ...e, password: '' }))
            }}
            isDisabled={authDisabled && !isLoading}
            status={errors.password ? { type: 'error', message: errors.password } : undefined}
            description={t('auth.passwordHint')}
           
          />
          <TextInput
            label={t('auth.confirmPassword')}
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('auth.confirmPasswordPlaceholder')}
            startIcon={LockClosedIcon}
           
           
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v)
              if (errors.confirmPassword) setErrors((e) => ({ ...e, confirmPassword: '' }))
            }}
            isDisabled={authDisabled && !isLoading}
            status={errors.confirmPassword ? { type: 'error', message: errors.confirmPassword } : undefined}
           
          />

          {invitationCodeEnabled && (
            <TextInput
              label={t('auth.invitationCodeLabel')}
              type="text"
              placeholder={t('auth.invitationCodePlaceholder')}
              startIcon={KeyIcon}
              value={invitationCode}
              onChange={(v) => {
                setInvitationCode(v)
                if (errors.invitationCode) setErrors((e) => ({ ...e, invitationCode: '' }))
                setInvitationValid(false)
                setInvitationInvalid(false)
              }}
              isDisabled={authDisabled && !isLoading}
              status={
                errors.invitationCode
                  ? { type: 'error', message: errors.invitationCode }
                  : invitationValid
                    ? { type: 'success', message: t('auth.invitationCodeValid') }
                    : undefined
              }
             
            />
          )}

          {promoCodeEnabled && (
            <TextInput
              label={t('auth.promoCodeLabel')}
              isOptional
              type="text"
              placeholder={t('auth.promoCodePlaceholder')}
              startIcon={GiftIcon}
              value={promoCode}
              onChange={handlePromoCodeChange}
              isLoading={promoValidating}
              isDisabled={authDisabled && !isLoading}
              status={
                promoValidation.valid
                  ? {
                      type: 'success',
                      message: t('auth.promoCodeValid', { amount: (promoValidation.bonusAmount ?? 0).toFixed(2) }),
                    }
                  : promoValidation.invalid
                    ? { type: 'error', message: promoValidation.message }
                    : undefined
              }
            />
          )}

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

          {errorMessage && <Banner status="error" title={t('common.error')} description={errorMessage} />}

          <Button
            type="submit"
            label={isLoading ? t('auth.signingUp') : t('auth.signUp')}
            variant="primary"
           
            width="100%"
            isLoading={isLoading}
            isDisabled={authDisabled}
          />
        </VStack>
      </form>

      {hasOAuthProviders(settings, 'register') && (
        <OAuthProviders
          settings={settings}
          disabled={authDisabled}
          promoCode={promoCodeEnabled ? promoCode : undefined}
          mode="register"
          onStart={(request) => void handleOAuthStart(request)}
        />
      )}
    </AuthLayout>
  )
}
