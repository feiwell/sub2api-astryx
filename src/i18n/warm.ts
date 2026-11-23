/**
 * Asks for the catalog of the language in use, and does nothing else. The page runs this small script ahead of
 * the app's own code (warmLocale in vite.config.ts), so the catalog is on its way while that code is still
 * arriving. initI18n then finds it loaded, or waits on the same request.
 */
import { getLocale, loadLocaleMessages } from './core'

// A failure stays quiet here: initI18n asks again, and it is the one that reports.
loadLocaleMessages(getLocale()).catch(() => {})
