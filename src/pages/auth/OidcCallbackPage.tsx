import { PendingOAuthCallback } from '~/components/auth/PendingOAuthCallback'

/** React port of views/auth/OidcCallbackView.vue. */
export function OidcCallbackPage() {
  return <PendingOAuthCallback provider="oidc" />
}
