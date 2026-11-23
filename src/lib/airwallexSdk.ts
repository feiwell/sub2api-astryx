export const AIRWALLEX_SDK_URL = 'https://static.airwallex.com/components/sdk/v1/index.js'

interface CheckoutOptions {
  intent_id: string
  client_secret: string
  currency: string
  country_code: string
  successUrl: string
}

export interface AirwallexSDK {
  init(options: { env: 'prod' | 'demo'; enabledElements: ['payments']; locale: 'zh' | 'en' }): Promise<{
    payments?: { redirectToCheckout(options: CheckoutOptions): void | string | Promise<void | string> }
  }>
}

declare global {
  interface Window { AirwallexComponentsSDK?: AirwallexSDK }
}

let pending: Promise<AirwallexSDK> | undefined

/** Load the publisher's browser SDK when a valid checkout is ready. Concurrent visits share the request. */
export function loadAirwallexSDK(): Promise<AirwallexSDK> {
  const ready = window.AirwallexComponentsSDK
  if (typeof ready?.init === 'function') return Promise.resolve(ready)
  if (pending) return pending

  const script = document.createElement('script')
  script.async = true
  script.src = AIRWALLEX_SDK_URL
  const attempt = new Promise<AirwallexSDK>((resolve, reject) => {
    const fail = () => reject(new Error('Airwallex checkout could not be loaded.'))
    script.onerror = fail
    script.onload = () => {
      const sdk = window.AirwallexComponentsSDK
      if (typeof sdk?.init === 'function') resolve(sdk)
      else fail()
    }
    document.head.appendChild(script)
  })
  let timeout: number
  const deadline = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error('Airwallex checkout timed out.')), 20_000)
  })
  pending = Promise.race([attempt, deadline]).catch((error: unknown) => {
    script.remove()
    throw error
  }).finally(() => {
    clearTimeout(timeout)
    script.onload = null
    script.onerror = null
    pending = undefined
  })
  return pending
}
