import {
  isValidElement,
  lazy as reactLazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { AppLayout } from '~/layouts/AppLayout'
import { RouteGuard, type RouteMeta } from '~/router/RouteGuard'
import { registerPageCode } from '~/router/pageCode'
import { AdminComplianceGate } from '~/components/admin/AdminComplianceGate'

const pageLoads = new WeakMap<object, () => Promise<unknown>>()

/**
 * React's `lazy`, which here also remembers how the code of each page is fetched, so that the side
 * nav can fetch it before the page is shown (see pageCode.ts).
 */
function lazy<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  const Page = reactLazy(load)
  pageLoads.set(Page, load)
  return Page
}

// Auth pages
const LoginPage = lazy(() => import('~/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('~/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('~/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('~/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const EmailVerifyPage = lazy(() => import('~/pages/auth/EmailVerifyPage').then((m) => ({ default: m.EmailVerifyPage })))
const OAuthCallbackPage = lazy(() => import('~/pages/auth/OAuthCallbackPage').then((m) => ({ default: m.OAuthCallbackPage })))
const DingTalkCallbackPage = lazy(() => import('~/pages/auth/DingTalkCallbackPage').then((m) => ({ default: m.DingTalkCallbackPage })))
const LinuxDoCallbackPage = lazy(() => import('~/pages/auth/LinuxDoCallbackPage').then((m) => ({ default: m.LinuxDoCallbackPage })))
const OidcCallbackPage = lazy(() => import('~/pages/auth/OidcCallbackPage').then((m) => ({ default: m.OidcCallbackPage })))
const WechatCallbackPage = lazy(() => import('~/pages/auth/WechatCallbackPage').then((m) => ({ default: m.WechatCallbackPage })))
const WechatPaymentCallbackPage = lazy(() => import('~/pages/auth/WechatPaymentCallbackPage').then((m) => ({ default: m.WechatPaymentCallbackPage })))
const DingTalkEmailCompletionPage = lazy(() => import('~/pages/auth/DingTalkEmailCompletionPage').then((m) => ({ default: m.DingTalkEmailCompletionPage })))
const MCPOAuthAuthorizePage = lazy(() => import('~/pages/auth/MCPOAuthAuthorizePage').then((m) => ({ default: m.MCPOAuthAuthorizePage })))

// User pages
const DashboardPage = lazy(() => import('~/pages/user/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const KeysPage = lazy(() => import('~/pages/user/KeysPage').then((m) => ({ default: m.KeysPage })))
const UsagePage = lazy(() => import('~/pages/user/UsagePage').then((m) => ({ default: m.UsagePage })))
const ChannelsPage = lazy(() => import('~/pages/user/ChannelsPage').then((m) => ({ default: m.ChannelsPage })))
const MonitorPage = lazy(() => import('~/pages/user/MonitorPage').then((m) => ({ default: m.MonitorPage })))
const ProfilePage = lazy(() => import('~/pages/user/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const OrdersPage = lazy(() => import('~/pages/user/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const RedemptionPage = lazy(() => import('~/pages/user/RedemptionPage').then((m) => ({ default: m.RedemptionPage })))
const AffiliatePage = lazy(() => import('~/pages/user/AffiliatePage').then((m) => ({ default: m.AffiliatePage })))
const PurchasePage = lazy(() => import('~/pages/user/PurchasePage').then((m) => ({ default: m.PurchasePage })))
const SubscriptionsPage = lazy(() => import('~/pages/user/SubscriptionsPage').then((m) => ({ default: m.SubscriptionsPage })))
const MCPPage = lazy(() => import('~/pages/user/MCPPage').then((m) => ({ default: m.MCPPage })))
const PaymentQRCodePage = lazy(() => import('~/pages/user/PaymentQRCodePage').then((m) => ({ default: m.PaymentQRCodePage })))
const PaymentResultPage = lazy(() => import('~/pages/user/PaymentResultPage').then((m) => ({ default: m.PaymentResultPage })))
const StripePaymentPage = lazy(() => import('~/pages/user/StripePaymentPage').then((m) => ({ default: m.StripePaymentPage })))
const StripePopupPage = lazy(() => import('~/pages/user/StripePopupPage').then((m) => ({ default: m.StripePopupPage })))
const AirwallexPaymentPage = lazy(() => import('~/pages/user/AirwallexPaymentPage').then((m) => ({ default: m.AirwallexPaymentPage })))
const CustomPagePage = lazy(() => import('~/pages/user/CustomPagePage').then((m) => ({ default: m.CustomPagePage })))
const BatchImagePage = lazy(() => import('~/pages/user/BatchImagePage').then((m) => ({ default: m.BatchImagePage })))

// Public pages
const HomePage = lazy(() => import('~/pages/public/HomePage').then((m) => ({ default: m.HomePage })))
const ModelPlazaPage = lazy(() => import('~/pages/public/ModelPlazaPage').then((m) => ({ default: m.ModelPlazaPage })))
const KeyUsagePage = lazy(() => import('~/pages/public/KeyUsagePage').then((m) => ({ default: m.KeyUsagePage })))
const NotFoundPage = lazy(() => import('~/pages/public/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const LegalDocumentPage = lazy(() => import('~/pages/public/LegalDocumentPage').then((m) => ({ default: m.LegalDocumentPage })))
const SetupWizardPage = lazy(() => import('~/pages/public/SetupWizardPage').then((m) => ({ default: m.SetupWizardPage })))

// Admin pages
const AdminDashboardPage = lazy(() => import('~/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminAccountsPage = lazy(() => import('~/pages/admin/AdminAccountsPage').then((m) => ({ default: m.AdminAccountsPage })))
const AdminChannelsPage = lazy(() => import('~/pages/admin/AdminChannelsPage').then((m) => ({ default: m.AdminChannelsPage })))
const AdminGroupsPage = lazy(() => import('~/pages/admin/AdminGroupsPage').then((m) => ({ default: m.AdminGroupsPage })))
const AdminUsagePage = lazy(() => import('~/pages/admin/AdminUsagePage').then((m) => ({ default: m.AdminUsagePage })))
const AdminUsersPage = lazy(() => import('~/pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminProxiesPage = lazy(() => import('~/pages/admin/AdminProxiesPage').then((m) => ({ default: m.AdminProxiesPage })))
const AdminRedeemPage = lazy(() => import('~/pages/admin/AdminRedeemPage').then((m) => ({ default: m.AdminRedeemPage })))
const AdminSubscriptionsPage = lazy(() => import('~/pages/admin/AdminSubscriptionsPage').then((m) => ({ default: m.AdminSubscriptionsPage })))
const AdminRiskControlPage = lazy(() => import('~/pages/admin/AdminRiskControlPage').then((m) => ({ default: m.AdminRiskControlPage })))
const AdminSettingsPage = lazy(() => import('~/pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })))
const AdminChannelMonitorPage = lazy(() => import('~/pages/admin/AdminChannelMonitorPage'))
const AdminAnnouncementsPage = lazy(() => import('~/pages/admin/AdminAnnouncementsPage'))
const AdminAuditLogPage = lazy(() => import('~/pages/admin/AdminAuditLogPage'))
const AdminBackupPage = lazy(() => import('~/pages/admin/AdminBackupPage').then((m) => ({ default: m.AdminBackupPage })))
const AdminPluginsPage = lazy(() => import('~/pages/admin/AdminPluginsPage'))
const AdminPromoCodesPage = lazy(() => import('~/pages/admin/AdminPromoCodesPage'))
const AdminOpsDashboardPage = lazy(() => import('~/pages/admin/AdminOpsDashboardPage').then((m) => ({ default: m.AdminOpsDashboardPage })))
const AdminPromptAuditPage = lazy(() => import('~/pages/admin/AdminPromptAuditPage').then((m) => ({ default: m.AdminPromptAuditPage })))
const AdminOrdersPage = lazy(() => import('~/pages/admin/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })))
const AdminOrdersDashboardPage = lazy(() => import('~/pages/admin/AdminOrdersDashboardPage').then((m) => ({ default: m.AdminOrdersDashboardPage })))
const AdminPaymentPlansPage = lazy(() => import('~/pages/admin/AdminPaymentPlansPage').then((m) => ({ default: m.AdminPaymentPlansPage })))
const AdminAffiliateInvitesPage = lazy(() => import('~/pages/admin/AdminAffiliateInvitesPage').then((m) => ({ default: m.AdminAffiliateInvitesPage })))
const AdminAffiliateRebatesPage = lazy(() => import('~/pages/admin/AdminAffiliateRebatesPage').then((m) => ({ default: m.AdminAffiliateRebatesPage })))
const AdminAffiliateTransfersPage = lazy(() => import('~/pages/admin/AdminAffiliateTransfersPage').then((m) => ({ default: m.AdminAffiliateTransfersPage })))

function Loading() {
  return (
    <Center axis="both" padding={8} style={{ minHeight: '60vh' }}>
      <Spinner />
    </Center>
  )
}

function guarded(meta: RouteMeta, element: ReactNode) {
  return (
    <RouteGuard meta={meta}>
      <Suspense fallback={<Loading />}>{element}</Suspense>
    </RouteGuard>
  )
}

const publicMeta = (titleKey?: string): RouteMeta => ({ requiresAuth: false, titleKey })

/** User console routes (same paths and access rules as frontend/src/router/index.ts). */
const userRoutes: Array<{ path: string; meta: RouteMeta; element: ReactNode }> = [
  { path: '/dashboard', meta: { titleKey: 'nav.dashboard' }, element: <DashboardPage /> },
  { path: '/keys', meta: { titleKey: 'nav.apiKeys' }, element: <KeysPage /> },
  { path: '/batch-image', meta: { titleKey: 'nav.batchImage' }, element: <BatchImagePage /> },
  { path: '/docs/batch-image', meta: { titleKey: 'nav.batchImage' }, element: <BatchImagePage /> },
  { path: '/usage', meta: { titleKey: 'nav.usage' }, element: <UsagePage /> },
  { path: '/redeem', meta: { titleKey: 'nav.redeem', restrictedInSimpleMode: true }, element: <RedemptionPage /> },
  { path: '/affiliate', meta: { titleKey: 'nav.affiliate' }, element: <AffiliatePage /> },
  { path: '/available-channels', meta: { titleKey: 'nav.availableChannels' }, element: <ChannelsPage /> },
  { path: '/monitor', meta: { titleKey: 'nav.channelStatus' }, element: <MonitorPage /> },
  { path: '/settings/mcp', meta: { titleKey: 'mcp.title' }, element: <MCPPage /> },
  { path: '/profile', meta: { titleKey: 'nav.profile' }, element: <ProfilePage /> },
  {
    path: '/subscriptions',
    meta: { titleKey: 'nav.mySubscriptions', requiresSubscription: true, restrictedInSimpleMode: true },
    element: <SubscriptionsPage />,
  },
  { path: '/purchase', meta: { titleKey: 'nav.buySubscription', requiresPayment: true }, element: <PurchasePage /> },
  { path: '/orders', meta: { titleKey: 'nav.myOrders', requiresPayment: true }, element: <OrdersPage /> },
  { path: '/payment/qrcode', meta: { titleKey: 'payment.qr.scanToPay', requiresPayment: true }, element: <PaymentQRCodePage /> },
  { path: '/custom/:id', meta: {}, element: <CustomPagePage /> },
]

/** Admin routes */
const adminRoutes: Array<{ path: string; meta: RouteMeta; element: ReactNode }> = [
  { path: '/admin/dashboard', meta: { titleKey: 'admin.dashboard.title', requiresAdmin: true }, element: <AdminDashboardPage /> },
  { path: '/admin', meta: { requiresAdmin: true, titleKey: 'admin.dashboard.title' }, element: <Navigate to="/admin/dashboard" replace /> },
  { path: '/admin/ops', meta: { titleKey: 'admin.ops.title', requiresAdmin: true }, element: <AdminOpsDashboardPage /> },
  { path: '/admin/usage', meta: { titleKey: 'admin.usage.title', requiresAdmin: true }, element: <AdminUsagePage /> },
  { path: '/admin/users', meta: { titleKey: 'admin.users.title', requiresAdmin: true }, element: <AdminUsersPage /> },
  { path: '/admin/accounts', meta: { titleKey: 'admin.accounts.title', requiresAdmin: true }, element: <AdminAccountsPage /> },
  { path: '/admin/groups', meta: { titleKey: 'admin.groups.title', requiresAdmin: true }, element: <AdminGroupsPage /> },
  { path: '/admin/channels', meta: { titleKey: 'admin.channels.title', requiresAdmin: true }, element: <AdminChannelsPage /> },
  { path: '/admin/channels/pricing', meta: { titleKey: 'admin.channels.title', requiresAdmin: true }, element: <AdminChannelsPage /> },
  { path: '/admin/channels/monitor', meta: { titleKey: 'admin.channelMonitor.title', requiresAdmin: true }, element: <AdminChannelMonitorPage /> },
  { path: '/admin/proxies', meta: { titleKey: 'admin.proxies.title', requiresAdmin: true }, element: <AdminProxiesPage /> },
  { path: '/admin/redeem', meta: { titleKey: 'admin.redeem.title', requiresAdmin: true }, element: <AdminRedeemPage /> },
  { path: '/admin/subscriptions', meta: { titleKey: 'admin.subscriptions.title', requiresAdmin: true }, element: <AdminSubscriptionsPage /> },
  { path: '/admin/risk-control', meta: { titleKey: 'admin.riskControl.title', requiresAdmin: true }, element: <AdminRiskControlPage /> },
  { path: '/admin/channel-monitor', meta: { titleKey: 'admin.channelMonitor.title', requiresAdmin: true }, element: <AdminChannelMonitorPage /> },
  { path: '/admin/announcements', meta: { titleKey: 'admin.announcements.title', requiresAdmin: true }, element: <AdminAnnouncementsPage /> },
  { path: '/admin/audit-log', meta: { titleKey: 'admin.audit.title', requiresAdmin: true }, element: <AdminAuditLogPage /> },
  { path: '/admin/audit-logs', meta: { titleKey: 'admin.audit.title', requiresAdmin: true }, element: <AdminAuditLogPage /> },
  { path: '/admin/prompt-audit', meta: { titleKey: 'admin.promptAudit.title', requiresAdmin: true }, element: <AdminPromptAuditPage /> },
  { path: '/admin/affiliates', meta: { requiresAdmin: true, titleKey: 'admin.affiliates.title' }, element: <Navigate to="/admin/affiliates/invites" replace /> },
  { path: '/admin/affiliates/invites', meta: { titleKey: 'admin.affiliates.invites.title', requiresAdmin: true }, element: <AdminAffiliateInvitesPage /> },
  { path: '/admin/affiliates/rebates', meta: { titleKey: 'admin.affiliates.rebates.title', requiresAdmin: true }, element: <AdminAffiliateRebatesPage /> },
  { path: '/admin/affiliates/transfers', meta: { titleKey: 'admin.affiliates.transfers.title', requiresAdmin: true }, element: <AdminAffiliateTransfersPage /> },
  { path: '/admin/orders/dashboard', meta: { titleKey: 'admin.orders.dashboard.title', requiresAdmin: true }, element: <AdminOrdersDashboardPage /> },
  { path: '/admin/orders/plans', meta: { titleKey: 'admin.orders.plans.title', requiresAdmin: true }, element: <AdminPaymentPlansPage /> },
  { path: '/admin/orders', meta: { titleKey: 'admin.orders.title', requiresAdmin: true }, element: <AdminOrdersPage /> },
  { path: '/admin/backup', meta: { titleKey: 'admin.backup.title', requiresAdmin: true }, element: <AdminBackupPage /> },
  { path: '/admin/plugins', meta: { titleKey: 'admin.plugins.title', requiresAdmin: true }, element: <AdminPluginsPage /> },
  { path: '/admin/promo-codes', meta: { titleKey: 'admin.promo.title', requiresAdmin: true }, element: <AdminPromoCodesPage /> },
  { path: '/admin/settings', meta: { titleKey: 'admin.settings.title', requiresAdmin: true }, element: <AdminSettingsPage /> },
  { path: '/admin/*', meta: { requiresAdmin: true }, element: <NotFoundPage /> },
]

/** A route inside the app shell. The code of its page is registered, for the side nav to fetch early. */
function shellRoute(route: { path: string; meta: RouteMeta; element: ReactNode }) {
  const page = isValidElement(route.element) && typeof route.element.type !== 'string' ? route.element.type : undefined
  const load = page && pageLoads.get(page)
  if (load) registerPageCode(route.path, load)
  return { path: route.path, element: guarded(route.meta, route.element) }
}

export const router = createBrowserRouter([
  // Public routes
  { path: '/', element: guarded(publicMeta(), <HomePage />) },
  { path: '/home', element: guarded(publicMeta(), <HomePage />) },
  { path: '/model-plaza', element: guarded(publicMeta('nav.modelPlaza'), <ModelPlazaPage />) },
  { path: '/key-usage', element: guarded(publicMeta('keyUsage.title'), <KeyUsagePage />) },
  { path: '/legal/:documentId', element: guarded(publicMeta(), <LegalDocumentPage />) },
  { path: '/setup', element: guarded(publicMeta('setup.title'), <SetupWizardPage />) },

  // Auth routes
  { path: '/login', element: guarded(publicMeta('auth.signIn'), <LoginPage />) },
  { path: '/register', element: guarded(publicMeta('auth.signUp'), <RegisterPage />) },
  { path: '/forgot-password', element: guarded(publicMeta('auth.forgotPasswordTitle'), <ForgotPasswordPage />) },
  { path: '/reset-password', element: guarded(publicMeta('auth.resetPasswordTitle'), <ResetPasswordPage />) },
  { path: '/email-verify', element: guarded(publicMeta('auth.verifyYourEmail'), <EmailVerifyPage />) },
  { path: '/auth/callback', element: guarded(publicMeta('auth.oauthCallbackPageTitle'), <OAuthCallbackPage />) },
  { path: '/auth/oauth/callback', element: guarded(publicMeta('auth.oauthCallbackPageTitle'), <OAuthCallbackPage />) },
  { path: '/auth/dingtalk/callback', element: guarded(publicMeta('auth.dingtalkCallbackPageTitle'), <DingTalkCallbackPage />) },
  { path: '/auth/dingtalk/email-completion', element: guarded(publicMeta(), <DingTalkEmailCompletionPage />) },
  { path: '/auth/linuxdo/callback', element: guarded(publicMeta('auth.linuxdoCallbackPageTitle'), <LinuxDoCallbackPage />) },
  { path: '/auth/oidc/callback', element: guarded(publicMeta('auth.oidcCallbackPageTitle'), <OidcCallbackPage />) },
  { path: '/auth/wechat/callback', element: guarded(publicMeta('auth.wechatCallbackPageTitle'), <WechatCallbackPage />) },
  {
    path: '/auth/wechat/payment/callback',
    element: guarded(publicMeta('auth.wechatPaymentCallbackPageTitle'), <WechatPaymentCallbackPage />),
  },

  // Standalone payment pages (no app shell, same access rules as the Vue router)
  { path: '/payment/result', element: guarded(publicMeta('payment.result.success'), <PaymentResultPage />) },
  { path: '/payment/stripe', element: guarded(publicMeta('payment.stripePay'), <StripePaymentPage />) },
  { path: '/payment/airwallex', element: guarded(publicMeta('payment.airwallexPay'), <AirwallexPaymentPage />) },
  { path: '/payment/stripe-popup', element: guarded(publicMeta(), <StripePopupPage />) },
  { path: '/oauth/mcp/authorize', element: guarded({ titleKey: 'mcp.consentTitle' }, <MCPOAuthAuthorizePage />) },

  // User console and admin routes (requires auth)
  {
    element: (
      <RouteGuard meta={{}}>
        <AdminComplianceGate><AppLayout /></AdminComplianceGate>
      </RouteGuard>
    ),
    children: [...userRoutes, ...adminRoutes].map(shellRoute),
  },

  // 404 - must be last
  { path: '*', element: <NotFoundPage /> },
], { basename: import.meta.env.BASE_URL })
