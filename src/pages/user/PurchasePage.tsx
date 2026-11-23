import { toAppPath } from '@/utils/appPath'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Center } from '@astryxdesign/core/Center'
import { Icon } from '@astryxdesign/core/Icon'
import { Token } from '@astryxdesign/core/Token'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { paymentAPI } from '@/api/payment'
import subscriptionsAPI from '@/api/subscriptions'
import type { CheckoutInfoResponse, CreateOrderResult, OrderType, SubscriptionPlan } from '@/types/payment'
import type { UserSubscription } from '@/types'
import { extractApiErrorMessage, extractI18nErrorMessage } from '@/utils/apiError'
import { isMobileDevice } from '@/utils/device'
import { formatPeakRateWindow, hasPeakRate, serverTimezoneLabel } from '@/utils/peak-rate'
import { METHOD_ORDER, getPaymentPopupFeatures } from '@/components/payment/providerConfig'
import { currencySymbol } from '@/components/payment/currency'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  buildCreateOrderPayload,
  clearPaymentRecoverySnapshot,
  decidePaymentLaunch,
  normalizeVisibleMethod,
  readPaymentRecoverySnapshot,
  writePaymentRecoverySnapshot,
  type PaymentRecoverySnapshot,
} from '@/components/payment/paymentFlow'
import { buildPaymentErrorToastMessage, describePaymentScenarioError } from '@/views/user/paymentUx'
import { hasWechatResumeQuery, parseWechatResumeRoute, stripWechatResumeQuery } from '@/views/user/paymentWechatResume'
import { Page } from '~/components/common/Page'
import { PaymentStatusPanel } from '~/components/payment/PaymentStatusPanel'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { toast } from '~/lib/toast'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'

type TabKey = 'recharge' | 'subscription'

interface Tab {
  key: TabKey
  label: string
}

interface CreateOrderOptions {
  openid?: string
  wechatResumeToken?: string
  paymentType?: string
  isResume?: boolean
  mobileQrFallbackAttempted?: boolean
}

interface MobileQrFallbackContext {
  orderAmount: number
  orderType: OrderType
  planId?: number
  paymentType: string
  attempted: boolean
}

interface WeixinJSBridgeLike {
  invoke(action: string, payload: Record<string, unknown>, callback: (result: Record<string, unknown>) => void): void
}

type CreateOrderFlowResult = CreateOrderResult & { resume_token?: string }

type CreateOrderFn = (
  orderAmount: number,
  orderType: OrderType,
  planId?: number,
  options?: CreateOrderOptions,
  info?: CheckoutInfoResponse | null,
) => Promise<void>

function emptyPaymentState(): PaymentRecoverySnapshot {
  return {
    orderId: 0,
    amount: 0,
    qrCode: '',
    expiresAt: '',
    paymentType: '',
    payUrl: '',
    outTradeNo: '',
    clientSecret: '',
    intentId: '',
    currency: '',
    countryCode: '',
    paymentEnv: '',
    payAmount: 0,
    orderType: '',
    paymentMode: '',
    resumeToken: '',
    alipayMobilePrecreateDeepLink: false,
    createdAt: 0,
  }
}

function isWechatBrowser(): boolean {
  return typeof window !== 'undefined' && /MicroMessenger/i.test(window.navigator.userAgent)
}

function getWeixinJSBridge(): WeixinJSBridgeLike | undefined {
  return (window as Window & { WeixinJSBridge?: WeixinJSBridgeLike }).WeixinJSBridge
}

function waitForWeixinJSBridge(timeoutMs = 4000): Promise<WeixinJSBridgeLike | null> {
  const existing = getWeixinJSBridge()
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve) => {
    let settled = false
    const finish = (bridge: WeixinJSBridgeLike | null) => {
      if (settled) return
      settled = true
      document.removeEventListener('WeixinJSBridgeReady', handleReady)
      document.removeEventListener('onWeixinJSBridgeReady', handleReady)
      window.clearTimeout(timer)
      resolve(bridge)
    }
    const handleReady = () => finish(getWeixinJSBridge() ?? null)
    const timer = window.setTimeout(() => finish(getWeixinJSBridge() ?? null), timeoutMs)
    document.addEventListener('WeixinJSBridgeReady', handleReady, false)
    document.addEventListener('onWeixinJSBridgeReady', handleReady, false)
  })
}

async function invokeWechatJsapiPayment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bridge = await waitForWeixinJSBridge()
  if (!bridge) throw new Error('WECHAT_JSAPI_UNAVAILABLE')
  return new Promise((resolve) => {
    bridge.invoke('getBrandWCPayRequest', payload, (result) => resolve(result || {}))
  })
}

/** Carries the order context through WeChat OAuth so /purchase can resume the payment afterwards. */
function buildWechatOAuthAuthorizeUrl(
  authorizeUrl: string,
  context: { paymentType: string; orderType: OrderType; planId?: number; orderAmount: number },
): string {
  const normalizedUrl = authorizeUrl.trim()
  if (!normalizedUrl || typeof window === 'undefined') return normalizedUrl
  try {
    const targetUrl = new URL(normalizedUrl, window.location.origin)
    const redirectPath = targetUrl.searchParams.get('redirect') || '/purchase'
    const redirectUrl = new URL(redirectPath, window.location.origin)
    const paymentType = normalizeVisibleMethod(context.paymentType) || context.paymentType.trim() || 'wxpay'
    redirectUrl.searchParams.set('payment_type', paymentType)
    redirectUrl.searchParams.set('order_type', context.orderType)
    if (context.planId) redirectUrl.searchParams.set('plan_id', String(context.planId))
    else redirectUrl.searchParams.delete('plan_id')
    if (context.orderAmount > 0) redirectUrl.searchParams.set('amount', String(context.orderAmount))
    else redirectUrl.searchParams.delete('amount')
    targetUrl.searchParams.set('redirect', `${redirectUrl.pathname}${redirectUrl.search}`)
    return targetUrl.toString()
  } catch {
    return normalizedUrl
  }
}

