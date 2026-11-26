import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { AppShell } from '@astryxdesign/core/AppShell'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection, useSideNavCollapse } from '@astryxdesign/core/SideNav'
import { NavIcon } from '@astryxdesign/core/NavIcon'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Button } from '@astryxdesign/core/Button'
import { Avatar } from '@astryxdesign/core/Avatar'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import {
  ArrowRightStartOnRectangleIcon,
  BookOpenIcon,
  ChevronUpDownIcon,
  CubeTransparentIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { VersionBadge } from '~/components/VersionBadge'
import { RouteProgress } from '~/components/common/RouteProgress'
import { useAppStore } from '~/stores/app'
import { useAuthStore, selectIsAdmin, selectIsSimpleMode } from '~/stores/auth'
import { useBatchImageAccess } from '~/stores/batchImageAccess'
import {
  buildUserNav,
  buildAdminNav,
  filterNav,
  filterAdminNav,
  isNavGroup,
  isNavGroupActive,
  isNavItemActive,
  navPlace,
  type NavGroup,
} from './navigation'
import { ColorModeToggle, LocaleSwitcher } from './HeaderControls'
import { PageStage, PageTurnContext, PageTurnLink, usePageTurn, useTurnsPages, useTurnTo } from './PageTurn'
import { toast } from '~/lib/toast'
import { useUpdateNotice } from './useUpdateNotice'

function SiteLogo() {
  const siteLogo = useAppStore((s) => s.siteLogo)
  if (siteLogo) {
    return <img src={siteLogo} alt="" width={20} height={20} style={{ borderRadius: 4, objectFit: 'contain' }} />
  }
  return <Icon icon={CubeTransparentIcon} size="sm" />
}

/** The signed-in user at the foot of the side nav: avatar, name and balance. Opens the account menu. */
function UserCard() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { isCollapsed } = useSideNavCollapse()
  const turnsPages = useTurnsPages()
  const turnTo = useTurnTo()
  if (!user) return null
  const name = user.username || user.email
  const balance = `$${(user.balance ?? 0).toFixed(2)}`
  return (
    <DropdownMenu
      hasChevron={false}
      placement="above"
      alignment="start"
      renderTrigger={(triggerProps) => (
        <Button
          {...triggerProps}
          label={name}
          variant="ghost"
          type="button"
          aria-label={isCollapsed ? name : undefined}
          data-page-turn={turnsPages ? '' : undefined}
          className={isCollapsed ? 'sidenav-user is-collapsed' : 'sidenav-user'}>
          <span className="sidenav-user__content">
          <Avatar name={name} src={user.avatar_url || undefined} size="sm" tooltip={false} />
          {!isCollapsed && (
            <>
              <span className="sidenav-user__text">
                <span className="sidenav-user__name truncate">{name}</span>
                <span className="sidenav-user__meta tabular">
                  {t('dashboard.balance')} {balance}
                </span>
              </span>
              <Icon icon={ChevronUpDownIcon} size="sm" color="secondary" />
            </>
          )}
          </span>
        </Button>
      )}
      header={
        <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 12px' }}>
          <Text type="body" weight="semibold">
            {name}
          </Text>
          <Text type="supporting" color="secondary">
            {user.email}
          </Text>
        </div>
      }
      items={[
        { label: t('nav.profile'), icon: UserCircleIcon, onClick: () => turnTo('/profile') },
        { type: 'divider' },
        {
          label: t('nav.logout'),
          icon: ArrowRightStartOnRectangleIcon,
          variant: 'destructive',
          onClick: async () => {
            await logout()
            toast.success(t('astryx.logoutSuccess'))
            navigate('/login', { replace: true })
          },
        },
      ]}
    />
  )
}

/**
 * An expandable group of admin pages. It follows the route (open while one of its pages is showing)
 * until the user toggles it; a closed group, or any group on the collapsed rail, is highlighted
 * while one of its pages is showing.
 */
function AdminNavGroup({
  group,
  pathname,
  isOpen,
  onToggle,
}: {
  group: NavGroup
  pathname: string
  /** Open state is owned by the layout so only one group can be open at a time. */
  isOpen: boolean
  onToggle: (open: boolean) => void
}) {
  const { isCollapsed: isRailCollapsed } = useSideNavCollapse()
  const isActive = isNavGroupActive(group, pathname)
  const expanded = isOpen
  return (
    <SideNavItem
      label={group.label}
      icon={group.icon}
      isSelected={isActive && (isRailCollapsed || !expanded)}
      collapsible={{ isCollapsed: !expanded, onCollapsedChange: (isNowCollapsed) => onToggle(!isNowCollapsed) }}>
      {group.items.map((item) => (
        <SideNavItem
          key={item.path}
          as={PageTurnLink}
          label={item.label}
          href={item.path}
          isSelected={isNavItemActive(item.path, pathname)}
        />
      ))}
    </SideNavItem>
  )
}

