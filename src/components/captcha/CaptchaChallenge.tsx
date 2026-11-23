import { useImperativeHandle, useRef, type Ref } from 'react'
import type { PublicSettings } from '@/types'
import { TurnstileWidget, type TurnstileHandle } from './TurnstileWidget'
import { TencentCaptchaGate, type TencentCaptchaHandle } from './TencentCaptchaGate'
import { AliyunCaptchaWidget, type AliyunCaptchaHandle } from './AliyunCaptchaWidget'
import { useAppStore } from '~/stores/app'

/** Result of an action-triggered captcha (Tencent / Aliyun popup). */
export interface ActionCaptchaResult {
  token: string
  randstr: string
}

export interface CaptchaChallengeHandle {
  reset: () => void
  /** Pops the active action captcha. Resolves null when dismissed. */
  verifyAction: () => Promise<ActionCaptchaResult | null>
}

export interface CaptchaConfig {
  turnstileEnabled: boolean
  turnstileSiteKey: string
  tencentEnabled: boolean
  tencentAppId: string
  tencentRegion: string
  aliyunEnabled: boolean
  aliyunSceneId: string
  aliyunPrefix: string
  aliyunRegion: string
  /** Any captcha is configured. */
  enabled: boolean
  /** Tencent or Aliyun (popup on submit) is configured. */
  actionEnabled: boolean
}

export function captchaConfigFromSettings(settings: Partial<PublicSettings> | null | undefined): CaptchaConfig {
  const s = (settings ?? {}) as Partial<PublicSettings> & Record<string, unknown>
  const turnstileEnabled = s.turnstile_enabled === true
  const turnstileSiteKey = String(s.turnstile_site_key || '')
  const tencentEnabled = s.tencent_captcha_enabled === true
  const tencentAppId = String(s.tencent_captcha_app_id || '')
  const aliyunEnabled = s.aliyun_captcha_enabled === true
  const aliyunSceneId = String(s.aliyun_captcha_scene_id || '')
  const aliyunPrefix = String(s.aliyun_captcha_prefix || '')
  const actionEnabled = (tencentEnabled && !!tencentAppId) || (aliyunEnabled && !!aliyunSceneId && !!aliyunPrefix)
  return {
    turnstileEnabled,
    turnstileSiteKey,
    tencentEnabled,
    tencentAppId,
    tencentRegion: String(s.tencent_captcha_region || 'cn'),
    aliyunEnabled,
    aliyunSceneId,
    aliyunPrefix,
    aliyunRegion: String(s.aliyun_captcha_region || 'cn'),
    enabled: (turnstileEnabled && !!turnstileSiteKey) || actionEnabled,
    actionEnabled,
  }
}

/** React port of CaptchaChallenge.vue: renders whichever captcha is configured. */
export function CaptchaChallenge(props: {
  config: CaptchaConfig
  onVerify: (token: string, randstr: string) => void
  onExpire: () => void
  onError: () => void
  ref?: Ref<CaptchaChallengeHandle | null>
}) {
  const { config } = props
  const colorMode = useAppStore((s) => s.colorMode)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const tencentRef = useRef<TencentCaptchaHandle>(null)
  const aliyunRef = useRef<AliyunCaptchaHandle>(null)

  useImperativeHandle(props.ref, () => ({
    reset() {
      turnstileRef.current?.reset()
      tencentRef.current?.reset()
      aliyunRef.current?.reset()
    },
    async verifyAction() {
      if (config.tencentEnabled && config.tencentAppId) {
        try {
          const proof = (await tencentRef.current?.verify()) ?? null
          return proof ? { token: proof.ticket, randstr: proof.randstr } : null
        } catch {
          props.onError()
          return null
        }
      }
      if (config.aliyunEnabled && config.aliyunSceneId && config.aliyunPrefix) {
        try {
          const param = (await aliyunRef.current?.verify()) ?? null
          return param ? { token: param, randstr: '' } : null
        } catch {
          props.onError()
          return null
        }
      }
      return null
    },
  }))

  if (config.turnstileEnabled && config.turnstileSiteKey) {
    return (
      <TurnstileWidget
        ref={turnstileRef}
        siteKey={config.turnstileSiteKey}
        theme={colorMode}
        onVerify={(token) => props.onVerify(token, '')}
        onExpire={props.onExpire}
        onError={props.onError}
      />
    )
  }
  if (config.tencentEnabled && config.tencentAppId) {
    return <TencentCaptchaGate ref={tencentRef} appId={config.tencentAppId} region={config.tencentRegion} />
  }
  if (config.aliyunEnabled && config.aliyunSceneId && config.aliyunPrefix) {
    return (
      <AliyunCaptchaWidget
        ref={aliyunRef}
        sceneId={config.aliyunSceneId}
        prefix={config.aliyunPrefix}
        region={config.aliyunRegion === 'sgp' ? 'sgp' : 'cn'}
        onVerify={(param) => props.onVerify(param, '')}
        onError={props.onError}
      />
    )
  }
  return null
}
