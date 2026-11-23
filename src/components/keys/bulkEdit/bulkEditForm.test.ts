import { describe, expect, it } from 'vitest'
import {
  BULK_EDIT_FIELDS,
  buildUpdates,
  emptyBulkEditForm,
  findProblems,
  hasTickedField,
  type BulkEditField,
  type BulkEditForm,
} from './bulkEditForm'

// The cases of BulkEditKeysModal.spec.ts on the Vue side that are about what gets sent.

const GROUPS = [{ id: 7 }]

/** An empty form with the given fields ticked and values filled in. */
function formWith(ticked: BulkEditField[], values: Partial<Omit<BulkEditForm, 'enabled'>> = {}): BulkEditForm {
  const form = emptyBulkEditForm()
  for (const field of ticked) form.enabled[field] = true
  return { ...form, ...values }
}

const limits = (changes: Partial<BulkEditForm['limits']>) => ({ ...emptyBulkEditForm().limits, ...changes })
const ipLists = (changes: Partial<BulkEditForm['ipLists']>) => ({ ...emptyBulkEditForm().ipLists, ...changes })

describe('bulk edit form', () => {
  it('lists every field of the form once', () => {
    expect([...BULK_EDIT_FIELDS].sort()).toEqual(Object.keys(emptyBulkEditForm().enabled).sort())
  })

  it('has nothing to send until a field is ticked, then sends only that field', () => {
    expect(hasTickedField(emptyBulkEditForm())).toBe(false)
    expect(buildUpdates(emptyBulkEditForm())).toEqual({})

    const form = formWith(['status'], { status: 'inactive' })
    expect(hasTickedField(form)).toBe(true)
    expect(findProblems(form, GROUPS)).toEqual({})
    expect(buildUpdates(form)).toEqual({ status: 'inactive' })
  })

  it('sends a window limit of zero and leaves the other limits alone', () => {
    const form = formWith(['rate_limit_1d'], { limits: limits({ rate_limit_1d: 0, quota: 12 }) })
    expect(findProblems(form, GROUPS)).toEqual({})
    expect(buildUpdates(form)).toEqual({ rate_limit_1d: 0 })
  })

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects a ticked quota of %s', (quota) => {
    const form = formWith(['quota'], { limits: limits({ quota }) })
    expect(findProblems(form, GROUPS)).toEqual({ quota: 'limit' })
  })

  it('ignores what an unticked field holds', () => {
    const form = formWith(['status'], { limits: limits({ quota: -1 }), groupId: 99 })
    expect(findProblems(form, GROUPS)).toEqual({})
    expect(buildUpdates(form)).toEqual({ status: 'active' })
  })

  it('requires a group the user can pick when changing the group', () => {
    expect(findProblems(formWith(['group_id']), GROUPS)).toEqual({ group_id: 'group' })
    expect(findProblems(formWith(['group_id'], { groupId: 99 }), GROUPS)).toEqual({ group_id: 'group' })

    const form = formWith(['group_id'], { groupId: 7 })
    expect(findProblems(form, GROUPS)).toEqual({})
    expect(buildUpdates(form)).toEqual({ group_id: 7 })
  })

  it('clears a ticked IP list left blank and a ticked expiration set to never', () => {
    const undated = formWith(['ip_whitelist', 'expires_at'])
    expect(findProblems(undated, GROUPS)).toEqual({ expires_at: 'expiration' })

    const form = { ...undated, neverExpires: true }
    expect(findProblems(form, GROUPS)).toEqual({})
    expect(buildUpdates(form)).toEqual({ ip_whitelist: [], expires_at: '' })
  })

  it('trims IP lines, drops blank ones and sends the local date as ISO', () => {
    const form = formWith(['ip_blacklist', 'expires_at'], {
      ipLists: ipLists({ ip_blacklist: ' 192.0.2.1 \n\n 198.51.100.0/24\n' }),
      expirationDate: '2030-01-02T03:04',
    })
    expect(findProblems(form, GROUPS)).toEqual({})
    expect(buildUpdates(form)).toEqual({
      ip_blacklist: ['192.0.2.1', '198.51.100.0/24'],
      expires_at: new Date('2030-01-02T03:04').toISOString(),
    })
  })

  it('writes the fields in the order the Vue dialog sends them', () => {
    const form = formWith(
      ['ip_blacklist', 'expires_at', 'rate_limit_7d', 'quota', 'status', 'group_id', 'ip_whitelist', 'rate_limit_5h'],
      { groupId: 7, limits: limits({ quota: 25.5, rate_limit_5h: 1, rate_limit_7d: 3 }), neverExpires: true },
    )
    expect(Object.keys(buildUpdates(form))).toEqual([
      'group_id',
      'status',
      'quota',
      'rate_limit_5h',
      'rate_limit_7d',
      'ip_whitelist',
      'ip_blacklist',
      'expires_at',
    ])
  })
})