export function AppLayout({ children }: { children?: React.ReactNode } = {}) {
  const { t } = useI18n()
  const { turnTo, pathname } = usePageTurn()
  const siteName = useAppStore((s) => s.siteName)
  const docUrl = useAppStore((s) => s.docUrl)
  const settings = useAppStore((s) => s.publicSettings)
  const isAdmin = useAuthStore(selectIsAdmin)
  const { frontendUpdate, backendUpdate } = useUpdateNotice(isAdmin)
  const isSimpleMode = useAuthStore(selectIsSimpleMode)
  const canUseBatchImage = useBatchImageAccess((s) => s.canUseBatchImage)
  const refreshBatchImage = useBatchImageAccess((s) => s.refresh)

  useEffect(() => {
    void refreshBatchImage()
  }, [refreshBatchImage])

  const items = useMemo(
    () => filterNav(buildUserNav(settings, { canUseBatchImage }), settings, isSimpleMode),
    // `t` identity is stable; re-run when the locale catalog changes via settings/user re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, isSimpleMode, canUseBatchImage, t('nav.dashboard')],
  )

  const adminEntries = useMemo(
    () => (isAdmin ? filterAdminNav(buildAdminNav(settings), settings) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, isAdmin, t('admin.dashboard')],
  )
  const hasAdminNav = adminEntries.length > 0
  // Only one admin nav group stays open, so opening one closes the others.
  const [openNavGroupId, setOpenNavGroupId] = useState<string | null>(null)
  // A navigation of its own hands the open group back to the route.
  useEffect(() => {
    setOpenNavGroupId(null)
  }, [pathname])
  // The side nav lists the admin pages above the user's own.
  const placeOf = useCallback((path: string) => navPlace([...adminEntries, ...items], path), [adminEntries, items])

  const shell = (
    <AppShell
      contentPadding={0}
      sideNav={
        <SideNav
          collapsible
          header={
            <VStack gap={1} hAlign="stretch">
              <div className="site-heading-with-update">
                <SideNavHeading as={PageTurnLink} heading={siteName} headingHref="/dashboard" icon={<NavIcon icon={<SiteLogo />} />} />
                {isAdmin && (frontendUpdate || backendUpdate) && (
                  <span
                    className="site-update-indicator"
                    role="status"
                    aria-label={[
                      frontendUpdate && t('astryx.frontendUpdateAvailable'),
                      backendUpdate && t('astryx.backendUpdateAvailable'),
                    ].filter(Boolean).join(' / ')}
                    title={[
                      frontendUpdate && t('astryx.frontendUpdateAvailable'),
                      backendUpdate && t('astryx.backendUpdateAvailable'),
                    ].filter(Boolean).join(' / ')}
                  />
                )}
              </div>
              <VersionBadge onNavigate={turnTo} />
            </VStack>
          }
          footer={<UserCard />}
          footerIcons={
            <>
              {docUrl && (
                <IconButton
                  label={t('nav.docs')}
                  tooltip={t('nav.docs')}
                  variant="ghost"
                  icon={<Icon icon={BookOpenIcon} size="sm" />}
                  href={docUrl}
                  target="_blank"
                  rel="noreferrer"
                />
              )}
              <LocaleSwitcher />
              <ColorModeToggle />
            </>
          }>
          {hasAdminNav && (
            <SideNavSection title={t('astryx.adminSection')}>
              {adminEntries.map((entry) =>
                isNavGroup(entry) ? (
                  <AdminNavGroup
                    key={entry.id}
                    group={entry}
                    pathname={pathname}
                    // Until the user opens something, follow the route; after that the
                    // tapped group alone stays open.
                    isOpen={
                      openNavGroupId === null
                        ? isNavGroupActive(entry, pathname)
                        : openNavGroupId === entry.id
                    }
                    onToggle={(open) => setOpenNavGroupId(open ? entry.id : null)}
                  />
                ) : (
                  <SideNavItem
                    key={entry.path}
                    as={PageTurnLink}
                    label={entry.label}
                    icon={entry.icon}
                    href={entry.path}
                    isSelected={isNavItemActive(entry.path, pathname)}
                  />
                ),
              )}
            </SideNavSection>
          )}
          <SideNavSection title={t('nav.myAccount')} isHeaderHidden={!hasAdminNav}>
            {items.map((item) => (
              <SideNavItem
                key={item.path}
                as={PageTurnLink}
                label={item.label}
                icon={item.icon}
                href={item.path}
                isSelected={isNavItemActive(item.path, pathname)}
              />
            ))}
          </SideNavSection>
        </SideNav>
      }>
      <PageStage placeOf={placeOf}>{children || <Outlet />}</PageStage>
    </AppShell>
  )

  return <PageTurnContext value={turnTo}>
    <RouteProgress />
    {shell}
  </PageTurnContext>
}
