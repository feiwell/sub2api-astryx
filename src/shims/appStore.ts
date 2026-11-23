/**
 * Replaces `@/stores/app` (Pinia) for shared modules such as
 * utils/featureFlags.ts, which only read the cached public settings.
 */
import { useAppStore as useReactAppStore } from '~/stores/app'

export function useAppStore() {
  return {
    get cachedPublicSettings() {
      return useReactAppStore.getState().publicSettings
    },
    get siteName() {
      return useReactAppStore.getState().siteName
    },
  }
}
