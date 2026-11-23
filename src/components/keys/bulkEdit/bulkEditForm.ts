import type { Group, UpdateApiKeyRequest } from '@/types'

/** Spending caps of a key, in USD; 0 lifts the cap. */
export const LIMIT_FIELDS = ['quota', 'rate_limit_5h', 'rate_limit_1d', 'rate_limit_7d'] as const
export const IP_FIELDS = ['ip_whitelist', 'ip_blacklist'] as const

/** Every field a bulk edit can change, in the order the dialog shows them. */
export const BULK_EDIT_FIELDS = ['group_id', 'status', ...LIMIT_FIELDS, 'expires_at', ...IP_FIELDS] as const

export type LimitField = (typeof LIMIT_FIELDS)[number]
export type IpField = (typeof IP_FIELDS)[number]
export type BulkEditField = (typeof BULK_EDIT_FIELDS)[number]

export interface BulkEditForm {
  /** Only ticked fields are sent; every other field keeps the value each key already has. */
  enabled: Record<BulkEditField, boolean>
  groupId: number | null
  status: 'active' | 'inactive'
  limits: Record<LimitField, number | null>
  neverExpires: boolean
  /** Local wall-clock time as `YYYY-MM-DDTHH:MM`; empty until one is picked. */
  expirationDate: string
  /** One address or CIDR range per line. */
  ipLists: Record<IpField, string>
}

export type BulkEditProblem = 'group' | 'limit' | 'expiration'
export type BulkEditProblems = Partial<Record<BulkEditField, BulkEditProblem>>

export function emptyBulkEditForm(): BulkEditForm {
  return {
    enabled: {
      group_id: false,
      status: false,
      quota: false,
      rate_limit_5h: false,
      rate_limit_1d: false,
      rate_limit_7d: false,
      expires_at: false,
      ip_whitelist: false,
      ip_blacklist: false,
    },
    groupId: null,
    status: 'active',
    limits: { quota: null, rate_limit_5h: null, rate_limit_1d: null, rate_limit_7d: null },
    neverExpires: false,
    expirationDate: '',
    ipLists: { ip_whitelist: '', ip_blacklist: '' },
  }
}

export function hasTickedField(form: BulkEditForm): boolean {
  return Object.values(form.enabled).some(Boolean)
}

/** What stops a ticked field from being sent. The rules are those of BulkEditKeysModal.vue. */
export function findProblems(form: BulkEditForm, groups: ReadonlyArray<Pick<Group, 'id'>>): BulkEditProblems {
  const { enabled } = form
  const problems: BulkEditProblems = {}
  // A key cannot be left without a group from here, so the group has to be one the user can pick.
  if (enabled.group_id && !groups.some((group) => group.id === form.groupId)) problems.group_id = 'group'
  for (const field of LIMIT_FIELDS) {
    const amount = form.limits[field]
    if (enabled[field] && (amount === null || !Number.isFinite(amount) || amount < 0)) problems[field] = 'limit'
  }
  if (enabled.expires_at && !form.neverExpires && !Number.isFinite(Date.parse(form.expirationDate))) {
    problems.expires_at = 'expiration'
  }
  return problems
}

const parseIpList = (text: string): string[] =>
  text
    .split('\n')
    .map((ip) => ip.trim())
    .filter(Boolean)

/** The request body sent for every selected key: the ticked fields and nothing else. */
export function buildUpdates(form: BulkEditForm): UpdateApiKeyRequest {
  const { enabled } = form
  const updates: UpdateApiKeyRequest = {}
  if (enabled.group_id) updates.group_id = form.groupId
  if (enabled.status) updates.status = form.status
  for (const field of LIMIT_FIELDS) {
    const amount = form.limits[field]
    if (enabled[field] && amount !== null) updates[field] = amount
  }
  // An empty list is sent as such: ticking a list and leaving it blank clears it on every key.
  for (const field of IP_FIELDS) {
    if (enabled[field]) updates[field] = parseIpList(form.ipLists[field])
  }
  if (enabled.expires_at) {
    // An empty string removes the expiration.
    updates.expires_at = form.neverExpires ? '' : new Date(form.expirationDate).toISOString()
  }
  return updates
}