function buildRouteUrl(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** Same order as the Vue selector: built-in Alipay / WeChat first, then Stripe and Airwallex. */
function sortMethodKeys(methods: string[]): string[] {
  const order: readonly string[] = METHOD_ORDER
  const rank = (m: string) => (order.indexOf(m) === -1 ? 999 : order.indexOf(m))
  return [...methods].sort((a, b) => rank(a) - rank(b))
}

function shouldFallbackToDesktopQr(err: unknown, paymentMethod: string, attempted: boolean): boolean {
  if (attempted || !isMobileDevice()) return false
  const normalizedMethod = normalizeVisibleMethod(paymentMethod) || paymentMethod
  const reason =
    typeof err === 'object' && err && 'reason' in err && typeof err.reason === 'string' ? err.reason : ''
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err && typeof err.message === 'string'
        ? err.message
        : ''
  const normalizedMessage = message.toLowerCase()
  if (normalizedMethod === 'wxpay') {
    return (
      reason === 'WECHAT_H5_NOT_AUTHORIZED' ||
      reason === 'WECHAT_PAYMENT_MP_NOT_CONFIGURED' ||
      reason === 'WECHAT_JSAPI_FAILED' ||
      reason === 'PAYMENT_GATEWAY_ERROR' ||
      reason === 'UNHANDLED_PAYMENT_SCENARIO' ||
      normalizedMessage.includes('weixinjsbridge is unavailable') ||
      normalizedMessage.includes('wechat_jsapi_unavailable')
    )
  }
  if (normalizedMethod === 'alipay') {
    return reason === 'PAYMENT_GATEWAY_ERROR' || reason === 'UNHANDLED_PAYMENT_SCENARIO'
  }
  return false
}

function persistRecoverySnapshot(snapshot: PaymentRecoverySnapshot) {
  if (typeof window === 'undefined' || !snapshot.orderId) return
  writePaymentRecoverySnapshot(window.localStorage, snapshot, PAYMENT_RECOVERY_STORAGE_KEY)
}

function removeRecoverySnapshot() {
  if (typeof window === 'undefined') return
  clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
}

export function PurchasePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const authStore = useAuthStore()
  const appStore = useAppStore()

  const user = authStore.user

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('recharge')
  const [checkout, setCheckout] = useState<CheckoutInfoResponse | null>(null)
  const [activeSubscriptions, setActiveSubscriptions] = useState<UserSubscription[]>([])
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)

  // Recharge state
  const [amount, setAmount] = useState<number | null>(null)
  const [selectedMethod, setSelectedMethod] = useState('')

  // In-progress checkout (PaymentView.vue paymentPhase / paymentState)
  const [paymentPhase, setPaymentPhase] = useState<'select' | 'paying'>('select')
  const [paymentState, setPaymentState] = useState<PaymentRecoverySnapshot>(emptyPaymentState)

  // Renewal plan selection (?tab=subscription&group=<id> with several plans for that group)
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [renewGroupId, setRenewGroupId] = useState<number | null>(null)

  const subscriptionEnabled = resolveFeatureFlag(appStore.publicSettings, FeatureFlags.subscription)
  const initialQuery = useRef(searchParams)
  // The WeChat hand-back creates an order, so it must run once even if checkout data reloads.
  const wechatResumeHandled = useRef(false)
  const createOrderRef = useRef<CreateOrderFn | null>(null)

  const refreshActiveSubscriptions = useCallback(() => {
    subscriptionsAPI
      .getActiveSubscriptions()
      .then(setActiveSubscriptions)
      .catch(() => {})
  }, [])

  // Load checkout data, restore an in-flight payment, resume a WeChat hand-back and handle renewal navigation
  useEffect(() => {
    const query = initialQuery.current
    const queryObject = Object.fromEntries(query)
    async function loadData() {
      try {
        setLoading(true)
        const checkoutRes = await paymentAPI.getCheckoutInfo()
        const info = checkoutRes.data
        setCheckout(info)

        // Set default payment method
        const methods = sortMethodKeys(Object.keys(info.methods || {}))
        const methodKeyFor = (visible: string) => methods.find((m) => (normalizeVisibleMethod(m) || m) === visible)
        let method = methods[0] ?? ''

        // Coming back from WeChat OAuth: the order is re-created below, so drop any stale snapshot
        if (hasWechatResumeQuery(queryObject)) removeRecoverySnapshot()

        // Restore an order that is still being paid (popup closed, page reloaded, app hand-off returned)
        const routeResumeToken = query.get('resume_token') || query.get('wechat_resume_token') || undefined
        const restored = readPaymentRecoverySnapshot(
          window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
          { resumeToken: routeResumeToken },
        )
        if (restored) {
          setPaymentState(restored)
          setPaymentPhase('paying')
          const restoredMethod =
            normalizeVisibleMethod(restored.paymentType) || (info.methods?.[restored.paymentType] ? restored.paymentType : '')
          if (restoredMethod) {
            method = methodKeyFor(restoredMethod) ?? method
          }
        } else {
          removeRecoverySnapshot()
        }
        setSelectedMethod(method)

        // WeChat OAuth / payment callback hand-back (PaymentView.vue resumeWechatPaymentFromQuery):
        // re-create the order with the openid or resume token, then strip those params from the URL.
        const resume = wechatResumeHandled.current ? null : parseWechatResumeRoute(queryObject, info.plans, 0)
        if (resume) {
          wechatResumeHandled.current = true
          setSelectedMethod(methodKeyFor(resume.paymentType) ?? resume.paymentType)
          if (resume.orderType === 'balance' && resume.orderAmount > 0) setAmount(resume.orderAmount)
          if (resume.orderType === 'subscription' && resume.planId) {
            setSelectedPlan(info.plans.find((plan) => plan.id === resume.planId) ?? null)
          }
          const strippedQuery = new URLSearchParams()
          Object.entries(stripWechatResumeQuery(queryObject)).forEach(([key, value]) => {
            if (typeof value === 'string') strippedQuery.set(key, value)
          })
          setSearchParams(strippedQuery, { replace: true })

          const resumeOptions = { paymentType: resume.paymentType, isResume: true }
          if (resume.wechatResumeToken) {
            await createOrderRef.current?.(
              0,
              resume.orderType,
              resume.planId,
              { ...resumeOptions, wechatResumeToken: resume.wechatResumeToken },
              info,
            )
          } else if (resume.orderAmount > 0 && resume.openid) {
            await createOrderRef.current?.(
              resume.orderAmount,
              resume.orderType,
              resume.planId,
              { ...resumeOptions, openid: resume.openid },
              info,
            )
          }
        }

        // Handle tab from query params (ignored when subscriptions are disabled)
        if (query.get('tab') === 'subscription' && subscriptionEnabled) {
          setActiveTab('subscription')
          const groupParam = query.get('group')
          if (groupParam) {
            const groupId = Number(groupParam)
            const groupPlans = info.plans.filter((p) => p.group_id === groupId)
            if (groupPlans.length === 1) {
              setSelectedPlan(groupPlans[0])
            } else if (groupPlans.length > 1) {
              setRenewGroupId(groupId)
              setShowRenewalModal(true)
            }
          }
        }
      } catch (error) {
        toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
      } finally {
        setLoading(false)
      }
      if (subscriptionEnabled) refreshActiveSubscriptions()
    }

    void loadData()
    // setSearchParams changes identity with every query change (including the strip above); the
    // initial query is read from a ref, so this effect must not re-run for it.
  }, [refreshActiveSubscriptions, subscriptionEnabled, t])

  // Determine available tabs
  const tabs = useMemo<Tab[]>(() => {
    if (!checkout) return []
    const result: Tab[] = []
    if (!checkout.balance_disabled) {
      result.push({ key: 'recharge', label: t('payment.tabTopUp') })
    }
    // Check subscription feature flag (opt-out, enabled by default)
    if (subscriptionEnabled) {
      result.push({ key: 'subscription', label: t('payment.tabSubscribe') })
    }
    return result
  }, [checkout, subscriptionEnabled, t])

  // Converge on the first available tab when the current one disappears
  useEffect(() => {
    if (tabs.length === 0 || tabs.some((tab) => tab.key === activeTab)) return
    if (activeTab === 'subscription') setSelectedPlan(null)
    setActiveTab(tabs[0].key)
  }, [tabs, activeTab])

  const renewalPlans = useMemo(
    () => (renewGroupId == null || !checkout ? [] : checkout.plans.filter((p) => p.group_id === renewGroupId)),
    [checkout, renewGroupId],
  )

  const closeRenewalModal = useCallback(() => {
    setShowRenewalModal(false)
    setRenewGroupId(null)
  }, [])

  const selectPlanFromModal = useCallback((plan: SubscriptionPlan) => {
    setShowRenewalModal(false)
    setRenewGroupId(null)
    setSelectedPlan(plan)
  }, [])

  const resetPayment = useCallback(() => {
    setPaymentPhase('select')
    setPaymentState(emptyPaymentState())
    removeRecoverySnapshot()
  }, [])

  const redirectToPaymentResult = useCallback(
    (state: PaymentRecoverySnapshot) => {
      navigate(
        buildRouteUrl('/payment/result', {
          order_id: state.orderId > 0 ? String(state.orderId) : undefined,
          out_trade_no: state.outTradeNo || undefined,
          resume_token: state.resumeToken || undefined,
        }),
      )
    },
    [navigate],
  )

  const handlePaymentDone = useCallback(() => {
    const wasSubscription = paymentState.orderType === 'subscription'
    resetPayment()
    setSelectedPlan(null)
    if (wasSubscription) refreshActiveSubscriptions()
  }, [paymentState.orderType, refreshActiveSubscriptions, resetPayment])

  const handlePaymentSuccess = useCallback(() => {
    const completedPayment = { ...paymentState }
    removeRecoverySnapshot()
    void authStore.refreshUser().catch(() => {})
    if (completedPayment.orderType === 'subscription') refreshActiveSubscriptions()
    redirectToPaymentResult(completedPayment)
  }, [authStore, paymentState, redirectToPaymentResult, refreshActiveSubscriptions])

  const applyScenarioError = (err: unknown, paymentMethod: string): boolean => {
    const descriptor = describePaymentScenarioError(err, {
      paymentMethod,
      isMobile: isMobileDevice(),
      isWechatBrowser: isWechatBrowser(),
    })
    if (!descriptor) return false
    toast.error(buildPaymentErrorToastMessage(t(descriptor.messageKey), descriptor.hintKey ? t(descriptor.hintKey) : ''))
    return true
  }

  // Mobile wxpay/alipay failed: retry once as a desktop order so the user can scan a QR instead.
  const attemptMobileQrFallback = async (err: unknown, context: MobileQrFallbackContext): Promise<boolean> => {
    if (!shouldFallbackToDesktopQr(err, context.paymentType, context.attempted)) return false
    try {
      const visibleMethod = normalizeVisibleMethod(context.paymentType) || context.paymentType
      const payload = buildCreateOrderPayload({
        amount: context.orderAmount,
        paymentType: visibleMethod,
        orderType: context.orderType,
        planId: context.planId,
        origin: window.location.origin + toAppPath(''),
        isMobile: false,
        isWechatBrowser: false,
      })
      const result = (await paymentAPI.createOrder(payload)).data as CreateOrderFlowResult
      const stripeMethod = visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay'
      const stripeRouteUrl = result.client_secret
        ? buildRouteUrl(toAppPath('/payment/stripe'), {
            order_id: String(result.order_id),
            method: stripeMethod,
            resume_token: result.resume_token || undefined,
          })
        : ''
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType: context.orderType,
        isMobile: false,
        isWechatBrowser: false,
        stripePopupUrl: stripeRouteUrl,
        stripeRouteUrl,
      })
      if (decision.kind !== 'qr_waiting' || !decision.paymentState.qrCode) return false
      setPaymentState(decision.paymentState)
      setPaymentPhase('paying')
      persistRecoverySnapshot(decision.recovery)
      toast.warning(t('payment.errors.mobilePaymentFallbackToQr'))
      return true
    } catch {
      return false
    }
  }

  // `info` lets the mount effect resume a WeChat order before the checkout state has re-rendered.
  const createOrder: CreateOrderFn = async (orderAmount, orderType, planId, options = {}, info = checkout) => {
    if (!info) return
    setSubmitting(true)
    const requestType =
      normalizeVisibleMethod(options.paymentType || selectedMethod) || options.paymentType || selectedMethod
    let errorMessage = ''
    try {
      const payload = buildCreateOrderPayload({
        amount: orderAmount,
        paymentType: requestType,
        orderType,
        planId,
        origin: window.location.origin + toAppPath(''),
        isMobile: isMobileDevice(),
        isWechatBrowser: isWechatBrowser(),
        forceQRCode: !!(info.alipay_force_qrcode && normalizeVisibleMethod(requestType) === 'alipay'),
        mobilePrecreateDeepLink: info.alipay_mobile_precreate_deep_link === true,
      })
      if (options.openid) payload.openid = options.openid
      if (options.wechatResumeToken) payload.wechat_resume_token = options.wechatResumeToken

      const result = (await paymentAPI.createOrder(payload)).data as CreateOrderFlowResult
      const openWindow = (url: string) => {
        const win = window.open(url, 'paymentPopup', getPaymentPopupFeatures())
        if (!win || win.closed) window.location.href = url
      }
      const visibleMethod = normalizeVisibleMethod(requestType) || requestType
      // The dedicated Stripe button lands on Stripe's full Payment Element (no preset method).
      const stripeMethod = visibleMethod === 'stripe' ? '' : visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay'
      const stripeRouteUrl =
        result.client_secret && visibleMethod !== 'airwallex'
          ? buildRouteUrl(toAppPath('/payment/stripe'), {
              order_id: String(result.order_id),
              method: stripeMethod || undefined,
              resume_token: result.resume_token || undefined,
            })
          : ''
      const airwallexRouteUrl =
        result.client_secret && result.intent_id
          ? buildRouteUrl(toAppPath('/payment/airwallex'), {
              order_id: String(result.order_id),
              out_trade_no: result.out_trade_no || undefined,
              resume_token: result.resume_token || undefined,
            })
          : ''
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType,
        isMobile: isMobileDevice(),
        isWechatBrowser: isWechatBrowser(),
        forceQRCode: !!(info.alipay_force_qrcode && visibleMethod === 'alipay'),
        mobilePrecreateDeepLink: info.alipay_mobile_precreate_deep_link === true,
        stripePopupUrl: stripeRouteUrl,
        stripeRouteUrl,
        airwallexRouteUrl,
      })

      if (decision.kind === 'wechat_oauth' && decision.oauth?.authorize_url) {
        window.location.href = buildWechatOAuthAuthorizeUrl(decision.oauth.authorize_url, {
          paymentType: visibleMethod,
          orderType,
          planId,
          orderAmount,
        })
        return
      }

      if (decision.kind === 'unhandled') {
        applyScenarioError({ reason: 'UNHANDLED_PAYMENT_SCENARIO' }, visibleMethod)
        return
      }

      setPaymentState(decision.paymentState)
      setPaymentPhase('paying')
      persistRecoverySnapshot(decision.recovery)

      if (decision.kind === 'stripe_popup') {
        openWindow(decision.paymentState.payUrl)
        return
      }
      if (decision.kind === 'stripe_route' || decision.kind === 'airwallex_route') {
        window.location.href = decision.paymentState.payUrl
        return
      }
      if (decision.kind === 'wechat_jsapi' && decision.jsapi) {
        const fallbackContext = {
          orderAmount,
          orderType,
          planId,
          paymentType: visibleMethod,
          attempted: options.mobileQrFallbackAttempted === true,
        }
        try {
          const jsapiResult = await invokeWechatJsapiPayment(decision.jsapi as Record<string, unknown>)
          const errMsg = String(jsapiResult.err_msg || '').toLowerCase()
          if (errMsg.includes('cancel')) {
            toast.warning(t('payment.qr.cancelled'))
            resetPayment()
          } else if (errMsg && !errMsg.includes('ok')) {
            resetPayment()
            const jsapiError = { reason: 'WECHAT_JSAPI_FAILED', message: errMsg }
            if (!(await attemptMobileQrFallback(jsapiError, fallbackContext))) {
              applyScenarioError(jsapiError, visibleMethod)
            }
          } else {
            const resultState = { ...decision.paymentState }
            resetPayment()
            redirectToPaymentResult(resultState)
          }
        } catch (err) {
          resetPayment()
          if (!(await attemptMobileQrFallback(err, fallbackContext))) throw err
        }
        return
      }
      if (decision.kind === 'redirect_waiting' && decision.paymentState.payUrl) {
        if (isMobileDevice()) {
          window.location.href = decision.paymentState.payUrl
          return
        }
        openWindow(decision.paymentState.payUrl)
      }
    } catch (err) {
      const apiErr = (err ?? {}) as Record<string, unknown>
      if (apiErr.reason === 'TOO_MANY_PENDING') {
        const metadata = apiErr.metadata as Record<string, unknown> | undefined
        errorMessage = t('payment.errors.tooManyPending', { max: metadata?.max || '' })
      } else if (apiErr.reason === 'CANCEL_RATE_LIMITED') {
        errorMessage = t('payment.errors.cancelRateLimited')
      } else if (
        await attemptMobileQrFallback(err, {
          orderAmount,
          orderType,
          planId,
          paymentType: requestType,
          attempted: options.mobileQrFallbackAttempted === true,
        })
      ) {
        return
      } else {
        const handled = applyScenarioError(
          err,
          normalizeVisibleMethod(options.paymentType || selectedMethod) || selectedMethod,
        )
        if (handled) return
        errorMessage = extractI18nErrorMessage(
          err,
          t,
          'payment.errors',
          extractApiErrorMessage(err, t('payment.result.failed')),
        )
      }
      toast.error(buildPaymentErrorToastMessage(errorMessage))
    } finally {
      setSubmitting(false)
    }
  }
  createOrderRef.current = createOrder

  // Handle recharge submission
  const handleRecharge = () => {
    if (submitting) return
    if (!amount || amount <= 0 || !selectedMethod) {
      toast.error(t('payment.errors.INVALID_AMOUNT'))
      return
    }
    void createOrder(amount, 'balance')
  }

  // Handle subscription purchase
  const handleSubscription = () => {
    if (!selectedPlan || !selectedMethod || submitting) return
    void createOrder(selectedPlan.price, 'subscription', selectedPlan.id)
  }

  if (loading) {
    return (
      <Page title={t('payment.title')}>
        <Center axis="both" padding={8} minHeight="60vh">
          <Spinner />
        </Center>
      </Page>
    )
  }

  if (!checkout) {
    return (
      <Page title={t('payment.title')}>
        <EmptyState title={t('common.noData')} description={t('payment.billingUnavailable')} />
      </Page>
    )
  }

  return (
    <Page title={t('payment.title')}>
      <VStack gap={6} hAlign="stretch">
        {/* Tab Switcher (hidden during payment and subscription confirmation) */}
        {tabs.length > 1 && paymentPhase === 'select' && !selectedPlan && (
          <Card padding={1}>
            <SegmentedControl
              label={t('purchase.paymentType')}
              value={activeTab}
              onChange={(value) => setActiveTab(value as TabKey)}
              layout="fill"
            >
              {tabs.map((tab) => (
                <SegmentedControlItem key={tab.key} value={tab.key} label={tab.label} />
              ))}
            </SegmentedControl>
          </Card>
        )}

        {paymentPhase === 'paying' ? (
          <PaymentStatusPanel
            key={paymentState.orderId}
            orderId={paymentState.orderId}
            amount={paymentState.amount}
            payAmount={paymentState.payAmount}
            qrCode={paymentState.qrCode}
            expiresAt={paymentState.expiresAt}
            paymentType={paymentState.paymentType}
            payUrl={paymentState.payUrl}
            orderType={paymentState.orderType}
            currency={paymentState.currency || checkout.methods?.[selectedMethod]?.currency}
            outTradeNo={paymentState.outTradeNo}
            mobileAlipayDeepLink={paymentState.alipayMobilePrecreateDeepLink}
            onDone={handlePaymentDone}
            onSuccess={handlePaymentSuccess}
            onSettled={removeRecoverySnapshot}
          />
        ) : (
          <>
            {/* No tabs available */}
            {tabs.length === 0 && (
              <EmptyState title={t('common.noData')} description={t('payment.billingUnavailable')} />
            )}

            {/* Recharge Tab */}
            {activeTab === 'recharge' && tabs.some((tab) => tab.key === 'recharge') && (
              <RechargeTab
                user={user}
                checkout={checkout}
                amount={amount}
                setAmount={setAmount}
                selectedMethod={selectedMethod}
                setSelectedMethod={setSelectedMethod}
                submitting={submitting}
                onSubmit={handleRecharge}
              />
            )}

            {/* Subscription Tab */}
            {activeTab === 'subscription' && tabs.some((tab) => tab.key === 'subscription') && (
              <SubscriptionTab
                checkout={checkout}
                activeSubscriptions={activeSubscriptions}
                selectedPlan={selectedPlan}
                setSelectedPlan={setSelectedPlan}
                selectedMethod={selectedMethod}
                setSelectedMethod={setSelectedMethod}
                submitting={submitting}
                onSubmit={handleSubscription}
              />
            )}
          </>
        )}
      </VStack>

      {/* Renewal Plan Selection Modal */}
      <Dialog
        isOpen={showRenewalModal}
        onOpenChange={(open) => !open && closeRenewalModal()}
        width={520}
        maxHeight="90dvh"
      >
        <Layout
          height="auto"
          header={<DialogHeader title={t('payment.selectPlan')} onOpenChange={(open) => !open && closeRenewalModal()} />}
          content={
            <LayoutContent isScrollable>
              <VStack gap={4}>
                {renewalPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    activeSubscriptions={activeSubscriptions}
                    onSelect={() => selectPlanFromModal(plan)}
                  />
                ))}
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </Page>
  )
}

