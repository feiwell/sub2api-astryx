import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuthStore, selectIsAuthenticated, selectIsAdmin, selectIsSimpleMode } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { useI18n } from '~/i18n'

export interface RouteMeta {
  /** Defaults to true. */
  requiresAuth?: boolean
  requiresAdmin?: boolean
  requiresPayment?: boolean
  requiresSubscription?: boolean
  /** i18n key for the document title. */
  titleKey?: string
  /** Hidden for simple-mode users (redirects to dashboard). */
  restrictedInSimpleMode?: boolean
}

const BACKEND_MODE_ALLOWED_PATHS = ['/login', '/key-usage', '/setup', '/payment/result', '/payment/airwallex', '/legal']
const BACKEND_MODE_CALLBACK_PATHS = [
  '/auth/callback',
  '/auth/linuxdo/callback',
  '/auth/dingtalk/callback',
  '/auth/dingtalk/email-completion',
  '/auth/oidc/callback',
  '/auth/wechat/callback',
  '/auth/wechat/payment/callback',
]
const BACKEND_MODE_PENDING_AUTH_PATHS = ['/register', '/email-verify']

function isBackendModePublicRouteAllowed(path: string, hasPendingAuthSession: boolean): boolean {
  if (BACKEND_MODE_ALLOWED_PATHS.some((p) => path === p || path.startsWith(p))) return true
  if (BACKEND_MODE_CALLBACK_PATHS.includes(path)) return true
  return hasPendingAuthSession && BACKEND_MODE_PENDING_AUTH_PATHS.includes(path)
}

/**
 * Port of the Vue router's beforeEach guard, applied per route element.
 */
export function RouteGuard({ meta, children }: { meta: RouteMeta; children: ReactNode }) {
  const location = useLocation()
  const { t } = useI18n()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const isAdmin = useAuthStore(selectIsAdmin)
  const isSimpleMode = useAuthStore(selectIsSimpleMode)
  const hasPendingAuthSession = useAuthStore((s) => s.pendingAuthSession !== null)
  const settings = useAppStore((s) => s.publicSettings)
  const settingsLoaded = useAppStore((s) => s.publicSettingsLoaded)
  const siteName = useAppStore((s) => s.siteName)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)
  const needsSettings = !!(meta.requiresPayment || meta.requiresSubscription)
  const [settingsReady, setSettingsReady] = useState(settingsLoaded || !needsSettings)

  useEffect(() => {
    // Only routes with a title set it, so a layout guard never overrides its child page.
    if (meta.titleKey) document.title = `${t(meta.titleKey)} - ${siteName}`
  }, [meta.titleKey, siteName, t])

  useEffect(() => {
    if (settingsReady) return
    void fetchPublicSettings().finally(() => setSettingsReady(true))
  }, [settingsReady, fetchPublicSettings])

  const home = isAdmin ? '/admin/dashboard' : '/dashboard'
  const backendMode = settings?.backend_mode_enabled === true
  const path = location.pathname

  if (meta.requiresAuth === false) {
    if (isAuthenticated && (path === '/login' || path === '/register')) {
      if (backendMode && !isAdmin) return <>{children}</>
      return <Navigate to={home} replace />
    }
    if (backendMode && !isAuthenticated && !isBackendModePublicRouteAllowed(path, hasPendingAuthSession)) {
      return <Navigate to="/login" replace />
    }
    return <>{children}</>
  }

  if (!isAuthenticated) {
    return <Navigate to={{ pathname: '/login', search: `?redirect=${encodeURIComponent(path + location.search)}` }} replace />
  }
  if (meta.requiresAdmin && !isAdmin) return <Navigate to="/dashboard" replace />
  if (!settingsReady) return null
  if (meta.requiresPayment && settings?.payment_enabled === false) return <Navigate to={home} replace />
  if (meta.requiresSubscription && settings?.subscription_enabled === false) return <Navigate to={home} replace />
  if (isSimpleMode && meta.restrictedInSimpleMode) return <Navigate to={home} replace />
  if (backendMode && !isAdmin && !isBackendModePublicRouteAllowed(path, hasPendingAuthSession)) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
