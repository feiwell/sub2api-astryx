import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { paymentAPI, type PublicOrderVerifyResult } from '@/api/payment'
import type { PaymentOrder } from '@/types/payment'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  clearPaymentRecoverySnapshot,
  readPaymentRecoverySnapshot,
} from '@/components/payment/paymentFlow'
import { formatPaymentAmount, normalizePaymentCurrency } from '@/components/payment/currency'
import { normalizePaymentMethodForDisplay, paymentMethodI18nKey } from '@/views/user/paymentUx'
import { OrderStatus } from '~/components/payment/OrderStatus'
import { CenteredFrame } from '~/components/common/CenteredFrame'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'

type ResolvedOrder = PaymentOrder | PublicOrderVerifyResult

interface ReturnInfo {
  outTradeNo: string
  money: string
  type: string
}

const SUCCESS = new Set(['COMPLETED', 'PAID', 'RECHARGING'])
const PENDING = new Set(['PENDING', 'CREATED', 'WAITING', 'PROCESSING'])
const REFRESH_INTERVAL_MS = 2000
const REFRESH_MAX_ATTEMPTS = 15

const norm = (s: string | null | undefined) => String(s || '').trim().toUpperCase()
const isPendingStatus = (s: string | null | undefined) => PENDING.has(norm(s))

function hasOrderId(o: ResolvedOrder | null): o is PaymentOrder {
  return !!o && 'id' in o && typeof o.id === 'number'
}
function hasAmountFields(o: ResolvedOrder | null): o is PaymentOrder {
  return !!o && 'pay_amount' in o && typeof o.pay_amount === 'number' && 'amount' in o && typeof o.amount === 'number'
}
function hasPaymentType(o: ResolvedOrder | null): o is PaymentOrder {
  return !!o && 'payment_type' in o && typeof o.payment_type === 'string' && o.payment_type.trim() !== ''
}
function bonusAmount(o: unknown): number {
  const v = (o as { bonus_amount?: unknown } | null)?.bonus_amount
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}
function clearSnapshot() {
  clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
}