// Recharge Tab Component
interface RechargeTabProps {
  user: { username?: string; balance?: number } | null
  checkout: CheckoutInfoResponse
  amount: number | null
  setAmount: (amount: number | null) => void
  selectedMethod: string
  setSelectedMethod: (method: string) => void
  submitting: boolean
  onSubmit: () => void
}

function RechargeTab({
  user,
  checkout,
  amount,
  setAmount,
  selectedMethod,
  setSelectedMethod,
  submitting,
  onSubmit,
}: RechargeTabProps) {
  const { t } = useI18n()

  const enabledMethods = Object.keys(checkout.methods || {})

  if (enabledMethods.length === 0) {
    return <EmptyState title={t('payment.noPaymentMethods')} />
  }

  return (
    <VStack gap={6}>
      {/* Account Card */}
      <Card padding={5}>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            {t('payment.rechargeAccount')}
          </Text>
          <Text type="body" size="base" weight="semibold">
            {user?.username || ''}
          </Text>
          <Text type="body" weight="medium" color="primary">
            {t('payment.currentBalance')}: ${user?.balance?.toFixed(2) || '0.00'}
          </Text>
        </VStack>
      </Card>

      {/* Amount */}
      <Card padding={6}>
        <AmountPicker amount={amount} setAmount={setAmount} min={checkout.global_min} max={checkout.global_max} />
      </Card>

      {/* Payment Method */}
      <Card padding={6}>
        <PaymentMethodPicker
          methods={checkout.methods}
          selectedMethod={selectedMethod}
          setSelectedMethod={setSelectedMethod}
        />
      </Card>

      {/* Submit Button */}
      <Button
        label={submitting ? t('common.processing') : t('payment.createOrder')}
        variant="primary"
        size="lg"
        isDisabled={submitting || !amount || amount <= 0 || !selectedMethod}
        isLoading={submitting}
        onClick={onSubmit}
      />
    </VStack>
  )
}

