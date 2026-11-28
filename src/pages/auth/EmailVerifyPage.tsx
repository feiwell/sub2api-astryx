import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Layout'

import { sendVerifyCode } from '@/api/auth'
import type { RegisterRequest, SendVerifyCodeRequest } from '@/types'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { AuthLayout } from '~/layouts/AuthLayout'
import { CaptchaChallenge, captchaConfigFromSettings, type CaptchaChallengeHandle } from '~/components/captcha/CaptchaChallenge'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { toast } from '~/lib/toast'

type PendingRegistration = Pick<RegisterRequest, 'email' | 'password' | 'invitation_code' | 'promo_code' | 'aff_code'> & {
  redirectTo?: string
  code_sent_at?: number
  countdown?: number
}

/** React port of views/auth/EmailVerifyView.vue. */
export function EmailVerifyPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const settings = useAppStore((s) => s.publicSettings)
  const siteName = useAppStore((s) => s.siteName) || 'Sub2API'

  // Read registration data from sessionStorage
  const getRegisterData = () => {
    try {
      const data = sessionStorage.getItem('pending_register_data')
      if (!data) return null
      const parsed: PendingRegistration = JSON.parse(data)
      if (!parsed || typeof parsed.email !== 'string' || !parsed.email || typeof parsed.password !== 'string' || !parsed.password) return null
      return parsed
    } catch {
      return null
    }
  }

  const [registerData] = useState(getRegisterData)
  const hasRegisterData = !!registerData

  const [verifyCode, setVerifyCode] = useState('')
  const [errors, setErrors] = useState({ code: '' })
  const [isLoading, setLoading] = useState(false)
  const [isSendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(!!registerData?.code_sent_at)
  const [countdown, setCountdown] = useState(() => {
    if (!registerData?.code_sent_at || typeof registerData.countdown !== 'number' || !Number.isFinite(registerData.countdown)) return 0
    return Math.max(0, Math.ceil((registerData.code_sent_at + registerData.countdown * 1000 - Date.now()) / 1000))
  })

  const captchaRef = useRef<CaptchaChallengeHandle>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaRandstr, setCaptchaRandstr] = useState('')
  const captcha = captchaConfigFromSettings(settings)

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const resetCaptcha = () => {
    captchaRef.current?.reset()
    setCaptchaToken('')
    setCaptchaRandstr('')
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

  const handleResendCode = async () => {
    if (!registerData || countdown > 0 || isSendingCode || isLoading) return

    const proof = await acquireActionProof()
    if (proof === null) return

    setSendingCode(true)
    try {
      const token = proof === 'none' ? captchaToken : proof.token
      const randstr = proof === 'none' ? captchaRandstr : proof.randstr

      const payload: SendVerifyCodeRequest = {
        email: registerData.email,
        turnstile_token: captcha.turnstileEnabled || captcha.aliyunEnabled ? token : undefined,
        tencent_captcha_ticket: captcha.tencentEnabled ? token : undefined,
        tencent_captcha_randstr: captcha.tencentEnabled ? randstr : undefined,
      }
      const response = await sendVerifyCode(payload)
      sessionStorage.setItem('pending_register_data', JSON.stringify({
        email: registerData.email,
        password: registerData.password,
        invitation_code: registerData.invitation_code,
        promo_code: registerData.promo_code,
        aff_code: registerData.aff_code,
        redirectTo: registerData.redirectTo,
        code_sent_at: Date.now(),
        countdown: response.countdown,
      }))
      setCodeSent(true)
      setCountdown(response.countdown)
      toast.success(t('auth.codeSentSuccess'))
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.sendCodeFailed'))
      toast.error(message)
    } finally {
      if (captcha.enabled) resetCaptcha()
      setSendingCode(false)
    }
  }

  const handleVerify = async () => {
    if (!registerData || !/^\d{6}$/.test(verifyCode) || isLoading || isSendingCode) return

    setLoading(true)
    setErrors({ code: '' })
    try {
      await register({
        email: registerData.email,
        password: registerData.password,
        verify_code: verifyCode,
        invitation_code: registerData.invitation_code,
        promo_code: registerData.promo_code,
        aff_code: registerData.aff_code,
      })
      sessionStorage.removeItem('pending_register_data')
      toast.success(t('auth.accountCreatedSuccess', { siteName }))
      navigate(registerData.redirectTo || '/dashboard', { replace: true })
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.verifyFailed'))
      setErrors({ code: message })
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    sessionStorage.removeItem('pending_register_data')
    navigate('/register')
  }

  if (!hasRegisterData) {
    return (
      <AuthLayout title={t('auth.verifyYourEmail')} subtitle={t('auth.sendCodeDesc')}>
        <VStack gap={4} hAlign="stretch">
          <Banner
            status="warning"
            title={t('auth.sessionExpired')}
            description={t('auth.sessionExpiredDesc')}
          />
          <VStack gap={2} hAlign="center">
            <Link href="/register" type="supporting">
              {t('auth.backToRegistration')}
            </Link>
          </VStack>
        </VStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.verifyYourEmail')}
      subtitle={t('auth.sendCodeDesc')}
      footer={
        <Text type="supporting" color="secondary">
          <Link href="/register" type="supporting" onClick={handleBack}>
            {t('auth.backToRegistration')}
          </Link>
        </Text>
      }>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void handleVerify()
        }}>
        <VStack gap={4} hAlign="stretch">
          <Text type="supporting" color="secondary" justify="center">
            {registerData.email}
          </Text>
          <VStack gap={1} hAlign="stretch">
            <Text type="supporting" color="secondary" justify="center">
              {t('auth.verificationCode')}
            </Text>
            <TextInput
              label={t('auth.verificationCode')}
              isLabelHidden
              type="text"
              autoComplete="one-time-code"
              placeholder="000000"
              value={verifyCode}
              onChange={(v) => {
                setVerifyCode(v.replace(/\D/g, '').slice(0, 6))
                if (errors.code) setErrors({ code: '' })
              }}
              isDisabled={isLoading}
              status={errors.code ? { type: 'error', message: errors.code } : undefined}
              description={t('auth.verificationCodeHint')}
              hasAutoFocus
            />
          </VStack>

          {codeSent && (
            <Banner status="success" title={t('auth.codeSentSuccess')} />
          )}

          {captcha.enabled && (
            <VStack gap={1} hAlign="stretch">
              <CaptchaChallenge
                ref={captchaRef}
                config={captcha}
                onVerify={(token, randstr) => {
                  setCaptchaToken(token)
                  setCaptchaRandstr(randstr)
                }}
                onExpire={() => setCaptchaToken('')}
                onError={() => setCaptchaToken('')}
              />
            </VStack>
          )}

          <Button
            type="submit"
            label={isLoading ? t('auth.verifying') : t('auth.verifyAndCreate')}
            variant="primary"
           
            width="100%"
            isLoading={isLoading}
            isDisabled={isLoading || isSendingCode || !/^\d{6}$/.test(verifyCode)}
          />

          <VStack gap={2} hAlign="center">
            {countdown > 0 ? (
              <Text type="supporting" color={"tertiary" as any}>
                {t('auth.resendCountdown', { countdown })}
              </Text>
            ) : (
              <Button
                label={isSendingCode ? t('auth.sendingCode') : t('auth.resendCode')}
                variant="ghost"
               
                isLoading={isSendingCode}
                isDisabled={isSendingCode || isLoading || (captcha.turnstileEnabled && !!captcha.turnstileSiteKey && !captchaToken)}
                onClick={() => void handleResendCode()}
              />
            )}
          </VStack>
        </VStack>
      </form>
    </AuthLayout>
  )
}
