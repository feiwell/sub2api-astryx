import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { PAYMENT_RECOVERY_STORAGE_KEY, type PaymentRecoverySnapshot } from '@/components/payment/paymentFlow'
import { setLocale } from '~/i18n'
import { AIRWALLEX_SDK_URL, loadAirwallexSDK } from '~/lib/airwallexSdk'
import { AirwallexPaymentPage } from './AirwallexPaymentPage'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function captureScripts() {
  const scripts: HTMLScriptElement[] = []
  const append = document.head.appendChild.bind(document.head)
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && node.src === AIRWALLEX_SDK_URL) {
      scripts.push(node)
      return node
    }
    return append(node)
  })
  return scripts
}

function saveIntent(paymentEnv = 'demo', currency = '', countryCode = '') {
  const data: PaymentRecoverySnapshot = {
    orderId: 17, amount: 10, qrCode: '', expiresAt: '', paymentType: 'airwallex', payUrl: '',
    outTradeNo: 'example-order', clientSecret: crypto.randomUUID(), intentId: crypto.randomUUID(),
    currency, countryCode, paymentEnv, payAmount: 10, orderType: 'balance', paymentMode: '',
    resumeToken: crypto.randomUUID(), createdAt: Date.now(),
  }
  localStorage.setItem(PAYMENT_RECOVERY_STORAGE_KEY, JSON.stringify(data))
  return data
}

function openPage() {
  return render(<MemoryRouter initialEntries={['/payment/airwallex?order_id=17']}><AirwallexPaymentPage /></MemoryRouter>)
}

it('shares one pending script and permits a fresh request when the script lacks its SDK', async () => {
  const scripts = captureScripts()
  const first = loadAirwallexSDK()
  expect(loadAirwallexSDK()).toBe(first)
  expect(scripts).toHaveLength(1)
  scripts[0].dispatchEvent(new Event('load'))
  await expect(first).rejects.toThrow()
  const retry = loadAirwallexSDK()
  expect(scripts).toHaveLength(2)
  const sdk = { init: vi.fn() }
  vi.stubGlobal('AirwallexComponentsSDK', sdk)
  scripts[1].dispatchEvent(new Event('load'))
  await expect(retry).resolves.toBe(sdk)
  await expect(loadAirwallexSDK()).resolves.toBe(sdk)
  expect(scripts).toHaveLength(2)
})

it.each([
  ['prod', 'zh', 'USD', 'US', 'USD', 'US'],
  ['demo', 'en', '', '', 'CNY', 'CN'],
])('passes the %s intent and return URL to the hosted checkout', async (env, locale, currency, country, expectedCurrency, expectedCountry) => {
  captureScripts()
  const snapshot = saveIntent(env, currency, country)
  await setLocale(locale)
  const redirectToCheckout = vi.fn()
  const init = vi.fn().mockResolvedValue({ payments: { redirectToCheckout } })
  vi.stubGlobal('AirwallexComponentsSDK', { init })
  openPage()
  await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledOnce())
  expect(init).toHaveBeenCalledWith({ env, enabledElements: ['payments'], locale })
  const resultUrl = new URL('/payment/result', window.location.origin)
  resultUrl.searchParams.set('order_id', '17')
  resultUrl.searchParams.set('out_trade_no', snapshot.outTradeNo)
  resultUrl.searchParams.set('resume_token', snapshot.resumeToken)
  expect(redirectToCheckout).toHaveBeenCalledWith({
    intent_id: snapshot.intentId, client_secret: snapshot.clientSecret,
    currency: expectedCurrency, country_code: expectedCountry, successUrl: resultUrl.href,
  })
})

it.each([['en', 'Retry'], ['zh', '重试']])('shows the %s retry control and reuses the payment intent after a download failure', async (locale, retryLabel) => {
  await setLocale(locale)
  saveIntent()
  const scripts = captureScripts()
  openPage()
  expect(scripts).toHaveLength(1)
  act(() => { scripts[0].dispatchEvent(new Event('error')) })
  fireEvent.click(await screen.findByRole('button', { name: retryLabel }))
  expect(scripts).toHaveLength(2)
  const redirectToCheckout = vi.fn()
  vi.stubGlobal('AirwallexComponentsSDK', { init: vi.fn().mockResolvedValue({ payments: { redirectToCheckout } }) })
  act(() => { scripts[1].dispatchEvent(new Event('load')) })
  await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledOnce())
})

it('keeps the SDK unloaded when checkout cannot restore an intent', async () => {
  await setLocale('en')
  const scripts = captureScripts()
  openPage()
  expect(await screen.findByText('Missing Airwallex payment parameters')).toBeVisible()
  expect(scripts).toHaveLength(0)
})
