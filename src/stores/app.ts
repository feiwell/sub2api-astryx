/**
 * Global app state — React port of the parts of frontend/src/stores/app.ts the
 * new UI needs: public settings (site branding + feature flags), version info,
 * colour mode and sidebar state. Toasts are handled by Astryx's toast system.
 */
import { create } from 'zustand'
import type { PublicSettings } from '@/types'
import { getPublicSettings as fetchPublicSettingsAPI } from '@/api/auth'
import { sanitizeUrl } from '@/utils/url'
import { toAppPath } from '@/utils/appPath'

export type ColorMode = 'light' | 'dark'

function initialColorMode(): ColorMode {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // ignore storage failures
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

interface AppState {
  publicSettings: PublicSettings | null
  publicSettingsLoaded: boolean
  siteName: string
  siteLogo: string
  siteSubtitle: string
  docUrl: string
  apiBaseUrl: string
  contactInfo: string
  colorMode: ColorMode

  applySettings: (config: PublicSettings) => void
  initFromInjectedConfig: () => boolean
  fetchPublicSettings: (force?: boolean) => Promise<PublicSettings | null>
  setColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
}

const defaultSiteName = import.meta.env.VITE_DEFAULT_SITE_NAME?.trim() || 'Sub2API'

let publicSettingsRequest: Promise<PublicSettings | null> | null = null

export const useAppStore = create<AppState>((set, get) => ({
  publicSettings: null,
  publicSettingsLoaded: false,
  siteName: defaultSiteName,
  siteLogo: '',
  siteSubtitle: '',
  docUrl: '',
  apiBaseUrl: '',
  contactInfo: '',
  colorMode: initialColorMode(),

  applySettings(config) {
    const siteName = config.site_name && config.site_name !== 'Sub2API' ? config.site_name : defaultSiteName
    config = { ...config, site_name: siteName }
    window.__APP_CONFIG__ = { ...config }
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favicon) {
      favicon.href = sanitizeUrl(config.site_logo || '', { allowRelative: true, allowDataUrl: true }) || toAppPath('/logo.svg')
      favicon.removeAttribute('type')
    }
    set({
      publicSettings: config,
      publicSettingsLoaded: true,
      siteName,
      siteLogo: config.site_logo || '',
      siteSubtitle: config.site_subtitle || '',
      docUrl: config.doc_url || '',
      apiBaseUrl: config.api_base_url || '',
      contactInfo: config.contact_info || '',
    })
  },

  initFromInjectedConfig() {
    if (window.__APP_CONFIG__) {
      get().applySettings(window.__APP_CONFIG__)
      return true
    }
    return false
  },

  fetchPublicSettings(force = false) {
    if (publicSettingsRequest) return publicSettingsRequest
    const state = get()
    if (!force && state.publicSettingsLoaded && state.publicSettings) {
      return Promise.resolve(state.publicSettings)
    }
    const request = fetchPublicSettingsAPI()
      .then((data) => {
        get().applySettings(data)
        return data
      })
      .catch((error) => {
        console.error('Failed to fetch public settings:', error)
        return null
      })
      .finally(() => {
        if (publicSettingsRequest === request) publicSettingsRequest = null
      })
    publicSettingsRequest = request
    return request
  },

  setColorMode(mode) {
    try {
      localStorage.setItem('theme', mode)
    } catch {
      // ignore storage failures
    }
    document.documentElement.classList.toggle('dark', mode === 'dark')
    set({ colorMode: mode })
  },

  toggleColorMode() {
    get().setColorMode(get().colorMode === 'dark' ? 'light' : 'dark')
  },
}))
