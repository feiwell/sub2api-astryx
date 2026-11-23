import { toAppPath } from '@/utils/appPath'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { Stripe, StripeElements } from '@stripe/stripe-js'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { paymentAPI } from '@/api/payment'
import type { PaymentOrder } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'
import { formatPaymentAmount, normalizePaymentCurrency } from '@/components/payment/currency'
import { PAYMENT_RECOVERY_STORAGE_KEY, readPaymentRecoverySnapshot } from '@/components/payment/paymentFlow'
import { CenteredFrame } from '~/components/common/CenteredFrame'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'

type WechatPayResult = {
  paymentIntent?: { status: string; next_action?: { wechat_pay_display_qr_code?: { image_data_url?: string } } }
  error?: { message?: string }
}
type StripeWithWechat = Stripe & {
  confirmWechatPayPayment: (clientSecret: string, options: Record<string, unknown>) => Promise<WechatPayResult>
}

/** React port of views/user/StripePaymentView.vue. */
export function StripePaymentPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const colorMode = useAppStore((s) => s.colorMode)
  const orderIdParam = query.get('order_id') || ''
  const method = query.get('method') || ''

  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState('')
  const [stripeError, setStripeError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [currency, setCurrency] = useState('CNY')
  const [wechatQrUrl, setWechatQrUrl] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [showElement, setShowElement] = useState(false)
  const [clientSecret, setClientSecret] = useState('')

  const mountRef = useRef<HTMLElement>(null)
  const stripeRef = useRef<Stripe | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)
  const disposedRef = useRef(false)
  const timersRef = useRef<{ redirect?: ReturnType<typeof setTimeout>; poll?: ReturnType<typeof setInterval> }>({})

  const returnUrl = `${window.location.origin}${toAppPath('/payment/result')}?order_id=${orderIdParam}&status=success`

  function scheduleClose() {
    if (disposedRef.current) return
    timersRef.current.redirect = setTimeout(() => {
      if (window.opener) window.close()
      else navigate(`/payment/result?order_id=${orderIdParam}&status=success`)
    }, 2000)
  }

  function startPolling(orderId: number) {
    timersRef.current.poll = setInterval(async () => {
      try {
        const o = (await paymentAPI.getOrder(orderId)).data
        if (o && (o.status === 'COMPLETED' || o.status === 'PAID')) {
          clearInterval(timersRef.current.poll)
          setSuccess(true)
          setWechatQrUrl('')
          scheduleClose()
        }
      } catch {
        // keep polling
      }
    }, 3000)
  }

  useEffect(() => {
    disposedRef.current = false
    const timers = timersRef.current
    void (async () => {
      const orderId = Number(orderIdParam)
      const resumeToken = query.get('resume_token') || undefined
      // client_secret comes only from this browser's recovery snapshot for the same order, never from the URL.
      const restored = readPaymentRecoverySnapshot(window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY), { resumeToken })
      const secret = orderId && restored?.orderId === orderId ? restored.clientSecret : ''
      if (!orderId || !secret) {
        setLoading(false)
        setInitError(t('payment.stripeMissingParams'))
        return
      }
      try {
        setCurrency(normalizePaymentCurrency(restored?.currency))
        const res = await paymentAPI.getOrder(orderId)
        setOrder(res.data)
        if (res.data.currency) setCurrency(normalizePaymentCurrency(res.data.currency))
        const config = (await paymentAPI.getConfig()).data
        const publishableKey = config?.stripe_publishable_key
        if (!publishableKey) {
          setInitError(t('payment.stripeNotConfigured'))
          return
        }
        const { loadStripe } = await import('@stripe/stripe-js/pure')
        const stripe = await loadStripe(publishableKey)
        if (disposedRef.current) return
        if (!stripe) {
          setInitError(t('payment.stripeLoadFailed'))
          return
        }
        stripeRef.current = stripe
        setLoading(false)
        if (method === 'alipay') {
          setRedirecting(true)
          const { error } = await stripe.confirmAlipayPayment(secret, { return_url: returnUrl })
          if (error) {
            setRedirecting(false)
            setStripeError(error.message || t('payment.result.failed'))
          }
        } else if (method === 'wechat_pay') {
          const { paymentIntent, error } = await (stripe as StripeWithWechat).confirmWechatPayPayment(secret, {
            payment_method_options: { wechat_pay: { client: isMobileDevice() ? 'mobile_web' : 'web' } },
          })
          if (error) {
            setStripeError(error.message || t('payment.result.failed'))
            return
          }
          const qr = paymentIntent?.next_action?.wechat_pay_display_qr_code?.image_data_url
          if (qr) {
            setWechatQrUrl(qr)
            startPolling(orderId)
          } else if (paymentIntent?.status === 'succeeded') {
            setSuccess(true)
            scheduleClose()
          } else {
            setStripeError(t('payment.result.failed'))
          }
        } else {
          setClientSecret(secret)
          setShowElement(true)
        }
      } catch (err) {
        setInitError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed')))
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      disposedRef.current = true
      if (timers.redirect) clearTimeout(timers.redirect)
      if (timers.poll) clearInterval(timers.poll)
    }
    // Initializes once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mount the full Payment Element once its container is rendered.
  useEffect(() => {
    const stripe = stripeRef.current
    if (!showElement || !clientSecret || !stripe || !mountRef.current || elementsRef.current) return
    const elements = stripe.elements({
      clientSecret,
      appearance: { theme: colorMode === 'dark' ? 'night' : 'stripe', variables: { borderRadius: '8px' } },
    })
    elementsRef.current = elements
    const paymentElement = elements.create('payment', {
      layout: 'tabs',
      paymentMethodOrder: ['alipay', 'wechat_pay', 'card', 'link'],
    })
    paymentElement.mount(mountRef.current)
    paymentElement.on('ready', () => setReady(true))
  }, [showElement, clientSecret, colorMode])

  async function handleGenericPay() {
    const stripe = stripeRef.current
    const elements = elementsRef.current
    if (!stripe || !elements || submitting) return
    setSubmitting(true)
    setStripeError('')
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      })
      if (error) setStripeError(error.message || t('payment.result.failed'))
      else {
        setSuccess(true)
        scheduleClose()
      }
    } catch (err) {
      setStripeError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.result.failed')))
    } finally {
      setSubmitting(false)
    }
  }

  const backButton = (
    <Button label={t('payment.result.backToRecharge')} variant="secondary" width="100%" onClick={() => navigate('/purchase')} />
  )

  let content
  if (loading) {
    content = (
      <VStack hAlign="center" padding={10}>
        <Spinner />
      </VStack>
    )
  } else if (initError) {
    content = (
      <Card padding={8}>
        <VStack gap={3} hAlign="center">
          <Icon icon={ExclamationCircleIcon} size="lg" color="error" />
          <Heading level={3}>{t('payment.stripeLoadFailed')}</Heading>
          <Text color="secondary" justify="center">
            {initError}
          </Text>
          <Button label={t('payment.result.backToRecharge')} variant="primary" onClick={() => navigate('/purchase')} />
        </VStack>
      </Card>
    )
  } else {
    content = (
      <>
        {order && (
          <Card padding={6}>
            <VStack gap={1} hAlign="center">
              <Text color="secondary">{t('payment.actualPay')}</Text>
              <Heading level={1}>{formatPaymentAmount(order.pay_amount, currency, locale)}</Heading>
            </VStack>
          </Card>
        )}
        {wechatQrUrl ? (
          <Card padding={6}>
            <VStack gap={4} hAlign="center">
              <Text type="large" weight="semibold">
                {t('payment.qr.scanWxpay')}
              </Text>
              <img src={wechatQrUrl} alt={t('payment.qr.scanWxpay')} width={224} height={224} />
              <Text color="secondary" justify="center">
                {t('payment.qr.scanWxpayHint')}
              </Text>
              <Text type="supporting">{t('payment.qr.waitingPayment')}</Text>
            </VStack>
          </Card>
        ) : redirecting ? (
          <Card padding={6}>
            <VStack gap={4} hAlign="center">
              <Spinner size="xl" />
              <Text color="secondary">{t('payment.qr.payInNewWindowHint')}</Text>
            </VStack>
          </Card>
        ) : success ? (
          <Card padding={6}>
            <VStack gap={3} hAlign="center">
              <Icon icon={CheckCircleIcon} size="lg" color="success" />
              <Text type="large" weight="bold">
                {t('payment.result.success')}
              </Text>
              <Text color="secondary">{t('payment.stripeSuccessProcessing')}</Text>
            </VStack>
          </Card>
        ) : showElement ? (
          <>
            <Card padding={6}>
              <VStack gap={4} hAlign="stretch">
                <VStack ref={mountRef} minHeight={200} />
                {stripeError && <Banner status="error" title={stripeError} />}
                <Button
                  label={submitting ? t('common.processing') : t('payment.stripePay')}
                  variant="primary"
                  width="100%"
                  isLoading={submitting}
                  isDisabled={submitting || !ready}
                  onClick={() => void handleGenericPay()}
                />
              </VStack>
            </Card>
            {backButton}
          </>
        ) : null}
        {stripeError && !showElement && (
          <VStack gap={3} hAlign="stretch">
            <Banner status="error" title={stripeError} />
            {backButton}
          </VStack>
        )}
      </>
    )
  }

  return <CenteredFrame>{content}</CenteredFrame>
}