// Subscription Tab Component
interface SubscriptionTabProps {
  checkout: CheckoutInfoResponse
  activeSubscriptions: UserSubscription[]
  selectedPlan: SubscriptionPlan | null
  setSelectedPlan: (plan: SubscriptionPlan | null) => void
  selectedMethod: string
  setSelectedMethod: (method: string) => void
  submitting: boolean
  onSubmit: () => void
}

function SubscriptionTab({
  checkout,
  activeSubscriptions,
  selectedPlan,
  setSelectedPlan,
  selectedMethod,
  setSelectedMethod,
  submitting,
  onSubmit,
}: SubscriptionTabProps) {
  const { t } = useI18n()
  const peakRateLabel = usePeakRateLabel(selectedPlan)

  // Plan confirmation view
  if (selectedPlan) {
    return (
      <VStack gap={6}>
        {/* Plan Details Card */}
        <Card padding={5}>
          <VStack gap={3}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              {selectedPlan.group_platform && <Badge label={selectedPlan.group_platform} />}
              <Heading level={3}>{selectedPlan.name}</Heading>
            </HStack>

            <HStack gap={2} vAlign="end">
              {!!selectedPlan.original_price && (
                <Text type="body" color="secondary" hasStrikethrough>
                  ${selectedPlan.original_price.toFixed(2)}
                </Text>
              )}
              <Text type="body" size="xl" weight="bold">
                ${selectedPlan.price.toFixed(2)}
              </Text>
              <Text type="supporting" color="secondary">
                / {planValiditySuffix(selectedPlan, t)}
              </Text>
            </HStack>

            {selectedPlan.description && (
              <Text type="body" color="secondary">
                {selectedPlan.description}
              </Text>
            )}

            {/* Rate and Limits */}
            <Grid columns={2} gap={3}>
              <PlanFact label={t('payment.planCard.rate')} value={`×${selectedPlan.rate_multiplier ?? 1}`} />
              {peakRateLabel && <PlanFact label={t('payment.planCard.peakRate')} value={peakRateLabel} />}
              {selectedPlan.daily_limit_usd != null && (
                <PlanFact label={t('payment.planCard.dailyLimit')} value={`$${selectedPlan.daily_limit_usd}`} />
              )}
              {selectedPlan.weekly_limit_usd != null && (
                <PlanFact label={t('payment.planCard.weeklyLimit')} value={`$${selectedPlan.weekly_limit_usd}`} />
              )}
              {selectedPlan.monthly_limit_usd != null && (
                <PlanFact label={t('payment.planCard.monthlyLimit')} value={`$${selectedPlan.monthly_limit_usd}`} />
              )}
              {selectedPlan.daily_limit_usd == null &&
                selectedPlan.weekly_limit_usd == null &&
                selectedPlan.monthly_limit_usd == null && (
                  <PlanFact label={t('payment.planCard.quota')} value={t('payment.planCard.unlimited')} />
                )}
            </Grid>
          </VStack>
        </Card>

        {/* Payment Method */}
        <Card padding={6}>
          <PaymentMethodPicker
            methods={checkout.methods}
            selectedMethod={selectedMethod}
            setSelectedMethod={setSelectedMethod}
          />
        </Card>

        {/* Action Buttons */}
        <VStack gap={3}>
          <Button
            label={submitting ? t('common.processing') : `${t('payment.createOrder')} $${selectedPlan.price.toFixed(2)}`}
            variant="primary"
            size="lg"
            isDisabled={submitting || !selectedMethod}
            isLoading={submitting}
            onClick={onSubmit}
          />
          <Button label={t('common.cancel')} variant="secondary" onClick={() => setSelectedPlan(null)} />
        </VStack>
      </VStack>
    )
  }

  // Plan list view
  if (checkout.plans.length === 0) {
    return <EmptyState title={t('payment.noPlans')} />
  }

  return (
    <VStack gap={6}>
      {/* Plan Cards Grid */}
      <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={5}>
        {checkout.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            activeSubscriptions={activeSubscriptions}
            onSelect={() => setSelectedPlan(plan)}
          />
        ))}
      </Grid>

      {/* Active Subscriptions */}
      {activeSubscriptions.length > 0 && (
        <VStack gap={2}>
          <Text type="supporting" weight="medium" color="secondary">
            {t('payment.activeSubscription')}
          </Text>

          <VStack gap={2}>
            {activeSubscriptions.map((sub) => (
              <Card key={sub.id} padding={3}>
                <HStack gap={3} vAlign="center">
                  <StatusDot variant="success" label={t('userSubscriptions.status.active')} />
                  <StackItem size="fill">
                    <VStack gap={0}>
                      <HStack gap={1.5} vAlign="center">
                        <Text type="body" weight="semibold" maxLines={1}>
                          {sub.group?.name || t('payment.groupFallback', { id: sub.group_id })}
                        </Text>
                        {sub.group?.platform && <Badge label={sub.group.platform} />}
                      </HStack>
                      <Text type="supporting" color="secondary">
                        {t('payment.planCard.rate')}: ×{sub.group?.rate_multiplier ?? 1}
                        {sub.expires_at
                          ? ` • ${t('userSubscriptions.daysRemaining', { days: getDaysRemaining(sub.expires_at) })}`
                          : ` • ${t('userSubscriptions.noExpiration')}`}
                      </Text>
                    </VStack>
                  </StackItem>
                  <Badge variant="success" label={t('userSubscriptions.status.active')} />
                </HStack>
              </Card>
            ))}
          </VStack>
        </VStack>
      )}
    </VStack>
  )
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text type="body" weight="semibold" hasTabularNumbers>
        {value}
      </Text>
    </VStack>
  )
}

