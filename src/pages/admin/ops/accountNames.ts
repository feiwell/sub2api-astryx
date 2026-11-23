import { accountsAPI } from '~/lib/api/admin/accounts'

const PAGE_SIZE = 1000

let known: Map<number, string> | null = null

/**
 * Account names by id, read from the light account list. Request details carry only the id.
 * The answer is kept for the whole visit; `force` asks again, for an account created since.
 */
async function loadAccountNames(force = false): Promise<Map<number, string>> {
  if (!force && known) return known
  const names = new Map<number, string>()
  let total = Number.POSITIVE_INFINITY
  for (let page = 1; names.size < total; page++) {
    const answer = await accountsAPI.list(page, PAGE_SIZE, { lite: '1', include_scheduler_score: '0' })
    total = answer.total || 0
    const before = names.size
    for (const account of answer.items || []) names.set(account.id, account.name)
    // A page that brings nothing new means the list ended short of its announced total.
    if (names.size === before) break
  }
  known = names
  return names
}

// Ids a fresh read did not find: accounts deleted since their requests were logged. Asking again finds nothing new.
const gone = new Set<number>()

/** Account names for the accounts with these ids. An id missing from the known names costs one fresh read, once. */
export async function loadAccountNamesFor(ids: number[]): Promise<Map<number, string>> {
  let names = await loadAccountNames()
  const missing = ids.filter((id) => !names.has(id) && !gone.has(id))
  if (missing.length > 0) {
    names = await loadAccountNames(true)
    for (const id of missing) if (!names.has(id)) gone.add(id)
  }
  return names
}
