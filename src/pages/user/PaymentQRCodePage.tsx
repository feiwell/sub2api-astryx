import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { paymentAPI } from '@/api/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { isBuiltInAlipayMethod, isBuiltInWxpayMethod } from '@/components/payment/providerConfig'
import { CenteredFrame } from '~/components/common/CenteredFrame'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { renderQrDataUrl } from '~/lib/paymentQr'

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** React port of views/user/PaymentQRCodeView.vue. */
export function PaymentQRCodePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const orderId = Number(query.get('order_id')) || 0
  const qrUrl = query.get('qr') || ''
  const payUrl = query.get('pay_url') || ''
  const paymentType = query.get('payment_type') || ''
  const expiresAt = query.get('expires_at') || ''

  const [qrImage, setQrImage] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [expired, setExpired] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const activeRef = useRef(true)

  const isAlipay = isBuiltInAlipayMethod(paymentType)
  const isWxpay = isBuiltInWxpayMethod(paymentType)
  const scanTitle = isAlipay ? t('payment.qr.scanAlipay') : isWxpay ? t('payment.qr.scanWxpay') : t('payment.qr.scanToPay')
  const scanHint = isAlipay ? t('payment.qr.scanAlipayHint') : isWxpay ? t('payment.qr.scanWxpayHint') : ''

  useEffect(() => {
    if (!qrUrl) return
    let cancelled = false
    void renderQrDataUrl(qrUrl).then((url) => !cancelled && setQrImage(url))
    return () => {
      cancelled = true
    }
  }, [qrUrl])

  useEffect(() => {
    activeRef.current = true
    let seconds = 30 * 60
    if (expiresAt) seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    seconds = Math.max(0, seconds)
    setRemaining(seconds)
    if (seconds <= 0) {
      setExpired(true)
      return
    }
    const deadline = Date.now() + seconds * 1000
    let pollInFlight = false
    const stop = () => {
      activeRef.current = false
      clearInterval(countdown)
      clearInterval(poll)
    }
    const countdown = setInterval(() => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        setExpired(true)
        stop()
      }
    }, 1000)
    const poll = setInterval(async () => {
      if (!orderId || pollInFlight) return
      pollInFlight = true
      try {
        const order = (await paymentAPI.getOrder(orderId)).data
        if (!activeRef.current || !order) return
        if (order.status === 'COMPLETED' || order.status === 'PAID') {
          stop()
          navigate(`/payment/result?order_id=${orderId}&status=success`)
        } else if (order.status === 'EXPIRED' || order.status === 'CANCELLED' || order.status === 'FAILED') {
          stop()
          setExpired(true)
        }
      } catch {
        // keep polling
      } finally {
        pollInFlight = false
      }
    }, 3000)
    return stop
  }, [orderId, expiresAt, navigate])

  async function handleCancel() {
    if (!orderId || cancelling) return
    setCancelling(true)
    try {
      await paymentAPI.cancelOrder(orderId)
      activeRef.current = false
      navigate('/purchase')
    } catch (err) {
      toast.error(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <CenteredFrame isFullScreen={false}>
      <VStack gap={6} hAlign="center">
        <Heading level={2}>{qrUrl ? scanTitle : t('payment.qr.payInNewWindow')}</Heading>
        {qrUrl && (
          <Card padding={6}>
            {qrImage && <img src={qrImage} alt={scanTitle} width={256} height={256} />}
          </Card>
        )}
        {qrUrl && !expired && scanHint && (
          <Text color="secondary" justify="center">
            {scanHint}
          </Text>
        )}
        {expired ? (
          <VStack gap={4} hAlign="center">
            <Text type="large" weight="medium">
              {t('payment.qr.expired')}
            </Text>
            <Button label={t('payment.result.backToRecharge')} variant="primary" onClick={() => navigate('/purchase')} />
          </VStack>
        ) : (
          <VStack gap={1} hAlign="center">
            <Text color="secondary">{qrUrl ? t('payment.qr.expiresIn') : t('payment.qr.payInNewWindowHint')}</Text>
            <Heading level={2}>
              <Text type="inherit" hasTabularNumbers>
                {formatCountdown(remaining)}
              </Text>
            </Heading>
            <Text type="supporting">{t('payment.qr.waitingPayment')}</Text>
          </VStack>
        )}
      </VStack>
      {payUrl && !qrUrl && !expired && (
        <Button
          label={t('payment.qr.openPayWindow')}
          variant="primary"
          width="100%"
          href={payUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      )}
      {!expired && orderId > 0 && (
        <Button
          label={cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
          variant="secondary"
          width="100%"
          isDisabled={cancelling}
          onClick={() => void handleCancel()}
        />
      )}
    </CenteredFrame>
  )
}
