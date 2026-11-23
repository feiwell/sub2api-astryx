import type { ComponentType, SVGProps } from 'react'
import {
  HomeIcon,
  KeyIcon,
  PhotoIcon,
  ChartBarIcon,
  Squares2X2Icon,
  SignalIcon,
  CreditCardIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  GiftIcon,
  UsersIcon,
  UserCircleIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  ServerStackIcon,
  ReceiptPercentIcon,
} from '@heroicons/react/24/outline'
import type { PublicSettings } from '@/types'
import { FeatureFlags, resolveFeatureFlag, type FeatureFlagDefinition } from '@/utils/featureFlags'
import { resolveSiteBillingMode } from '@/utils/siteBillingMode'
import { t } from '~/i18n'

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface NavItem {
  path: string
  label: string
  /** Rows nested inside a NavGroup go without an icon. */
  icon?: HeroIcon
  hideInSimpleMode?: boolean
  flag?: FeatureFlagDefinition
  /** Extra visibility check against public _settings. */
  visible?: (settings: PublicSettings | null) => boolean
}

/** An expandable set of admin pages under one label. */
export interface NavGroup {
  id: string
  label: string
  icon: HeroIcon
  items: NavItem[]
}

export type AdminNavEntry = NavItem | NavGroup

export function isNavGroup(entry: AdminNavEntry): entry is NavGroup {
  return 'items' in entry
}

function purchaseLabel(settings: PublicSettings | null): string {
  switch (resolveSiteBillingMode(settings)) {
    case 'recharge_only':
      return t('nav.recharge')
    case 'subscription_only':
      return t('nav.subscribe')
    default:
      return t('nav.buySubscription')
  }
}

/** User-side navigation, same order and gating as AppSidebar.vue. */
export function buildUserNav(settings: PublicSettings | null, ctx: { canUseBatchImage: boolean }): NavItem[] {
  const items: NavItem[] = [
    { path: '/dashboard', label: t('nav.dashboard'), icon: HomeIcon },
    { path: '/keys', label: t('nav.apiKeys'), icon: KeyIcon },
    {
      path: '/batch-image',
      label: t('nav.batchImage'),
      icon: PhotoIcon,
      hideInSimpleMode: true,
      visible: () => ctx.canUseBatchImage,
    },
    { path: '/usage', label: t('nav.usage'), icon: ChartBarIcon, hideInSimpleMode: true },
    {
      path: '/available-channels',
      label: t('nav.availableChannels'),
      icon: Squares2X2Icon,
      hideInSimpleMode: true,
      flag: FeatureFlags.availableChannels,
    },
    { path: '/monitor', label: t('nav.channelStatus'), icon: SignalIcon, flag: FeatureFlags.channelMonitor },
    {
      path: '/subscriptions',
      label: t('nav.mySubscriptions'),
      icon: CreditCardIcon,
      hideInSimpleMode: true,
      flag: FeatureFlags.subscription,
    },
    { path: '/purchase', label: purchaseLabel(settings), icon: BanknotesIcon, hideInSimpleMode: true, flag: FeatureFlags.payment },
    { path: '/orders', label: t('nav.myOrders'), icon: ClipboardDocumentListIcon, hideInSimpleMode: true, flag: FeatureFlags.payment },
    { path: '/redeem', label: t('nav.redeem'), icon: GiftIcon, hideInSimpleMode: true },
    { path: '/affiliate', label: t('nav.affiliate'), icon: UsersIcon, hideInSimpleMode: true, flag: FeatureFlags.affiliate },
    { path: '/profile', label: t('nav.profile'), icon: UserCircleIcon },
    { path: '/settings/mcp', label: t('mcp.title'), icon: CpuChipIcon, flag: FeatureFlags.mcp },
  ]
  for (const item of settings?.custom_menu_items ?? []) {
    if (item.visibility !== 'user') continue
    items.push({ path: `/custom/${item.id}`, label: item.label, icon: DocumentTextIcon })
  }
  return items
}

export function filterNav(items: NavItem[], _settings: PublicSettings | null, isSimpleMode: boolean): NavItem[] {
  return items.filter((item) => {
    if (item.flag && !resolveFeatureFlag(_settings, item.flag)) return false
    if (item.visible && !item.visible(_settings)) return false
    if (isSimpleMode && item.hideInSimpleMode) return false
    return true
  })
}

export function isNavItemActive(itemPath: string, currentPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

/** Admin navigation: the dashboard and settings stand alone, the other pages sit in expandable groups. */
export function buildAdminNav(_settings: PublicSettings | null): AdminNavEntry[] {
  return [
    { path: '/admin/dashboard', label: t('nav.dashboard'), icon: HomeIcon },
    {
      id: 'users',
      label: t('astryx.navGroups.users'),
      icon: UserGroupIcon,
      items: [
        { path: '/admin/users', label: t('nav.users') },
        { path: '/admin/subscriptions', label: t('nav.subscriptions'), flag: FeatureFlags.subscription },
        { path: '/admin/affiliates', label: t('nav.affiliateManagement') },
        { path: '/admin/announcements', label: t('nav.announcements') },
      ],
    },
    {
      id: 'upstream',
      label: t('astryx.navGroups.upstream'),
      icon: ServerStackIcon,
      items: [
        { path: '/admin/accounts', label: t('nav.accounts') },
        { path: '/admin/groups', label: t('nav.groups') },
        { path: '/admin/channels/pricing', label: t('nav.channels') },
        { path: '/admin/channels/monitor', label: t('nav.channelMonitor'), flag: FeatureFlags.channelMonitor },
        { path: '/admin/proxies', label: t('nav.proxies') },
        { path: '/admin/plugins', label: t('nav.plugins') },
      ],
    },
    {
      id: 'billing',
      label: t('astryx.navGroups.billing'),
      icon: ReceiptPercentIcon,
      items: [
        { path: '/admin/orders', label: t('nav.orders') },
        { path: '/admin/redeem', label: t('nav.redeemCodes') },
        { path: '/admin/promo-codes', label: t('nav.promoCodes') },
      ],
    },
    {
      id: 'audit',
      label: t('astryx.navGroups.audit'),
      icon: ShieldCheckIcon,
      items: [
        { path: '/admin/ops', label: t('nav.ops') },
        { path: '/admin/usage', label: t('nav.usage') },
        { path: '/admin/risk-control', label: t('nav.riskControl') },
        { path: '/admin/prompt-audit', label: t('nav.promptAudit') },
        { path: '/admin/audit-logs', label: t('nav.auditLog') },
      ],
    },
    { path: '/admin/settings', label: t('nav.settings'), icon: Cog6ToothIcon },
  ]
}

/** filterNav for the grouped admin list; a group with no visible page left is dropped. */
export function filterAdminNav(entries: AdminNavEntry[], settings: PublicSettings | null): AdminNavEntry[] {
  return entries.flatMap((entry): AdminNavEntry[] => {
    if (!isNavGroup(entry)) return filterNav([entry], settings, false)
    const items = filterNav(entry.items, settings, false)
    return items.length > 0 ? [{ ...entry, items }] : []
  })
}

export function isNavGroupActive(group: NavGroup, currentPath: string): boolean {
  return group.items.some((item) => isNavItemActive(item.path, currentPath))
}

/**
 * Where the page at `currentPath` sits in the side nav: the place of its item counted from the top of
 * `entries`, through the pages inside groups. -1 when the side nav has no item for the page.
 */
export function navPlace(entries: AdminNavEntry[], currentPath: string): number {
  return entries
    .flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]))
    .findIndex((item) => isNavItemActive(item.path, currentPath))
}
