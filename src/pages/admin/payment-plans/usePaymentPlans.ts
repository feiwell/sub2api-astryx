import { useEffect, useRef, useState } from 'react'
import type { AdminGroup } from '@/types'
import type { SubscriptionPlan } from '@/types/payment'
import { extractI18nErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { AdminPaymentConfig } from '~/lib/api/admin/payment'
import { toast } from '~/lib/toast'
import { planOf, type RawPlan } from './planModel'

/**
 * The subscription plans as the page lists them, with what the page needs beside them: the groups a
 * plan can subscribe to, and the payment settings the price preview is worked out from.
 */
export function usePaymentPlans() {
  const { t } = useI18n()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load of the plans; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [groups, setGroups] = useState<AdminGroup[]>([])
  // Whether the groups were loaded at all. Until then no plan can be said to be in a group that is gone.
  const [areGroupsKnown, setGroupsKnown] = useState(false)
  const [haveGroupsFailed, setGroupsFailed] = useState(false)
  const [config, setConfig] = useState<AdminPaymentConfig | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // The plans whose sale switch is being sent, by plan id.
  const [switching, setSwitching] = useState<Record<number, true>>({})
  const inFlight = useRef(new Set<number>())
  const isLoadUnderWay = useRef(false)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    isLoadUnderWay.current = true
    adminAPI.payment
      .getPlans()
      .then((answer) => {
        if (isStale) return
        setPlans(((answer.data || []) as RawPlan[]).map(planOf))
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.error('[payment-plans] failed to load the plans', error)
        // The plans of the last good load stay, under the error.
        setFailure(extractI18nErrorMessage(error, t, 'payment.errors', t('common.loadFailed')))
      })
      .finally(() => {
        if (isStale) return
        isLoadUnderWay.current = false
        setLoading(false)
      })

    // The page works without these two. Without the groups a plan shows the group it carries itself and
    // none can be picked; without the settings the price has no preview.
    setGroupsFailed(false)
    adminAPI.groups
      .getAll()
      .then((loaded) => {
        if (isStale) return
        setGroups(loaded || [])
        setGroupsKnown(true)
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.error('[payment-plans] failed to load the groups', error)
        setGroupsFailed(true)
      })
    adminAPI.payment
      .getConfig()
      .then((answer) => {
        if (!isStale) setConfig(answer.data || null)
      })
      .catch((error: unknown) => {
        if (!isStale) console.error('[payment-plans] failed to load the payment settings', error)
      })

    return () => {
      isStale = true
    }
  }, [reloadTick, t])

  const reload = () => setReloadTick((tick) => tick + 1)

  /** Puts a plan on sale or takes it off, at once; a second click while that is sent does nothing. */
  const toggleForSale = async (plan: SubscriptionPlan) => {
    if (inFlight.current.has(plan.id)) return
    inFlight.current.add(plan.id)
    setSwitching((current) => ({ ...current, [plan.id]: true }))
    const forSale = !plan.for_sale
    try {
      await adminAPI.payment.updatePlan(plan.id, { for_sale: forSale })
      setPlans((current) => current.map((each) => (each.id === plan.id ? { ...each, for_sale: forSale } : each)))
      // A load that was on its way may have read the plan before the change.
      if (isLoadUnderWay.current) reload()
    } catch (error) {
      toast.error(extractI18nErrorMessage(error, t, 'payment.errors', t('common.error')))
    } finally {
      inFlight.current.delete(plan.id)
      setSwitching((current) => {
        const next = { ...current }
        delete next[plan.id]
        return next
      })
    }
  }

  return {
    plans,
    isLoading,
    failure,
    groups,
    areGroupsKnown,
    haveGroupsFailed,
    config,
    reload,
    switching,
    toggleForSale,
  }
}

export type PaymentPlans = ReturnType<typeof usePaymentPlans>
