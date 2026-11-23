import { PendingOAuthCallback } from '~/components/auth/PendingOAuthCallback'

/** React port of views/auth/DingTalkCallbackView.vue. */
export function DingTalkCallbackPage() {
  return <PendingOAuthCallback provider="dingtalk" />
}
