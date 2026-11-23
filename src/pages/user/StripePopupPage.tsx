import { toAppPath } from '@/utils/appPath'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'
import { buildApiUrl } from '~/lib/api/url'
import { CenteredFrame } from '~/components/common/CenteredFrame'
import { useI18n } from '~/i18n'

interface StripeWithWechatPay {
  confirmWechatPayPayment(
    clientSecret: string,
    options: Record<string, unknown>,
  ): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>
}

/**
 * React port of views/user/StripePopupView.vue: the opener posts the client
 * secret via postMessage, then this window confirms Alipay / WeChat Pay.
 */
export function StripePopupPage() {
  const { t } = useI18n()
  const [query] = useSearchParams()
  const orderId = query.get('order_id') || ''
  const method = query.get('method') || 'alipay'
  const amount = query.get('amount') || ''

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [hint, setHint] = useState(t('payment.stripePopup.redirecting'))
  const doneRef = useRef(false)
  doneRef.current = Boolean(error) || success

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let initTimeout: ReturnType<typeof setTimeout> | null = null
    const closeSoon = () => setTimeout(() => window.close(), 2000)

    const startPolling = () => {
      let inFlight = false
      pollTimer = setInterval(async () => {
        if (inFlight) return
        inFlight = true
        try {
          const token = localStorage.getItem('auth_token') || ''
          const res = await fetch(buildApiUrl(`/payment/orders/${orderId}`), {
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            credentials: 'include',
          })
          if (!res.ok) return
          const data = await res.json()
          const status = data?.data?.status
          if (status === 'COMPLETED' || status === 'PAID') {
            if (pollTimer) clearInterval(pollTimer)
            pollTimer = null
            setSuccess(true)
            closeSoon()
          }
        } catch {
          // ignore
        } finally {
          inFlight = false
        }
      }, 3000)
    }

    const initStripe = async (clientSecret: string, publishableKey: string) => {
      if (!clientSecret || !publishableKey) {
        setError(t('payment.stripeMissingParams'))
        return
      }
      try {
        const { loadStripe } = await import('@stripe/stripe-js/pure')
        const stripe = await loadStripe(publishableKey)
        if (!stripe) {
          setError(t('payment.stripeLoadFailed'))
          return
        }
        const returnUrl = `${window.location.origin}${toAppPath('/payment/result')}?order_id=${orderId}&status=success`
        if (method === 'alipay') {
          const { error: err } = await stripe.confirmAlipayPayment(clientSecret, { return_url: returnUrl })
          if (err) setError(err.message || t('payment.result.failed'))
        } else if (method === 'wechat_pay') {
          setHint(t('payment.stripePopup.loadingQr'))
          const result = await (stripe as unknown as StripeWithWechatPay).confirmWechatPayPayment(clientSecret, {
            payment_method_options: { wechat_pay: { client: isMobileDevice() ? 'mobile_web' : 'web' } },
          })
          if (result.error) setError(result.error.message || t('payment.result.failed'))
          else if (result.paymentIntent?.status === 'succeeded') {
            setSuccess(true)
            closeSoon()
          } else startPolling()
        }
      } catch (err) {
        setError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed')))
      }
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'STRIPE_POPUP_INIT') return
      if (initTimeout) clearTimeout(initTimeout)
      initTimeout = null
      window.removeEventListener('message', onMessage)
      void initStripe(event.data.clientSecret, event.data.publishableKey)
    }
    window.addEventListener('message', onMessage)
    if (window.opener) window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, window.location.origin)
    // Fallback only for an opener that never sends STRIPE_POPUP_INIT.
    initTimeout = setTimeout(() => {
      if (!doneRef.current) setError(t('payment.stripePopup.timeout'))
    }, 15000)

    return () => {
      window.removeEventListener('message', onMessage)
      if (pollTimer) clearInterval(pollTimer)
      if (initTimeout) clearTimeout(initTimeout)
    }
    // Initializes once per popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CenteredFrame>
      <Card padding={6}>
        <VStack gap={4} hAlign="stretch">
          {amount && (
            <VStack gap={1} hAlign="center">
              <Heading level={1}>¥{amount}</Heading>
              {orderId && (
                <Text type="supporting">
                  {t('payment.orders.orderId')}: {orderId}
                </Text>
              )}
            </VStack>
          )}
          {error ? (
            <VStack gap={3} hAlign="stretch">
              <Banner status="error" title={error} />
              <Button label={t('common.close')} variant="secondary" width="100%" onClick={() => window.close()} />
            </VStack>
          ) : success ? (
            <VStack gap={3} hAlign="center" padding={4}>
              <Icon icon={CheckCircleIcon} size="lg" color="success" />
              <Text color="secondary">{t('payment.result.success')}</Text>
              <Button label={t('common.close')} variant="secondary" onClick={() => window.close()} />
            </VStack>
          ) : (
            <VStack gap={3} hAlign="center" padding={6}>
              <Spinner size="lg" label={hint} />
            </VStack>
          )}
        </VStack>
      </Card>
    </CenteredFrame>
  )
}
