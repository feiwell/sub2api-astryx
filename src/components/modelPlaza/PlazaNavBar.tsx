import { Link } from 'react-router'
import { HStack } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'

export function PlazaNavBar() {
  const { t } = useI18n()
  const settings = useAppStore((s) => s.publicSettings)
  const siteName = settings?.site_name || 'Sub2API'
  const siteLogo = (settings as any)?.logo || '/logo.png'

  return (
    <header className="border-b border-gray-200 bg-white/95 dark:border-dark-800 dark:bg-dark-900/95">
      <HStack
        className="mx-auto max-w-7xl px-4 py-4 sm:px-6"
        gap={4}
        vAlign="center"
        hAlign="between"
      >
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
            <img src={siteLogo} alt="Logo" className="h-full w-full object-contain" />
          </div>
          <Text weight="semibold" className="text-base">
            {siteName}
          </Text>
        </Link>
        <Link to="/login">
          <Button variant="primary" size="sm" label="" >
            {t('home.login')}
          </Button>
        </Link>
      </HStack>
    </header>
  )
}
