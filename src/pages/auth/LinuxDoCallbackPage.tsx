import { PendingOAuthCallback } from '~/components/auth/PendingOAuthCallback'

/** React port of views/auth/LinuxDoCallbackView.vue. */
export function LinuxDoCallbackPage() {
  return <PendingOAuthCallback provider="linuxdo" />
}
