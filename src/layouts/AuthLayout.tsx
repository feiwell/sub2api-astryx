import { toAppPath } from '@/utils/appPath'
import type { ReactNode } from 'react'
import { Center } from '@astryxdesign/core/Center'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { sanitizeUrl } from '@/utils/url'
import { useAppStore } from '~/stores/app'
import { ColorModeToggle, LocaleSwitcher } from './HeaderControls'

/** Centered card frame for login / register / password pages (port of AuthLayout.vue). */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const siteName = useAppStore((s) => s.siteName) || 'Sub2API'
  const siteLogo = sanitizeUrl(useAppStore((s) => s.siteLogo) || '', { allowRelative: true, allowDataUrl: true })
  const siteSubtitle = useAppStore((s) => s.siteSubtitle) || 'Subscription to API Conversion Platform'
  const loaded = useAppStore((s) => s.publicSettingsLoaded)

  return (
    <div className="auth-page">
      <div className="auth-toolbar">
        <LocaleSwitcher />
        <ColorModeToggle />
      </div>
      <Center axis="both" padding={6} style={{ minHeight: '100vh' }}>
        <VStack gap={5} hAlign="center" width="100%" style={{ maxWidth: 420 }}>
          {loaded && (
            <VStack gap={2} hAlign="center">
              <img src={siteLogo || toAppPath('/logo.svg')} alt="" width={48} height={48} style={{ objectFit: 'contain' }} />
              <Heading level={2}>{siteName}</Heading>
              <Text type="supporting" color="secondary" justify="center">
                {siteSubtitle}
              </Text>
            </VStack>
          )}
          <Card padding={8} width="100%">
            <VStack gap={4} hAlign="stretch">
              <VStack gap={1} hAlign="center">
                <Heading level={3}>{title}</Heading>
                {subtitle && (
                  <Text type="body" color="secondary" justify="center">
                    {subtitle}
                  </Text>
                )}
              </VStack>
              {children}
            </VStack>
          </Card>
          {footer && (
            <HStack gap={1} justify="center">
              {footer}
            </HStack>
          )}
          <Text type="supporting" color="secondary">
            &copy; {new Date().getFullYear()} {siteName}
          </Text>
        </VStack>
      </Center>
    </div>
  )
}
