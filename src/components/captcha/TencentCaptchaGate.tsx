import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import {
  loadTencentCaptcha,
  normalizeTencentCaptchaRegion,
  type TencentCaptchaProof,
  type TencentCaptchaResult,
} from '@/utils/tencentCaptcha'
import { getLocale } from '~/i18n'

export interface TencentCaptchaHandle {
  verify: () => Promise<TencentCaptchaProof | null>
  reset: (reinitialize?: boolean) => void
}

// The international ticket is valid for 5 minutes; drop cached ones a minute early.
const CACHED_PROOF_MAX_AGE_MS = 4 * 60 * 1000
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * React port of TencentCaptchaGate.vue. The mainland ("cn") flavour pops a
 * modal on demand; the international flavour renders a checkbox inline and
 * pre-verifies so the ticket is ready when the form submits.
 */
export function TencentCaptchaGate(props: { appId: string; region?: string; ref?: Ref<TencentCaptchaHandle | null> }) {
  const region = normalizeTencentCaptchaRegion(props.region ?? 'cn')
  const isInternational = region === 'intl'
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerVisible, setContainerVisible] = useState(isInternational)

  const st = useRef({
    instance: null as { show(): void; destroy(): void } | null,
    pending: null as Promise<TencentCaptchaProof | null> | null,
    cancelPending: null as (() => void) | null,
    cachedProof: null as TencentCaptchaProof | null,
    cachedAt: 0,
    mounted: false,
  })

  function createVerification(): Promise<TencentCaptchaProof | null> {
    const s = st.current
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (cb: () => void, keepContainer = false) => {
        if (settled) return
        settled = true
        if (s.cancelPending === cancel) s.cancelPending = null
        if (!keepContainer) {
          s.instance?.destroy()
          s.instance = null
          setContainerVisible(false)
        }
        cb()
      }
      const cancel = () => finish(() => resolve(null))
      s.cancelPending = cancel
      if (isInternational) setContainerVisible(true)

      void nextFrame()
        .then(() => loadTencentCaptcha(region))
        .then((TencentCaptcha) => {
          if (s.cancelPending !== cancel) return
          const userLanguage = getLocale().startsWith('zh') ? 'zh-cn' : 'en'
          const handleResult = (result: TencentCaptchaResult) => {
            if (result.ret === 2) {
              finish(() => resolve(null))
              return
            }
            const ticket = result.ticket?.trim() || ''
            const randstr = result.randstr?.trim() || ''
            if (!ticket || !randstr || ticket.startsWith('trerror_') || result.errorCode !== undefined) {
              finish(() => reject(new Error('Tencent Captcha verification failed')))
              return
            }
            finish(() => resolve({ ticket, randstr }), isInternational)
          }
          if (isInternational) {
            const container = containerRef.current
            if (!container) throw new Error('Tencent Captcha international container is unavailable')
            s.instance = new TencentCaptcha(container, props.appId, handleResult, {
              enableAutoCheck: false,
              userLanguage,
              type: 'popup',
            })
          } else {
            s.instance = new TencentCaptcha(props.appId, handleResult, { userLanguage })
          }
          s.instance.show()
        })
        .catch((error: unknown) => finish(() => reject(error)))
    })
  }

  function reset(reinitialize = true) {
    const s = st.current
    s.instance?.destroy()
    s.instance = null
    s.cancelPending?.()
    s.cancelPending = null
    s.pending = null
    s.cachedProof = null
    s.cachedAt = 0
    setContainerVisible(isInternational)
    if (reinitialize && s.mounted && isInternational) {
      void nextFrame().then(() => {
        if (st.current.mounted) preload()
      })
    }
  }

  function preload() {
    const s = st.current
    if (!isInternational || s.pending || s.cachedProof) return
    const verification = createVerification()
    s.pending = verification
    void verification
      .then((proof) => {
        if (proof) {
          s.cachedProof = proof
          s.cachedAt = Date.now()
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (s.pending === verification) s.pending = null
      })
  }

  function verify(): Promise<TencentCaptchaProof | null> {
    const s = st.current
    if (s.cachedProof) {
      if (Date.now() - s.cachedAt >= CACHED_PROOF_MAX_AGE_MS) {
        reset(false)
      } else {
        const proof = s.cachedProof
        s.cachedProof = null
        s.cachedAt = 0
        s.pending = null
        return Promise.resolve(proof)
      }
    }
    if (s.pending) {
      const verification = s.pending
      setContainerVisible(true)
      void nextFrame().then(() => {
        if (st.current.pending === verification) st.current.instance?.show()
      })
      return verification.then((proof) => {
        if (st.current.cachedProof === proof) {
          st.current.cachedProof = null
          st.current.cachedAt = 0
        }
        return proof
      })
    }
    setContainerVisible(true)
    const verification = createVerification()
    s.pending = verification
    const clear = () => {
      if (st.current.pending === verification) st.current.pending = null
    }
    void verification.then(clear, clear)
    return verification
  }

  useImperativeHandle(props.ref, () => ({ verify, reset }))

  useEffect(() => {
    st.current.mounted = true
    preload()
    return () => {
      st.current.mounted = false
      reset(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.appId, region])

  if (!isInternational) return null
  return (
    <div
      ref={containerRef}
      className={containerVisible ? 'captcha-tencent-intl' : 'captcha-tencent-intl captcha-tencent-intl--hidden'}
    />
  )
}
