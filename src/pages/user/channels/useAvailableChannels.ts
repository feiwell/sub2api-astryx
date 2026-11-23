import { useEffect, useState } from 'react'
import { userChannelsAPI, type UserAvailableChannel } from '@/api/channels'
import { userGroupsAPI } from '@/api/groups'
import type { GroupRates } from './channelsModel'

const NO_RATES: GroupRates = {}

/**
 * The channels the user can reach, with the user's own rate for the groups that have one. Both are asked
 * for together; the channels do not wait for the rates to succeed.
 */
export function useAvailableChannels() {
  // Not sent; counting it up makes the load below run again.
  const [reloadTick, setReloadTick] = useState(0)
  const [channels, setChannels] = useState<UserAvailableChannel[] | null>(null)
  const [rates, setRates] = useState<GroupRates>(NO_RATES)
  const [isLoading, setIsLoading] = useState(true)
  // Wrapped, so that a load rejected with nothing at all still counts as failed.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)

  useEffect(() => {
    let isStale = false
    setIsLoading(true)
    setFailure(null)
    Promise.all([
      userChannelsAPI.getAvailable(),
      userGroupsAPI.getUserGroupRates().catch((error: unknown) => {
        // Without them the groups show their default rate; the page is not told as failed for that.
        console.warn('[channels] failed to load the rates of the user', error)
        return null
      }),
    ])
      .then(([list, own]) => {
        if (isStale) return
        setChannels(Array.isArray(list) ? list : [])
        // Rates that could not be read again leave the last ones in place: they are nearer the truth than none.
        if (own != null) setRates(own)
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.error('[channels] failed to load the channels', error)
        setFailure({ error })
      })
      .finally(() => {
        if (!isStale) setIsLoading(false)
      })
    return () => {
      // An answer that comes after the next load was started, or after the page was left, is ignored.
      isStale = true
    }
  }, [reloadTick])

  return {
    /** Null until the channels were loaded once; after a failed load the last good answer stays. */
    channels,
    rates,
    isLoading,
    hasFailed: failure != null,
    /** What the failed load was rejected with, for the wording of the error. */
    failure: failure?.error,
    /** Load everything again. */
    refresh: () => setReloadTick((tick) => tick + 1),
  }
}
