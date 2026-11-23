import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Layout'

import { sendVerifyCode } from '@/api/auth'
import { verifyEmailCode } from '@/api/auth-extensions'
import type { SendVerifyCodeRequest } from '@/types'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { AuthLayout } from '~/layouts/AuthLayout'
import { CaptchaChallenge, captchaConfigFromSettings, type CaptchaChallengeHandle } from '~/components/captcha/CaptchaChallenge'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { toast } from '~/lib/toast'

const RESEND_COOLDOWN = 60 // seconds

/** React port of views/auth/EmailVerifyView.vue. */
export function EmailVerifyPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const settings = useAppStore((s) => s.publicSettings)

  // Read registration data from sessionStorage
  const getRegisterData = () => {
    try {
      const data = sessionStorage.getItem('pending_register_data')
      if (!data) return null
      return JSON.parse(data) as {
        email: string
        password: string
        invitation_code?: string
        promo_code?: string
        aff_code?: string
        turnstile_token?: string
        tencent_captcha_ticket?: string
        tencent_captcha_randstr?: string
      }
    } catch {
      return null
    }
  }

  const registerData = getRegisterData()
  const hasRegisterData = !!registerData

  const [verifyCode, setVerifyCode] = useState('')
  const [errors, setErrors] = useState({ code: '' })
  const [isLoading, setLoading] = useState(false)
  const [isSendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [countdown, setCountdown] = useState(0)

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
    if (!registerData || countdown > 0) return

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
      await (sendVerifyCode as any)(payload)
      setCodeSent(true)
      setCountdown(RESEND_COOLDOWN)
      toast.success(t('auth.codeSentSuccess'))
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.sendCodeFailed'))
      toast.error(message)
    } finally {
      if (captcha.actionEnabled) resetCaptcha()
      setSendingCode(false)
    }
  }

  const handleVerify = async () => {
    if (!registerData || !verifyCode) return

    const proof = await acquireActionProof()
    if (proof === null) return

    setLoading(true)
    try {
      const token = proof === 'none' ? captchaToken : proof.token
      const randstr = proof === 'none' ? captchaRandstr : proof.randstr

      const payload: any = {
        email: registerData.email,
        code: verifyCode,
        password: registerData.password,
        invitation_code: registerData.invitation_code,
        promo_code: registerData.promo_code,
        aff_code: registerData.aff_code,
        turnstile_token: captcha.turnstileEnabled || captcha.aliyunEnabled ? token : undefined,
        tencent_captcha_ticket: captcha.tencentEnabled ? token : undefined,
        tencent_captcha_randstr: captcha.tencentEnabled ? randstr : undefined,
      }
      const response = await (verifyEmailCode as any)(payload)

      // Set auth token and redirect
      await setToken(response.access_token || response.token)
      sessionStorage.removeItem('pending_register_data')
      toast.success(t('auth.verifySuccess'))
      navigate('/dashboard', { replace: true })
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.verifyFailed'))
      setErrors({ code: message })
      toast.error(message)
    } finally {
      if (captcha.actionEnabled) resetCaptcha()
      setLoading(false)
    }
  }

  const handleBack = () => {
    sessionStorage.removeItem('pending_register_data')
    navigate('/register')
  }

  if (!hasRegisterData) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.sendCodeDesc')}>
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
      title="Authentication"
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
            <Banner status="success" title={t('auth.codeSent')} />
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
            isDisabled={isLoading || !verifyCode}
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
                isDisabled={isSendingCode || (captcha.enabled && !captchaToken)}
                onClick={() => void handleResendCode()}
              />
            )}
          </VStack>
        </VStack>
      </form>
    </AuthLayout>
  )
}