/** React port of views/user/PaymentResultView.vue. */
export function PaymentResultPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const [order, setOrder] = useState<ResolvedOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('CNY')
  const [returnInfo, setReturnInfo] = useState<ReturnInfo | null>(null)
  const balanceRefreshed = useRef(false)

  function applyOrder(next: ResolvedOrder | null) {
    setOrder(next)
    if (next && 'currency' in next && next.currency) setCurrency(normalizePaymentCurrency(next.currency))
    if (next && !balanceRefreshed.current && norm(next.status) === 'COMPLETED') {
      if (!('order_type' in next) || next.order_type === 'balance') {
        balanceRefreshed.current = true
        void refreshUser().catch(() => undefined)
      }
    }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let disposed = false
    const resumeToken = query.get('resume_token') || ''
    const routeOrderId = Number(query.get('order_id')) || 0
    let outTradeNo = query.get('out_trade_no') || ''
    let orderId = 0
    let resumeLookupFailed = false

    const byResumeToken = async (token: string) => {
      try {
        return (await paymentAPI.resolveOrderPublicByResumeToken(token)).data as ResolvedOrder
      } catch {
        return null
      }
    }
    const byOutTradeNo = async (no: string): Promise<ResolvedOrder | null> => {
      try {
        return (await paymentAPI.verifyOrder(no)).data
      } catch {
        try {
          return (await paymentAPI.verifyOrderPublic(no)).data
        } catch {
          return null
        }
      }
    }
    const byOrderId = async (id: number) => {
      try {
        return (await paymentAPI.getOrder(id)).data as ResolvedOrder
      } catch {
        return null
      }
    }

    void (async () => {
      const raw = window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY)
      let restored = null
      if (raw) {
        if (resumeToken) restored = readPaymentRecoverySnapshot(raw, { resumeToken })
        else if (routeOrderId || outTradeNo) {
          const candidate = readPaymentRecoverySnapshot(raw)
          if (
            candidate &&
            !(routeOrderId > 0 && candidate.orderId !== routeOrderId) &&
            !(outTradeNo && candidate.outTradeNo !== outTradeNo)
          ) {
            restored = candidate
          }
        }
      }
      if (restored?.orderId) orderId = restored.orderId
      if (restored?.currency) setCurrency(normalizePaymentCurrency(restored.currency))
      if (!outTradeNo && restored?.outTradeNo) outTradeNo = restored.outTradeNo

      let current: ResolvedOrder | null = null
      if (resumeToken) {
        current = await byResumeToken(resumeToken)
        if (current) {
          if (!orderId && hasOrderId(current)) orderId = current.id
        } else {
          resumeLookupFailed = true
          if (routeOrderId > 0) orderId = routeOrderId
        }
      } else if (routeOrderId > 0) {
        orderId = routeOrderId
      }

      const hasLegacyContext = (query.get('trade_status') || '').trim() !== ''
      const usePublicOutTradeNo = outTradeNo !== '' && (hasLegacyContext || routeOrderId > 0 || orderId > 0)

      if (!current && orderId && (!resumeToken || routeOrderId > 0)) current = await byOrderId(orderId)
      if (!current && usePublicOutTradeNo && (!resumeToken || resumeLookupFailed)) {
        current = await byOutTradeNo(outTradeNo)
        if (current && !orderId && hasOrderId(current)) orderId = current.id
      }
      if (disposed) return
      if (current) applyOrder(current)

      let info: ReturnInfo | null = null
      if (!current && !orderId && outTradeNo && hasLegacyContext) {
        info = { outTradeNo, money: query.get('money') || '', type: query.get('type') || '' }
        setReturnInfo(info)
      }

      const refresh = async (): Promise<ResolvedOrder | null> => {
        if (resumeToken) {
          const r = await byResumeToken(resumeToken)
          if (r) return r
        }
        if (orderId) {
          const r = await byOrderId(orderId)
          if (r) return r
        }
        return usePublicOutTradeNo ? byOutTradeNo(outTradeNo) : null
      }

      let attempts = 0
      const schedule = (status: string | undefined) => {
        if (!isPendingStatus(status) || attempts >= REFRESH_MAX_ATTEMPTS || disposed) return
        timer = setTimeout(async () => {
          attempts += 1
          const next = await refresh()
          if (disposed) return
          if (next) {
            applyOrder(next)
            if (!isPendingStatus(next.status)) clearSnapshot()
          }
          schedule(next?.status ?? status)
        }, REFRESH_INTERVAL_MS)
      }

      if (current && isPendingStatus(current.status)) schedule(current.status)
      else if (current || info) clearSnapshot()
      setLoading(false)
    })()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
    }
    // Resolves once per visit, like the Vue onMounted hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fmt = (value: number) => formatPaymentAmount(value, currency, locale)
  const methodLabel = (type: string) => {
    const key = paymentMethodI18nKey(type)
    const label = t(key)
    return label === key ? normalizePaymentMethodForDisplay(type) || type : label
  }

  const isSuccess = SUCCESS.has(norm(order?.status))
  const isPending = isPendingStatus(order?.status)
  const title = isSuccess ? t('payment.result.success') : isPending ? t('payment.result.processing') : t('payment.result.failed')

  let base = 0
  let fee = 0
  if (hasAmountFields(order)) {
    const rate = Number(order.fee_rate) || 0
    base = rate > 0 ? Math.round((order.pay_amount / (1 + rate / 100)) * 100) / 100 : order.pay_amount
    fee = rate > 0 ? Math.round((order.pay_amount - base) * 100) / 100 : 0
  }

  if (loading) {
    return (
      <CenteredFrame>
        <VStack hAlign="center" padding={10}>
          <Spinner />
        </VStack>
      </CenteredFrame>
    )
  }

  return (
    <CenteredFrame>
      <VStack gap={2} hAlign="center">
        {isPending ? (
          <Spinner size="lg" />
        ) : (
          <Icon icon={isSuccess ? CheckCircleIcon : XCircleIcon} size="lg" color={isSuccess ? 'success' : 'error'} />
        )}
        <Heading level={2}>{title}</Heading>
        {isPending && <Text color="secondary">{t('payment.result.processingHint')}</Text>}
      </VStack>

      {order ? (
        <Card padding={5}>
          <MetadataList>
            {hasOrderId(order) && <MetadataListItem label={t('payment.orders.orderId')}>#{order.id}</MetadataListItem>}
            {order.out_trade_no && <MetadataListItem label={t('payment.orders.orderNo')}>{order.out_trade_no}</MetadataListItem>}
            {hasAmountFields(order) && <MetadataListItem label={t('payment.orders.baseAmount')}>{fmt(base)}</MetadataListItem>}
            {hasAmountFields(order) && order.fee_rate > 0 && (
              <MetadataListItem label={`${t('payment.orders.fee')} (${order.fee_rate}%)`}>{fmt(fee)}</MetadataListItem>
            )}
            {hasAmountFields(order) && (
              <MetadataListItem label={t('payment.orders.payAmount')}>
                <Text weight="bold">{fmt(order.pay_amount)}</Text>
              </MetadataListItem>
            )}
            {hasAmountFields(order) && bonusAmount(order) > 0 && (
              <MetadataListItem label={t('payment.orders.bonusAmount')}>+${bonusAmount(order).toFixed(2)}</MetadataListItem>
            )}
            {hasAmountFields(order) && (order.amount !== order.pay_amount || bonusAmount(order) > 0) && (
              <MetadataListItem label={t('payment.orders.creditedAmount')}>
                {order.order_type === 'balance' ? `$${order.amount.toFixed(2)}` : fmt(order.amount)}
              </MetadataListItem>
            )}
            {hasPaymentType(order) && (
              <MetadataListItem label={t('payment.orders.paymentMethod')}>{methodLabel(order.payment_type)}</MetadataListItem>
            )}
            <MetadataListItem label={t('payment.orders.status')}>
              <OrderStatus status={order.status} />
            </MetadataListItem>
          </MetadataList>
        </Card>
      ) : returnInfo ? (
        <Card padding={5}>
          <MetadataList>
            {returnInfo.outTradeNo && <MetadataListItem label={t('payment.orders.orderId')}>{returnInfo.outTradeNo}</MetadataListItem>}
            {returnInfo.money && (
              <MetadataListItem label={t('payment.orders.payAmount')}>{fmt(Number(returnInfo.money) || 0)}</MetadataListItem>
            )}
            {returnInfo.type && (
              <MetadataListItem label={t('payment.orders.paymentMethod')}>{methodLabel(returnInfo.type)}</MetadataListItem>
            )}
          </MetadataList>
        </Card>
      ) : null}

      <Grid columns={2} gap={3}>
        <Button label={t('payment.result.backToRecharge')} variant="secondary" width="100%" onClick={() => navigate('/purchase')} />
        <Button label={t('payment.result.viewOrders')} variant="primary" width="100%" onClick={() => navigate('/orders')} />
      </Grid>
    </CenteredFrame>
  )
}
