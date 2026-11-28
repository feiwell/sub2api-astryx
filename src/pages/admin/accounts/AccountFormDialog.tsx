import {
  syncCreatedAccount,
  useUpstreamModelSync,
} from './useUpstreamModelSync'
import { isMultiProtocolApiKeyPlatform } from '@/components/account/credentialsBuilder'
import {
  AdvancedAccountFields,
  ConnectionProtocolFields,
  CredentialFields,
} from './AdvancedAccountFields'
import { OllamaSettings } from './OllamaSettings'
import { useEffect, useMemo, useState } from 'react'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Section } from '@astryxdesign/core/Section'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector, type SelectorOptionData } from '@astryxdesign/core/Selector'
import { PlatformMarkIcon } from '~/components/common/PlatformMarkIcon'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { Account, AccountType, AdminGroup, Proxy } from '@/types'
import { listPlatforms } from '@/constants/platformCatalog'
import { supportsAccountQuota } from '@/utils/accountQuota'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { ProxyPicker, GroupPicker } from './AccountPickers'
import {
  ReauthAccountDialog,
  type AuthorizedCredentials,
} from './ReauthAccountDialog'
import {
  buildAccountRequest,
  initialForm,
  limits,
  quotaDims,
  typesFor,
  type AccountForm,
  type QuotaDim,
} from './accountForm'

const typeLabels: Record<AccountType, string> = {
  apikey: 'apiKey',
  bedrock: 'bedrockLabel',
  service_account: 'vertexLabel',
  oauth: 'types.oauth',
  'setup-token': 'setupToken',
  upstream: 'types.upstream',
}
interface Props {
  isOpen: boolean
  editing: Account | null
  groups: AdminGroup[]
  onClose: () => void
  onSaved: () => void
}

function platformOption({ value, label }: SelectorOptionData) {
  return (
    <HStack gap={2} vAlign="center">
      <PlatformMarkIcon platform={value} />
      <Text>{label ?? value}</Text>
    </HStack>
  )
}

