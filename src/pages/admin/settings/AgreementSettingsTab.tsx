import { useId, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { DateInput } from '@astryxdesign/core/DateInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Field } from '@astryxdesign/core/Field'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { InputGroup, InputGroupText } from '@astryxdesign/core/InputGroup'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { LoginAgreementDocument } from '@/types'
import { useI18n } from '~/i18n'
import type { SystemSettings } from '~/lib/api/admin/settings'
import { toast } from '~/lib/toast'

interface AgreementSettingsTabProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

interface AgreementFormState {
  login_agreement_enabled: boolean
  login_agreement_mode: string
  login_agreement_updated_at: string
}

interface DocumentRow {
  // The route id is editable, so it cannot double as the React key.
  key: number
  doc: LoginAgreementDocument
}

const MAX_DOCUMENTS = 10
const PAIR_COLUMNS = { minWidth: 260, max: 2 }

// Same ids as the Vue page; titles are localized when the defaults are created.
const DEFAULT_DOCUMENT_IDS = ['terms', 'usage-policy', 'supported-regions', 'service-specific-terms'] as const

const defaultDocuments = (t: (key: string) => string): LoginAgreementDocument[] =>
  DEFAULT_DOCUMENT_IDS.map(id => ({
    id,
    title: t(`admin.settings.agreement.defaultDocuments.${id}`),
    content_md: '',
  }))

let nextRowKey = 0
const toRow = (doc: LoginAgreementDocument): DocumentRow => ({ key: nextRowKey++, doc })

// Same rule as the Vue page: lowercase, every run of other characters becomes one "-", no separators at either end.
const normalizeDocumentId = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')

/** The id a document is saved under and served at: /legal/<id>. */
const routeIdOf = (doc: LoginAgreementDocument, index: number) =>
  normalizeDocumentId(doc.id || doc.title) || `doc-${index + 1}`

function SettingsSection({
  title,
  hints,
  children,
}: {
  title: string
  hints: string[]
  children: ReactNode
}) {
  return (
    <VStack gap={4} hAlign="stretch">
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {hints.map(hint => (
          <Text key={hint} type="supporting" color="secondary">
            {hint}
          </Text>
        ))}
      </VStack>
      {children}
    </VStack>
  )
}

export function AgreementSettingsTab({ settings, onSave, saving }: AgreementSettingsTabProps) {
  const { t } = useI18n()
  const modeGroupID = useId()
  const [form, setForm] = useState<AgreementFormState>(() => ({
    login_agreement_enabled: settings.login_agreement_enabled ?? false,
    login_agreement_mode: settings.login_agreement_mode || 'modal',
    login_agreement_updated_at: settings.login_agreement_updated_at || new Date().toISOString().split('T')[0],
  }))
  const [rows, setRows] = useState<DocumentRow[]>(() =>
    (settings.login_agreement_documents?.length ? settings.login_agreement_documents : defaultDocuments(t)).map(toRow)
  )

  const setField = <K extends keyof AgreementFormState>(field: K) => (value: AgreementFormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const addDocument = () => {
    const row = toRow({ id: `document-${Date.now()}`, title: '', content_md: '' })
    setRows(prev => [...prev, row])
  }

  const removeDocument = (key: number) =>
    setRows(prev => (prev.length > 1 ? prev.filter(row => row.key !== key) : prev))

  const updateDocument = (key: number, patch: Partial<LoginAgreementDocument>) =>
    setRows(prev => prev.map(row => (row.key === key ? { ...row, doc: { ...row.doc, ...patch } } : row)))

  const handleSave = async () => {
    // Same clean-up and checks as the Vue page, in the same order.
    const cleaned = rows
      .map((row, index) => ({
        key: row.key,
        doc: {
          ...row.doc,
          id: routeIdOf(row.doc, index),
          title: row.doc.title.trim(),
          content_md: row.doc.content_md.trim(),
        },
      }))
      .filter(({ doc }) => doc.title || doc.content_md)
    const documents = cleaned.map(row => row.doc)

    if (form.login_agreement_enabled && documents.length === 0) {
      toast.error(t('admin.settings.agreement.documentsRequired'))
      return
    }
    if (documents.some(doc => !doc.title)) {
      toast.error(t('admin.settings.agreement.documentTitleRequired'))
      return
    }
    const duplicate = documents.find((doc, index) => documents.findIndex(other => other.id === doc.id) !== index)
    if (duplicate) {
      toast.error(t('admin.settings.agreement.duplicateRoute', { path: `/legal/${duplicate.id}` }))
      return
    }

    const saved = await onSave({ ...form, login_agreement_documents: documents })
    // Show what is stored now. With no document left the backend keeps its previous ones, so the rows stay as typed.
    if (saved && cleaned.length > 0) setRows(cleaned)
  }

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.agreement.title')}
        hints={[t('admin.settings.agreement.description')]}
      >
        <VStack gap={4} hAlign="start">
          <CheckboxInput
            label={t('admin.settings.agreement.enabled')}
            value={form.login_agreement_enabled}
            onChange={setField('login_agreement_enabled')}
          />
          <Field label={t('admin.settings.agreement.displayMode')} inputID={modeGroupID} isGroupLabel>
            <VStack gap={2}>
              <SegmentedControl
                label={t('admin.settings.agreement.displayMode')}
                value={form.login_agreement_mode}
                onChange={setField('login_agreement_mode')}
              >
                <SegmentedControlItem value="modal" label={t('admin.settings.agreement.modal')} />
                <SegmentedControlItem value="checkbox" label={t('admin.settings.agreement.checkbox')} />
              </SegmentedControl>
              <Text type="supporting" color="secondary">
                {form.login_agreement_mode === 'checkbox'
                  ? t('admin.settings.agreement.checkboxHint')
                  : t('admin.settings.agreement.modalHint')}
              </Text>
            </VStack>
          </Field>
          <DateInput
            label={t('admin.settings.agreement.updatedDate')}
            description={t('admin.settings.agreement.updatedDateHint')}
            value={form.login_agreement_updated_at as ISODateString}
            onChange={value => setField('login_agreement_updated_at')(value ?? '')}
            format="system_date"
            weekStartsOn="mon"
          />
        </VStack>
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.agreement.documents')}
        hints={[t('admin.settings.agreement.documentsHint'), t('admin.settings.agreement.routeSlugHint')]}
      >
        {rows.map(({ key, doc }, index) => (
          <Card key={key} padding={4}>
            <VStack gap={4} hAlign="stretch">
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <VStack gap={0}>
                    <Text weight="semibold">{doc.title || t('admin.settings.agreement.untitledDocument')}</Text>
                    <Text type="supporting" color="secondary">
                      {`/legal/${routeIdOf(doc, index)}`}
                    </Text>
                  </VStack>
                </StackItem>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t('common.delete')}
                  tooltip={t('common.delete')}
                  icon={<Icon icon={TrashIcon} />}
                  isDisabled={rows.length <= 1}
                  onClick={() => removeDocument(key)}
                />
              </HStack>
              <Grid columns={PAIR_COLUMNS} gap={4}>
                <TextInput
                  label={t('admin.settings.agreement.documentTitle')}
                  value={doc.title}
                  onChange={title => updateDocument(key, { title })}
                  placeholder={t('admin.settings.agreement.documentTitlePlaceholder')}
                />
                <InputGroup label={t('admin.settings.agreement.routeSlug')}>
                  <InputGroupText>/legal/</InputGroupText>
                  <TextInput
                    label={t('admin.settings.agreement.routeSlug')}
                    isLabelHidden
                    value={doc.id}
                    onChange={id => updateDocument(key, { id })}
                    placeholder="terms"
                  />
                </InputGroup>
              </Grid>
              <TextArea
                label={t('admin.settings.agreement.content')}
                value={doc.content_md}
                onChange={content_md => updateDocument(key, { content_md })}
                placeholder={t('admin.settings.agreement.contentPlaceholder')}
                rows={8}
              />
            </VStack>
          </Card>
        ))}
        <HStack>
          <Button
            icon={<Icon icon={PlusIcon} />}
            label={t('admin.settings.agreement.addDocument')}
            isDisabled={rows.length >= MAX_DOCUMENTS}
            onClick={addDocument}
          />
        </HStack>
      </SettingsSection>

      <Divider />

      <HStack>
        <Button
          variant="primary"
          label={saving ? t('common.saving') : t('common.save')}
          isLoading={saving}
          onClick={() => void handleSave()}
        />
      </HStack>
    </VStack>
  )
}
