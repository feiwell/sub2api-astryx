import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { parseHeaderOverridesJson, serializeHeaderOverrideRows } from '@/components/account/credentialsBuilder'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { toast } from '~/lib/toast'
import { nextRowKey, type KeyedHeaderRow } from './bulkEditPayload'

// Language-neutral JSON sample; kept out of i18n because the braces read as interpolation
const IMPORT_JSON_PLACEHOLDER = '{"user-agent": "my-client/1.0", "x-relay-token": "..."}'

interface HeaderOverrideRowsEditorProps {
  rows: KeyedHeaderRow[]
  onChange: (rows: KeyedHeaderRow[]) => void
}

/**
 * Request-header override rows (port of HeaderOverrideEditor.vue together
 * with HeaderOverrideJsonTools.vue): name/value rows plus JSON import/copy.
 */
export function HeaderOverrideRowsEditor({ rows, onChange }: HeaderOverrideRowsEditorProps) {
  const { t } = useI18n()
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')

  const hasNamedRows = rows.some((row) => row.name.trim())

  const updateRow = (key: number, patch: Partial<KeyedHeaderRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const closeImport = () => {
    setShowImport(false)
    setImportText('')
  }

  const applyImport = () => {
    const parsed = parseHeaderOverridesJson(importText)
    if (parsed === null) {
      toast.error(t('admin.accounts.headerOverride.importJsonInvalid'))
      return
    }
    onChange(parsed.map((row) => ({ ...row, key: nextRowKey() })))
    closeImport()
  }

  return (
    <VStack gap={2} hAlign="stretch">
      {rows.map((row) => (
        <HStack key={row.key} gap={2} vAlign="center">
          <StackItem size="fill">
            <TextInput
              label={t('admin.accounts.headerOverride.namePlaceholder')}
              isLabelHidden
              placeholder={t('admin.accounts.headerOverride.namePlaceholder')}
              value={row.name}
              onChange={(name) => updateRow(row.key, { name })}
            />
          </StackItem>
          <StackItem size="fill">
            <TextInput
              label={t('admin.accounts.headerOverride.valuePlaceholder')}
              isLabelHidden
              placeholder={t('admin.accounts.headerOverride.valuePlaceholder')}
              value={row.value}
              onChange={(value) => updateRow(row.key, { value })}
            />
          </StackItem>
          <IconButton
            icon={<Icon icon={TrashIcon} />}
            label={t('common.delete')}
            variant="ghost"
            onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
          />
        </HStack>
      ))}
      <Button
        label={t('admin.accounts.headerOverride.addRow')}
        icon={<Icon icon={PlusIcon} />}
        width="100%"
        onClick={() => onChange([...rows, { key: nextRowKey(), name: '', value: '' }])}
      />
      <HStack gap={2} wrap="wrap">
        <Button
          label={t('admin.accounts.headerOverride.importJson')}
          size="sm"
          variant="ghost"
          onClick={() => (showImport ? closeImport() : setShowImport(true))}
        />
        <Button
          label={t('admin.accounts.headerOverride.copyJson')}
          size="sm"
          variant="ghost"
          isDisabled={!hasNamedRows}
          onClick={() => void copyToClipboard(serializeHeaderOverrideRows(rows))}
        />
      </HStack>
      {showImport && (
        <VStack gap={2} hAlign="stretch">
          <TextArea
            label={t('admin.accounts.headerOverride.importJson')}
            isLabelHidden
            rows={5}
            value={importText}
            onChange={setImportText}
            placeholder={IMPORT_JSON_PLACEHOLDER}
            hasSpellCheck={false}
            hasAutoFocus
          />
          <HStack gap={2}>
            <Button label={t('admin.accounts.headerOverride.importJsonApply')} size="sm" variant="primary" onClick={applyImport} />
            <Button label={t('admin.accounts.headerOverride.importJsonCancel')} size="sm" onClick={closeImport} />
          </HStack>
          <Text type="supporting">{t('admin.accounts.headerOverride.importJsonHint')}</Text>
        </VStack>
      )}
      <Text type="supporting">{t('admin.accounts.headerOverride.emptyValueHint')}</Text>
    </VStack>
  )
}
