import { getGatewayBaseURL } from '@/api/url'
import { Button } from '@astryxdesign/core/Button'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { InputGroup } from '@astryxdesign/core/InputGroup'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { providerLabel } from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import type { APIMode, ChannelMonitor, CheckMode } from '~/lib/api/admin/channelMonitor'
import type { ChannelMonitorTemplate } from '~/lib/api/admin/channelMonitorTemplate'
import { MonitorAccountField } from './MonitorAccountField'
import { MonitorModelsField } from './MonitorModelsField'
import { MonitorRequestFields } from './MonitorRequestFields'
import {
  FORM_PROVIDERS,
  MAX_INTERVAL_SECONDS,
  MIN_INTERVAL_SECONDS,
  canOnlyReadQuota,
  maxJitterSeconds,
  probes,
  readsQuota,
  templatesFor,
  withApiMode,
  withCheckMode,
  withExtraModels,
  withInterval,
  withProvider,
  withTemplate,
  type MonitorForm,
  type MonitorFormProblems,
} from './monitorForm'

/** The fields a number is typed into; what is typed can be something no number can be read from. */
export type MonitorNumberField = 'interval' | 'jitter'

const CHECK_MODES: readonly CheckMode[] = ['probe', 'quota', 'quota_probe']
const API_MODES: readonly APIMode[] = ['chat_completions', 'responses']

// Selector values are strings, so "no template" needs a value of its own.
const NO_TEMPLATE = '__none__'

/**
 * The fields of a monitor. Which of them there are follows what the monitor does: one that reads a quota has
 * an account, one that probes has an address, a key, models and a request that can be customised.
 */
