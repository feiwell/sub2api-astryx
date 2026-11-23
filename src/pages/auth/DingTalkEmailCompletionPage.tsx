import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { persistOAuthTokenContext, type PendingOAuthExchangeResponse } from '@/api/auth'
import { clearAllAffiliateReferralCodes } from '@/utils/oauthAffiliate'
import { apiClient } from '~/lib/api/client'
import { AuthLayout } from '~/layouts/AuthLayout'
import {
  PendingOAuthCreateAccountForm,
  type PendingOAuthCreateAccountPayload,
} from '~/components/auth/PendingOAuthCreateAccountForm'
import { requestErrorMessage, sanitizeRedirectPath } from '~/components/auth/PendingOAuthCallback'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { toast } from '~/lib/toast'

type CreateAccountResponse = PendingOAuthExchangeResponse & {
  step?: string
  redirect?: string
  existing_account_bindable?: boolean
}

/** React port of views/auth/DingTalkEmailCompletionView.vue. */
export function DingTalkEmailCompletionPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const setToken = useAuthStore((s) => s.setToken)
  const [isSubmitting, setSubmitting] = useState(false)
  const [accountActionError, setAccountActionError] = useState('')
  const initialEmail = query.get('email') || ''

  function navigateToBindLogin(email: string) {
    const params = new URLSearchParams({ bind: '1' })
    if (email) params.set('email', email)
    const redirect = query.get('redirect')
    if (redirect) params.set('redirect', redirect)
    navigate(`/auth/dingtalk/callback?${params}`, { replace: true })
  }

  async function handleCreateAccount(payload: PendingOAuthCreateAccountPayload) {
    setAccountActionError('')
    if (!payload.email || !payload.password) return
    setSubmitting(true)
    try {
      const { data } = await apiClient.post<CreateAccountResponse>('/auth/oauth/pending/create-account', {
        email: payload.email,
        password: payload.password,
        verify_code: payload.verifyCode || undefined,
        ...(payload.turnstileToken ? { turnstile_token: payload.turnstileToken } : {}),
        ...(payload.tencentCaptchaTicket
          ? { tencent_captcha_ticket: payload.tencentCaptchaTicket, tencent_captcha_randstr: payload.tencentCaptchaRandstr }
          : {}),
        invitation_code: payload.invitationCode || undefined,
      })
      const redirect = sanitizeRedirectPath(data.redirect || query.get('redirect'))
      if (data.access_token) {
        persistOAuthTokenContext(data)
        await setToken(data.access_token)
        clearAllAffiliateReferralCodes()
        toast.success(t('auth.loginSuccess'))
        navigate(redirect, { replace: true })
        return
      }
      // The email is already registered: go back to the callback and bind it.
      if (data.step === 'choose_account_action_required' || data.existing_account_bindable === true) {
        navigateToBindLogin(payload.email)
        return
      }
      setAccountActionError(t('auth.loginFailed'))
      toast.error(t('auth.loginFailed'))
    } catch (e) {
      const reason = (e as { response?: { data?: { reason?: string } } }).response?.data?.reason
      if (reason === 'REGISTRATION_DISABLED') {
        toast.info(t('auth.dingtalk.registrationDisabledRedirectToBind'))
        navigateToBindLogin(payload.email)
        return
      }
      const message = requestErrorMessage(e, t('auth.loginFailed'))
      setAccountActionError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title={t('auth.dingtalk.createAccountTitle')} subtitle={t('auth.oauthFlow.createAccountHint')}>
      <PendingOAuthCreateAccountForm
        initialEmail={initialEmail}
        isSubmitting={isSubmitting}
        errorMessage={accountActionError}
        onSubmit={(payload) => void handleCreateAccount(payload)}
        onSwitchToBind={navigateToBindLogin}
      />
    </AuthLayout>
  )
}
