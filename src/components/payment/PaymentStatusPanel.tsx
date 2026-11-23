import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { paymentAPI } from '@/api/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { getPaymentPopupFeatures, isBuiltInAlipayMethod, isBuiltInWxpayMethod } from '@/components/payment/providerConfig'
import { currencySymbol, formatPaymentAmount, normalizePaymentCurrency } from '@/components/payment/currency'
import {
  createAlipayDeepLinkLauncher,
  type AlipayDeepLinkLauncher,
  type AlipayDeepLinkState,
} from '@/components/payment/alipayDeepLink'
import type { PaymentOrder } from '@/types/payment'
import { renderQrDataUrl } from '~/lib/paymentQr'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

export type PaymentOutcome = 'success' | 'cancelled' | 'expired'

export interface PaymentStatusPanelProps {
  orderId: number
  amount?: number
  payAmount?: number
  qrCode: string
  expiresAt: string
  paymentType: string
  payUrl?: string
  orderType?: string
  currency?: string
  outTradeNo?: string
  mobileAlipayDeepLink?: boolean
  /** The user acknowledged a terminal state (or left the fallback); return to method selection. */
  onDone: () => void
  /** Payment confirmed by the server. */
  onSuccess: () => void
  /** Any terminal state was reached. */
  onSettled: (outcome: PaymentOutcome) => void
}

const VERIFY_RETRY_INTERVAL_MS = 15000
const VERIFY_RETRY_MAX_ATTEMPTS = 6
const POLL_INTERVAL_MS = 3000
const QR_SIZE = 220

