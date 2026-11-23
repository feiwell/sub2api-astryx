import { useMemo, useRef } from 'react'
import { Typeahead, TypeaheadItem, type SearchSource, type SearchableItem } from '@astryxdesign/core/Typeahead'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import type { PickedOption } from './adminUsageQuery'

/** One match of a search. `note` is shown under its name in the list. */
export interface SearchMatch extends PickedOption {
  note?: string
}

type Item = SearchableItem<{ note?: string }>

/**
 * A filter picked by searching the server: type part of a name, pick one of the matches. The field then shows
 * the pick, and its clear button takes the filter off.
 */
export function RemoteSearchField({
  label,
  placeholder,
  value,
  onChange,
  search,
  hasMatchesOnFocus = false,
}: {
  label: string
  placeholder: string
  value: PickedOption | null
  onChange: (value: PickedOption | null) => void
  /** The matches for what was typed. Asked with an empty text for what to offer before anything is typed. */
  search: (text: string) => Promise<SearchMatch[]>
  /** Offer matches as soon as the field is entered, before anything is typed. */
  hasMatchesOnFocus?: boolean
}) {
  const { t } = useI18n()
  // The search can close over other filters and change on every render; the source below must not, or the
  // field would start over each time.
  const latestSearch = useRef(search)
  latestSearch.current = search

  const source = useMemo<SearchSource<Item>>(() => {
    const find = async (text: string): Promise<Item[]> => {
      try {
        const matches = await latestSearch.current(text.trim())
        return matches.map((match) => ({
          id: String(match.id),
          label: match.label,
          auxiliaryData: { note: match.note },
        }))
      } catch (error) {
        // A failed search offers nothing; the next keystroke asks again.
        console.error('[admin-usage] search failed', error)
        return []
      }
    }
    return { search: find, bootstrap: () => (hasMatchesOnFocus ? find('') : []) }
  }, [hasMatchesOnFocus])

  const pickedId = value?.id
  const pickedLabel = value?.label
  const picked = useMemo<Item | null>(
    () => (pickedId == null ? null : { id: String(pickedId), label: pickedLabel ?? String(pickedId) }),
    [pickedId, pickedLabel],
  )

  return (
    <Typeahead<Item>
      label={label}
      width="100%"
      placeholder={placeholder}
      startIcon={MagnifyingGlassIcon}
      searchSource={source}
      value={picked}
      onChange={(item) => onChange(item ? { id: Number(item.id), label: item.label } : null)}
      hasEntriesOnFocus={hasMatchesOnFocus}
      minQueryLength={hasMatchesOnFocus ? 0 : 1}
      debounceMs={300}
      emptySearchText={t('common.noOptionsFound')}
      renderItem={(item) => <TypeaheadItem item={item} description={item.auxiliaryData?.note} />}
    />
  )
}