// Plan Card Component (port of components/payment/SubscriptionPlanCard.vue)
interface PlanCardProps {
  plan: SubscriptionPlan
  activeSubscriptions: UserSubscription[]
  onSelect: () => void
}

// Antigravity plans list the model families they unlock
const MODEL_SCOPE_LABELS: Record<string, string> = {
  claude: 'Claude',
  gemini_text: 'Gemini',
  gemini_image: 'Imagen',
}

function PlanCard({ plan, activeSubscriptions, onSelect }: PlanCardProps) {
  const { t } = useI18n()
  const peakRateLabel = usePeakRateLabel(plan)

  const isActive = activeSubscriptions.some((sub) => sub.group_id === plan.group_id && sub.status === 'active')
  const symbol = currencySymbol(plan.currency || 'USD')
  const discountPercent =
    plan.original_price && plan.original_price > 0 ? Math.round((1 - plan.price / plan.original_price) * 100) : 0
  const modelScopes =
    plan.group_platform === 'antigravity' ? (plan.supported_model_scopes || []).map((s) => MODEL_SCOPE_LABELS[s] || s) : []
  const features = plan.features || []
  const noLimits = plan.daily_limit_usd == null && plan.weekly_limit_usd == null && plan.monthly_limit_usd == null

  return (
    <Card padding={5}>
      <VStack gap={4}>
        {/* Header */}
        <VStack gap={2}>
          <HStack gap={2} wrap="wrap">
            {plan.group_platform && <Badge label={plan.group_platform} />}
            {isActive && <Badge variant="success" label={t('userSubscriptions.status.active')} />}
          </HStack>
          <Heading level={4} maxLines={2}>
            {plan.name}
          </Heading>
        </VStack>

        {/* Price */}
        <HStack gap={2} vAlign="end" wrap="wrap">
          {!!plan.original_price && (
            <Text type="body" color="secondary" hasStrikethrough>
              {symbol}
              {plan.original_price}
              {plan.currency ? ` ${plan.currency}` : ''}
            </Text>
          )}
          <Text type="body" size="xl" weight="bold" hasTabularNumbers>
            {symbol}
            {plan.price}
            {plan.currency ? ` ${plan.currency}` : ''}
          </Text>
          <Text type="supporting" color="secondary">
            / {planValiditySuffix(plan, t)}
          </Text>
          {discountPercent > 0 && <Token label={`-${discountPercent}%`} size="sm" color="red" />}
        </HStack>

        {/* Description */}
        {plan.description && (
          <Text type="body" color="secondary" maxLines={2}>
            {plan.description}
          </Text>
        )}

        <Divider />

        {/* Group quota info */}
        <VStack gap={2}>
          <PlanRow label={t('payment.planCard.rate')} value={`×${Number((plan.rate_multiplier ?? 1).toPrecision(10))}`} />
          {peakRateLabel && <PlanRow label={t('payment.planCard.peakRate')} value={peakRateLabel} />}
          {plan.daily_limit_usd != null && (
            <PlanRow label={t('payment.planCard.dailyLimit')} value={`$${plan.daily_limit_usd}`} />
          )}
          {plan.weekly_limit_usd != null && (
            <PlanRow label={t('payment.planCard.weeklyLimit')} value={`$${plan.weekly_limit_usd}`} />
          )}
          {plan.monthly_limit_usd != null && (
            <PlanRow label={t('payment.planCard.monthlyLimit')} value={`$${plan.monthly_limit_usd}`} />
          )}
          {noLimits && <PlanRow label={t('payment.planCard.quota')} value={t('payment.planCard.unlimited')} />}
          {modelScopes.length > 0 && (
            <HStack hAlign="between" gap={2}>
              <Text type="supporting" color="secondary">
                {t('payment.planCard.models')}
              </Text>
              <HStack gap={1} wrap="wrap" hAlign="end">
                {modelScopes.map((scope) => (
                  <Token key={scope} label={scope} size="sm" color="gray" />
                ))}
              </HStack>
            </HStack>
          )}
        </VStack>

        {/* Features */}
        {features.length > 0 && (
          <VStack gap={1}>
            {features.map((feature) => (
              <HStack key={feature} gap={1.5} vAlign="start">
                <Icon icon="check" size="sm" color="success" />
                <Text type="supporting">{feature}</Text>
              </HStack>
            ))}
          </VStack>
        )}

        {/* Subscribe Button */}
        <Button
          label={isActive ? t('payment.renewNow') : t('payment.subscribeNow')}
          variant={isActive ? 'primary' : 'secondary'}
          onClick={onSelect}
        />
      </VStack>
    </Card>
  )
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack hAlign="between" gap={2}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      <Text type="body" weight="semibold" hasTabularNumbers>
        {value}
      </Text>
    </HStack>
  )
}