export function AccountFormDialog({
  isOpen,
  editing,
  groups,
  onClose,
  onSaved,
}: Props) {
  const { t } = useI18n()
  const [form, setForm] = useState(() => initialForm(editing))
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [notifyEnabled, setNotifyEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [authorization, setAuthorization] =
    useState<AuthorizedCredentials | null>(null)
  const oauth = form.type === 'oauth' || form.type === 'setup-token'
  const shadow = editing?.parent_account_id != null
  const draft = useMemo(
    () => ({
      name: form.name,
      type: form.type,
      platform: form.platform,
      proxy_id: form.proxy,
    }),
    [form.name, form.type, form.platform, form.proxy],
  )
  const groupChoices = groups.filter(
    (g) =>
      form.groups.includes(g.id) ||
      g.platform === 'composite' ||
      g.platform === form.platform ||
      (form.platform === 'antigravity' &&
        form.mixedScheduling &&
        ['anthropic', 'gemini'].includes(g.platform)),
  )
  const patch = (fields: Partial<AccountForm>) =>
    setForm((current) => ({ ...current, ...fields }))
  const discovery = useUpstreamModelSync(form, editing, (whitelist) =>
    patch({ whitelist }),
  )
  const patchQuota = (
    dim: QuotaDim,
    fields: Partial<AccountForm['quota'][QuotaDim]>,
  ) => {
    setForm((current) => ({
      ...current,
      quota: { ...current.quota, [dim]: { ...current.quota[dim], ...fields } },
    }))
  }
  const label = (key: string) => t(`admin.accounts.${key}`)
  const changeKind = (platform: string, type: AccountType) => {
    const fresh = initialForm(null)
    setAuthorization(null)
    setForm({
      ...fresh,
      name: form.name,
      notes: form.notes,
      priority: form.priority,
      concurrency: form.concurrency,
      expires: form.expires,
      autoPause: form.autoPause,
      rate: form.rate,
      loadFactor: form.loadFactor,
      groups: platform === form.platform ? form.groups : [],
      proxy: form.proxy,
      platform,
      type,
      authMode: type === 'bedrock' ? 'sigv4' : 'service_account',
    })
  }
  useEffect(() => {
    let active = true
    adminAPI.settings
      .getSettings()
      .then((settings) => {
        if (active)
          setNotifyEnabled(settings.account_quota_notify_enabled === true)
      })
      .catch(() => {
        /* Global notification settings can be restricted to full admins. */
      })
    adminAPI.proxies
      .getAll()
      .then((items) => {
        if (active) setProxies(items)
      })
      .catch((err) => {
        if (active) toast.error(extractApiErrorMessage(err, t('common.error')))
      })
    return () => {
      active = false
    }
  }, [t])

  const save = async () => {
    if (saving || discovery.busy) return
    setSaving(true)
    try {
      const { create, update } = buildAccountRequest(
        form,
        editing,
        authorization,
        t,
      )
      const body = create ?? update
      if (!body) return
      if (
        body.group_ids?.length &&
        ['anthropic', 'antigravity'].includes(form.platform)
      ) {
        const risk = await adminAPI.accounts.checkMixedChannelRisk({
          platform: form.platform,
          group_ids: body.group_ids,
          account_id: editing?.id,
        })
        if (risk.has_risk) {
          if (
            !window.confirm(risk.message || label('mixedChannelWarningTitle'))
          )
            return
          body.confirm_mixed_channel_risk = true
        }
      }
      if (create) {
        const created = await adminAPI.accounts.create(create)
        const mapping = create.credentials.model_mapping
        if (
          discovery.visible &&
          (discovery.previewed.current ||
            (mapping &&
              typeof mapping === 'object' &&
              Object.values(mapping).some(
                (target) =>
                  typeof target === 'string' &&
                  target.trim() &&
                  !target.includes('*'),
              )))
        ) {
          await syncCreatedAccount(created.id)
        }
      } else if (editing && update && Object.keys(update).length)
        await adminAPI.accounts.update(editing.id, update)
      toast.success(label(editing ? 'accountUpdated' : 'accountCreated'))
      onSaved()
      onClose()
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('common.saveFailed')))
    } finally {
      setSaving(false)
    }
  }
  const secretField = (key: 'key' | 'secret' | 'session', title: string) => (
    <TextInput
      label={label(title)}
      type="password"
      value={form[key]}
      onChange={(value) => patch({ [key]: value })}
      description={editing ? label('leaveEmptyToKeep') : undefined}
    />
  )
  if (authorizing)
    return (
      <ReauthAccountDialog
        isOpen
        draft={draft}
        onClose={() => setAuthorizing(false)}
        onAuthorized={(value) => {
          setAuthorization(value)
          patch({ type: value.type })
        }}
      />
    )
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
      width={800}
      maxHeight="85dvh"
      purpose="form"
    >
      <Layout
        header={
          <DialogHeader
            title={label(editing ? 'editAccount' : 'createAccount')}
            onOpenChange={(open) => {
              if (!open && !saving) onClose()
            }}
          />
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={6} hAlign="stretch">
              <Section variant="transparent" padding={4}>
                <VStack gap={3} hAlign="stretch">
                  <Heading level={3}>{t('astryx.accountSectionBasic')}</Heading>
                  <TextInput
                    isRequired
                    label={label('accountName')}
                    value={form.name}
                    onChange={(name) => patch({ name })}
                  />
                  <Grid columns={{ minWidth: 240, max: 2 }} gap={3}>
                    <Selector
                      label={label('platform')}
                      value={form.platform}
                      isDisabled={!!editing}
                      renderOption={platformOption}
                      renderValue={platformOption}
                      options={listPlatforms().map((p) => ({
                        value: p.id,
                        label: p.display_name,
                      }))}
                      onChange={(platform) =>
                        changeKind(platform, typesFor(platform)[0])
                      }
                    />
                    <Selector
                      label={label('columns.type')}
                      value={form.type}
                      isDisabled={!!editing}
                      options={(editing
                        ? [form.type]
                        : typesFor(form.platform)
                      ).map((value) => ({
                        value,
                        label: label(typeLabels[value]),
                      }))}
                      onChange={(value) =>
                        changeKind(form.platform, value as AccountType)
                      }
                    />
                  </Grid>
                </VStack>
              </Section>
              {!shadow && (
                <>
                  <Section
                    variant="transparent"
                    padding={4}
                    dividers={['top']}
                    paddingBlockStart={4}
                  >
                    <VStack gap={3} hAlign="stretch">
                      <Heading level={3}>
                        {t('astryx.accountSectionConnection')}
                      </Heading>
                      <Text weight="medium">{label('proxy')}</Text>
                      <ProxyPicker
                        label={label('proxy')}
                        proxies={proxies}
                        value={form.proxy}
                        onChange={(proxy) => {
                          setAuthorization(null)
                          patch({ proxy })
                        }}
                      />
                      {!editing && oauth && (
                        <Button
                          label={
                            authorization
                              ? t('astryx.accountAuthorized')
                              : label('oauth.completeAuth')
                          }
                          onClick={() => setAuthorizing(true)}
                        />
                      )}
                      <ConnectionProtocolFields
                        form={form}
                        editing={editing}
                        patch={patch}
                      />
                      {(form.type === 'apikey' || form.type === 'upstream') &&
                        !(
                          form.type === 'apikey' &&
                          isMultiProtocolApiKeyPlatform(form.platform) &&
                          form.protocol === 'adaptive'
                        ) && (
                          <TextInput
                            label={label('baseUrl')}
                            value={form.baseUrl}
                            onChange={(baseUrl) => patch({ baseUrl })}
                          />
                        )}
                      {form.type === 'bedrock' && (
                        <>
                          <Selector
                            label={label('bedrockAuthMode')}
                            isDisabled={!!editing}
                            value={form.authMode}
                            onChange={(authMode) => patch({ authMode })}
                            options={['sigv4', 'apikey'].map((value) => ({
                              value,
                              label: label(
                                value === 'sigv4'
                                  ? 'bedrockAuthModeSigv4'
                                  : 'bedrockAuthModeApikey',
                              ),
                            }))}
                          />
                          <TextInput
                            label={label('bedrockRegion')}
                            value={form.region}
                            onChange={(region) => patch({ region })}
                          />
                          {form.authMode === 'sigv4' && (
                            <>
                              <TextInput
                                label={label('bedrockAccessKeyId')}
                                value={form.accessId}
                                onChange={(accessId) => patch({ accessId })}
                              />
                              {secretField('secret', 'bedrockSecretAccessKey')}
                              {secretField('session', 'bedrockSessionToken')}
                            </>
                          )}
                        </>
                      )}
                      {form.type === 'service_account' && (
                        <>
                          {form.platform === 'gemini' && (
                            <Selector
                              label={label('vertexAuthMode')}
                              value={form.authMode}
                              isDisabled={!!editing}
                              options={['service_account', 'apikey'].map(
                                (value) => ({
                                  value,
                                  label: label(
                                    value === 'apikey'
                                      ? 'vertexAuthModeApiKey'
                                      : 'vertexAuthModeServiceAccount',
                                  ),
                                }),
                              )}
                              onChange={(authMode) => patch({ authMode })}
                            />
                          )}
                          {form.authMode === 'apikey' ? (
                            <TextInput
                              label="Project ID"
                              value={form.project}
                              onChange={(project) => patch({ project })}
                            />
                          ) : (
                            <TextArea
                              label={label('vertexSaJsonLabel')}
                              value={form.json}
                              description={
                                editing
                                  ? label('vertexSaJsonKeyHidden')
                                  : undefined
                              }
                              onChange={(json) => patch({ json })}
                            />
                          )}
                          <TextInput
                            label={t('astryx.accountLocation')}
                            value={form.location}
                            onChange={(location) => patch({ location })}
                          />
                        </>
                      )}
                      {(form.type === 'apikey' ||
                        form.type === 'upstream' ||
                        form.authMode === 'apikey') &&
                        secretField('key', 'apiKey')}
                    </VStack>
                  </Section>
                  <Section
                    variant="transparent"
                    padding={4}
                    dividers={['top']}
                    paddingBlockStart={4}
                  >
                    <VStack gap={3} hAlign="stretch">
                      <Heading level={3}>
                        {t('astryx.accountSectionModels')}
                      </Heading>
                      <CredentialFields
                        syncAction={
                          discovery.visible && (
                            <Button
                              size="sm"
                              label={label(
                                discovery.busy
                                  ? 'syncUpstreamModelsLoading'
                                  : 'syncUpstreamModels',
                              )}
                              isDisabled={saving || !discovery.canSync}
                              isLoading={discovery.busy}
                              onClick={() => void discovery.sync()}
                            />
                          )
                        }
                        syncHint={
                          discovery.visible
                            ? editing
                              ? t('astryx.accountSyncSaved')
                              : discovery.needsSavedConnection
                                ? t('astryx.accountSyncNeedsSave')
                                : undefined
                            : undefined
                        }
                        key={`${form.platform}-${form.type}`}
                        form={form}
                        editing={editing}
                        patch={patch}
                      />
                    </VStack>
                  </Section>
                </>
              )}
              <Section
                variant="transparent"
                padding={4}
                dividers={['top']}
                paddingBlockStart={4}
              >
                <VStack gap={3} hAlign="stretch">
                  <Heading level={3}>
                    {t('astryx.accountSectionScheduling')}
                  </Heading>
                  {form.platform === 'antigravity' && (
                    <Switch
                      label={label('mixedScheduling')}
                      value={form.mixedScheduling}
                      onChange={(mixedScheduling) => patch({ mixedScheduling })}
                    />
                  )}
                  <Text weight="medium">{label('columns.groups')}</Text>
                  <GroupPicker
                    label={label('columns.groups')}
                    groups={groupChoices}
                    value={form.groups}
                    onChange={(groups) => patch({ groups })}
                  />
                  <Grid columns={{ minWidth: 240, max: 2 }} gap={3}>
                    <NumberInput
                      label={label('priority')}
                      min={0}
                      isIntegerOnly
                      value={form.priority}
                      onChange={(priority) => patch({ priority })}
                    />
                    <NumberInput
                      label={label('concurrency')}
                      min={0}
                      isIntegerOnly
                      value={form.concurrency}
                      onChange={(concurrency) => patch({ concurrency })}
                    />
                  </Grid>
                  {editing && (
                    <>
                      <Selector
                        label={label('columns.status')}
                        value={form.status}
                        onChange={(status) =>
                          patch({ status: status as Account['status'] })
                        }
                        options={(editing.status === 'error'
                          ? ['error', 'active', 'inactive']
                          : ['active', 'inactive']
                        ).map((value) => ({
                          value,
                          label: label(`status.${value}`),
                        }))}
                      />
                      <Switch
                        label={label('schedulable')}
                        value={form.schedulable}
                        onChange={(schedulable) => patch({ schedulable })}
                      />
                    </>
                  )}
                </VStack>
              </Section>
              {supportsAccountQuota(form.type) && (
                <Section
                  variant="transparent"
                  padding={4}
                  dividers={['top']}
                  paddingBlockStart={4}
                >
                  <Collapsible
                    trigger={t('astryx.accountSectionQuota')}
                    defaultIsOpen={quotaDims.some(
                      (dim) =>
                        form[
                          dim === 'total'
                            ? 'quota_limit'
                            : (`quota_${dim}_limit` as const)
                        ] > 0,
                    )}
                  >
                    <VStack gap={4} hAlign="stretch">
                      {quotaDims.map((dim) => {
                        const key =
                          dim === 'total'
                            ? 'quota_limit'
                            : (`quota_${dim}_limit` as const)
                        const cfg = form.quota[dim]
                        return (
                          <Section
                            key={dim}
                            variant="transparent"
                            padding={4}
                            dividers={dim === 'daily' ? undefined : ['top']}
                            paddingBlockStart={4}
                          >
                            <VStack gap={3} hAlign="stretch">
                              <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
                                <NumberInput
                                  label={label(limits[key])}
                                  min={0}
                                  step={0.01}
                                  value={form[key]}
                                  onChange={(value) => patch({ [key]: value })}
                                />
                                {dim !== 'total' && (
                                  <>
                                    <Selector
                                      label={label('quotaResetMode')}
                                      value={cfg.fixed ? 'fixed' : 'rolling'}
                                      onChange={(value) =>
                                        patchQuota(dim, {
                                          fixed: value === 'fixed',
                                        })
                                      }
                                      options={[
                                        {
                                          value: 'fixed',
                                          label: label('quotaResetModeFixed'),
                                        },
                                        {
                                          value: 'rolling',
                                          label: label('quotaResetModeRolling'),
                                        },
                                      ]}
                                    />
                                    {cfg.fixed && (
                                      <NumberInput
                                        label={label('quotaResetHour')}
                                        min={0}
                                        max={23}
                                        isIntegerOnly
                                        value={cfg.hour}
                                        onChange={(hour) =>
                                          patchQuota(dim, { hour })
                                        }
                                      />
                                    )}
                                    {cfg.fixed && dim === 'weekly' && (
                                      <Selector
                                        label={label('quotaWeeklyResetDay')}
                                        value={String(form.day)}
                                        onChange={(value) =>
                                          patch({ day: Number(value) })
                                        }
                                        options={[
                                          'sunday',
                                          'monday',
                                          'tuesday',
                                          'wednesday',
                                          'thursday',
                                          'friday',
                                          'saturday',
                                        ].map((d, i) => ({
                                          value: String(i),
                                          label: label(`dayOfWeek.${d}`),
                                        }))}
                                      />
                                    )}
                                  </>
                                )}
                              </Grid>
                              {notifyEnabled && form[key] > 0 && (
                                <>
                                  <Switch
                                    label={label('quotaNotify.enabled')}
                                    value={cfg.notify}
                                    onChange={(notify) =>
                                      patchQuota(dim, { notify })
                                    }
                                  />
                                  {cfg.notify && (
                                    <Grid
                                      columns={{ minWidth: 200, max: 2 }}
                                      gap={3}
                                    >
                                      <NumberInput
                                        label={label('quotaNotify.alert')}
                                        value={cfg.threshold}
                                        min={0}
                                        max={cfg.percentage ? 100 : undefined}
                                        step={cfg.percentage ? 1 : 0.01}
                                        onChange={(threshold) =>
                                          patchQuota(dim, { threshold })
                                        }
                                      />
                                      <Selector
                                        label={t('astryx.accountQuotaThresholdUnit')}
                                        value={cfg.percentage ? '%' : '$'}
                                        options={['$', '%'].map((value) => ({
                                          value,
                                          label: value,
                                        }))}
                                        onChange={(value) =>
                                          patchQuota(dim, {
                                            percentage: value === '%',
                                            threshold:
                                              value === '%'
                                                ? Math.min(100, cfg.threshold)
                                                : cfg.threshold,
                                          })
                                        }
                                      />
                                    </Grid>
                                  )}
                                </>
                              )}
                            </VStack>
                          </Section>
                        )
                      })}
                      {supportsAccountQuota(form.type) &&
                        (form.quota.daily.fixed || form.quota.weekly.fixed) && (
                          <TextInput
                            label={label('quotaResetTimezone')}
                            value={form.timezone}
                            onChange={(timezone) => patch({ timezone })}
                          />
                        )}
                    </VStack>
                  </Collapsible>
                </Section>
              )}
              <Section
                variant="transparent"
                padding={4}
                dividers={['top']}
                paddingBlockStart={4}
              >
                <Collapsible
                  trigger={t('astryx.accountSectionAdvanced')}
                  defaultIsOpen={false}
                >
                  <VStack gap={4} hAlign="stretch">
                    <AdvancedAccountFields
                      form={form}
                      editing={editing}
                      patch={patch}
                    />
                    <TextArea
                      label={label('notes')}
                      value={form.notes}
                      onChange={(notes) => patch({ notes })}
                    />
                    {editing?.ollama_cloud_usage?.eligible && (
                      <OllamaSettings
                        key={editing.id}
                        id={editing.id}
                        initial={editing.ollama_cloud_usage}
                        onUpdated={onSaved}
                      />
                    )}
                  </VStack>
                </Collapsible>
              </Section>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button
                label={t('common.cancel')}
                isDisabled={saving}
                onClick={onClose}
              />
              <Button
                label={t('common.save')}
                variant="primary"
                isLoading={saving}
                isDisabled={
                  discovery.busy || (!editing && oauth && !authorization)
                }
                onClick={() => void save()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
