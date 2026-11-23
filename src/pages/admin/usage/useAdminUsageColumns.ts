import { useState } from 'react'
import { readHiddenColumns } from '~/components/usage/ColumnPicker'
import { USAGE_COLUMNS_VERSION, startingHiddenColumns } from './adminUsageFormat'

// The keys the Vue page stores the same choice under: a column hidden in one frontend is hidden in the other.
const COLUMNS_KEY = 'usage-hidden-columns'
const VERSION_KEY = 'usage-hidden-columns-version'

function readStartingColumns(): string[] {
  const stored = readHiddenColumns(COLUMNS_KEY)
  try {
    const version = localStorage.getItem(VERSION_KEY)
    const hidden = startingHiddenColumns(stored, version)
    if (version !== USAGE_COLUMNS_VERSION) {
      // Written back so the columns added since are hidden once, not again after someone shows them.
      if (stored) localStorage.setItem(COLUMNS_KEY, JSON.stringify(hidden))
      localStorage.setItem(VERSION_KEY, USAGE_COLUMNS_VERSION)
    }
    return hidden
  } catch {
    // Storage is switched off: whatever was read counts as an old choice, and nothing is remembered.
    return startingHiddenColumns(stored, null)
  }
}

/** Which columns of the admin usage table are hidden, remembered in this browser. */
export function useAdminUsageColumns() {
  const [hidden, setHidden] = useState<string[]>(readStartingColumns)
  const change = (next: string[]) => {
    setHidden(next)
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next))
      localStorage.setItem(VERSION_KEY, USAGE_COLUMNS_VERSION)
    } catch {
      // Storage can be full or switched off; the choice still holds until the page is left.
    }
  }
  return [hidden, change] as const
}
