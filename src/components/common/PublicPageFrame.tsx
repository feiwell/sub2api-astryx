import { toAppPath } from '@/utils/appPath'
import type { ReactNode } from 'react'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { Avatar } from '@astryxdesign/core/Avatar'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { sanitizeUrl } from '@/utils/url'
import { ColorModeToggle, LocaleSwitcher } from '~/layouts/HeaderControls'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'

const noticesPath = import.meta.env.DEV ? '/NOTICE' : '/licenses/NOTICE'

/**
 * Shared chrome of the public pages (home, key usage): a top bar with the
 * site logo/name, language, docs and theme controls, and a copyright footer
 * with documentation and source links — the header/footer pattern HomeView.vue and
 * KeyUsageView.vue share.
 */
export function PublicPageFrame({
  children,
  endActions,
  showSiteName = true,
  hasFooterLinks = true,
}: {
  children: ReactNode
  /** Extra controls after the theme toggle (model plaza, login/dashboard). */
  endActions?: ReactNode
  showSiteName?: boolean
  /** Documentation and source links beside the copyright (the compact home page omits them). */
  hasFooterLinks?: boolean
}) {
  const { t } = useI18n()
  const siteName = useAppStore((s) => s.siteName) || 'Sub2API'
  const siteLogo = sanitizeUrl(useAppStore((s) => s.siteLogo) || '', { allowRelative: true, allowDataUrl: true })
  const docUrl = sanitizeUrl(useAppStore((s) => s.docUrl) || '')

  return (
    <Layout
      height="fill"
      header={
        <TopNav
          label={siteName}
          heading={
            <TopNavHeading
              logo={<Avatar src={siteLogo || toAppPath('/logo.svg')} name={siteName} size={32} shape="rounded" tooltip={false} />}
              heading={showSiteName ? siteName : undefined}
              headingHref="/home"
            />
          }
          endContent={
            <HStack gap={1} vAlign="center">
              <LocaleSwitcher />
              {docUrl && (
                <IconButton
                  variant="ghost"
                  icon={<Icon icon={BookOpenIcon} size="sm" />}
                  label={t('home.viewDocs')}
                  tooltip={t('home.viewDocs')}
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              )}
              <ColorModeToggle />
              {endActions}
            </HStack>
          }
        />
      }
      content={
        <LayoutContent padding={0} isScrollable>
          <VStack minHeight="100%">
            <StackItem size="fill">{children}</StackItem>
            <Divider />
            <HStack gap={4} vAlign="center" hAlign="center" wrap="wrap" padding={6}>
              <Text type="supporting">
                &copy; {new Date().getFullYear()} {siteName}
                {hasFooterLinks && `. ${t('home.footer.allRightsReserved')}`}
              </Text>
              {hasFooterLinks && (
                <HStack gap={4} vAlign="center">
                  {docUrl && (
                    <Link href={docUrl} isExternalLink type="supporting" color="secondary">
                      {t('home.docs')}
                    </Link>
                  )}
                  <Link href={toAppPath(noticesPath)} type="supporting" color="secondary">
                    {t('astryx.sourceNotices')}
                  </Link>
                </HStack>
              )}
            </HStack>
          </VStack>
        </LayoutContent>
      }
    />
  )
}
