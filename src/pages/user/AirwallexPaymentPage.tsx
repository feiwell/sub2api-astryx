import { toAppPath } from '@/utils/appPath'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { ExclamationCircleIcon } from '@heroicons/react/24/outline'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  readPaymentRecoverySnapshot,
  type PaymentRecoverySnapshot,
} from '@/components/payment/paymentFlow'
import { CenteredFrame } from '~/components/common/CenteredFrame'
import { useI18n } from '~/i18n'
import { loadAirwallexSDK } from '~/lib/airwallexSdk'

/** React port of views/user/AirwallexPaymentView.vue: restores the intent and redirects to Airwallex checkout. */
export function AirwallexPaymentPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [canRetry, setCanRetry] = useState(false)

  useEffect(() => {
    let disposed = false
    setLoading(true)
    setCanRetry(false)
    setErrorMessage('')
    const orderIdParam = query.get('order_id') || ''
    const outTradeNo = query.get('out_trade_no') || ''
    const resumeToken = query.get('resume_token') || ''

    const restore = (): PaymentRecoverySnapshot | null => {
      const orderId = Number(orderIdParam) || 0
      const snapshot = readPaymentRecoverySnapshot(
        window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
        resumeToken ? { resumeToken } : {},
      )
      if (!snapshot || snapshot.paymentType !== 'airwallex') return null
      if (orderId > 0 && snapshot.orderId !== orderId) return null
      if (outTradeNo && snapshot.outTradeNo !== outTradeNo) return null
      if (!snapshot.intentId || !snapshot.clientSecret) return null
      return snapshot
    }

    const successUrl = (snapshot: PaymentRecoverySnapshot) => {
      const url = new URL(toAppPath('/payment/result'), window.location.origin)
      if (orderIdParam || snapshot.orderId > 0) url.searchParams.set('order_id', orderIdParam || String(snapshot.orderId))
      if (outTradeNo || snapshot.outTradeNo) url.searchParams.set('out_trade_no', outTradeNo || snapshot.outTradeNo)
      if (resumeToken || snapshot.resumeToken) url.searchParams.set('resume_token', resumeToken || snapshot.resumeToken)
      return url.toString()
    }

    void (async () => {
      const snapshot = restore()
      if (!snapshot) {
        setLoading(false)
        setErrorMessage(t('payment.airwallexMissingParams'))
        return
      }
      try {
        const airwallex = await loadAirwallexSDK()
        if (disposed) return
        const result = await airwallex.init({
          env: snapshot.paymentEnv === 'prod' ? 'prod' : 'demo',
          enabledElements: ['payments'],
          locale: locale.toLowerCase().startsWith('zh') ? 'zh' : 'en',
        })
        if (disposed) return
        setLoading(false)
        if (!result.payments) throw new Error(t('payment.airwallexLoadFailed'))
        const redirect = await result.payments.redirectToCheckout({
          intent_id: snapshot.intentId,
          client_secret: snapshot.clientSecret,
          currency: snapshot.currency || 'CNY',
          country_code: snapshot.countryCode || 'CN',
          successUrl: successUrl(snapshot),
        })
        if (!disposed && typeof redirect === 'string' && redirect) window.location.assign(redirect)
      } catch (err) {
        if (disposed) return
        setLoading(false)
        setCanRetry(true)
        setErrorMessage(err instanceof Error && err.message ? err.message : t('payment.airwallexLoadFailed'))
      }
    })()
    return () => {
      disposed = true
    }
    // A retry uses the same stored payment intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  return (
    <CenteredFrame>
      {loading ? (
        <VStack hAlign="center" padding={10}>
          <Spinner />
        </VStack>
      ) : errorMessage ? (
        <Card padding={8}>
          <VStack gap={3} hAlign="center">
            <Icon icon={ExclamationCircleIcon} size="lg" color="error" />
            <Heading level={3}>{t('payment.airwallexLoadFailed')}</Heading>
            <Text color="secondary" justify="center">
              {errorMessage}
            </Text>
            {canRetry && <Button label={t('common.retry')} onClick={() => setAttempt((value) => value + 1)} />}
            <Button label={t('payment.result.backToRecharge')} variant="primary" onClick={() => navigate('/purchase')} />
          </VStack>
        </Card>
      ) : (
        <Card padding={6}>
          <VStack gap={4} hAlign="center" padding={4}>
            <Spinner size="xl" />
            <Text color="secondary">{t('payment.qr.payInNewWindowHint')}</Text>
          </VStack>
        </Card>
      )}
    </CenteredFrame>
  )
}
