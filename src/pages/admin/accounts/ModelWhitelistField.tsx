import { useMemo, useState } from 'react'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import { allModels, getModelsByPlatform } from '@/composables/useModelWhitelist'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { toast } from '~/lib/toast'

interface ModelWhitelistFieldProps {
  value: string[]
  onChange: (models: string[]) => void
  /** Current mapping rows, used to reject a custom model that is already mapped elsewhere. */
  modelMappings: { from: string; to: string }[]
  platforms: string[]
  isDisabled?: boolean
}

/**
 * Model whitelist picker (port of ModelWhitelistSelector.vue as used by the
 * bulk editor, which has no single account to sync upstream models from):
 * searchable model list limited to the target platforms, removable chips,
 * "fill related", "clear all" and a custom model entry.
 */
export function ModelWhitelistField({ value, onChange, modelMappings, platforms, isDisabled }: ModelWhitelistFieldProps) {
  const { t } = useI18n()
  const [customModel, setCustomModel] = useState('')

  const normalizedPlatforms = useMemo(
    () => Array.from(new Set(platforms.map((platform) => platform?.trim()).filter((p): p is string => Boolean(p)))),
    [platforms],
  )

  const options = useMemo(() => {
    let available = allModels
    if (normalizedPlatforms.length > 0) {
      const allowed = new Set<string>()
      for (const platform of normalizedPlatforms) {
        for (const model of getModelsByPlatform(platform)) allowed.add(model)
      }
      available = allModels.filter((model) => allowed.has(model.value))
    }
    // Custom models stay listed so their checkbox reflects the selection
    const known = new Set(available.map((model) => model.value))
    const custom = value.filter((model) => !known.has(model)).map((model) => ({ value: model, label: model }))
    return [...available, ...custom].map((model) => ({
      value: model.value,
      label: model.label,
      action: (
        <IconButton
          icon={<Icon icon={ClipboardDocumentIcon} />}
          label={`${t('common.copy')} ${model.value}`}
          variant="ghost"
          size="sm"
          onClick={() => void copyToClipboard(model.value)}
        />
      ),
    }))
  }, [normalizedPlatforms, value, t])

  const addCustom = () => {
    const model = customModel.trim()
    if (!model) return
    if (value.includes(model)) {
      toast.warning(t('admin.accounts.modelExists'))
      return
    }
    const conflict = modelMappings.find(
      (mapping) => mapping.from.trim() === model && mapping.to.trim() && mapping.to.trim() !== model,
    )
    if (conflict) {
      toast.warning(t('admin.accounts.modelMappingConflict', { from: model, to: conflict.to.trim() }))
      return
    }
    onChange([...value, model])
    setCustomModel('')
  }

  const fillRelated = () => {
    const next = [...value]
    for (const platform of normalizedPlatforms) {
      for (const model of getModelsByPlatform(platform)) {
        if (!next.includes(model)) next.push(model)
      }
    }
    onChange(next)
  }

  return (
    <VStack gap={3} hAlign="stretch">
      <MultiSelector
        label={t('admin.accounts.modelWhitelist')}
        isLabelHidden
        options={options}
        value={value}
        onChange={(models) => onChange(models)}
        hasSearch
        searchPlaceholder={t('admin.accounts.searchModels')}
        emptySearchText={t('admin.accounts.noMatchingModels')}
        placeholder={t('admin.accounts.modelCount', { count: 0 })}
        formatValue={(items) => t('admin.accounts.modelCount', { count: items.length })}
        isDisabled={isDisabled}
      />
      {value.length > 0 && (
        <HStack gap={1.5} wrap="wrap">
          {value.map((model) => (
            <Token
              key={model}
              label={model}
              size="sm"
              isDisabled={isDisabled}
              onRemove={() => onChange(value.filter((m) => m !== model))}
            />
          ))}
        </HStack>
      )}
      <HStack gap={2} wrap="wrap">
        <Button label={t('admin.accounts.fillRelatedModels')} size="sm" isDisabled={isDisabled} onClick={fillRelated} />
        <Button label={t('admin.accounts.clearAllModels')} size="sm" isDisabled={isDisabled} onClick={() => onChange([])} />
      </HStack>
      <HStack gap={2} vAlign="end">
        <StackItem size="fill">
          <TextInput
            label={t('admin.accounts.customModelName')}
            placeholder={t('admin.accounts.enterCustomModelName')}
            value={customModel}
            onChange={setCustomModel}
            onEnter={addCustom}
            isDisabled={isDisabled}
          />
        </StackItem>
        <Button label={t('admin.accounts.addModel')} isDisabled={isDisabled} onClick={addCustom} />
      </HStack>
    </VStack>
  )
}
