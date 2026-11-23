import { useCallback } from 'react'
import type { TypeOption } from '@/components/payment/providerConfig'
import { useI18n } from '~/i18n'

/** Resolve a payment method label, falling back to the raw value when no translation exists. */
export function usePaymentMethodLabel() {
  const { t, te, locale } = useI18n()
  return useCallback(
    (opt: TypeOption): TypeOption => {
      if (opt.label !== opt.value) return opt
      const key = `payment.methods.${opt.value}`
      return { ...opt, label: te(key) ? t(key) : opt.value }
    },
    // locale re-creates the callback so labels follow language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, te, locale],
  )
}
