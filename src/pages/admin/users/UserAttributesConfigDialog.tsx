import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { Code } from '@astryxdesign/core/Code'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { ArrowDown, ArrowUp, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import type {
  UserAttributeDefinition,
  UserAttributeOption,
  UserAttributeType,
} from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const ATTRIBUTE_TYPES: UserAttributeType[] = [
  'text',
  'textarea',
  'number',
  'email',
  'url',
  'date',
  'select',
  'multi_select',
]

/** An option row in the editor; `uid` only keeps React keys stable while editing. */
type OptionDraft = { uid: number; value: string; label: string }

let optionUid = 0
const nextOptionUid = () => ++optionUid

type AttributeForm = {
  key: string
  name: string
  type: UserAttributeType
  description: string
  placeholder: string
  required: boolean
  enabled: boolean
  options: OptionDraft[]
}

const emptyForm = (): AttributeForm => ({
  key: '',
  name: '',
  type: 'text',
  description: '',
  placeholder: '',
  required: false,
  enabled: true,
  options: [],
})

/**
 * Port of components/user/UserAttributesConfigModal.vue: manage the custom user
 * attribute definitions (create / edit / delete / reorder / enable).
 */
export function UserAttributesConfigDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  /** Called on close; the page reloads definitions and users afterwards. */
  onClose: () => void
}) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [attributes, setAttributes] = useState<UserAttributeDefinition[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<UserAttributeDefinition | null>(null)
  const [deleting, setDeleting] = useState<UserAttributeDefinition | null>(null)
  const [isDeleteLoading, setIsDeleteLoading] = useState(false)
  const [form, setForm] = useState<AttributeForm>(emptyForm)

  const loadAttributes = useCallback(async () => {
    setLoading(true)
    try {
      setAttributes(await adminAPI.userAttributes.listDefinitions())
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.users.attributes.failedToLoad')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (isOpen) void loadAttributes()
  }, [isOpen, loadAttributes])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setShowEditor(true)
  }

  const openEdit = (attr: UserAttributeDefinition) => {
    setEditing(attr)
    setForm({
      key: attr.key,
      name: attr.name,
      type: attr.type,
      description: attr.description || '',
      placeholder: attr.placeholder || '',
      required: attr.required,
      enabled: attr.enabled,
      options: (attr.options || []).map((option) => ({
        uid: nextOptionUid(),
        value: option.value,
        label: option.label,
      })),
    })
    setShowEditor(true)
  }

  const closeEditor = () => {
    setShowEditor(false)
    setEditing(null)
  }

  const patchForm = <K extends keyof AttributeForm>(key: K, value: AttributeForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const hasOptions = form.type === 'select' || form.type === 'multi_select'

  const handleSave = async () => {
    if (!form.key.trim()) {
      toast.error(t('admin.users.attributes.keyRequired'))
      return
    }
    if (!form.name.trim()) {
      toast.error(t('admin.users.attributes.nameRequired'))
      return
    }
    if (hasOptions && form.options.length === 0) {
      toast.error(t('admin.users.attributes.optionsRequired'))
      return
    }
    setSaving(true)
    try {
      const options: UserAttributeOption[] | undefined = hasOptions
        ? form.options.map((option) => ({ value: option.value, label: option.label }))
        : undefined
      const payload = {
        key: form.key,
        name: form.name,
        type: form.type,
        description: form.description,
        placeholder: form.placeholder,
        required: form.required,
        enabled: form.enabled,
        options,
      }
      if (editing) {
        await adminAPI.userAttributes.updateDefinition(editing.id, payload)
        toast.success(t('admin.users.attributes.updated'))
      } else {
        await adminAPI.userAttributes.createDefinition(payload)
        toast.success(t('admin.users.attributes.created'))
      }
      closeEditor()
      void loadAttributes()
    } catch (error) {
      toast.error(
        extractApiErrorMessage(
          error,
          editing
            ? t('admin.users.attributes.failedToUpdate')
            : t('admin.users.attributes.failedToCreate'),
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setIsDeleteLoading(true)
    try {
      await adminAPI.userAttributes.deleteDefinition(deleting.id)
      toast.success(t('admin.users.attributes.deleted'))
      setDeleting(null)
      void loadAttributes()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.users.attributes.failedToDelete')))
    } finally {
      setIsDeleteLoading(false)
    }
  }

  /** Moves one definition and persists the new order through /reorder. */
  const move = async (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= attributes.length) return
    const next = [...attributes]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setAttributes(next)
    setReordering(true)
    try {
      await adminAPI.userAttributes.reorderDefinitions(next.map((attr) => attr.id))
      toast.success(t('admin.users.attributes.reordered'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.users.attributes.failedToReorder')))
      void loadAttributes()
    } finally {
      setReordering(false)
    }
  }

  /** Enables / disables a definition without opening the editor. */
  const toggleEnabled = async (attr: UserAttributeDefinition, enabled: boolean) => {
    setAttributes((prev) => prev.map((item) => (item.id === attr.id ? { ...item, enabled } : item)))
    try {
      await adminAPI.userAttributes.updateDefinition(attr.id, { enabled })
      toast.success(t('admin.users.attributes.updated'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.users.attributes.failedToUpdate')))
      void loadAttributes()
    }
  }

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={760}>
        <Layout
          header={
            <DialogHeader
              title={t('admin.users.attributes.title')}
              subtitle={t('admin.users.attributes.description')}
              onOpenChange={(open) => !open && onClose()}
              endContent={
                <Button
                  label={t('admin.users.attributes.addAttribute')}
                  variant="primary"
                  size="sm"
                  icon={<Icon icon={Plus} size="sm" />}
                  onClick={openCreate}
                />
              }
            />
          }
          content={
            <LayoutContent>
              {loading ? (
                <Center padding={8}>
                  <Spinner />
                </Center>
              ) : attributes.length === 0 ? (
                <Center padding={8}>
                  <EmptyState
                    icon={<Icon icon={Tag} />}
                    title={t('admin.users.attributes.noAttributes')}
                    description={t('admin.users.attributes.noAttributesHint')}
                    isCompact
                  />
                </Center>
              ) : (
                <VStack gap={2} hAlign="stretch">
                  {attributes.map((attr, index) => (
                    <Card key={attr.id} padding={3}>
                      <HStack gap={3} vAlign="center">
                        <VStack gap={0.5}>
                          <IconButton
                            label={t('admin.settings.customMenu.moveUp')}
                            icon={<Icon icon={ArrowUp} size="xsm" />}
                            variant="ghost"
                            size="sm"
                            isDisabled={index === 0 || reordering}
                            onClick={() => void move(index, -1)}
                          />
                          <IconButton
                            label={t('admin.settings.customMenu.moveDown')}
                            icon={<Icon icon={ArrowDown} size="xsm" />}
                            variant="ghost"
                            size="sm"
                            isDisabled={index === attributes.length - 1 || reordering}
                            onClick={() => void move(index, 1)}
                          />
                        </VStack>
                        <StackItem size="fill">
                          <VStack gap={1}>
                            <HStack gap={2} vAlign="center" wrap="wrap">
                              <Text weight="medium">{attr.name}</Text>
                              <Code>{attr.key}</Code>
                              {attr.required && (
                                <Badge label={t('admin.users.attributes.required')} variant="error" />
                              )}
                              {!attr.enabled && <Badge label={t('common.disabled')} variant="neutral" />}
                            </HStack>
                            <HStack gap={2} vAlign="center" wrap="wrap">
                              <Badge
                                label={t(`admin.users.attributes.types.${attr.type}`)}
                                variant="neutral"
                              />
                              {attr.description && (
                                <Text type="supporting" color="secondary" maxLines={1}>
                                  {attr.description}
                                </Text>
                              )}
                            </HStack>
                          </VStack>
                        </StackItem>
                        <Switch
                          label={t('admin.users.attributes.enabled')}
                          isLabelHidden
                          size="sm"
                          value={attr.enabled}
                          onChange={(checked) => void toggleEnabled(attr, checked)}
                        />
                        <IconButton
                          label={t('common.edit')}
                          icon={<Icon icon={Pencil} size="sm" />}
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(attr)}
                        />
                        <IconButton
                          label={t('common.delete')}
                          icon={<Icon icon={Trash2} size="sm" />}
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(attr)}
                        />
                      </HStack>
                    </Card>
                  ))}
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.close')} variant="secondary" onClick={onClose} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <Dialog isOpen={showEditor} onOpenChange={(open) => !open && closeEditor()} width={560} purpose="form">
        <Layout
          header={
            <DialogHeader
              title={
                editing
                  ? t('admin.users.attributes.editAttribute')
                  : t('admin.users.attributes.addAttribute')
              }
              onOpenChange={(open) => !open && closeEditor()}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <TextInput
                  label={t('admin.users.attributes.key')}
                  value={form.key}
                  onChange={(value) => patchForm('key', value)}
                  placeholder={t('admin.users.attributes.keyHint')}
                  description={t('admin.users.attributes.keyHint')}
                  isRequired
                  isDisabled={!!editing}
                />
                <TextInput
                  label={t('admin.users.attributes.name')}
                  value={form.name}
                  onChange={(value) => patchForm('name', value)}
                  placeholder={t('admin.users.attributes.nameHint')}
                  isRequired
                />
                <Selector
                  label={t('admin.users.attributes.type')}
                  value={form.type}
                  onChange={(value) => patchForm('type', value as UserAttributeType)}
                  options={ATTRIBUTE_TYPES.map((type) => ({
                    value: type,
                    label: t(`admin.users.attributes.types.${type}`),
                  }))}
                />
                {hasOptions && (
                  <VStack gap={2} hAlign="stretch">
                    <Text type="label">{t('admin.users.attributes.options')}</Text>
                    {form.options.map((option, index) => (
                      <HStack key={option.uid} gap={2} vAlign="end">
                        <StackItem size="fill">
                          <TextInput
                            label={t('admin.users.attributes.optionValue')}
                            isLabelHidden
                            size="sm"
                            value={option.value}
                            placeholder={t('admin.users.attributes.optionValue')}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                options: prev.options.map((item, i) =>
                                  i === index ? { ...item, value } : item,
                                ),
                              }))
                            }
                          />
                        </StackItem>
                        <StackItem size="fill">
                          <TextInput
                            label={t('admin.users.attributes.optionLabel')}
                            isLabelHidden
                            size="sm"
                            value={option.label}
                            placeholder={t('admin.users.attributes.optionLabel')}
                            onChange={(label) =>
                              setForm((prev) => ({
                                ...prev,
                                options: prev.options.map((item, i) =>
                                  i === index ? { ...item, label } : item,
                                ),
                              }))
                            }
                          />
                        </StackItem>
                        <IconButton
                          label={t('common.delete')}
                          icon={<Icon icon={X} size="sm" />}
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              options: prev.options.filter((_, i) => i !== index),
                            }))
                          }
                        />
                      </HStack>
                    ))}
                    <HStack>
                      <Button
                        label={t('admin.users.attributes.addOption')}
                        variant="secondary"
                        size="sm"
                        icon={<Icon icon={Plus} size="sm" />}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            options: [...prev.options, { uid: nextOptionUid(), value: '', label: '' }],
                          }))
                        }
                      />
                    </HStack>
                  </VStack>
                )}
                <TextInput
                  label={t('admin.users.attributes.fieldDescription')}
                  value={form.description}
                  onChange={(value) => patchForm('description', value)}
                  placeholder={t('admin.users.attributes.fieldDescriptionHint')}
                />
                <TextInput
                  label={t('admin.users.attributes.placeholder')}
                  value={form.placeholder}
                  onChange={(value) => patchForm('placeholder', value)}
                  placeholder={t('admin.users.attributes.placeholderHint')}
                />
                <HStack gap={6} vAlign="center" wrap="wrap">
                  <CheckboxInput
                    label={t('admin.users.attributes.required')}
                    value={form.required}
                    onChange={(checked) => patchForm('required', checked)}
                  />
                  <CheckboxInput
                    label={t('admin.users.attributes.enabled')}
                    value={form.enabled}
                    onChange={(checked) => patchForm('enabled', checked)}
                  />
                </HStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" onClick={closeEditor} />
                <Button
                  label={
                    saving ? t('common.saving') : editing ? t('common.update') : t('common.create')
                  }
                  variant="primary"
                  isLoading={saving}
                  onClick={() => void handleSave()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('admin.users.attributes.deleteAttribute')}
        description={t('admin.users.attributes.deleteConfirm', { name: deleting?.name ?? '' })}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={isDeleteLoading}
        onAction={() => void handleDelete()}
      />
    </>
  )
}
