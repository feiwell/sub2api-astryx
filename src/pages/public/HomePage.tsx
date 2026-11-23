import { toAppPath } from '@/utils/appPath'
import { useEffect, useRef } from 'react'
import { Layout } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Avatar } from '@astryxdesign/core/Avatar'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Squares2X2Icon } from '@heroicons/react/24/outline'
import { sanitizeUrl } from '@/utils/url'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { PublicPageFrame } from '~/components/common/PublicPageFrame'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import { HomeLanding } from './home/HomeLanding'

/**
 * Admin-provided home page HTML. The content is an admin-only setting, so it is
 * rendered as-is, exactly like the Vue page's v-html.
 */
function CustomHomeHtml({ html }: { html: string }) {
  const container = useRef<HTMLElement>(null)
  useEffect(() => {
    if (container.current) container.current.innerHTML = html
  }, [html])
  return <VStack ref={container} />
}

/**
 * Public landing page for / and /home (port of views/HomeView.vue). Renders the
 * admin's custom home content (iframe URL or HTML) when configured, otherwise
 * the compact or the default landing page with docs/model-plaza entry points.
 */
export function HomePage() {
  const { t } = useI18n()
  const publicSettings = useAppStore((s) => s.publicSettings)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)
  const siteName = useAppStore((s) => s.siteName) || 'Sub2API'
  const siteLogo = sanitizeUrl(useAppStore((s) => s.siteLogo) || '', { allowRelative: true, allowDataUrl: true })
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => !!s.token && !!s.user)
  // Beside its actions the top bar has room for the site name only on a wide screen; on a narrow
  // one the name leads the landing content instead.
  const hasRoomForSiteName = useMediaQuery('(min-width: 640px)', true)

  useEffect(() => {
    void fetchPublicSettings()
  }, [fetchPublicSettings])

  useEffect(() => {
    document.title = `${siteName} - AI API Gateway`
  }, [siteName])

  const siteSubtitle = publicSettings?.site_subtitle || 'AI API Gateway Platform'
  // Preview builds can show the built-in landing page while using the live site settings.
  const homeContent = import.meta.env.VITE_PREVIEW_BUILTIN_HOME === 'true'
    ? ''
    : (publicSettings?.home_content || '').trim()
  const compactHomeEnabled = publicSettings?.compact_home_enabled === true
  const showModelPlazaEntry =
    resolveFeatureFlag(publicSettings, FeatureFlags.modelPlaza) &&
    (isAuthenticated || publicSettings?.model_plaza_require_auth !== true)
  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'

  // Custom home content takes over the whole page.
  if (homeContent) {
    if (homeContent.startsWith('http://') || homeContent.startsWith('https://')) {
      return (
        <Layout
          height="fill"
          content={<iframe src={homeContent} title={siteName} width="100%" height="100%" frameBorder={0} allowFullScreen />}
        />
      )
    }
    return <CustomHomeHtml html={homeContent} />
  }

  const modelPlazaButton = showModelPlazaEntry && (
    <Button
      variant="ghost"
      href="/model-plaza"
      icon={<Icon icon={Squares2X2Icon} size="sm" />}
      label={t('nav.modelPlaza')}
      tooltip={t('nav.modelPlaza')}
    />
  )

  if (compactHomeEnabled) {
    return (
      <PublicPageFrame
        hasFooterLinks={false}
        endActions={
          <>
            {modelPlazaButton}
            <Button
              variant="primary"
              href={isAuthenticated ? dashboardPath : '/login'}
              label={isAuthenticated ? t('home.dashboard') : t('home.login')}
            />
          </>
        }
      >
        <HStack hAlign="center" padding={6}>
          <VStack gap={6} hAlign="center" maxWidth={640} paddingBlock={10}>
            <Avatar src={siteLogo || toAppPath('/logo.svg')} name={siteName} size={72} shape="rounded" tooltip={false} />
            <VStack gap={3} hAlign="center">
              <Heading level={1} justify="center" textWrap="balance">
                {siteName}
              </Heading>
              <Text color="secondary" justify="center" textWrap="balance">
                {siteSubtitle}
              </Text>
            </VStack>
            <Button
              variant="primary"
              href={isAuthenticated ? dashboardPath : '/login'}
              label={isAuthenticated ? t('home.goToDashboard') : t('home.login')}
            />
          </VStack>
        </HStack>
      </PublicPageFrame>
    )
  }

  return (
    <PublicPageFrame
      showSiteName={hasRoomForSiteName}
      endActions={
        <>
          {modelPlazaButton}
          {isAuthenticated ? (
            <Button
              size="sm"
              variant="primary"
              href={dashboardPath}
              icon={<Avatar name={user?.email || ''} size={20} tooltip={false} />}
              label={t('home.dashboard')}
            />
          ) : (
            <Button size="sm" variant="primary" href="/login" label={t('home.login')} />
          )}
        </>
      }
    >
      <HomeLanding
        eyebrow={hasRoomForSiteName ? siteSubtitle : `${siteName} · ${siteSubtitle}`}
        startHref={isAuthenticated ? dashboardPath : '/login'}
        startLabel={isAuthenticated ? t('home.goToDashboard') : t('home.getStarted')}
      />
    </PublicPageFrame>
  )
}
