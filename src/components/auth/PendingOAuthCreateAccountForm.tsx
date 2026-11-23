import { useEffect, useRef, useState } from 'react'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { EnvelopeIcon, LockClosedIcon, KeyIcon } from '@heroicons/react/24/outline'
import { getPublicSettings, sendPendingOAuthVerifyCode } from '@/api/auth'
import type { PublicSettings } from '@/types'
import {
  CaptchaChallenge,
  captchaConfigFromSettings,
  type CaptchaChallengeHandle,
} from '~/components/captcha/CaptchaChallenge'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

export type PendingOAuthCreateAccountPayload = {
  email: string
  password: string
  verifyCode: string
  turnstileToken?: string
  tencentCaptchaTicket?: string
  tencentCaptchaRandstr?: string
  invitationCode?: string
}

function requestErrorMessage(error: unknown, fallback: string): string {
  const err = error as { message?: string; response?: { data?: { detail?: string; message?: string } } }
  return err.response?.data?.detail || err.response?.data?.message || err.message || fallback
}

/** Port of components/auth/PendingOAuthCreateAccountForm.vue. */
export function PendingOAuthCreateAccountForm({
  initialEmail,
  isSubmitting,
  errorMessage,
  onSubmit,
  onSwitchToBind,
}: {
  initialEmail: string
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (payload: PendingOAuthCreateAccountPayload) => void
  onSwitchToBind: (email: string) => void
}) {
  const { t } = useI18n()
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [isSendingCode, setSendingCode] = useState(false)
  const [sendCodeSuccess, setSendCodeSuccess] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaRandstr, setCaptchaRandstr] = useState('')
  const captchaRef = useRef<CaptchaChallengeHandle>(null)

  const captcha = captchaConfigFromSettings(settings)
  const invitationCodeEnabled = settings?.invitation_code_enabled === true
  const emailVerifyEnabled = settings ? settings.email_verify_enabled !== false : true

  useEffect(() => setEmail(initialEmail || ''), [initialEmail])

  useEffect(() => {
    let cancelled = false
    getPublicSettings()
      .then((data) => !cancelled && setSettings(data))
      .catch(() => !cancelled && setSettings(null))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (errorMessage && captcha.enabled) resetCaptcha()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessage])

  function resetCaptcha() {
    setCaptchaToken('')
    setCaptchaRandstr('')
    captchaRef.current?.reset()
  }

  async function acquireActionProof(): Promise<{ token: string; randstr: string } | null> {
    if (!captcha.actionEnabled) return { token: captchaToken, randstr: captchaRandstr }
    const proof = (await captchaRef.current?.verifyAction()) ?? null
    if (proof) {
      setCaptchaToken(proof.token)
      setCaptchaRandstr(proof.randstr)
    }
    return proof
  }

  async function handleSendCode() {
    const trimmed = email.trim()
    if (!trimmed) return
    if (captcha.turnstileEnabled && !captchaToken) {
      toast.error(t('auth.completeVerification'))
      return
    }
    const proof = await acquireActionProof()
    if (!proof) return
    setSendingCode(true)
    setSendCodeSuccess(false)
    try {
      const response = await sendPendingOAuthVerifyCode({
        email: trimmed,
        turnstile_token: captcha.turnstileEnabled || captcha.aliyunEnabled ? proof.token : undefined,
        tencent_captcha_ticket: captcha.tencentEnabled ? proof.token : undefined,
        tencent_captcha_randstr: captcha.tencentEnabled ? proof.randstr : undefined,
      })
      setSendCodeSuccess(true)
      setCountdown(Math.max(0, response.countdown || 0))
    } catch (error) {
      toast.error(requestErrorMessage(error, t('auth.sendCodeFailed')))
    } finally {
      if (captcha.enabled) resetCaptcha()
      setSendingCode(false)
    }
  }

  async function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed || password.length < 6) return
    if (captcha.turnstileEnabled && !captchaToken) {
      toast.error(t('auth.completeVerification'))
      return
    }
    const proof = await acquireActionProof()
    if (!proof) return
    onSubmit({
      email: trimmed,
      password,
      verifyCode: emailVerifyEnabled ? verifyCode.trim() : '',
      ...((captcha.turnstileEnabled || captcha.aliyunEnabled) && proof.token ? { turnstileToken: proof.token } : {}),
      ...(captcha.tencentEnabled && proof.token
        ? { tencentCaptchaTicket: proof.token, tencentCaptchaRandstr: proof.randstr }
        : {}),
      invitationCode: invitationCode.trim() || undefined,
    })
    if (captcha.actionEnabled) resetCaptcha()
  }

  const canSubmit =
    !isSubmitting &&
    !!email.trim() &&
    password.length >= 6 &&
    (!invitationCodeEnabled || !!invitationCode.trim()) &&
    (!captcha.turnstileEnabled || !!captchaToken)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}>
      <VStack gap={3} hAlign="stretch">
        <TextInput
          label={t('auth.emailLabel')}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          startIcon={EnvelopeIcon}
          value={email}
          onChange={setEmail}
          isDisabled={isSubmitting || isSendingCode}
        />
        <TextInput
          label={t('auth.passwordLabel')}
          type="password"
          autoComplete="new-password"
          placeholder={t('auth.passwordPlaceholder')}
          startIcon={LockClosedIcon}
          value={password}
          onChange={setPassword}
          isDisabled={isSubmitting}
        />
        {captcha.enabled && (
          <CaptchaChallenge
            ref={captchaRef}
            config={captcha}
            onVerify={(token, randstr) => {
              setCaptchaToken(token)
              setCaptchaRandstr(randstr)
            }}
            onExpire={() => {
              setCaptchaToken('')
              toast.error(t('auth.turnstileExpired'))
            }}
            onError={() => {
              setCaptchaToken('')
              toast.error(t('auth.turnstileFailed'))
            }}
          />
        )}
        {emailVerifyEnabled && (
          <VStack gap={1} hAlign="stretch">
            <HStack gap={3} vAlign="end">
              <StackItem size="fill">
                <TextInput
                  label={t('auth.verificationCode')}
                  inputMode="numeric"
                  placeholder="123456"
                  value={verifyCode}
                  onChange={(v) => setVerifyCode(v.replace(/\D/g, '').slice(0, 6))}
                  isDisabled={isSubmitting}
                />
              </StackItem>
              <Button
                label={
                  isSendingCode
                    ? t('auth.sendingCode')
                    : countdown > 0
                      ? t('auth.resendCountdown', { countdown })
                      : t('auth.sendCode')
                }
                variant="secondary"
                isLoading={isSendingCode}
                isDisabled={
                  isSubmitting || isSendingCode || countdown > 0 || !email.trim() || (captcha.turnstileEnabled && !captchaToken)
                }
                onClick={() => void handleSendCode()}
              />
            </HStack>
            <Text type="supporting" color={sendCodeSuccess ? 'accent' : 'secondary'}>
              {sendCodeSuccess ? t('auth.codeSentSuccess') : t('auth.verificationCodeHint')}
            </Text>
          </VStack>
        )}
        {invitationCodeEnabled && (
          <TextInput
            label={t('auth.invitationCodeLabel')}
            placeholder={t('auth.invitationCodePlaceholder')}
            startIcon={KeyIcon}
            value={invitationCode}
            onChange={setInvitationCode}
            isDisabled={isSubmitting}
          />
        )}
        <Button
          type="submit"
          label={isSubmitting ? t('common.processing') : t('auth.createAccount')}
          variant="primary"
          width="100%"
          isLoading={isSubmitting}
          isDisabled={!canSubmit}
        />
        <Button
          label={t('auth.alreadyHaveAccount')}
          variant="secondary"
          width="100%"
          isDisabled={isSubmitting}
          onClick={() => onSwitchToBind(email.trim())}
        />
      </VStack>
    </form>
  )
}
