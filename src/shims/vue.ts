/**
 * Minimal stand-in for `vue` used by the shared modules in shared/
 * (constants/platforms.ts, constants/platformCatalog.ts, utils/ipGeoLookup.ts).
 * They only need Vue's reactivity primitives, which @vue/reactivity provides
 * without the Vue renderer. React code should not import this module.
 */
import { effect } from '@vue/reactivity'

export {
  reactive,
  readonly,
  ref,
  shallowRef,
  computed,
  isRef,
  unref,
  toRaw,
  markRaw,
} from '@vue/reactivity'

/** Synchronous effect, equivalent to Vue's watchSyncEffect for our use. */
export function watchSyncEffect(fn: () => void): () => void {
  const runner = effect(fn)
  return () => runner.effect.stop()
}