function isSuccessStatus(status: string | null | undefined): boolean {
  return status === 'COMPLETED' || status === 'PAID' || status === 'RECHARGING'
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * React port of components/payment/PaymentStatusPanel.vue: the in-progress checkout shown after an
 * order is created. Renders the QR code (or the popup/redirect waiting state, or the mobile Alipay
 * app hand-off with its QR fallback), counts down to expiry, polls the order (with an upstream
 * verify retry for Alipay/WeChat) and settles into success, cancelled or expired.
 */
export function PaymentStatusPanel({
  orderId,
  amount,
  payAmount,
  qrCode,
  expiresAt,
  paymentType,
  payUrl,
  orderType,
  currency,
  outTradeNo,
  mobileAlipayDeepLink,
  onDone,
  onSuccess,
  onSettled,
}: PaymentStatusPanelProps) {
  const { t, locale } = useI18n()

  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const [paidOrder, setPaidOrder] = useState<PaymentOrder | null>(null)
  const [outcome, setOutcomeState] = useState<PaymentOutcome | null>(null)
  const [deepLinkState, setDeepLinkState] = useState<AlipayDeepLinkState>('idle')
  const [deepLinkFallbackVisible, setDeepLinkFallbackVisible] = useState(false)
  const [qrImage, setQrImage] = useState('')

  const isAlipay = isBuiltInAlipayMethod(paymentType)
  const isWxpay = isBuiltInWxpayMethod(paymentType)
  const isMobileAlipayDeepLink = mobileAlipayDeepLink === true && isAlipay && !!qrCode
  const showQRCode = !!qrCode && (!isMobileAlipayDeepLink || deepLinkFallbackVisible)
  const paymentCurrency = normalizePaymentCurrency(currency)
  const creditedAmountSymbol = currencySymbol('USD')

  const scanTitle = isAlipay ? t('payment.qr.scanAlipay') : isWxpay ? t('payment.qr.scanWxpay') : t('payment.qr.scanToPay')
  const scanHint = isAlipay ? t('payment.qr.scanAlipayHint') : isWxpay ? t('payment.qr.scanWxpayHint') : ''

  const formatGatewayAmount = (value: number, cur?: string | null) =>
    formatPaymentAmount(value, cur || paymentCurrency, locale)

  // Timers and in-flight flags live in refs so the polling closure always sees current state.
  const outcomeRef = useRef<PaymentOutcome | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const launcherRef = useRef<AlipayDeepLinkLauncher | null>(null)
  const pollInFlight = useRef(false)
  const verifyAttempts = useRef(0)
  const lastVerifyAt = useRef(0)
  const callbacks = useRef({ onSuccess, onSettled, onDone })
  callbacks.current = { onSuccess, onSettled, onDone }

  const cleanup = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    pollTimer.current = null
    countdownTimer.current = null
    launcherRef.current?.dispose()
    launcherRef.current = null
  }, [])

  const setOutcome = useCallback((next: PaymentOutcome) => {
    if (outcomeRef.current === next) return
    outcomeRef.current = next
    setOutcomeState(next)
    callbacks.current.onSettled(next)
  }, [])

  // Countdown + status polling for the lifetime of this order.
  useEffect(() => {
    outcomeRef.current = null
    verifyAttempts.current = 0
    lastVerifyAt.current = 0

    let seconds = 30 * 60
    if (expiresAt) seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    seconds = Math.max(0, seconds)
    setRemainingSeconds(seconds)
    if (seconds <= 0) {
      setOutcome('expired')
    } else {
      const deadline = Date.now() + seconds * 1000
      countdownTimer.current = setInterval(() => {
        const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
        setRemainingSeconds(left)
        if (left <= 0) {
          setOutcome('expired')
          cleanup()
        }
      }, 1000)
    }

    const tryRecoverPendingOrder = async (order: PaymentOrder): Promise<PaymentOrder> => {
      if (!isBuiltInWxpayMethod(paymentType) && !isBuiltInAlipayMethod(paymentType)) return order
      const tradeNo = String(order.out_trade_no || '').trim()
      if (!tradeNo) return order
      if (String(order.status || '').trim().toUpperCase() !== 'PENDING') return order
      const now = Date.now()
      if (verifyAttempts.current >= VERIFY_RETRY_MAX_ATTEMPTS || now - lastVerifyAt.current < VERIFY_RETRY_INTERVAL_MS) {
        return order
      }
      lastVerifyAt.current = now
      verifyAttempts.current += 1
      try {
        const result = await paymentAPI.verifyOrder(tradeNo)
        return result.data ?? order
      } catch {
        return order
      }
    }

    const pollStatus = async () => {
      if (!orderId || outcomeRef.current || pollInFlight.current) return
      // Guard against overlapping requests when the API (plus verify) is slower than the interval.
      pollInFlight.current = true
      try {
        let order: PaymentOrder | null = null
        try {
          order = (await paymentAPI.getOrder(orderId)).data
        } catch (error) {
          console.error('[payment] Failed to poll order status:', error)
        }
        if (!order || outcomeRef.current) return
        order = await tryRecoverPendingOrder(order)
        if (outcomeRef.current) return
        if (isSuccessStatus(order.status)) {
          cleanup()
          setPaidOrder(order)
          setOutcome('success')
          callbacks.current.onSuccess()
        } else if (order.status === 'CANCELLED') {
          cleanup()
          setOutcome('cancelled')
        } else if (order.status === 'EXPIRED' || order.status === 'FAILED') {
          cleanup()
          setOutcome('expired')
        }
      } finally {
        pollInFlight.current = false
      }
    }

    pollTimer.current = setInterval(() => void pollStatus(), POLL_INTERVAL_MS)
    return cleanup
  }, [orderId, expiresAt, paymentType, cleanup, setOutcome])

  // Mobile Alipay: try to hand off to the app first; the QR only appears if the launch times out.
  useEffect(() => {
    if (!isMobileAlipayDeepLink) return
    const launcher = createAlipayDeepLinkLauncher({
      qrCode,
      document,
      lifecycleTarget: window,
      userAgent: window.navigator.userAgent,
      assignLocation: (url) => window.location.assign(url),
      onStateChange: (state) => {
        setDeepLinkState(state)
        if (state === 'fallback') setDeepLinkFallbackVisible(true)
        else if (state === 'backgrounded') setDeepLinkFallbackVisible(false)
      },
    })
    launcherRef.current = launcher
    launcher.launch()
    return () => {
      launcher.dispose()
      if (launcherRef.current === launcher) launcherRef.current = null
    }
  }, [isMobileAlipayDeepLink, qrCode])

  useEffect(() => {
    if (!showQRCode || !qrCode) return
    let cancelled = false
    void renderQrDataUrl(qrCode, QR_SIZE).then((url) => {
      if (!cancelled) setQrImage(url)
    })
    return () => {
      cancelled = true
    }
  }, [showQRCode, qrCode])

  const reopenPopup = () => {
    if (!payUrl) return
    const win = window.open(payUrl, 'paymentPopup', getPaymentPopupFeatures())
    if (!win || win.closed) window.location.href = payUrl
  }

  const reopenAlipay = () => launcherRef.current?.launch()

  const saveQRCode = () => {
    if (!qrImage) return
    const link = document.createElement('a')
    link.href = qrImage
    link.download = `alipay-${outTradeNo || orderId}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleCancel = async () => {
    if (!orderId || cancelling) return
    setCancelling(true)
    try {
      await paymentAPI.cancelOrder(orderId)
      cleanup()
      setOutcome('cancelled')
    } catch (err) {
      toast.error(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setCancelling(false)
    }
  }

  const handleDone = () => {
    cleanup()
    callbacks.current.onDone()
  }

  const countdown = formatCountdown(remainingSeconds)

  const countdownCard = (withLabel: boolean) => (
    <Card padding={4}>
      <VStack gap={1} hAlign="center">
        {withLabel && <Text color="secondary">{t('payment.qr.expiresIn')}</Text>}
        <Heading level={2}>
          <Text type="inherit" hasTabularNumbers>
            {countdown}
          </Text>
        </Heading>
        <Text type="supporting" color="secondary">
          {t('payment.qr.waitingPayment')}
        </Text>
      </VStack>
    </Card>
  )

  const qrImageBlock = qrImage ? (
    <Card variant={isAlipay ? 'blue' : isWxpay ? 'green' : 'default'} padding={4}>
      <img src={qrImage} alt={scanTitle} width={QR_SIZE} height={QR_SIZE} />
    </Card>
  ) : (
    <Spinner size="lg" />
  )

  // ═══ Terminal states ═══
  if (outcome === 'success') {
    return (
      <Card padding={6}>
        <VStack gap={4} hAlign="center">
          <Icon icon="success" size="lg" color="success" />
          <Heading level={3}>
            {orderType === 'subscription' ? t('payment.result.subscriptionSuccess') : t('payment.result.success')}
          </Heading>
          {paidOrder && (
            <Card variant="muted" padding={4} width="100%">
              <MetadataList>
                <MetadataListItem label={t('payment.orders.orderId')}>#{paidOrder.id}</MetadataListItem>
                {paidOrder.out_trade_no && (
                  <MetadataListItem label={t('payment.orders.orderNo')}>{paidOrder.out_trade_no}</MetadataListItem>
                )}
                <MetadataListItem label={t('payment.orders.amount')}>
                  <Text hasTabularNumbers>
                    {creditedAmountSymbol}
                    {paidOrder.amount.toFixed(2)}
                    {(paidOrder.bonus_amount ?? 0) > 0 &&
                      ` (${t('payment.orders.bonusIncluded', {
                        amount: creditedAmountSymbol + (paidOrder.bonus_amount ?? 0).toFixed(2),
                      })})`}
                  </Text>
                </MetadataListItem>
                <MetadataListItem label={t('payment.orders.payAmount')}>
                  <Text hasTabularNumbers>{formatGatewayAmount(paidOrder.pay_amount, paidOrder.currency)}</Text>
                </MetadataListItem>
              </MetadataList>
            </Card>
          )}
          <Button label={t('common.confirm')} variant="primary" onClick={handleDone} />
        </VStack>
      </Card>
    )
  }

  if (outcome === 'cancelled' || outcome === 'expired') {
    const cancelled = outcome === 'cancelled'
    return (
      <Card padding={6}>
        <VStack gap={4} hAlign="center">
          <Icon icon={cancelled ? 'close' : 'clock'} size="lg" color={cancelled ? 'secondary' : 'warning'} />
          <Heading level={3}>{cancelled ? t('payment.qr.cancelled') : t('payment.qr.expired')}</Heading>
          <Text color="secondary" justify="center">
            {cancelled ? t('payment.qr.cancelledDesc') : t('payment.qr.expiredDesc')}
          </Text>
          <Button label={t('common.confirm')} variant="primary" onClick={handleDone} />
        </VStack>
      </Card>
    )
  }

  // ═══ Mobile Alipay app hand-off ═══
  if (isMobileAlipayDeepLink) {
    if (!deepLinkFallbackVisible) {
      return (
        <VStack gap={4}>
          <Card padding={6}>
            <VStack gap={4} hAlign="center">
              {deepLinkState === 'launching' ? (
                <Spinner size="xl" />
              ) : (
                <Icon icon="success" size="lg" color="accent" />
              )}
              <Heading level={3}>
                {deepLinkState === 'backgrounded' ? t('payment.qr.alipayContinueInApp') : t('payment.qr.alipayOpening')}
              </Heading>
              <Text color="secondary" justify="center">
                {t('payment.qr.alipayWaitingHint')}
              </Text>
              {deepLinkState === 'backgrounded' && (
                <Button
                  label={t('payment.qr.reopenAlipay')}
                  variant="primary"
                  icon={<Icon icon="externalLink" size="sm" />}
                  onClick={reopenAlipay}
                />
              )}
            </VStack>
          </Card>
          {countdownCard(true)}
        </VStack>
      )
    }
    return (
      <Card padding={6}>
        <VStack gap={4} hAlign="center">
          <VStack gap={1} hAlign="center">
            <Heading level={3}>{t('payment.qr.alipayFallbackTitle')}</Heading>
            <Text color="secondary" justify="center">
              {t('payment.qr.alipayFallbackHint')}
            </Text>
          </VStack>
          <MetadataList>
            <MetadataListItem label={t('payment.orders.payAmount')}>
              <Text weight="semibold" hasTabularNumbers>
                {formatGatewayAmount(payAmount || amount || 0)}
              </Text>
            </MetadataListItem>
            <MetadataListItem label={t('payment.orders.orderNo')}>
              <Text type="code">{outTradeNo || `#${orderId}`}</Text>
            </MetadataListItem>
            <MetadataListItem label={t('payment.qr.expiresIn')}>
              <Text weight="semibold" hasTabularNumbers>
                {countdown}
              </Text>
            </MetadataListItem>
          </MetadataList>
          {qrImageBlock}
          <Text color="secondary" justify="center">
            {t('payment.qr.alipaySaveAndScanHint')}
          </Text>
          <Grid columns={{ minWidth: 180, repeat: 'fit' }} gap={2} width="100%">
            <Button
              label={t('payment.qr.reopenAlipay')}
              variant="primary"
              icon={<Icon icon="externalLink" size="sm" />}
              onClick={reopenAlipay}
            />
            <Button
              label={t('payment.qr.saveQRCode')}
              variant="secondary"
              icon={<Icon icon="arrowDown" size="sm" />}
              onClick={saveQRCode}
              isDisabled={!qrImage}
            />
          </Grid>
          <Button label={t('payment.result.backToRecharge')} variant="secondary" width="100%" onClick={handleDone} />
        </VStack>
      </Card>
    )
  }

  const cancelButton = (
    <Button
      label={cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
      variant="secondary"
      width="100%"
      isDisabled={cancelling}
      isLoading={cancelling}
      onClick={() => void handleCancel()}
    />
  )

  // ═══ QR code mode ═══
  if (showQRCode) {
    return (
      <VStack gap={4}>
        <Card padding={6}>
          <VStack gap={4} hAlign="center">
            <Heading level={3}>{scanTitle}</Heading>
            {qrImageBlock}
            {scanHint && (
              <Text color="secondary" justify="center">
                {scanHint}
              </Text>
            )}
            {payUrl && <Button label={t('payment.qr.openPayWindow')} variant="secondary" size="sm" onClick={reopenPopup} />}
          </VStack>
        </Card>
        {countdownCard(true)}
        {cancelButton}
      </VStack>
    )
  }

  // ═══ Waiting for popup / redirect ═══
  return (
    <VStack gap={4}>
      <Card padding={6}>
        <VStack gap={4} hAlign="center">
          <Spinner size="xl" />
          <Text color="secondary" justify="center">
            {t('payment.qr.payInNewWindowHint')}
          </Text>
          {payUrl && <Button label={t('payment.qr.openPayWindow')} variant="secondary" size="sm" onClick={reopenPopup} />}
        </VStack>
      </Card>
      {countdownCard(false)}
      {cancelButton}
    </VStack>
  )
}
