import type {
  AccountAvailability,
  AccountConcurrencyInfo,
  OpsAccountAvailabilityStatsResponse,
  OpsConcurrencyStatsResponse,
  OpsUserConcurrencyStatsResponse,
  PlatformAvailability,
  PlatformConcurrencyInfo,
  UserConcurrencyInfo,
} from '~/lib/api/admin/ops'
import type { OpsTone } from './health'

export type ConcurrencyDimension = 'platform' | 'group' | 'account' | 'user'

/** Users on request; otherwise one level below the page's filter: platforms, a platform's groups, a group's accounts. */
export function dimensionOf(isByUser: boolean, platform: string, groupId: number | null): ConcurrencyDimension {
  if (isByUser) return 'user'
  if (groupId != null && groupId > 0) return 'account'
  return platform ? 'group' : 'platform'
}

type Loads = OpsConcurrencyStatsResponse | null | undefined
type Availability = OpsAccountAvailabilityStatsResponse | null | undefined
type Load = Pick<PlatformConcurrencyInfo, 'current_in_use' | 'max_capacity' | 'waiting_in_queue'>
type AccountCounts = Pick<PlatformAvailability, 'total_accounts' | 'available_count' | 'rate_limit_count' | 'error_count'>

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const percentOf = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Keys of either answer: the two endpoints can know different platforms, groups or accounts. */
const keysOf = (...maps: Array<Record<string, unknown>>): string[] => [
  ...new Set(maps.flatMap((map) => Object.keys(map))),
]

export interface ConcurrencySummaryRow {
  key: string
  name: string
  /** Platform of a group row; empty on a platform row, whose name says it already. */
  platform: string
  inUse: number
  capacity: number
  loadPercent: number
  queued: number
  availableAccounts: number
  totalAccounts: number
  availabilityPercent: number
  rateLimitedAccounts: number
  errorAccounts: number
}

function summaryRow(
  key: string,
  name: string,
  platform: string,
  load: Load | undefined,
  accounts: AccountCounts | undefined,
): ConcurrencySummaryRow {
  const inUse = count(load?.current_in_use)
  const capacity = count(load?.max_capacity)
  const availableAccounts = count(accounts?.available_count)
  const totalAccounts = count(accounts?.total_accounts)
  return {
    key,
    name,
    platform,
    inUse,
    capacity,
    loadPercent: percentOf(inUse, capacity),
    queued: count(load?.waiting_in_queue),
    availableAccounts,
    totalAccounts,
    availabilityPercent: percentOf(availableAccounts, totalAccounts),
    rateLimitedAccounts: count(accounts?.rate_limit_count),
    errorAccounts: count(accounts?.error_count),
  }
}

const fullestFirst = (a: { loadPercent: number }, b: { loadPercent: number }) => b.loadPercent - a.loadPercent

export function platformRows(loads: Loads, availability: Availability): ConcurrencySummaryRow[] {
  const load: Record<string, Load | undefined> = loads?.platform ?? {}
  const accounts: Record<string, AccountCounts | undefined> = availability?.platform ?? {}
  return keysOf(load, accounts)
    .map((platform) => summaryRow(platform, platform.toUpperCase(), '', load[platform], accounts[platform]))
    .sort(fullestFirst)
}

/** The groups of `platform`, or every group when no platform is given. */
export function groupRows(loads: Loads, availability: Availability, platform: string): ConcurrencySummaryRow[] {
  const load = loads?.group ?? {}
  const accounts = availability?.group ?? {}
  return keysOf(load, accounts)
    .filter((id) => !platform || load[id]?.platform === platform || accounts[id]?.platform === platform)
    .map((id) =>
      summaryRow(
        id,
        String(load[id]?.group_name || accounts[id]?.group_name || `#${id}`),
        String(load[id]?.platform || accounts[id]?.platform || ''),
        load[id],
        accounts[id],
      ),
    )
    .sort(fullestFirst)
}

export type AccountStatus =
  | { kind: 'available' }
  | { kind: 'rateLimited'; remainingSeconds: number }
  | { kind: 'overloaded'; remainingSeconds: number }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable' }

/** One status per account, checked in the order of the Vue card: available, rate limited, overloaded, error. */
function accountStatus(account: AccountAvailability | undefined): AccountStatus {
  if (account?.is_available) return { kind: 'available' }
  if (account?.is_rate_limited) return { kind: 'rateLimited', remainingSeconds: count(account.rate_limit_remaining_sec) }
  if (account?.is_overloaded) return { kind: 'overloaded', remainingSeconds: count(account.overload_remaining_sec) }
  if (account?.has_error) return { kind: 'error', message: account.error_message || '' }
  return { kind: 'unavailable' }
}

export interface ConcurrencyAccountRow {
  key: string
  name: string
  groupName: string
  inUse: number
  capacity: number
  loadPercent: number
  queued: number
  status: AccountStatus
  hasError: boolean
  isRateLimited: boolean
}

/** The accounts of group `groupId` (all accounts without one): those in trouble first, the rest by load. */
export function accountRows(loads: Loads, availability: Availability, groupId: number | null): ConcurrencyAccountRow[] {
  const load: Record<string, AccountConcurrencyInfo | undefined> = loads?.account ?? {}
  const accounts: Record<string, AccountAvailability | undefined> = availability?.account ?? {}
  const isInGroup = (id: string) =>
    groupId == null || groupId <= 0 || load[id]?.group_id === groupId || accounts[id]?.group_id === groupId
  return keysOf(load, accounts)
    .filter(isInGroup)
    .map((id) => {
      const usage = load[id]
      const account = accounts[id]
      return {
        key: id,
        name: String(usage?.account_name || account?.account_name || `#${id}`),
        groupName: String(usage?.group_name || account?.group_name || ''),
        inUse: count(usage?.current_in_use),
        capacity: count(usage?.max_capacity),
        loadPercent: count(usage?.load_percentage),
        queued: count(usage?.waiting_in_queue),
        status: accountStatus(account),
        hasError: !!account?.has_error,
        isRateLimited: !!account?.is_rate_limited,
      }
    })
    .sort(
      (a, b) =>
        Number(b.hasError) - Number(a.hasError) ||
        Number(b.isRateLimited) - Number(a.isRateLimited) ||
        fullestFirst(a, b),
    )
}

export interface ConcurrencyUserRow {
  key: string
  name: string
  /** Shown beside the name when the user has both a name and an e-mail address. */
  email: string
  inUse: number
  capacity: number
  loadPercent: number
  queued: number
}

/** Users by the requests they have running, then by how much of their own limit that is. */
export function userRows(users: OpsUserConcurrencyStatsResponse | null): ConcurrencyUserRow[] {
  const stats: Record<string, UserConcurrencyInfo | undefined> = users?.user ?? {}
  return Object.keys(stats)
    .map((id) => {
      const user = stats[id]
      const email = user?.user_email || `#${id}`
      return {
        key: id,
        name: user?.username || email,
        email: user?.username ? email : '',
        inUse: count(user?.current_in_use),
        capacity: count(user?.max_capacity),
        loadPercent: count(user?.load_percentage),
        queued: count(user?.waiting_in_queue),
      }
    })
    .sort((a, b) => b.inUse - a.inUse || fullestFirst(a, b))
}

/** How full a pool is: critical from 90%, a warning from 70%. */
export const loadTone = (percent: number): OpsTone => (percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success')

/** Time left on a rate limit or an overload, in its largest whole unit: 45s, 12m, 3h. */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`
}
