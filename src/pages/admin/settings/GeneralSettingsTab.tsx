import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { CustomEndpoint, CustomMenuItem } from '@/types'
import { useI18n } from '~/i18n'

interface GeneralFormState {
  backend_mode_enabled: boolean
  site_name: string
  site_subtitle: string
  site_logo: string
  api_base_url: string
  contact_info: string
  doc_url: string
  home_content: string
  compact_home_enabled: boolean
  hide_ccs_import_button: boolean
  table_default_page_size: number
  table_page_size_options: number[]
  custom_endpoints: CustomEndpoint[]
  custom_menu_items: CustomMenuItem[]
}

type SystemSettings = Partial<GeneralFormState>

interface GeneralSettingsTabProps {
  settings: SystemSettings
  onSave: (updates: SystemSettings) => Promise<boolean>
  saving: boolean
}

const SECTION_COLUMNS = { minWidth: 320, max: 2 }
const PAIR_COLUMNS = { minWidth: 180, max: 2 }

// The backend keeps the menu in the order it is sent; sort_order mirrors the position, as on the Vue page.
function withSortOrder(items: CustomMenuItem[]): CustomMenuItem[] {
  return items.map((item, index) => (item.sort_order === index ? item : { ...item, sort_order: index }))
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Grid columns={SECTION_COLUMNS} gap={10}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && (
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        )}
      </VStack>
      <VStack gap={4} hAlign="stretch">
        {children}
      </VStack>
    </Grid>
  )
}

