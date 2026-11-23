import { createRoot } from 'react-dom/client'
import { initI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import { App } from '~/App'
import './styles.css'

async function bootstrap() {
  const app = useAppStore.getState()
  document.documentElement.classList.toggle('dark', app.colorMode === 'dark')
  if (!app.initFromInjectedConfig()) {
    void app.fetchPublicSettings()
  }
  const siteName = useAppStore.getState().siteName
  if (siteName && siteName !== 'Sub2API') document.title = `${siteName} - AI API Gateway`
  useAuthStore.getState().checkAuth()
  await initI18n()
  createRoot(document.getElementById('root')!).render(<App />)
}

void bootstrap()