/** "14:00-18:00 ×2 (UTC+08:00)" for a plan with a peak-rate window (server time zone), '' otherwise. */
function usePeakRateLabel(plan: SubscriptionPlan | null): string {
  const appStore = useAppStore()
  if (!plan || !hasPeakRate(plan)) return ''
  return formatPeakRateWindow(plan, serverTimezoneLabel(appStore.publicSettings?.server_utc_offset))
}

// Recharge amount: quick presets plus a custom amount (0 = no limit)
const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]

interface AmountPickerProps {
  amount: number | null
  setAmount: (amount: number | null) => void
  min: number
  max: number
}

function AmountPicker({ amount, setAmount, min, max }: AmountPickerProps) {
  const { t } = useI18n()
  const presets = QUICK_AMOUNTS.filter((a) => (min <= 0 || a >= min) && (max <= 0 || a <= max))

  return (
    <VStack gap={4} hAlign="stretch">
      <Text type="body" size="base" weight="medium">
        {t('payment.amountLabel')}
      </Text>
      {presets.length > 0 && (
        <VStack gap={2} hAlign="stretch">
          <Text type="supporting" color="secondary">
            {t('payment.quickAmounts')}
          </Text>
          <Grid columns={{ minWidth: 96, repeat: 'fill' }} gap={2}>
            {presets.map((a) => (
              <ToggleButton
                key={a}
                label={`$${a}`}
                isPressed={amount === a}
                onPressedChange={(pressed) => setAmount(pressed ? a : null)}
              />
            ))}
          </Grid>
        </VStack>
      )}
      <NumberInput
        label={t('payment.customAmount')}
        placeholder={t('payment.enterAmount')}
        value={amount}
        onChange={(v) => setAmount(Number.isFinite(v) && v > 0 ? v : null)}
        min={min > 0 ? min : null}
        max={max > 0 ? max : null}
        step={0.01}
        units="$"
        isWheelEnabled={false}
      />
    </VStack>
  )
}

