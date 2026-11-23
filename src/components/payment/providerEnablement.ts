import type { ProviderInstance } from '@/types/payment'
import { normalizeVisibleMethod } from '@/components/payment/paymentFlow'

export type ProviderEnablementCandidate = Pick<
  ProviderInstance,
  'id' | 'provider_key' | 'supported_types' | 'enabled' | 'name'
>

export interface ProviderEnablementConflict {
  method: 'alipay' | 'wxpay'
  conflicting: ProviderInstance
}

/** User-visible methods (alipay / wxpay) an enabled provider claims. */
function getProviderVisibleMethods(provider: ProviderEnablementCandidate): Array<'alipay' | 'wxpay'> {
  if (!provider.enabled) return []

  const supportedTypes = Array.isArray(provider.supported_types) ? provider.supported_types : []
  const methods = new Set<'alipay' | 'wxpay'>()

  if (provider.provider_key === 'alipay' || provider.provider_key === 'wxpay') {
    const own = provider.provider_key
    if (supportedTypes.length === 0) {
      methods.add(own)
    } else if (supportedTypes.some(type => normalizeVisibleMethod(type) === own)) {
      methods.add(own)
    }
  } else if (provider.provider_key === 'easypay') {
    for (const type of supportedTypes) {
      const method = normalizeVisibleMethod(type)
      if (method === 'alipay' || method === 'wxpay') methods.add(method)
    }
  }

  return Array.from(methods)
}

/** Only one enabled provider instance may serve alipay or wxpay at a time. */
export function findProviderEnablementConflict(
  candidate: ProviderEnablementCandidate,
  providers: ProviderInstance[],
): ProviderEnablementConflict | null {
  const claimed = getProviderVisibleMethods(candidate)
  if (claimed.length === 0) return null

  for (const other of providers) {
    if (other.id === candidate.id || !other.enabled) continue
    const otherMethods = getProviderVisibleMethods(other)
    const matched = claimed.find(method => otherMethods.includes(method))
    if (matched) return { method: matched, conflicting: other }
  }
  return null
}
