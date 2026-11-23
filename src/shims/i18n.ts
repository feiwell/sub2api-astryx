/**
 * Replaces `@/i18n` (vue-i18n setup) for shared modules from shared/
 * such as api/client.ts and utils/format.ts.
 */
import { getLocale, initI18n, loadLocaleMessages, setLocale, t, te, tm, availableLocales } from '~/i18n/core'

export const i18n = {
  global: {
    t,
    te,
    tm,
    get locale() {
      return { value: getLocale() }
    },
  },
}

export { getLocale, initI18n, loadLocaleMessages, setLocale, availableLocales }
export default i18n
