import { IconButton } from '@astryxdesign/core/IconButton'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { LanguageIcon, MoonIcon, SunIcon, CheckIcon } from '@heroicons/react/24/outline'
import { availableLocales, useI18n, type LocaleCode } from '~/i18n'
import { useAppStore } from '~/stores/app'

export function ColorModeToggle() {
  const { t } = useI18n()
  const colorMode = useAppStore((s) => s.colorMode)
  const toggle = useAppStore((s) => s.toggleColorMode)
  const isDark = colorMode === 'dark'
  return (
    <IconButton
      label={isDark ? t('nav.lightMode') : t('nav.darkMode')}
      tooltip={isDark ? t('nav.lightMode') : t('nav.darkMode')}
      variant="ghost"
      icon={<Icon icon={isDark ? SunIcon : MoonIcon} size="sm" />}
      onClick={toggle}
    />
  )
}

export function LocaleSwitcher() {
  const { t, locale, setLocale } = useI18n()
  return (
    <DropdownMenu
      hasChevron={false}
      alignment="end"
      button={{
        label: t('astryx.switchLanguage'),
        variant: 'ghost',
        isIconOnly: true,
        icon: <Icon icon={LanguageIcon} size="sm" />,
        tooltip: t('astryx.switchLanguage'),
      }}
      items={availableLocales.map((l) => ({
        label: `${l.flag} ${l.name}`,
        endContent: l.code === locale ? <Icon icon={CheckIcon} size="sm" /> : undefined,
        onClick: () => void setLocale(l.code as LocaleCode),
      }))}
    />
  )
}
