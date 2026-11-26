import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useI18n, getLocale } from '~/i18n'
import { Button } from '@astryxdesign/core/Button'

interface AliyunCaptchaInitOptions {
  SceneId: string
  prefix: string
  mode: 'popup' | 'embed'
  element: string
  button: string
  captchaVerifyCallback: (param: string) => { captchaResult: boolean; bizResult?: boolean }
  onBizResultCallback: (bizResult: boolean) => void
  getInstance: (instance: unknown) => void
  slideStyle?: { width: number; height: number }
  language?: string
}

declare global {
  interface Window {
    initAliyunCaptcha?: (options: AliyunCaptchaInitOptions) => void
    AliyunCaptchaConfig?: { region: string; prefix: string }
  }
}

export interface AliyunCaptchaHandle {
  verify: () => Promise<string | null>
  reset: () => void
}

const SCRIPT_SRC = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'
const POPUP_ID = 'aliyunCaptcha-window-popup'
const MASK_ID = 'aliyunCaptcha-mask'
const POPUP_OPEN_TIMEOUT_MS = 8000
const POPUP_WATCH_INTERVAL_MS = 300

function loadScript(region: string, prefix: string): Promise<void> {
  return new Promise((resolve, reject) => {
    window.AliyunCaptchaConfig = { region, prefix }
    if (window.initAliyunCaptcha) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>('script[src*="aliyunCaptcha/AliyunCaptcha"]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Aliyun captcha script')))
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Aliyun captcha script'))
    document.head.appendChild(script)
  })
}

type CaptchaState = 'idle' | 'verifying' | 'verified'

/**
 * React port of AliyunCaptchaWidget.vue. The SDK binds to a native trigger
 * button by id, so the Astryx button keeps a stable DOM id.
 */
export function AliyunCaptchaWidget(props: {
  sceneId: string
  prefix: string
  region?: 'cn' | 'sgp'
  onVerify?: (param: string) => void
  onError?: () => void
  ref?: Ref<AliyunCaptchaHandle | null>
}) {
  const { t } = useI18n()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const buttonId = `aliyun-captcha-button-${uid}`
  const elementId = `aliyun-captcha-element-${uid}`
  const [state, setStateValue] = useState<CaptchaState>('idle')
  const callbacks = useRef(props)
  callbacks.current = props

  const s = useRef({
    state: 'idle' as CaptchaState,
    cachedParam: null as string | null,
    pending: null as { resolve: (v: string | null) => void } | null,
    timer: null as number | null,
    ready: null as Promise<void> | null,
  })

  const setState = (next: CaptchaState) => {
    s.current.state = next
    setStateValue(next)
  }

  function stopWatch() {
    if (s.current.timer !== null) {
      window.clearInterval(s.current.timer)
      s.current.timer = null
    }
  }

  function settle(value: string | null) {
    const current = s.current.pending
    s.current.pending = null
    current?.resolve(value)
  }

  function onParam(param: string) {
    stopWatch()
    s.current.cachedParam = param
    setState('verified')
    callbacks.current.onVerify?.(param)
    settle(param)
  }

  function isPopupVisible() {
    const popup = document.getElementById(POPUP_ID)
    return !!popup && window.getComputedStyle(popup).display !== 'none'
  }

  function startWatch() {
    stopWatch()
    const startedAt = Date.now()
    let seen = false
    s.current.timer = window.setInterval(() => {
      if (s.current.state === 'verified') {
        stopWatch()
        return
      }
      if (isPopupVisible()) {
        seen = true
        return
      }
      if (seen || Date.now() - startedAt > POPUP_OPEN_TIMEOUT_MS) {
        stopWatch()
        setState('idle')
        settle(null)
        return
      }
      document.getElementById(buttonId)?.click()
    }, POPUP_WATCH_INTERVAL_MS)
  }

  function ensureReady(): Promise<void> {
    if (!s.current.ready) {
      const { region = 'cn', prefix, sceneId } = callbacks.current
      s.current.ready = loadScript(region, prefix).then(() => {
        if (!window.initAliyunCaptcha) throw new Error('Aliyun captcha script not ready')
        window.initAliyunCaptcha({
          SceneId: sceneId,
          prefix,
          mode: 'popup',
          element: `#${elementId}`,
          button: `#${buttonId}`,
          captchaVerifyCallback: (param) => {
            onParam(param)
            return { captchaResult: true }
          },
          onBizResultCallback: () => {},
          getInstance: () => {},
          slideStyle: { width: 360, height: 40 },
          language: getLocale().startsWith('zh') ? 'cn' : 'en',
        })
      })
      s.current.ready.catch(() => {
        s.current.ready = null
      })
    }
    return s.current.ready
  }

  function handleTriggerClick() {
    if (s.current.state === 'verified') return
    setState('verifying')
    if (s.current.timer === null) startWatch()
  }

  useImperativeHandle(props.ref, () => ({
    async verify() {
      if (s.current.state === 'verified' && s.current.cachedParam) return s.current.cachedParam
      settle(null)
      await ensureReady()
      return new Promise<string | null>((resolve) => {
        s.current.pending = { resolve }
        document.getElementById(buttonId)?.click()
      })
    },
    reset() {
      stopWatch()
      settle(null)
      s.current.cachedParam = null
      setState('idle')
    },
  }))

  useEffect(() => {
    if (!props.sceneId || !props.prefix) return
    const button = document.getElementById(buttonId)
    button?.addEventListener('click', handleTriggerClick)
    ensureReady().catch((error) => {
      console.error('Failed to initialize Aliyun captcha:', error)
      callbacks.current.onError?.()
    })
    return () => {
      button?.removeEventListener('click', handleTriggerClick)
      stopWatch()
      settle(null)
      document.getElementById(MASK_ID)?.remove()
      document.getElementById(POPUP_ID)?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sceneId, props.prefix])

  useEffect(() => {
    const button = document.getElementById(buttonId) as HTMLButtonElement | null
    if (button) button.disabled = state === 'verified'
  }, [buttonId, props.sceneId, props.prefix, state])

  if (!props.sceneId || !props.prefix) return null
  const label =
    state === 'verified'
      ? t('auth.captchaVerified')
      : state === 'verifying'
        ? t('auth.captchaVerifying')
        : t('auth.captchaClickToVerify')
  return (
    <div className="captcha-aliyun">
      <Button
        id={buttonId}
        label={label}
        type="button"
        className={state === 'verified' ? 'captcha-aliyun__button is-verified' : 'captcha-aliyun__button'}
        isDisabled={state === 'verified'}
      >
        <span aria-hidden="true">{state === 'verified' ? '✓' : '🛡'}</span>
        <span>{label}</span>
      </Button>
      <div id={elementId} />
    </div>
  )
}
