import { useEffect, useRef, useState } from 'react'
import { useAnnounce } from '@astryxdesign/core/hooks'
import { redeemAPI } from '@/api'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useAuthStore } from '~/stores/auth'
import { outcomeLines, readRedeemOutcome, type RedeemOutcome } from './redeemModel'

/** How the last code went: what it did, or what the server said against it (empty when it said nothing). */
export type RedeemResult = { isRedeemed: true; outcome: RedeemOutcome } | { isRedeemed: false; reason: string }

/**
 * The code being entered and how redeeming it went. A redeemed code empties the field, calls `onRedeemed`
 * and refreshes the account, whose balance and concurrency the page and the navigation show.
 */
export function useRedeemCode(onRedeemed: () => void) {
  const { t } = useI18n()
  const announce = useAnnounce()
  const refreshUser = useAuthStore((state) => state.refreshUser)
  const [code, setCode] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<RedeemResult | null>(null)
  // Set by an attempt to redeem nothing, until something is typed.
  const [isMissing, setMissing] = useState(false)
  // State arrives a render late: this is what keeps a second Enter from sending the code twice.
  const isBusy = useRef(false)
  const isOnPage = useRef(true)
  useEffect(() => {
    isOnPage.current = true
    return () => {
      isOnPage.current = false
    }
  }, [])

  /** Redeems what is in the field; resolves to whether it was redeemed. */
  const submit = async (): Promise<boolean> => {
    if (isBusy.current) return false
    const entered = code.trim()
    if (!entered) {
      setMissing(true)
      return false
    }
    isBusy.current = true
    setSubmitting(true)
    setResult(null)
    let answer: unknown
    try {
      answer = await redeemAPI.redeem(entered)
    } catch (error) {
      const reason = extractApiErrorMessage(error, '')
      if (isOnPage.current) {
        // The code stays in the field, to be corrected.
        setResult({ isRedeemed: false, reason })
        announce(`${t('redeem.redeemFailed')} ${reason || t('redeem.failedToRedeem')}`, 'assertive')
      } else {
        // The page was left while the code was on its way; how it went is still told.
        toast.error(t('redeem.redeemFailed'))
      }
      return false
    } finally {
      isBusy.current = false
      setSubmitting(false)
    }

    const outcome = readRedeemOutcome(answer)
    if (isOnPage.current) {
      setResult({ isRedeemed: true, outcome })
      setCode('')
      announce([t('redeem.redeemSuccess'), ...outcomeLines(outcome, t)].join(' '))
      onRedeemed()
    } else {
      toast.success(t('redeem.codeRedeemSuccess'))
    }
    refreshUser().catch((error: unknown) => {
      console.error('[redeem] failed to refresh the account after redeeming', error)
      toast.warning(t('redeem.userRefreshFailed'))
    })
    return true
  }

  return {
    code,
    changeCode: (value: string) => {
      setCode(value)
      setMissing(false)
    },
    isMissing,
    isSubmitting,
    result,
    submit,
  }
}

export type RedeemCode = ReturnType<typeof useRedeemCode>
