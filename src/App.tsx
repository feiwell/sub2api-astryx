import { RouterProvider } from 'react-router'
import { Theme } from '@astryxdesign/core/theme'
import { LinkProvider } from '@astryxdesign/core/Link'
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import { ToastViewport } from '@astryxdesign/core/Toast'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import zhCN from '@astryxdesign/core/locales/zh-CN.generated.js'
import { RouterLink } from '~/lib/RouterLink'
import { ToastBridge } from '~/lib/toast'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { router } from '~/router'

// Astryx's Chinese catalog lacks these two strings; without them they show in English.
const astryxMessages = {
  'zh-CN': {
    ...zhCN,
    '@astryx.tokenizer.create': '创建「{value}」',
    '@astryx.inputClearButton.tooltip': '清除',
  },
}

export function App() {
  const { locale } = useI18n()
  const colorMode = useAppStore((s) => s.colorMode)
  return (
    <Theme theme={neutralTheme} mode={colorMode}>
      <InternationalizationProvider locale={locale === 'zh' ? 'zh-CN' : 'en'} messages={astryxMessages}>
        <LinkProvider component={RouterLink}>
          <ToastViewport position="topEnd">
            <ToastBridge />
            <RouterProvider router={router} />
          </ToastViewport>
        </LinkProvider>
      </InternationalizationProvider>
    </Theme>
  )
}
