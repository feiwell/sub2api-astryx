import { useMemo, useRef, useState } from 'react'
import { Tokenizer } from '@astryxdesign/core/Tokenizer'
import { TypeaheadItem, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead'
import { useI18n } from '~/i18n'

// Model names are typed in, never picked from a list.
const NO_SUGGESTIONS: SearchSource<SearchableItem> = { search: () => [], bootstrap: () => [] }

/**
 * A list of model names, typed in. A name is added with Enter, or when the field is left; one entry can name
 * several, such as a pasted list. Port of components/admin/channel/ModelTagInput.vue.
 */
export function MonitorModelsField({
  label,
  isLabelHidden = false,
  description,
  placeholder,
  models,
  onAdd,
  onChange,
  isDisabled = false,
}: {
  label: string
  isLabelHidden?: boolean
  description?: string
  placeholder?: string
  models: string[]
  /** What was typed in is to be added; it can name several models, or ones already listed. */
  onAdd: (entry: string) => void
  /** The list after a model was taken out of it. */
  onChange: (models: string[]) => void
  isDisabled?: boolean
}) {
  const { t } = useI18n()
  // The field owns its typed text, so a new key is what empties the box.
  const [fieldKey, setFieldKey] = useState(0)
  const inputRef = useRef<HTMLInputElement | HTMLButtonElement>(null)
  const value = useMemo<SearchableItem[]>(() => models.map((model) => ({ id: model, label: model })), [models])

  // Text still in the box when focus leaves is added too: it would not be saved otherwise.
  const addWhatIsLeft = () => {
    const typed = inputRef.current?.value ?? ''
    if (!typed.trim()) return
    setFieldKey((key) => key + 1)
    onAdd(typed)
  }

  return (
    <Tokenizer
      key={fieldKey}
      ref={inputRef}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      placeholder={placeholder}
      searchSource={NO_SUGGESTIONS}
      value={value}
      onChange={(items, change) => {
        if (change.type === 'create') onAdd(change.item.label)
        else onChange(items.map((item) => item.label))
      }}
      onBlur={addWhatIsLeft}
      hasCreate
      minQueryLength={1}
      debounceMs={0}
      // With nothing to pick from, the only entry that finds nothing is a model already in the list.
      emptySearchText={t('common.noOptionsFound')}
      renderItem={(item) => <TypeaheadItem item={item} />}
      isDisabled={isDisabled}
    />
  )
}
