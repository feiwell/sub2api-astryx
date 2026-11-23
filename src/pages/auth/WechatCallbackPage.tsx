import { PendingOAuthCallback } from '~/components/auth/PendingOAuthCallback'

/** React port of views/auth/WechatCallbackView.vue. */
export function WechatCallbackPage() {
  return <PendingOAuthCallback provider="wechat" />
}
