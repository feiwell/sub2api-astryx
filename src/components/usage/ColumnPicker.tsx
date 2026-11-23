import { useState } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'

/** A column that can be hidden. A column that must always show is simply not offered. */
export interface ColumnChoice {
  key: string
  label: string
}

/** The hidden columns stored under `storageKey`, or null when no usable choice is stored. */
export function readHiddenColumns(storageKey: string): string[] | null {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : null
  } catch {
    return null
  }
}

/**
 * Which columns of a table are hidden, remembered in this browser. What is stored under `storageKey` is the list
 * of hidden keys, as the Vue page writes it, so both frontends keep one choice. Until a choice is made the
 * columns in `hiddenByDefault` are the hidden ones.
 */
export function useHiddenColumns(storageKey: string, hiddenByDefault: string[]) {
  const [hidden, setHidden] = useState<string[]>(() => readHiddenColumns(storageKey) ?? hiddenByDefault)
  const change = (next: string[]) => {
    setHidden(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Storage can be full or switched off; the choice still holds until the page is left.
    }
  }
  return [hidden, change] as const
}

/** The "columns" button of a table: the columns that can be hidden, each ticked while it shows. */
export function ColumnPicker({
  columns,
  hidden,
  onChange,
}: {
  columns: ColumnChoice[]
  hidden: string[]
  onChange: (hidden: string[]) => void
}) {
  const { t } = useI18n()
  const label = t('admin.users.columnSettings')
  return (
    <MultiSelector
      label={label}
      isLabelHidden
      variant="secondary"
      startIcon={<Icon icon={AdjustmentsHorizontalIcon} />}
      // The button always reads "columns": which ones show is what the list is for.
      triggerDisplay="labels"
      formatValue={() => label}
      placeholder={label}
      options={columns.map((column) => ({ value: column.key, label: column.label }))}
      value={columns.map((column) => column.key).filter((key) => !hidden.includes(key))}
      onChange={(shown) => onChange(columns.map((column) => column.key).filter((key) => !shown.includes(key)))}
    />
  )
}
