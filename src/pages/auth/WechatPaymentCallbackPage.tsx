import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { AuthLayout } from '~/layouts/AuthLayout'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

function normalizeRedirectPath(path: string | null | undefined): string {
  const value = (path || '').trim()
  if (!value || !value.startsWith('/')) return '/purchase'
  if (value.startsWith('//') || value.includes('://')) return '/purchase'
  if (value === '/payment') return '/purchase'
  if (value.startsWith('/payment?')) return '/purchase' + value.slice('/payment'.length)
  return value
}

/** React port of views/auth/WechatPaymentCallbackView.vue: resumes the WeChat JSAPI payment flow. */
export function WechatPaymentCallbackPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (errorMessage) toast.error(errorMessage)
  }, [errorMessage])

  useEffect(() => {
    const raw = window.location.hash
    const fragment = new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw)
    const readParam = (key: string) => fragment.get(key) || query.get(key) || ''

    const error = readParam('error') || readParam('err_msg') || readParam('errmsg')
    const errorDescription = readParam('error_description') || readParam('message')
    if (error) {
      setErrorMessage(errorDescription || error)
      return
    }

    const resumeToken = readParam('wechat_resume_token')
    const openid = readParam('openid')
    if (!resumeToken && !openid) {
      setErrorMessage(t('auth.wechatPayment.callbackMissingResumeToken'))
      return
    }

    const redirectURL = new URL(normalizeRedirectPath(readParam('redirect')), window.location.origin)
    const next = new URLSearchParams(redirectURL.searchParams)
    next.set('wechat_resume', '1')
    if (resumeToken) {
      next.set('wechat_resume_token', resumeToken)
    } else {
      next.set('openid', openid)
      for (const key of ['state', 'scope', 'payment_type', 'amount', 'order_type', 'plan_id']) {
        const value = readParam(key)
        if (value) next.set(key, value)
      }
    }
    navigate(`${redirectURL.pathname}?${next}`, { replace: true })
    // Runs once per callback visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthLayout
      title={t('auth.wechatPayment.callbackTitle')}
      subtitle={errorMessage ? undefined : t('auth.wechatPayment.callbackProcessing')}>
      {errorMessage ? (
        <VStack gap={4} hAlign="stretch">
          <Banner status="error" title={errorMessage} />
          <Button
            label={t('auth.wechatPayment.backToPayment')}
            variant="primary"
            width="100%"
            onClick={() => navigate('/purchase', { replace: true })}
          />
        </VStack>
      ) : (
        <VStack gap={4} hAlign="center">
          <Spinner />
        </VStack>
      )}
    </AuthLayout>
  )
}
