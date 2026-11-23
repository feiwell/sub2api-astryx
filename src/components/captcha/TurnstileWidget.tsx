import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useI18n } from '~/i18n'

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' | 'flexible'
}

interface TurnstileAPI {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileAPI
    onTurnstileLoad?: () => void
  }
}

export interface TurnstileHandle {
  reset: () => void
}

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    window.onTurnstileLoad = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Turnstile script'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function TurnstileWidget(props: {
  siteKey: string
  theme?: 'light' | 'dark' | 'auto'
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
  ref?: Ref<TurnstileHandle | null>
}) {
  const { t } = useI18n()
  const { siteKey, theme = 'auto' } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const [loading, setLoading] = useState(true)

  useImperativeHandle(props.ref, () => ({
    reset() {
      if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current)
    },
  }))

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return
        containerRef.current.innerHTML = ''
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => callbacks.current.onVerify(token),
          'expired-callback': () => callbacks.current.onExpire?.(),
          'error-callback': () => callbacks.current.onError?.(),
          theme,
          size: 'flexible',
        })
      })
      .catch((error) => {
        console.error('Failed to initialize Turnstile:', error)
        callbacks.current.onError?.()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
        widgetIdRef.current = null
      }
    }
  }, [siteKey, theme])

  if (!siteKey) return null
  return (
    <div className="captcha-turnstile">
      {loading && (
        <div role="status" className="captcha-placeholder">
          {t('auth.captchaLoading')}
        </div>
      )}
      <div ref={containerRef} />
    </div>
  )
}
