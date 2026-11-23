import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { LockClosedIcon, KeyIcon } from '@heroicons/react/24/outline'
import { exchangeOAuthCallback, completeOAuthRegistration } from '@/api/auth-extensions'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { AuthLayout } from '~/layouts/AuthLayout'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { toast } from '~/lib/toast'

/** React port of views/auth/OAuthCallbackView.vue. */
export function OAuthCallbackPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const setToken = useAuthStore((s) => s.setToken)

  const code = query.get('code') || ''
  const state = query.get('state') || ''
  const error = query.get('error') || query.get('error_description') || ''

  const [isProcessing, setProcessing] = useState(true)
  const [needsRegistrationCompletion, setNeedsRegistrationCompletion] = useState(false)
  const [invalidCallback, setInvalidCallback] = useState(false)

  const [registrationEmail, setRegistrationEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [showPassword] = useState(false)
  const [showConfirmPassword] = useState(false)

  const [invitationRequired, setInvitationRequired] = useState(false)
  const [providerName, setProviderName] = useState('')
  const [redirectTo, setRedirectTo] = useState('/dashboard')
  const [isSubmitting, setSubmitting] = useState(false)
  const [registrationError, setRegistrationError] = useState('')

  useEffect(() => {
    if (error) {
      setInvalidCallback(true)
      setProcessing(false)
      toast.error(error)
      return
    }

    if (!code) {
      setInvalidCallback(true)
      setProcessing(false)
      return
    }

    void handleOAuthCallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOAuthCallback = async () => {
    setProcessing(true)
    try {
      const response = await exchangeOAuthCallback({ code, state } as any) as any

      // Check if we got a token directly
      if (response.access_token) {
        await setToken(response.access_token)
        toast.success(t('auth.loginSuccess'))
        const redirect = query.get('redirect') || '/dashboard'
        navigate(redirect, { replace: true })
        return
      }

      // Check if registration completion is needed
      if (response.requires_registration_completion) {
        setNeedsRegistrationCompletion(true)
        setRegistrationEmail(response.email || '')
        setInvitationRequired(response.invitation_required === true)
        setProviderName(response.provider || 'OAuth')
        setRedirectTo(query.get('redirect') || '/dashboard')
        setProcessing(false)
        return
      }

      // Unknown response
      throw new Error('Invalid OAuth callback response')
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.loginFailed'))
      toast.error(message)
      setInvalidCallback(true)
    } finally {
      if (!needsRegistrationCompletion) {
        setProcessing(false)
      }
    }
  }

  const handleSubmitRegistration = async () => {
    setRegistrationError('')

    if (!registrationEmail.trim()) {
      setRegistrationError(t('auth.emailRequired'))
      return
    }
    if (password.length < 6) {
      setRegistrationError(t('auth.passwordMinLength'))
      return
    }
    if (password !== confirmPassword) {
      setRegistrationError(t('auth.passwordMismatch'))
      return
    }
    if (invitationRequired && !invitationCode.trim()) {
      setRegistrationError(t('auth.invitationCodeRequired'))
      return
    }

    setSubmitting(true)
    try {
      const payload: any = { password, state }
      if (invitationRequired && invitationCode) {
        payload.invitation_code = invitationCode
      }

      const response = await completeOAuthRegistration(payload) as any
      await setToken(response.access_token)
      sessionStorage.removeItem('oauth_pending_provider')
      toast.success(t('auth.registerSuccess'))
      navigate(redirectTo, { replace: true })
    } catch (error) {
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.registerFailed'))
      setRegistrationError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (isProcessing) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.oauth.callbackHint')}>
        <VStack gap={4} hAlign="center">
          <Spinner />
          <Text type="body" color="secondary">
            {t('common.loading')}
          </Text>
        </VStack>
      </AuthLayout>
    )
  }

  if (needsRegistrationCompletion) {
    return (
      <AuthLayout
        title={t('auth.oidc.completeRegistration')}
        subtitle={
          invitationRequired
            ? t('auth.oidc.invitationRequired', { providerName })
            : t('auth.oidc.completeRegistration')
        }>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmitRegistration()
          }}>
          <VStack gap={4} hAlign="stretch">
            <TextInput label={t('auth.emailLabel')} type="email" value={registrationEmail} isDisabled />

            <TextInput
              label={t('auth.passwordLabel')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('auth.createPasswordPlaceholder')}
              startIcon={LockClosedIcon}
             
             
              value={password}
              onChange={setPassword}
              isDisabled={isSubmitting}
             
              hasAutoFocus
            />

            <TextInput
              label={t('auth.confirmPassword')}
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('auth.confirmPasswordPlaceholder')}
              startIcon={LockClosedIcon}
             
             
              value={confirmPassword}
              onChange={setConfirmPassword}
              isDisabled={isSubmitting}
             
            />

            {invitationRequired && (
              <TextInput
                label={t('auth.invitationCodeLabel')}
                type="text"
                placeholder={t('auth.invitationCodePlaceholder')}
                startIcon={KeyIcon}
                value={invitationCode}
                onChange={setInvitationCode}
                isDisabled={isSubmitting}
               
              />
            )}

            {registrationError && <Banner status="error" title={t('common.error')} />}

            <Button
              type="submit"
              label={isSubmitting ? t('common.processing') : t('auth.oidc.completeRegistration')}
              variant="primary"
             
              width="100%"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            />
          </VStack>
        </form>
      </AuthLayout>
    )
  }

  if (invalidCallback) {
    return (
      <AuthLayout title="Authentication" subtitle={t('auth.oauth.invalidCallbackHint')}>
        <VStack gap={4} hAlign="stretch">
          <Banner status="error" title={t('common.error')} />
          <Button label={t('auth.backToLogin')} variant="primary" width="100%" onClick={() => navigate('/login')} />
        </VStack>
      </AuthLayout>
    )
  }

  // Default view showing code/state (for debugging)
  return (
    <AuthLayout title="Authentication" subtitle={t('auth.oauth.callbackHint')}>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1} hAlign="stretch">
          <Text type="supporting" color="secondary">
            {t('auth.oauth.code')}
          </Text>
          <HStack gap={2}>
            <TextInput label="" value={code} isDisabled />
            <Button
              label={t('common.copy')}
              variant="secondary"

              isDisabled={!code}
              onClick={() => {
                void navigator.clipboard.writeText(code)
                toast.success(t('common.copied'))
              }}
            />
          </HStack>
        </VStack>

        <VStack gap={1} hAlign="stretch">
          <Text type="supporting" color="secondary">
            {t('auth.oauth.state')}
          </Text>
          <HStack gap={2}>
            <TextInput label="" value={state} isDisabled />
            <Button
              label={t('common.copy')}
              variant="secondary"
             
              isDisabled={!state}
              onClick={() => {
                void navigator.clipboard.writeText(state)
                toast.success(t('common.copied'))
              }}
            />
          </HStack>
        </VStack>
      </VStack>
    </AuthLayout>
  )
}