export function MonitorFormFields({
  id,
  form,
  onEdit,
  monitor,
  templates,
  problems,
  showProblems,
  isAdvancedOpen,
  onAdvancedOpenChange,
  onPickKey,
  onNumberEntryError,
  isDisabled,
}: {
  id: string
  form: MonitorForm
  /** Changes the form, starting from what it is by then. */
  onEdit: (change: (form: MonitorForm) => MonitorForm) => void
  /** The monitor being edited; null for a new one. */
  monitor: ChannelMonitor | null
  templates: ChannelMonitorTemplate[]
  /** The problems to point out. */
  problems: MonitorFormProblems
  /** Saving was tried: what a field finds wrong by itself is pointed out too. */
  showProblems: boolean
  isAdvancedOpen: boolean
  onAdvancedOpenChange: (isOpen: boolean) => void
  onPickKey: () => void
  onNumberEntryError: (field: MonitorNumberField, hasError: boolean) => void
  isDisabled: boolean
}) {
  const { t } = useI18n()
  const probing = probes(form)
  const quotaOnly = canOnlyReadQuota(form.provider)

  // A monitor can have been saved with a provider this form does not offer; it still has to show.
  const providers: readonly string[] = FORM_PROVIDERS.includes(form.provider)
    ? FORM_PROVIDERS
    : [...FORM_PROVIDERS, form.provider]

  const apiModeLabel = (mode: APIMode) =>
    mode === 'responses'
      ? t('admin.channelMonitor.form.apiModeResponses')
      : t('admin.channelMonitor.form.apiModeChatCompletions')

  const offeredTemplates = templatesFor(templates, form)
  const templateOptions = [
    { value: NO_TEMPLATE, label: t('admin.channelMonitor.templateField.none') },
    ...offeredTemplates.map((template) => ({
      value: String(template.id),
      label: form.provider === 'openai' ? `${template.name} · ${apiModeLabel(template.api_mode)}` : template.name,
    })),
  ]
  // The template a monitor was saved with can be gone since, or the templates could not be read.
  if (form.templateId !== null && !offeredTemplates.some((template) => template.id === form.templateId)) {
    templateOptions.push({ value: String(form.templateId), label: `#${form.templateId}` })
  }

  const pickProvider = (value: string) => {
    const provider = FORM_PROVIDERS.find((known) => known === value)
    if (provider) onEdit((current) => withProvider(current, provider))
  }
  const pickCheckMode = (value: string) => {
    const checkMode = CHECK_MODES.find((known) => known === value)
    if (checkMode) onEdit((current) => withCheckMode(current, checkMode))
  }
  const pickApiMode = (value: string) => {
    const apiMode = API_MODES.find((known) => known === value)
    if (apiMode) onEdit((current) => withApiMode(current, apiMode))
  }
  const pickTemplate = (value: string) => {
    // Leaving the template only lets go of it: the request copied from it is the monitor's own.
    if (value === NO_TEMPLATE) return onEdit((current) => ({ ...current, templateId: null }))
    const template = offeredTemplates.find((candidate) => String(candidate.id) === value)
    if (template) onEdit((current) => withTemplate(current, template))
  }

  const apiKeyStatus = problems.apiKey
    ? { type: 'error' as const, message: t('admin.channelMonitor.form.apiKeyPlaceholder') }
    : monitor?.api_key_decrypt_failed && !form.apiKey.trim()
      ? { type: 'warning' as const, message: t('admin.channelMonitor.apiKeyDecryptFailed') }
      : undefined

  return (
    <VStack id={id} gap={4} hAlign="stretch">
      <TextInput
        label={t('admin.channelMonitor.form.name')}
        isRequired
        hasAutoFocus
        placeholder={t('admin.channelMonitor.form.namePlaceholder')}
        value={form.name}
        onChange={(name) => onEdit((current) => ({ ...current, name }))}
        status={problems.name ? { type: 'error', message: t('admin.channelMonitor.nameRequired') } : undefined}
        isDisabled={isDisabled}
      />

      <RadioList
        label={t('admin.channelMonitor.form.checkMode')}
        value={form.checkMode}
        onChange={pickCheckMode}
        isDisabled={isDisabled}
      >
        <RadioListItem
          value="probe"
          label={t('admin.channelMonitor.form.checkModeProbe')}
          description={t('admin.channelMonitor.form.checkModeProbeHint')}
          isDisabled={quotaOnly}
        />
        <RadioListItem
          value="quota"
          label={t('admin.channelMonitor.form.checkModeQuota')}
          description={t('admin.channelMonitor.form.checkModeQuotaHint')}
        />
        <RadioListItem
          value="quota_probe"
          label={t('admin.channelMonitor.form.checkModeQuotaProbe')}
          description={t('admin.channelMonitor.form.checkModeQuotaProbeHint')}
          isDisabled={quotaOnly}
        />
      </RadioList>

      <Selector
        label={t('admin.channelMonitor.form.provider')}
        isRequired
        width="100%"
        options={providers.map((provider) => ({ value: provider, label: providerLabel(provider, t) }))}
        value={form.provider}
        onChange={pickProvider}
        isDisabled={isDisabled}
      />

      {readsQuota(form) && (
        <MonitorAccountField
          key={form.provider}
          provider={form.provider}
          accountId={form.accountId}
          onChange={(accountId) => onEdit((current) => ({ ...current, accountId }))}
          showProblem={showProblems}
          isDisabled={isDisabled}
        />
      )}

      {probing && form.provider === 'openai' && (
        <RadioList
          label={t('admin.channelMonitor.form.apiMode')}
          value={form.apiMode}
          onChange={pickApiMode}
          isDisabled={isDisabled}
        >
          <RadioListItem
            value="chat_completions"
            label={t('admin.channelMonitor.form.apiModeChatCompletions')}
            description={t('admin.channelMonitor.form.apiModeChatCompletionsHint')}
          />
          <RadioListItem
            value="responses"
            label={t('admin.channelMonitor.form.apiModeResponses')}
            description={t('admin.channelMonitor.form.apiModeResponsesHint')}
          />
        </RadioList>
      )}

      {probing && (
        <>
          <InputGroup
            label={t('admin.channelMonitor.form.endpoint')}
            isRequired
            status={problems.endpoint ? { type: 'error', message: t('common.required') } : undefined}
            isDisabled={isDisabled}
          >
            <TextInput
              label={t('admin.channelMonitor.form.endpoint')}
              isLabelHidden
              type="url"
              placeholder={t('admin.channelMonitor.form.endpointPlaceholder')}
              hasSpellCheck={false}
              autoComplete="off"
              value={form.endpoint}
              onChange={(endpoint) => onEdit((current) => ({ ...current, endpoint }))}
              // The group words the problem; the input is what is marked, and what takes the focus.
              status={problems.endpoint ? { type: 'error' } : undefined}
            />
            <Button
              label={t('admin.channelMonitor.form.useCurrentDomain')}
              variant="secondary"
              onClick={() => onEdit((current) => ({ ...current, endpoint: getGatewayBaseURL() }))}
            />
          </InputGroup>

          <InputGroup
            label={t('admin.channelMonitor.form.apiKey')}
            // A monitor being edited keeps its key unless a new one is typed; this is the one it has.
            description={monitor?.api_key_masked || undefined}
            isRequired={monitor === null}
            status={apiKeyStatus}
            isDisabled={isDisabled}
          >
            <TextInput
              label={t('admin.channelMonitor.form.apiKey')}
              isLabelHidden
              type="password"
              // Keeps a browser from filling in the password it saved for signing in.
              autoComplete="new-password"
              placeholder={
                monitor
                  ? t('admin.channelMonitor.form.apiKeyEditPlaceholder')
                  : t('admin.channelMonitor.form.apiKeyPlaceholder')
              }
              hasSpellCheck={false}
              value={form.apiKey}
              onChange={(apiKey) => onEdit((current) => ({ ...current, apiKey }))}
              status={problems.apiKey ? { type: 'error' } : undefined}
            />
            <Button label={t('admin.channelMonitor.form.useMyKey')} variant="secondary" onClick={onPickKey} />
          </InputGroup>

          <TextInput
            label={t('admin.channelMonitor.form.primaryModel')}
            isRequired
            placeholder={t('admin.channelMonitor.form.primaryModelPlaceholder')}
            hasSpellCheck={false}
            autoComplete="off"
            value={form.primaryModel}
            onChange={(primaryModel) => onEdit((current) => ({ ...current, primaryModel }))}
            status={
              problems.primaryModel
                ? { type: 'error', message: t('admin.channelMonitor.primaryModelRequired') }
                : undefined
            }
            isDisabled={isDisabled}
          />

          <MonitorModelsField
            label={t('admin.channelMonitor.form.extraModels')}
            description={t('admin.channels.form.modelInputHint')}
            placeholder={t('admin.channelMonitor.form.extraModelsPlaceholder')}
            models={form.extraModels}
            onAdd={(entry) => onEdit((current) => withExtraModels(current, entry))}
            onChange={(extraModels) => onEdit((current) => ({ ...current, extraModels }))}
            isDisabled={isDisabled}
          />
        </>
      )}

      <TextInput
        label={t('admin.channelMonitor.form.groupName')}
        placeholder={t('admin.channelMonitor.form.groupNamePlaceholder')}
        value={form.groupName}
        onChange={(groupName) => onEdit((current) => ({ ...current, groupName }))}
        isDisabled={isDisabled}
      />

      <NumberInput
        label={t('admin.channelMonitor.form.intervalSeconds')}
        description={t('admin.channelMonitor.form.intervalSecondsHint')}
        width="100%"
        min={MIN_INTERVAL_SECONDS}
        max={MAX_INTERVAL_SECONDS}
        isIntegerOnly
        value={form.intervalSeconds}
        onChange={(intervalSeconds) => onEdit((current) => withInterval(current, intervalSeconds))}
        onEntryErrorChange={(error) => onNumberEntryError('interval', error !== null)}
        isDisabled={isDisabled}
      />

      <NumberInput
        label={t('admin.channelMonitor.form.jitterSeconds')}
        description={t('admin.channelMonitor.form.jitterSecondsHint')}
        width="100%"
        min={0}
        max={maxJitterSeconds(form.intervalSeconds)}
        isIntegerOnly
        value={form.jitterSeconds}
        onChange={(jitterSeconds) => onEdit((current) => ({ ...current, jitterSeconds }))}
        onEntryErrorChange={(error) => onNumberEntryError('jitter', error !== null)}
        isDisabled={isDisabled}
      />

      <Switch
        label={t('admin.channelMonitor.form.enabled')}
        labelPosition="start"
        labelSpacing="spread"
        value={form.enabled}
        onChange={(enabled) => onEdit((current) => ({ ...current, enabled }))}
        isDisabled={isDisabled}
      />

      {probing && (
        <Collapsible
          isOpen={isAdvancedOpen}
          onOpenChange={onAdvancedOpenChange}
          trigger={<Text weight="semibold">{t('admin.channelMonitor.advanced.section')}</Text>}
        >
          <VStack gap={4} hAlign="stretch" paddingBlockStart={3}>
            <Text type="supporting">{t('admin.channelMonitor.advanced.sectionHint')}</Text>
            <Selector
              label={t('admin.channelMonitor.templateField.label')}
              description={t('admin.channelMonitor.templateField.applyHint')}
              placeholder={t('admin.channelMonitor.templateField.placeholder')}
              width="100%"
              options={templateOptions}
              value={form.templateId === null ? NO_TEMPLATE : String(form.templateId)}
              onChange={pickTemplate}
              isDisabled={isDisabled}
            />
            <MonitorRequestFields
              draft={form.request}
              onChange={(request) => onEdit((current) => ({ ...current, request }))}
              provider={form.provider}
              apiMode={form.apiMode}
              showProblems={showProblems}
              isDisabled={isDisabled}
            />
          </VStack>
        </Collapsible>
      )}
    </VStack>
  )
}