interface PaymentMethodPickerProps {
  methods: CheckoutInfoResponse['methods']
  selectedMethod: string
  setSelectedMethod: (method: string) => void
}

function PaymentMethodPicker({ methods, selectedMethod, setSelectedMethod }: PaymentMethodPickerProps) {
  const { t, te } = useI18n()
  const entries = Object.entries(methods || {})

  if (entries.length === 0) {
    return <EmptyState title={t('payment.noPaymentMethods')} />
  }

  return (
    <RadioList label={t('payment.paymentMethod')} value={selectedMethod} onChange={setSelectedMethod}>
      {entries.map(([key, limit]) => {
        const labelKey = `payment.methods.${key}`
        const label = te(labelKey) ? t(labelKey) : limit.display_name || key
        return <RadioListItem key={key} value={key} label={label} isDisabled={!limit.available} />
      })}
    </RadioList>
  )
}

// Billing-period suffix ("/ 月", "/ 30天"), same rules as components/payment/validity.ts in
// the Vue app: units may be singular or plural; week/month bill as 7/30 days, anything else as days.
function planValiditySuffix(
  plan: Pick<SubscriptionPlan, 'validity_days' | 'validity_unit'>,
  t: (key: string) => string,
): string {
  const unit = String(plan.validity_unit || 'day').trim().toLowerCase()
  const base = unit.endsWith('s') ? unit.slice(0, -1) : unit
  const days = plan.validity_days
  if (base === 'month') return days === 1 ? t('payment.perMonth') : `${days}${t('payment.months')}`
  if (base === 'week') return `${days}${t('payment.weeks')}`
  return `${days}${t('payment.days')}`
}

// Helper function
function getDaysRemaining(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
