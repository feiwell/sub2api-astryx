import { useMemo, useRef, useState } from 'react'
import { Text } from '@astryxdesign/core/Text'
import { Tokenizer } from '@astryxdesign/core/Tokenizer'
import { TypeaheadItem, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead'
import { useI18n } from '~/i18n'
import type { SystemSettings } from '~/lib/api/admin/settings'

interface ApiKeyAclSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
}

// Header names are typed in, never picked from a list.
const NO_SUGGESTIONS: SearchSource<SearchableItem> = { search: () => [], bootstrap: () => [] }

export function ApiKeyAclSettings({ settings, onSave }: ApiKeyAclSettingsProps) {
  const { t } = useI18n()
  const [forwardedHeaders, setForwardedHeaders] = useState<string[]>(settings.forwarded_client_ip_headers || [])
  // The field owns its typed text, so a new key is what empties the box.
  const [fieldKey, setFieldKey] = useState(0)
  const inputRef = useRef<HTMLInputElement | HTMLButtonElement>(null)
  const value = useMemo<SearchableItem[]>(
    () => forwardedHeaders.map(header => ({ id: header, label: header })),
    [forwardedHeaders],
  )

  // The list has no save button: every change is saved at once.
  const save = async (next: string[]) => {
    const previous = forwardedHeaders
    setForwardedHeaders(next)
    const saved = await onSave({ forwarded_client_ip_headers: next })
    // A change the server refused is taken back, unless the list has changed again since.
    if (!saved) setForwardedHeaders(current => (current === next ? previous : current))
  }

  // One entry can name several headers, such as a pasted "A, B". Header names ignore case.
  const addEntry = (entry: string) => {
    const next = [...forwardedHeaders]
    for (const header of entry.split(/[,\s]+/)) {
      if (header && !next.some(existing => existing.toLowerCase() === header.toLowerCase())) next.push(header)
    }
    if (next.length > forwardedHeaders.length) void save(next)
  }

  // Text still in the box when focus leaves is added too: nothing else would save it.
  const handleBlur = () => {
    const typed = inputRef.current?.value ?? ''
    if (!typed.trim()) return
    setFieldKey(key => key + 1)
    addEntry(typed)
  }

  return (
    <>
      <Tokenizer
        key={fieldKey}
        ref={inputRef}
        label={t('admin.settings.apiKeyAcl.forwardedClientIpHeaders')}
        description={t('admin.settings.apiKeyAcl.forwardedClientIpHeadersHint')}
        placeholder={t('admin.settings.apiKeyAcl.forwardedClientIpHeadersPlaceholder')}
        searchSource={NO_SUGGESTIONS}
        value={value}
        onChange={(items, change) => {
          if (change.type === 'create') addEntry(change.item.label)
          else void save(items.map(item => item.label))
        }}
        onBlur={handleBlur}
        hasCreate
        minQueryLength={1}
        debounceMs={0}
        // With nothing to pick from, the only entry that finds nothing is one already in the list.
        emptySearchText={t('admin.settings.apiKeyAcl.forwardedClientIpHeaderDuplicate')}
        renderItem={item => <TypeaheadItem item={item} />}
      />
      <Text type="supporting" color="secondary">
        {t('admin.settings.apiKeyAcl.forwardedClientIpHeadersRiskHint')}
      </Text>
    </>
  )
}
