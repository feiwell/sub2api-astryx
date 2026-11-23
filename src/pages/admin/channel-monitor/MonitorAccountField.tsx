import { useEffect, useMemo, useRef, useState } from 'react'
import { Typeahead, TypeaheadItem, type SearchSource, type SearchableItem } from '@astryxdesign/core/Typeahead'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { Provider } from '~/lib/api/admin/channelMonitor'

type Item = SearchableItem

// As many accounts as one search offers; typing more of a name narrows it further.
const ACCOUNTS_OFFERED = 50

const itemOf = (account: { id: number; name: string }): Item => ({
  id: String(account.id),
  label: `${account.name} (#${account.id})`,
})

/**
 * The account whose quota a monitor reads, picked by searching the accounts of the monitor's provider. Mount
 * it anew for another provider: an account belongs to one.
 */
export function MonitorAccountField({
  provider,
  accountId,
  onChange,
  showProblem,
  isDisabled = false,
}: {
  provider: Provider
  accountId: number | null
  onChange: (accountId: number | null) => void
  /** Point out that no account is picked: saving was tried. */
  showProblem: boolean
  isDisabled?: boolean
}) {
  const { t } = useI18n()
  // The account picked, with its name. A monitor being edited brings only the number of its account.
  const [picked, setPicked] = useState<Item | null>(null)
  // The account the monitor was saved with is gone, or is of another provider now.
  const [isMissing, setMissing] = useState(false)
  // The provider has no account at all: a search for any account found none. The list does not open to say
  // so, so the field does.
  const [hasNone, setHasNone] = useState(false)
  const [query, setQuery] = useState('')
  const latestOnChange = useRef(onChange)
  latestOnChange.current = onChange

  const source = useMemo<SearchSource<Item>>(() => {
    const find = async (text: string): Promise<Item[]> => {
      const search = text.trim()
      try {
        const answer = await adminAPI.accounts.list(
          1,
          ACCOUNTS_OFFERED,
          search ? { platform: provider, search } : { platform: provider },
        )
        const items = (answer.items || []).map(itemOf)
        if (!search) setHasNone(items.length === 0)
        return items
      } catch (error) {
        // A failed search offers nothing; the next keystroke asks again.
        console.error('[channel-monitor] account search failed', error)
        return []
      }
    }
    return { search: find, bootstrap: () => find('') }
  }, [provider])

  const pickedId = picked?.id
  useEffect(() => {
    if (accountId === null || pickedId === String(accountId)) return
    let isCurrent = true
    const giveUp = () => {
      if (!isCurrent) return
      setMissing(true)
      latestOnChange.current(null)
    }
    adminAPI.accounts.getById(accountId).then((account) => {
      if (!isCurrent) return
      if (String(account.platform) === provider) setPicked(itemOf(account))
      else giveUp()
    }, giveUp)
    return () => {
      isCurrent = false
    }
  }, [accountId, pickedId, provider])

  const value = useMemo<Item | null>(() => {
    if (accountId === null) return null
    if (picked && picked.id === String(accountId)) return picked
    // Until the account is read, its number stands for it.
    return { id: String(accountId), label: `#${accountId}` }
  }, [accountId, picked])

  const status = (() => {
    if (accountId === null) {
      // Why no account is picked is a warning until saving is tried; from then on it is what stops the save.
      const type = showProblem ? ('error' as const) : ('warning' as const)
      if (hasNone) return { type, message: t('admin.channelMonitor.form.linkedAccountEmpty') }
      if (isMissing) return { type, message: t('admin.channelMonitor.form.linkedAccountMissing') }
      if (showProblem) return { type, message: t('admin.channelMonitor.linkedAccountRequired') }
    }
    if (provider === 'openai') {
      return { type: 'warning' as const, message: t('admin.channelMonitor.form.openAIQuotaProbeHint') }
    }
    return undefined
  })()

  return (
    <Typeahead<Item>
      label={t('admin.channelMonitor.form.linkedAccount')}
      description={t('admin.channelMonitor.form.linkedAccountHint')}
      isRequired
      width="100%"
      placeholder={t('admin.channelMonitor.form.linkedAccountPlaceholder')}
      searchSource={source}
      value={value}
      onChange={(item) => {
        setPicked(item)
        setMissing(false)
        onChange(item ? Number(item.id) : null)
      }}
      hasEntriesOnFocus
      minQueryLength={0}
      debounceMs={300}
      onChangeQuery={setQuery}
      // Nothing found before anything is typed means the provider has no account at all.
      emptySearchText={
        query.trim() ? t('common.noOptionsFound') : t('admin.channelMonitor.form.linkedAccountEmpty')
      }
      renderItem={(item) => <TypeaheadItem item={item} />}
      status={status}
      isDisabled={isDisabled}
    />
  )
}
