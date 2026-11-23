import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PAYMENT_RECOVERY_STORAGE_KEY } from '@/components/payment/paymentFlow'
import type { CheckoutInfoResponse, CreateOrderResult, MethodLimit } from '@/types/payment'
import type { PaymentStatusPanelProps } from '~/components/payment/PaymentStatusPanel'
import { useAuthStore } from '~/stores/auth'
import { mockToast, mockUser } from '~/test/mocks'
import { PurchasePage } from './PurchasePage'

const { getCheckoutInfo, createOrder, getActiveSubscriptions } = vi.hoisted(() => ({
  getCheckoutInfo: vi.fn(), createOrder: vi.fn(), getActiveSubscriptions: vi.fn(),
}))
vi.mock('@/api/payment', () => ({ paymentAPI: { getCheckoutInfo, createOrder } }))
vi.mock('@/api/subscriptions', () => ({ default: { getActiveSubscriptions } }))
vi.mock('~/i18n', async () => ({ useI18n: (await import('~/test/mocks')).mockUseI18n }))
vi.mock('~/lib/toast', async () => ({ toast: (await import('~/test/mocks')).mockToast }))
// Stop at the checkout handoff. Polling a provider belongs to PaymentStatusPanel.
vi.mock('~/components/payment/PaymentStatusPanel', () => ({
  PaymentStatusPanel: ({ orderId }: PaymentStatusPanelProps) => <output aria-label="Pending order">{orderId}</output>,
}))

const method: MethodLimit = {
  daily_limit: 0, daily_used: 0, daily_remaining: 0,
  single_min: 10, single_max: 100, fee_rate: 0, available: true,
}
const checkout: CheckoutInfoResponse = {
  methods: {
    alipay: { ...method, display_name: 'Alipay' },
    wxpay: { ...method, display_name: 'WeChat Pay' },
  },
  global_min: 10, global_max: 100, balance_disabled: false,
  balance_recharge_multiplier: 1, subscription_usd_to_cny_rate: 0, recharge_fee_rate: 0,
  help_text: '', help_image_url: '', stripe_publishable_key: '',
  plans: [{
    id: 7, group_id: 1, name: 'Basic Plan', description: '', price: 25,
    validity_days: 30, validity_unit: 'day', features: [], for_sale: true, sort_order: 0,
  }],
}

function orderResult(amount: number): CreateOrderResult {
  return {
    order_id: 42, amount, pay_amount: amount, fee_rate: 0, qr_code: 'test-qr',
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
}

function renderPurchase() {
  render(<MemoryRouter initialEntries={['/purchase']}><PurchasePage /></MemoryRouter>)
}

async function renderCheckout() {
  renderPurchase()
  return screen.findByRole('button', { name: 'payment.createOrder' })
}

describe('PurchasePage', () => {
  beforeEach(() => {
    getCheckoutInfo.mockResolvedValue({ data: checkout })
    getActiveSubscriptions.mockResolvedValue([])
    createOrder.mockReset()
    useAuthStore.setState({ user: mockUser })
  })

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true)
  })

  it('displays the loading state until checkout is available', async () => {
    renderPurchase()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'payment.createOrder' })).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('offers both balance and subscription checkout with balance selected', async () => {
    await renderCheckout()
    const tabs = screen.getByRole('radiogroup', { name: 'purchase.paymentType' })
    expect(within(tabs).getByRole('radio', { name: 'payment.tabTopUp' })).toBeChecked()
    expect(within(tabs).getByRole('radio', { name: 'payment.tabSubscribe' })).not.toBeChecked()
  })

  it('blocks the order until a positive amount is selected', async () => {
    const user = userEvent.setup()
    const submit = await renderCheckout()
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await user.click(submit)
    expect(createOrder).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '$10' }))
    expect(submit).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('button', { name: '$10' }))
    expect(submit).toHaveAttribute('aria-disabled', 'true')
  })

  it('creates a balance order for the entered amount and opens the desktop payment URL', async ({ onTestFinished }) => {
    const user = userEvent.setup()
    const payUrl = 'https://checkout.example.test/order/42'
    const openPayment = vi.spyOn(window, 'open').mockReturnValue(window)
    onTestFinished(() => openPayment.mockRestore())
    createOrder.mockResolvedValueOnce({ data: { ...orderResult(42.5), qr_code: undefined, pay_url: payUrl } })
    const submit = await renderCheckout()
    const amount = screen.getByRole('spinbutton', { name: 'payment.customAmount' })
    await user.type(amount, '42.50')
    await user.tab()
    expect(submit).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(submit)
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 42.5, order_type: 'balance', payment_type: 'alipay' }))
    expect(await screen.findByLabelText('Pending order')).toHaveTextContent('42')
    expect(openPayment).toHaveBeenCalledWith(payUrl, 'paymentPopup', expect.any(String))
    const recovery = JSON.parse(localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY) ?? 'null')
    expect(recovery).toMatchObject({ orderId: 42, amount: 42.5, orderType: 'balance', payUrl })
  })

  it('confirms the chosen plan and sends a subscription order with the plan ID', async () => {
    const user = userEvent.setup()
    createOrder.mockResolvedValueOnce({ data: orderResult(25) })
    await renderCheckout()
    await user.click(screen.getByRole('radio', { name: 'payment.tabSubscribe' }))
    expect(screen.getByRole('heading', { name: 'Basic Plan' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'payment.subscribeNow' }))
    expect(createOrder).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'payment.createOrder $25.00' }))
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 25, payment_type: 'alipay', order_type: 'subscription', plan_id: 7 }))
    expect(await screen.findByLabelText('Pending order')).toHaveTextContent('42')
  })

  it('displays the available payment methods and the default selection', async () => {
    await renderCheckout()
    const methods = screen.getByRole('radiogroup', { name: 'payment.paymentMethod' })
    expect(within(methods).getByRole('radio', { name: 'Alipay' })).toBeChecked()
    expect(within(methods).getByRole('radio', { name: 'WeChat Pay' })).not.toBeChecked()
  })

  it('shows the server error and allows retrying a failed payment', async () => {
    const user = userEvent.setup()
    createOrder.mockRejectedValueOnce({ status: 400, message: 'Payment failed' })
    const submit = await renderCheckout()
    await user.click(screen.getByRole('button', { name: '$50' }))
    await user.click(submit)
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Payment failed'))
    expect(createOrder).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveAttribute('aria-disabled', 'true')
    expect(localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY)).toBeNull()
  })

  it('loads active subscriptions on mount', async () => {
    await renderCheckout()
    expect(getActiveSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('uses the selected method for the order', async () => {
    const user = userEvent.setup()
    createOrder.mockResolvedValueOnce({ data: orderResult(10) })
    const submit = await renderCheckout()
    await user.click(screen.getByRole('radio', { name: 'WeChat Pay' }))
    await user.click(screen.getByRole('button', { name: '$10' }))
    await user.click(submit)
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, payment_type: 'wxpay' }))
    expect(await screen.findByLabelText('Pending order')).toHaveTextContent('42')
  })

  it('only offers quick amounts inside the checkout limits', async () => {
    await renderCheckout()
    for (const amount of [10, 20, 50, 100]) {
      expect(screen.getByRole('button', { name: `$${amount}` })).toBeVisible()
    }
    expect(screen.queryByRole('button', { name: '$200' })).not.toBeInTheDocument()
  })
})
