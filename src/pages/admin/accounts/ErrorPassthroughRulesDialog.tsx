import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { CheckCircleIcon, PencilIcon, PlusIcon, ShieldCheckIcon, TrashIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { listPlatforms } from '@/constants/platformCatalog'
import { adminAPI } from '~/lib/api/admin'
import type { ErrorPassthroughRule } from '~/lib/api/admin/errorPassthrough'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

type Mode = 'list' | 'create' | 'edit'
type ApiErrorLike = { response?: { data?: { detail?: string } } }

interface RuleForm {
  name: string
  enabled: boolean
  priority: number
  match_mode: 'any' | 'all'
  platforms: string[]
  passthrough_code: boolean
  response_code: number | null
  passthrough_body: boolean
  custom_message: string | null
  skip_monitoring: boolean
  description: string | null
}

const EMPTY_FORM: RuleForm = {
  name: '',
  enabled: true,
  priority: 0,
  match_mode: 'any',
  platforms: [],
  passthrough_code: true,
  response_code: null,
  passthrough_body: true,
  custom_message: null,
  skip_monitoring: false,
  description: null,
}

interface RuleRow extends Record<string, unknown> {
  __id: string
  rule: ErrorPassthroughRule
}

const KEYWORD_MONO = { fontFamily: 'var(--font-family-code)' }

interface ErrorPassthroughRulesDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Port of components/admin/ErrorPassthroughRulesModal.vue. The create/edit
 * form is a step inside the same dialog instead of a nested dialog.
 */
export function ErrorPassthroughRulesDialog({ isOpen, onClose }: ErrorPassthroughRulesDialogProps) {
  const { t } = useI18n()
  const [rules, setRules] = useState<ErrorPassthroughRule[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<Mode>('list')
  const [editingRule, setEditingRule] = useState<ErrorPassthroughRule | null>(null)
  const [deletingRule, setDeletingRule] = useState<ErrorPassthroughRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM)
  // Raw inputs for the array fields
  const [errorCodesInput, setErrorCodesInput] = useState('')
  const [keywordsInput, setKeywordsInput] = useState('')

  const patch = (next: Partial<RuleForm>) => setForm((prev) => ({ ...prev, ...next }))

  const platformOptions = useMemo(() => listPlatforms().map((spec) => ({ value: spec.id, label: spec.display_name })), [])
  const matchModeOptions = [
    { value: 'any', label: t('admin.errorPassthrough.matchMode.any'), description: t('admin.errorPassthrough.matchMode.anyHint') },
    { value: 'all', label: t('admin.errorPassthrough.matchMode.all'), description: t('admin.errorPassthrough.matchMode.allHint') },
  ]

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      setRules(await adminAPI.errorPassthrough.list())
    } catch (error) {
      toast.error(t('admin.errorPassthrough.failedToLoad'))
      console.error('Error loading rules:', error)
    } finally {
      setLoading(false)
    }
  }, [t])

  // Load rules when the dialog opens
  useEffect(() => {
    if (!isOpen) return
    setMode('list')
    void loadRules()
  }, [isOpen, loadRules])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setErrorCodesInput('')
    setKeywordsInput('')
  }

  const closeForm = () => {
    setMode('list')
    setEditingRule(null)
    resetForm()
  }

  const openCreate = () => {
    resetForm()
    setEditingRule(null)
    setMode('create')
  }

  const handleEdit = useCallback((rule: ErrorPassthroughRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      match_mode: rule.match_mode,
      platforms: [...rule.platforms],
      passthrough_code: rule.passthrough_code,
      response_code: rule.response_code,
      passthrough_body: rule.passthrough_body,
      custom_message: rule.custom_message,
      skip_monitoring: rule.skip_monitoring,
      description: rule.description,
    })
    setErrorCodesInput(rule.error_codes.join(', '))
    setKeywordsInput(rule.keywords.join('\n'))
    setMode('edit')
  }, [])

  const parseErrorCodes = (): number[] => {
    if (!errorCodesInput.trim()) return []
    return errorCodesInput
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
  }

  const parseKeywords = (): string[] => {
    if (!keywordsInput.trim()) return []
    return keywordsInput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error(t('admin.errorPassthrough.nameRequired'))
      return
    }
    const errorCodes = parseErrorCodes()
    const keywords = parseKeywords()
    if (errorCodes.length === 0 && keywords.length === 0) {
      toast.error(t('admin.errorPassthrough.conditionsRequired'))
      return
    }

    setSubmitting(true)
    try {
      const data = {
        name: form.name.trim(),
        enabled: form.enabled,
        priority: form.priority,
        error_codes: errorCodes,
        keywords,
        match_mode: form.match_mode,
        platforms: form.platforms,
        passthrough_code: form.passthrough_code,
        response_code: form.passthrough_code ? null : form.response_code,
        passthrough_body: form.passthrough_body,
        custom_message: form.passthrough_body ? null : form.custom_message,
        skip_monitoring: form.skip_monitoring,
        description: form.description?.trim() || null,
      }
      if (mode === 'edit' && editingRule) {
        await adminAPI.errorPassthrough.update(editingRule.id, data)
        toast.success(t('admin.errorPassthrough.ruleUpdated'))
      } else {
        await adminAPI.errorPassthrough.create(data)
        toast.success(t('admin.errorPassthrough.ruleCreated'))
      }
      closeForm()
      void loadRules()
    } catch (error) {
      toast.error((error as ApiErrorLike).response?.data?.detail || t('admin.errorPassthrough.failedToSave'))
      console.error('Error saving rule:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleEnabled = useCallback(
    async (rule: ErrorPassthroughRule) => {
      try {
        const updated = await adminAPI.errorPassthrough.toggleEnabled(rule.id, !rule.enabled)
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: updated.enabled } : r)))
      } catch (error) {
        toast.error((error as ApiErrorLike).response?.data?.detail || t('admin.errorPassthrough.failedToToggle'))
        console.error('Error toggling rule:', error)
      }
    },
    [t],
  )

  const confirmDelete = async () => {
    if (!deletingRule) return
    setDeleting(true)
    try {
      await adminAPI.errorPassthrough.delete(deletingRule.id)
      toast.success(t('admin.errorPassthrough.ruleDeleted'))
      setDeletingRule(null)
      void loadRules()
    } catch (error) {
      toast.error((error as ApiErrorLike).response?.data?.detail || t('admin.errorPassthrough.failedToDelete'))
      console.error('Error deleting rule:', error)
    } finally {
      setDeleting(false)
    }
  }

  const rows: RuleRow[] = useMemo(() => rules.map((rule) => ({ __id: String(rule.id), rule })), [rules])

  const columns: TableColumn<RuleRow>[] = useMemo(
    () => [
      {
        key: 'priority',
        header: t('admin.errorPassthrough.columns.priority'),
        renderCell: ({ rule }: RuleRow) => <Text type="code">{rule.priority}</Text>,
        width: pixel(80),
      },
      {
        key: 'name',
        header: t('admin.errorPassthrough.columns.name'),
        renderCell: ({ rule }: RuleRow) => (
          <VStack gap={0.5}>
            <Text weight="medium">{rule.name}</Text>
            {rule.description && (
              <Text type="supporting" maxLines={1}>
                {rule.description}
              </Text>
            )}
          </VStack>
        ),
        width: proportional(1.5),
      },
      {
        key: 'conditions',
        header: t('admin.errorPassthrough.columns.conditions'),
        renderCell: ({ rule }: RuleRow) => (
          <VStack gap={1}>
            <HStack gap={1} wrap="wrap" vAlign="center">
              {rule.error_codes.slice(0, 3).map((code) => (
                <Token key={code} label={String(code)} color="red" size="sm" />
              ))}
              {rule.error_codes.length > 3 && <Text type="supporting">+{rule.error_codes.length - 3}</Text>}
              {rule.keywords.slice(0, 1).map((keyword) => (
                <Token
                  key={keyword}
                  label={`"${keyword.length > 10 ? keyword.substring(0, 10) + '...' : keyword}"`}
                  color="gray"
                  size="sm"
                />
              ))}
              {rule.keywords.length > 1 && <Text type="supporting">+{rule.keywords.length - 1}</Text>}
            </HStack>
            <Text type="supporting">{t('admin.errorPassthrough.matchMode.' + rule.match_mode)}</Text>
          </VStack>
        ),
        width: proportional(1.5),
      },
      {
        key: 'platforms',
        header: t('admin.errorPassthrough.columns.platforms'),
        renderCell: ({ rule }: RuleRow) =>
          rule.platforms.length === 0 ? (
            <Text type="supporting">{t('admin.errorPassthrough.allPlatforms')}</Text>
          ) : (
            <HStack gap={1} wrap="wrap" vAlign="center">
              {rule.platforms.slice(0, 2).map((platform) => (
                <Token key={platform} label={platform} color="blue" size="sm" />
              ))}
              {rule.platforms.length > 2 && <Text type="supporting">+{rule.platforms.length - 2}</Text>}
            </HStack>
          ),
        width: proportional(1),
      },
      {
        key: 'behavior',
        header: t('admin.errorPassthrough.columns.behavior'),
        renderCell: ({ rule }: RuleRow) => (
          <VStack gap={0.5}>
            <HStack gap={1} vAlign="center">
              <Icon
                icon={rule.passthrough_code ? CheckCircleIcon : XCircleIcon}
                size="xsm"
                color={rule.passthrough_code ? 'success' : 'disabled'}
              />
              <Text type="supporting">
                {t('admin.errorPassthrough.code')}:{' '}
                {rule.passthrough_code ? t('admin.errorPassthrough.passthrough') : rule.response_code || '-'}
              </Text>
            </HStack>
            <HStack gap={1} vAlign="center">
              <Icon
                icon={rule.passthrough_body ? CheckCircleIcon : XCircleIcon}
                size="xsm"
                color={rule.passthrough_body ? 'success' : 'disabled'}
              />
              <Text type="supporting">
                {t('admin.errorPassthrough.body')}:{' '}
                {rule.passthrough_body ? t('admin.errorPassthrough.passthrough') : t('admin.errorPassthrough.custom')}
              </Text>
            </HStack>
            {rule.skip_monitoring && (
              <HStack gap={1} vAlign="center">
                <Icon icon={CheckCircleIcon} size="xsm" color="warning" />
                <Text type="supporting">{t('admin.errorPassthrough.skipMonitoring')}</Text>
              </HStack>
            )}
          </VStack>
        ),
        width: proportional(1.5),
      },
      {
        key: 'status',
        header: t('admin.errorPassthrough.columns.status'),
        renderCell: ({ rule }: RuleRow) => (
          <Switch
            label={t('admin.errorPassthrough.form.enabled')}
            isLabelHidden
            size="sm"
            value={rule.enabled}
            onChange={() => void toggleEnabled(rule)}
          />
        ),
        width: pixel(90),
      },
      {
        key: 'actions',
        header: t('admin.errorPassthrough.columns.actions'),
        renderCell: ({ rule }: RuleRow) => (
          <HStack gap={1}>
            <IconButton icon={<Icon icon={PencilIcon} />} label={t('common.edit')} variant="ghost" onClick={() => handleEdit(rule)} />
            <IconButton icon={<Icon icon={TrashIcon} />} label={t('common.delete')} variant="ghost" onClick={() => setDeletingRule(rule)} />
          </HStack>
        ),
        width: pixel(100),
      },
    ],
    [t, toggleEnabled, handleEdit],
  )

  const renderList = () => (
    <VStack gap={4} hAlign="stretch">
      <HStack gap={3} vAlign="center" hAlign="between">
        <Text color="secondary">{t('admin.errorPassthrough.description')}</Text>
        <Button
          label={t('admin.errorPassthrough.createRule')}
          icon={<Icon icon={PlusIcon} />}
          variant="primary"
          size="sm"
          onClick={openCreate}
        />
      </HStack>
      {loading ? (
        <Center minHeight={160}>
          <Spinner />
        </Center>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<Icon icon={ShieldCheckIcon} size="lg" color="secondary" />}
          title={t('admin.errorPassthrough.noRules')}
          description={t('admin.errorPassthrough.createFirstRule')}
        />
      ) : (
        <Card padding={0}>
          <Table data={rows} columns={columns} idKey="__id" density="compact" verticalAlign="top" />
        </Card>
      )}
    </VStack>
  )

  const renderForm = () => (
    <VStack gap={4} hAlign="stretch">
      {/* Basic info */}
      <HStack gap={4}>
        <StackItem size="fill">
          <TextInput
            label={t('admin.errorPassthrough.form.name')}
            placeholder={t('admin.errorPassthrough.form.namePlaceholder')}
            value={form.name}
            onChange={(name) => patch({ name })}
            isRequired
          />
        </StackItem>
        <StackItem size="fill">
          <NumberInput
            label={t('admin.errorPassthrough.form.priority')}
            description={t('admin.errorPassthrough.form.priorityHint')}
            value={form.priority}
            onChange={(priority) => patch({ priority })}
            min={0}
            isIntegerOnly
          />
        </StackItem>
      </HStack>
      <TextInput
        label={t('admin.errorPassthrough.form.description')}
        placeholder={t('admin.errorPassthrough.form.descriptionPlaceholder')}
        value={form.description ?? ''}
        onChange={(description) => patch({ description })}
      />

      {/* Match conditions */}
      <Card padding={3}>
        <VStack gap={3} hAlign="stretch">
          <Text weight="medium">{t('admin.errorPassthrough.form.matchConditions')}</Text>
          <HStack gap={3}>
            <StackItem size="fill">
              <TextInput
                label={t('admin.errorPassthrough.form.errorCodes')}
                description={t('admin.errorPassthrough.form.errorCodesHint')}
                placeholder={t('admin.errorPassthrough.form.errorCodesPlaceholder')}
                value={errorCodesInput}
                onChange={setErrorCodesInput}
              />
            </StackItem>
            <StackItem size="fill">
              <TextArea
                label={t('admin.errorPassthrough.form.keywords')}
                description={t('admin.errorPassthrough.form.keywordsHint')}
                placeholder={t('admin.errorPassthrough.form.keywordsPlaceholder')}
                rows={2}
                value={keywordsInput}
                onChange={setKeywordsInput}
                controlStyle={KEYWORD_MONO}
              />
            </StackItem>
          </HStack>
          <RadioList
            label={t('admin.errorPassthrough.form.matchMode')}
            value={form.match_mode}
            onChange={(value) => patch({ match_mode: value === 'all' ? 'all' : 'any' })}
            size="sm">
            {matchModeOptions.map((option) => (
              <RadioListItem key={option.value} value={option.value} label={option.label} description={option.description} />
            ))}
          </RadioList>
          <MultiSelector
            label={t('admin.errorPassthrough.form.platforms')}
            description={t('admin.errorPassthrough.form.platformsHint')}
            placeholder={t('admin.errorPassthrough.allPlatforms')}
            options={platformOptions}
            value={form.platforms}
            onChange={(platforms) => patch({ platforms })}
            triggerDisplay="badges"
          />
        </VStack>
      </Card>

      {/* Response behavior */}
      <Card padding={3}>
        <VStack gap={3} hAlign="stretch">
          <Text weight="medium">{t('admin.errorPassthrough.form.responseBehavior')}</Text>
          <HStack gap={3}>
            <StackItem size="fill">
              <VStack gap={2} hAlign="stretch">
                <CheckboxInput
                  label={t('admin.errorPassthrough.form.passthroughCode')}
                  size="sm"
                  value={form.passthrough_code}
                  onChange={(passthrough_code) => patch({ passthrough_code })}
                />
                {!form.passthrough_code && (
                  <NumberInput
                    label={t('admin.errorPassthrough.form.responseCode')}
                    placeholder="422"
                    value={form.response_code}
                    onChange={(response_code: number | null) => patch({ response_code: response_code ?? null })}
                    min={100}
                    max={599}
                    isIntegerOnly
                    hasClear
                  />
                )}
              </VStack>
            </StackItem>
            <StackItem size="fill">
              <VStack gap={2} hAlign="stretch">
                <CheckboxInput
                  label={t('admin.errorPassthrough.form.passthroughBody')}
                  size="sm"
                  value={form.passthrough_body}
                  onChange={(passthrough_body) => patch({ passthrough_body })}
                />
                {!form.passthrough_body && (
                  <TextInput
                    label={t('admin.errorPassthrough.form.customMessage')}
                    placeholder={t('admin.errorPassthrough.form.customMessagePlaceholder')}
                    value={form.custom_message ?? ''}
                    onChange={(custom_message) => patch({ custom_message })}
                  />
                )}
              </VStack>
            </StackItem>
          </HStack>
        </VStack>
      </Card>

      <CheckboxInput
        label={t('admin.errorPassthrough.form.skipMonitoring')}
        description={t('admin.errorPassthrough.form.skipMonitoringHint')}
        size="sm"
        value={form.skip_monitoring}
        onChange={(skip_monitoring) => patch({ skip_monitoring })}
      />
      <CheckboxInput
        label={t('admin.errorPassthrough.form.enabled')}
        size="sm"
        value={form.enabled}
        onChange={(enabled) => patch({ enabled })}
      />
    </VStack>
  )

  const isForm = mode !== 'list'
  const title = mode === 'edit'
    ? t('admin.errorPassthrough.editRule')
    : mode === 'create'
      ? t('admin.errorPassthrough.createRule')
      : t('admin.errorPassthrough.title')
  // Dismissing the form step returns to the rule list, like closing Vue's nested form modal
  const handleOpenChange = (open: boolean) => {
    if (open) return
    if (isForm) closeForm()
    else onClose()
  }

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={isForm ? 880 : 1120} purpose={isForm ? 'form' : 'info'}>
        <Layout
          header={<DialogHeader title={title} onOpenChange={handleOpenChange} />}
          content={<LayoutContent>{isForm ? renderForm() : renderList()}</LayoutContent>}
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                {isForm ? (
                  <>
                    <Button label={t('common.cancel')} variant="secondary" onClick={closeForm} />
                    <Button
                      label={mode === 'edit' ? t('common.update') : t('common.create')}
                      variant="primary"
                      isLoading={submitting}
                      onClick={() => void handleSubmit()}
                    />
                  </>
                ) : (
                  <Button label={t('common.close')} variant="secondary" onClick={onClose} />
                )}
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      <AlertDialog
        isOpen={deletingRule !== null}
        onOpenChange={(open) => !open && !deleting && setDeletingRule(null)}
        title={t('admin.errorPassthrough.deleteRule')}
        description={t('admin.errorPassthrough.deleteConfirm', { name: deletingRule?.name })}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void confirmDelete()}
      />
    </>
  )
}
