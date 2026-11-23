import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { VStack } from '@astryxdesign/core/Layout'
import { LockClosedIcon } from '@heroicons/react/24/outline'
import { resetPassword } from '@/api/auth'

import { extractI18nErrorMessage } from '@/utils/apiError'
import { AuthLayout } from '~/layouts/AuthLayout'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

/** React port of views/auth/ResetPasswordView.vue. */
export function ResetPasswordPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()

  const token = query.get('token') || ''
  const emailParam = query.get('email') || ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [errors, setErrors] = useState({ password: '', confirmPassword: '' })
  const [isLoading, setLoading] = useState(false)
  const [isSuccess, setSuccess] = useState(false)
  const [isInvalidLink, setInvalidLink] = useState(false)
  const [showPassword, _setShowPassword] = useState(false)
  const [showConfirmPassword, _setShowConfirmPassword] = useState(false)

  useEffect(() => {
    if (!token || !emailParam) {
      setInvalidLink(true)
      toast.error(t('auth.invalidResetLink'))
    } else {
      setEmail(emailParam)
    }
  }, [token, emailParam, t])

  const validate = (): boolean => {
    const next = { password: '', confirmPassword: '' }
    if (!password) next.password = t('auth.passwordRequired')
    else if (password.length < 6) next.password = t('auth.passwordMinLength')
    if (!confirmPassword) next.confirmPassword = t('auth.confirmPasswordRequired')
    else if (password !== confirmPassword) next.confirmPassword = t('auth.passwordMismatch')
    setErrors(next)
    const first = next.password || next.confirmPassword
    if (first) toast.error(first)
    return !first
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      const payload: any = {
        token,
        email: emailParam,
        new_password: password,
      }
      await resetPassword(payload)
      setSuccess(true)
      toast.success(t('auth.passwordResetSuccess'))
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.passwordResetFailed'))
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  if (isInvalidLink) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.resetPasswordHint')}>
        <VStack gap={4} hAlign="stretch">
          <Banner
            status="warning"
            title={t('common.warning')} description={t('auth.invalidResetLinkHint')}
          />
          <VStack gap={2} hAlign="center">
            <Link href="/forgot-password" type="supporting">
              {t('auth.requestNewResetLink')}
            </Link>
          </VStack>
        </VStack>
      </AuthLayout>
    )
  }

  if (isSuccess) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.resetPasswordHint')}>
        <VStack gap={4} hAlign="stretch">
          <Banner
            status="success"
            title={t('common.success')} description={t('auth.passwordResetSuccessHint')}
          />
          <Button
            label={t('auth.signIn')}
            variant="primary"
           
            width="100%"
            onClick={() => navigate('/login')}
          />
        </VStack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Authentication" subtitle={t('auth.resetPasswordHint')}>
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
            autoComplete="username"
            value={email}
            isDisabled
           
          />
          <TextInput
            label={t('auth.newPassword')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('auth.newPasswordPlaceholder')}
            startIcon={LockClosedIcon}
           
           
            value={password}
            onChange={(v) => {
              setPassword(v)
              if (errors.password) setErrors((e) => ({ ...e, password: '' }))
            }}
            isDisabled={isLoading}
            status={errors.password ? { type: 'error', message: errors.password } : undefined}
           
            hasAutoFocus
          />
          <TextInput
            label={t('auth.confirmNewPassword')}
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('auth.confirmPasswordPlaceholder')}
            startIcon={LockClosedIcon}
           
           
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v)
              if (errors.confirmPassword) setErrors((e) => ({ ...e, confirmPassword: '' }))
            }}
            isDisabled={isLoading}
            status={errors.confirmPassword ? { type: 'error', message: errors.confirmPassword } : undefined}
           
          />

          <Button
            type="submit"
            label={isLoading ? t('common.submitting') : t('auth.resetPassword')}
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