export function GeneralSettingsTab({ settings, onSave, saving }: GeneralSettingsTabProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<GeneralFormState>({
    backend_mode_enabled: settings.backend_mode_enabled ?? false,
    site_name: settings.site_name || '',
    site_subtitle: settings.site_subtitle || '',
    site_logo: settings.site_logo || '',
    api_base_url: settings.api_base_url || '',
    contact_info: settings.contact_info || '',
    doc_url: settings.doc_url || '',
    home_content: settings.home_content || '',
    compact_home_enabled: settings.compact_home_enabled ?? false,
    hide_ccs_import_button: settings.hide_ccs_import_button ?? false,
    table_default_page_size: settings.table_default_page_size || 20,
    table_page_size_options: settings.table_page_size_options || [10, 20, 50, 100],
    custom_endpoints: settings.custom_endpoints || [],
    custom_menu_items: settings.custom_menu_items || [],
  })

  // A save returns the stored menu items, with the ids the backend generated for new ones.
  // Adopt them, otherwise the next save would send those items without an id and they would get new ones.
  const storedMenuItems = settings.custom_menu_items
  useEffect(() => {
    if (!Array.isArray(storedMenuItems)) return
    setForm(prev => (prev.custom_menu_items === storedMenuItems ? prev : { ...prev, custom_menu_items: storedMenuItems }))
  }, [storedMenuItems])

  const setField = <K extends keyof GeneralFormState>(field: K) => (value: GeneralFormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const addEndpoint = () =>
    setForm(prev => ({
      ...prev,
      custom_endpoints: [...prev.custom_endpoints, { name: '', endpoint: '', description: '' }],
    }))

  const removeEndpoint = (index: number) =>
    setForm(prev => ({
      ...prev,
      custom_endpoints: prev.custom_endpoints.filter((_, i) => i !== index),
    }))

  const updateEndpoint = (index: number, patch: Partial<CustomEndpoint>) =>
    setForm(prev => ({
      ...prev,
      custom_endpoints: prev.custom_endpoints.map((ep, i) => (i === index ? { ...ep, ...patch } : ep)),
    }))

  // A new item carries every field the backend checks: it rejects an item whose visibility is not
  // 'user' or 'admin', and generates the id itself when it is empty.
  const addMenuItem = () =>
    setForm(prev => ({
      ...prev,
      custom_menu_items: [
        ...prev.custom_menu_items,
        { id: '', label: '', icon_svg: '', url: '', visibility: 'user', sort_order: prev.custom_menu_items.length },
      ],
    }))

  const removeMenuItem = (index: number) =>
    setForm(prev => ({
      ...prev,
      custom_menu_items: withSortOrder(prev.custom_menu_items.filter((_, i) => i !== index)),
    }))

  const updateMenuItem = (index: number, patch: Partial<CustomMenuItem>) =>
    setForm(prev => ({
      ...prev,
      custom_menu_items: prev.custom_menu_items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))

  const moveMenuItem = (index: number, direction: -1 | 1) =>
    setForm(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.custom_menu_items.length) return prev
      const items = [...prev.custom_menu_items]
      items[index] = prev.custom_menu_items[target]
      items[target] = prev.custom_menu_items[index]
      return { ...prev, custom_menu_items: withSortOrder(items) }
    })

  const handleSubmit = useCallback(async () => {
    await onSave(form)
  }, [form, onSave])

  const visibilityOptions = [
    { value: 'user', label: t('admin.settings.customMenu.visibilityUser') },
    { value: 'admin', label: t('admin.settings.customMenu.visibilityAdmin') },
  ]

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.site.title')}
        description={t('admin.settings.site.description')}
      >
        <CheckboxInput
          label={t('admin.settings.site.backendMode')}
          description={t('admin.settings.site.backendModeDescription')}
          value={form.backend_mode_enabled}
          onChange={setField('backend_mode_enabled')}
        />
        <Grid columns={PAIR_COLUMNS} gap={4}>
          <TextInput
            label={t('admin.settings.site.siteName')}
            description={t('admin.settings.site.siteNameHint')}
            value={form.site_name}
            onChange={setField('site_name')}
            placeholder={t('admin.settings.site.siteNamePlaceholder')}
          />
          <TextInput
            label={t('admin.settings.site.siteSubtitle')}
            description={t('admin.settings.site.siteSubtitleHint')}
            value={form.site_subtitle}
            onChange={setField('site_subtitle')}
            placeholder={t('admin.settings.site.siteSubtitlePlaceholder')}
          />
        </Grid>
        <TextInput
          label={t('admin.settings.site.siteLogo')}
          description={t('admin.settings.site.siteLogoHint')}
          value={form.site_logo}
          onChange={setField('site_logo')}
          placeholder={t('admin.settings.site.siteLogoPlaceholder')}
        />
        <TextInput
          label={t('admin.settings.site.apiBaseUrl')}
          description={t('admin.settings.site.apiBaseUrlHint')}
          value={form.api_base_url}
          onChange={setField('api_base_url')}
          placeholder={t('admin.settings.site.apiBaseUrlPlaceholder')}
        />
        <TextInput
          label={t('admin.settings.site.contactInfo')}
          description={t('admin.settings.site.contactInfoHint')}
          value={form.contact_info}
          onChange={setField('contact_info')}
          placeholder={t('admin.settings.site.contactInfoPlaceholder')}
        />
        <TextInput
          label={t('admin.settings.site.docUrl')}
          description={t('admin.settings.site.docUrlHint')}
          value={form.doc_url}
          onChange={setField('doc_url')}
          placeholder={t('admin.settings.site.docUrlPlaceholder')}
        />
        <CheckboxInput
          label={t('admin.settings.site.hideCcsImportButton')}
          description={t('admin.settings.site.hideCcsImportButtonHint')}
          value={form.hide_ccs_import_button}
          onChange={setField('hide_ccs_import_button')}
        />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.site.homeContent')}
        description={t('admin.settings.site.homeContentHint')}
      >
        <TextArea
          label={t('admin.settings.site.homeContent')}
          isLabelHidden
          description={t('admin.settings.site.homeContentIframeWarning')}
          value={form.home_content}
          onChange={setField('home_content')}
          placeholder={t('admin.settings.site.homeContentPlaceholder')}
          rows={6}
        />
        <CheckboxInput
          label={t('admin.settings.site.compactHome')}
          description={t('admin.settings.site.compactHomeHint')}
          value={form.compact_home_enabled}
          onChange={setField('compact_home_enabled')}
        />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.site.customEndpoints.title')}
        description={t('admin.settings.site.customEndpoints.description')}
      >
        {form.custom_endpoints.map((ep, index) => (
          <Card key={index} padding={4}>
            <VStack gap={3} hAlign="stretch">
              <HStack gap={2} vAlign="center" justify="between">
                <Text type="body" weight="medium">
                  {t('admin.settings.site.customEndpoints.itemLabel', { n: index + 1 })}
                </Text>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t('common.delete')}
                  tooltip={t('common.delete')}
                  icon={<Icon icon={TrashIcon} />}
                  onClick={() => removeEndpoint(index)}
                />
              </HStack>
              <Grid columns={PAIR_COLUMNS} gap={3}>
                <TextInput
                  label={t('admin.settings.site.customEndpoints.name')}
                  value={ep.name}
                  onChange={(name) => updateEndpoint(index, { name })}
                  placeholder={t('admin.settings.site.customEndpoints.namePlaceholder')}
                />
                <TextInput
                  label={t('admin.settings.site.customEndpoints.endpointUrl')}
                  value={ep.endpoint}
                  onChange={(endpoint) => updateEndpoint(index, { endpoint })}
                  placeholder={t('admin.settings.site.customEndpoints.endpointUrlPlaceholder')}
                />
              </Grid>
              <TextInput
                label={t('admin.settings.site.customEndpoints.descriptionLabel')}
                value={ep.description}
                onChange={(description) => updateEndpoint(index, { description })}
                placeholder={t('admin.settings.site.customEndpoints.descriptionPlaceholder')}
              />
            </VStack>
          </Card>
        ))}
        <HStack>
          <Button
            size="sm"
            icon={<Icon icon={PlusIcon} />}
            label={t('admin.settings.site.customEndpoints.add')}
            onClick={addEndpoint}
          />
        </HStack>
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.customMenu.title')}
        description={t('admin.settings.customMenu.description')}
      >
        {form.custom_menu_items.map((item, index) => (
          <Card key={item.id || `new-${index}`} padding={4}>
            <VStack gap={3} hAlign="stretch">
              <HStack gap={2} vAlign="center" justify="between">
                <Text type="body" weight="medium">
                  {t('admin.settings.customMenu.itemLabel', { n: index + 1 })}
                </Text>
                <HStack gap={1} vAlign="center">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={t('admin.settings.customMenu.moveUp')}
                    tooltip={t('admin.settings.customMenu.moveUp')}
                    icon={<Icon icon={ArrowUpIcon} />}
                    isDisabled={index === 0}
                    onClick={() => moveMenuItem(index, -1)}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={t('admin.settings.customMenu.moveDown')}
                    tooltip={t('admin.settings.customMenu.moveDown')}
                    icon={<Icon icon={ArrowDownIcon} />}
                    isDisabled={index === form.custom_menu_items.length - 1}
                    onClick={() => moveMenuItem(index, 1)}
                  />
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={t('admin.settings.customMenu.remove')}
                    tooltip={t('admin.settings.customMenu.remove')}
                    icon={<Icon icon={TrashIcon} />}
                    onClick={() => removeMenuItem(index)}
                  />
                </HStack>
              </HStack>
              <Grid columns={PAIR_COLUMNS} gap={3}>
                <TextInput
                  label={t('admin.settings.customMenu.name')}
                  value={item.label}
                  onChange={(label) => updateMenuItem(index, { label })}
                  placeholder={t('admin.settings.customMenu.namePlaceholder')}
                />
                <Selector
                  label={t('admin.settings.customMenu.visibility')}
                  options={visibilityOptions}
                  value={item.visibility}
                  onChange={(value) => updateMenuItem(index, { visibility: value as CustomMenuItem['visibility'] })}
                  width="100%"
                />
              </Grid>
              <TextInput
                label={t('admin.settings.customMenu.url')}
                value={item.url}
                onChange={(url) => updateMenuItem(index, { url })}
                placeholder={t('admin.settings.customMenu.urlPlaceholder')}
              />
            </VStack>
          </Card>
        ))}
        <HStack>
          <Button
            size="sm"
            icon={<Icon icon={PlusIcon} />}
            label={t('admin.settings.customMenu.add')}
            onClick={addMenuItem}
          />
        </HStack>
      </SettingsSection>

      <Divider />

      <Grid columns={SECTION_COLUMNS} gap={10}>
        <VStack gap={1} />
        <HStack>
          <Button
            variant="primary"
            label={saving ? t('common.saving') : t('common.save')}
            isLoading={saving}
            onClick={() => void handleSubmit()}
          />
        </HStack>
      </Grid>
    </VStack>
  )
}
