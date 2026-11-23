import { useState } from 'react'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { forgotPassword } from '@/api/auth'
import type { SendVerifyCodeRequest } from '@/types'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { AuthLayout } from '~/layouts/AuthLayout'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** React port of views/auth/ForgotPasswordView.vue. */
export function ForgotPasswordPage() {
  const { t } = useI18n()

  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState({ email: '' })
  const [isLoading, setLoading] = useState(false)
  const [isSubmitted, setSubmitted] = useState(false)

  const validate = (): boolean => {
    const next = { email: '' }
    if (!email.trim()) next.email = t('auth.emailRequired')
    else if (!EMAIL_RE.test(email)) next.email = t('auth.invalidEmail')
    setErrors(next)
    if (next.email) toast.error(next.email)
    return !next.email
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      const payload: SendVerifyCodeRequest = {
        email,
      }
      await forgotPassword(payload)
      setSubmitted(true)
      toast.success(t('auth.resetEmailSent'))
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.sendResetEmailFailed'))
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.forgotPasswordHint')}>
        <VStack gap={4} hAlign="stretch">
          <Banner
            status="success"
            title={t('auth.resetEmailSent')}
            description={t('auth.resetEmailSentHint')}
          />
          <VStack gap={2} hAlign="center">
            <Link href="/login" type="supporting">
              {t('auth.backToLogin')}
            </Link>
          </VStack>
        </VStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Authentication" subtitle={t('auth.forgotPasswordHint')}
      footer={
        <Text type="supporting" color="secondary">
          <Link href="/login" type="supporting">
            {t('auth.backToLogin')}
          </Link>
        </Text>
      }>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
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
            isDisabled={isLoading}
            status={errors.email ? { type: 'error', message: errors.email } : undefined}
           
            hasAutoFocus
          />

          <Button
            type="submit"
            label={isLoading ? t('common.sending') : t('auth.sendResetLink')}
            variant="primary"
           
            width="100%"
            isLoading={isLoading}
            isDisabled={isLoading}
          />
        </VStack>
      </form>
    </AuthLayout>
  )
}
