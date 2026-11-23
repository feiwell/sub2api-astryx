import { useState } from 'react'
import type { UserBreakdownParams } from '@/api/admin/dashboard'
import type { UserBreakdownItem } from '@/types'
import { useLoadWhileShown } from '~/components/usage/useLoadWhileShown'
import { getUserBreakdown } from '~/lib/api/admin/dashboard'
import { buildUserRankingParams, type AdminUsageFilters, type RankingSortKey } from './adminUsageQuery'

/** How many users a ranking can run to. */
export const RANKING_SIZES = [20, 50, 100, 200]
const DEFAULT_SIZE = 50
const NO_USERS: UserBreakdownItem[] = []

/**
 * The users who used the most, under the filters of the admin usage page: the first `limit` of them by one
 * figure. Nothing is loaded until the ranking is looked at (`isActive`); `reloadTick` is the page's refresh
 * counter.
 */
export function useAdminUserRanking({
  filters,
  isActive,
  reloadTick,
}: {
  filters: AdminUsageFilters
  isActive: boolean
  reloadTick: number
}) {
  const [sortBy, setSortBy] = useState<RankingSortKey>('total_tokens')
  const [limit, setLimit] = useState(DEFAULT_SIZE)

  const key = JSON.stringify(buildUserRankingParams(filters, sortBy, limit))
  const { answer, isLoading, hasFailed } = useLoadWhileShown({
    isActive,
    version: `${key}#${reloadTick}`,
    load: async () => (await getUserBreakdown(JSON.parse(key) as UserBreakdownParams)).users || [],
    isKept: (users) => users.length > 0,
  })

  return {
    /** The figure the users are ranked by, most first. */
    sortBy,
    setSortBy,
    limit,
    setLimit,
    users: answer ?? NO_USERS,
    isLoading,
    hasFailed,
  }
}

export type AdminUserRankingState = ReturnType<typeof useAdminUserRanking>
