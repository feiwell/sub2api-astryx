import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { keysAPI } from '@/api'
import type { ApiKey, Group, UpdateApiKeyRequest } from '@/types'
import { formatDateTime } from '@/utils/format'
import { KEY_GROUP_PROVIDERS, getKeyGroupProvider, type KeyGroupProvider } from '@/utils/keyGroupProviders'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useGroupOptions } from './groupOptions'
import { serverDetail, usageLevel, usd, type UsageLevel } from './keyFormat'

interface KeyFormDialogProps {
  isOpen: boolean
  onClose: () => void
  /** The key was created or updated; the list should reload. */
  onSuccess: () => void
  /** The key being edited, kept current by the page; absent when creating. */
  editKey?: ApiKey | null
  groups: Group[]
  userGroupRates?: Record<number, number>
  /** The used quota was reset in place, without a list reload. */
  onKeyPatched?: (id: number, patch: Pick<ApiKey, 'quota_used' | 'status'>) => void
  /** Ask the page to confirm and reset the rate-limit usage of this key. */
  onResetRateLimit?: (key: ApiKey) => void
}

type ExpirationPreset = '7' | '30' | '90' | 'custom'

interface KeyForm {
  name: string
  groupId: number | null
  status: 'active' | 'inactive'
  useCustomKey: boolean
  customKey: string
  enableIpRestriction: boolean
  ipWhitelist: string
  ipBlacklist: string
  quota: number | null
  enableRateLimit: boolean
  rateLimit5h: number | null
  rateLimit1d: number | null
  rateLimit7d: number | null
  enableExpiration: boolean
  expirationPreset: ExpirationPreset
  expirationDate: string
}

const EXPIRATION_DAY_PRESETS = ['7', '30', '90'] as const
const DAY_MS = 24 * 60 * 60 * 1000
const NO_RATES: Record<number, number> = {}

const LEVEL_VARIANT: Record<UsageLevel, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  near: 'warning',
  full: 'error',
}

const pad = (n: number) => n.toString().padStart(2, '0')

/** Local wall-clock time as `YYYY-MM-DDTHH:MM`, the value format of the date-time input. */
const toLocalInputValue = (date: Date) => {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const daysFromNow = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toLocalInputValue(date)
}

const emptyForm = (): KeyForm => ({
  name: '',
  groupId: null,
  status: 'active',
  useCustomKey: false,
  customKey: '',
  enableIpRestriction: false,
  ipWhitelist: '',
  ipBlacklist: '',
  quota: null,
  enableRateLimit: false,
  rateLimit5h: null,
  rateLimit1d: null,
  rateLimit7d: null,
  enableExpiration: false,
  expirationPreset: '30',
  expirationDate: '',
})

const formFromKey = (key: ApiKey): KeyForm => ({
  name: key.name,
  groupId: key.group_id,
  // A key the server stopped (out of quota, expired) can only be switched back on from here.
  status: key.status === 'quota_exhausted' || key.status === 'expired' ? 'inactive' : key.status,
  useCustomKey: false,
  customKey: '',
  enableIpRestriction: key.ip_whitelist?.length > 0 || key.ip_blacklist?.length > 0,
  ipWhitelist: (key.ip_whitelist || []).join('\n'),
  ipBlacklist: (key.ip_blacklist || []).join('\n'),
  quota: key.quota > 0 ? key.quota : null,
  enableRateLimit: key.rate_limit_5h > 0 || key.rate_limit_1d > 0 || key.rate_limit_7d > 0,
  rateLimit5h: key.rate_limit_5h || null,
  rateLimit1d: key.rate_limit_1d || null,
  rateLimit7d: key.rate_limit_7d || null,
  enableExpiration: !!key.expires_at,
  expirationPreset: 'custom',
  expirationDate: key.expires_at ? toLocalInputValue(new Date(key.expires_at)) : '',
})

const parseIpList = (text: string): string[] =>
  text
    .split('\n')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0)

const shouldSubmitEditStatus = (key: ApiKey, status: 'active' | 'inactive') => {
  if (key.status === 'quota_exhausted' || key.status === 'expired') return status === 'active'
  return true
}

const firstProviderWithGroups = (groups: Group[]): KeyGroupProvider =>
  KEY_GROUP_PROVIDERS.find((provider) => groups.some((group) => getKeyGroupProvider(group.platform) === provider)) ??
  'anthropic'

/** Create or edit an API key (port of the form dialog in KeysView.vue). */
export function KeyFormDialog({
  isOpen,
  onClose,
  onSuccess,
  editKey = null,
  groups,
  userGroupRates = NO_RATES,
  onKeyPatched,
  onResetRateLimit,
}: KeyFormDialogProps) {
  const { t } = useI18n()
  const isEdit = editKey !== null

  const [form, setForm] = useState<KeyForm>(emptyForm)
  const [provider, setProvider] = useState<KeyGroupProvider>('anthropic')
  const [nameMissing, setNameMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resetQuotaOpen, setResetQuotaOpen] = useState(false)

  // Fill the form once per opening, so a list reload behind the dialog never wipes edits.
  const session = isOpen ? (editKey ? `edit:${editKey.id}` : 'create') : null
  const [activeSession, setActiveSession] = useState<string | null>(null)
  if (session !== activeSession) {
    setActiveSession(session)
    if (session !== null) {
      setForm(editKey ? formFromKey(editKey) : emptyForm())
      setProvider(firstProviderWithGroups(groups))
      setNameMissing(false)
    }
  }

  const patch = (changes: Partial<KeyForm>) => setForm((current) => ({ ...current, ...changes }))

  const groupsOf = (value: KeyGroupProvider) => groups.filter((group) => getKeyGroupProvider(group.platform) === value)
  // Groups may arrive after the dialog opened; never rest on a provider without any.
  const activeProvider = groupsOf(provider).length > 0 ? provider : firstProviderWithGroups(groups)
  const formGroups = isEdit ? groups : groupsOf(activeProvider)
  const groupId = isEdit || formGroups.some((group) => group.id === form.groupId) ? form.groupId : null
  const groupSelect = useGroupOptions(formGroups, userGroupRates, isEdit ? editKey.group : null)
  const selectedGroup = groupId === null ? undefined : groupSelect.groupsById.get(String(groupId))
  const selectedPeak = selectedGroup ? groupSelect.peakWindow(selectedGroup) : ''

  const customKeyError = (() => {
    if (!form.useCustomKey || !form.customKey) return ''
    if (form.customKey.length < 16) return t('keys.customKeyTooShort')
    if (!/^[a-zA-Z0-9_-]+$/.test(form.customKey)) return t('keys.customKeyInvalidChars')
    return ''
  })()

  const close = () => {
    if (!submitting) onClose()
  }

  const toggleExpiration = (enabled: boolean) => {
    // The highlighted preset is what gets applied, so give it a date straight away.
    if (enabled && !form.expirationDate && form.expirationPreset !== 'custom') {
      patch({ enableExpiration: true, expirationDate: daysFromNow(Number(form.expirationPreset)) })
    } else {
      patch({ enableExpiration: enabled })
    }
  }

  const selectExpirationPreset = (value: string) => {
    const preset = value as ExpirationPreset
    if (preset === 'custom') patch({ expirationPreset: 'custom' })
    else patch({ expirationPreset: preset, expirationDate: daysFromNow(Number(preset)) })
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!form.name) {
      setNameMissing(true)
      return
    }
    if (groupId === null) {
      toast.error(t('keys.groupRequired'))
      return
    }
    if (!isEdit && form.useCustomKey) {
      if (!form.customKey) {
        toast.error(t('keys.customKeyRequired'))
        return
      }
      if (customKeyError) {
        toast.error(customKeyError)
        return
      }
    }

    const ipWhitelist = form.enableIpRestriction ? parseIpList(form.ipWhitelist) : []
    const ipBlacklist = form.enableIpRestriction ? parseIpList(form.ipBlacklist) : []
    // Empty or 0 means unlimited, stored as 0.
    const quota = form.quota && form.quota > 0 ? form.quota : 0

    let expiresInDays: number | undefined
    let expiresAt: string | undefined
    if (form.enableExpiration && form.expirationDate) {
      if (isEdit) {
        expiresAt = new Date(form.expirationDate).toISOString()
      } else {
        const diffDays = Math.ceil((new Date(form.expirationDate).getTime() - Date.now()) / DAY_MS)
        expiresInDays = diffDays > 0 ? diffDays : 1
      }
    } else if (isEdit) {
      // An empty string clears the expiration.
      expiresAt = ''
    }

    const limit = (value: number | null) => (form.enableRateLimit && value && value > 0 ? value : 0)
    const rateLimits = {
      rate_limit_5h: limit(form.rateLimit5h),
      rate_limit_1d: limit(form.rateLimit1d),
      rate_limit_7d: limit(form.rateLimit7d),
    }

    setSubmitting(true)
    try {
      if (editKey) {
        const updates: UpdateApiKeyRequest = {
          name: form.name,
          group_id: groupId,
          ip_whitelist: ipWhitelist,
          ip_blacklist: ipBlacklist,
          quota,
          expires_at: expiresAt,
          ...rateLimits,
        }
        if (shouldSubmitEditStatus(editKey, form.status)) updates.status = form.status
        await keysAPI.update(editKey.id, updates)
        toast.success(t('keys.keyUpdatedSuccess'))
      } else {
        await keysAPI.create(
          form.name,
          groupId,
          form.useCustomKey ? form.customKey : undefined,
          ipWhitelist,
          ipBlacklist,
          quota,
          expiresInDays,
          rateLimits,
        )
        toast.success(t('keys.keyCreatedSuccess'))
      }
      onClose()
      onSuccess()
    } catch (error) {
      toast.error(serverDetail(error) || t('keys.failedToSave'))
    } finally {
      setSubmitting(false)
    }
  }

  const resetQuotaUsed = async () => {
    if (!editKey) return
    setResetQuotaOpen(false)
    try {
      const updated = await keysAPI.update(editKey.id, { reset_quota: true })
      toast.success(t('keys.quotaResetSuccess'))
      onKeyPatched?.(editKey.id, { quota_used: updated.quota_used, status: updated.status })
      if (editKey.status !== updated.status) {
        patch({ status: updated.status === 'active' ? 'active' : 'inactive' })
      }
    } catch (error) {
      toast.error(serverDetail(error) || t('keys.failedToResetQuota'))
    }
  }

  const windowUsage = (used: number, limitValue: number, label: string) =>
    limitValue > 0 ? (
      <VStack gap={1} hAlign="stretch">
        <Text type="supporting" hasTabularNumbers>
          {usd(used, 4)} / {usd(limitValue, 2)}
        </Text>
        <ProgressBar
          label={label}
          isLabelHidden
          value={Math.min(used, limitValue)}
          max={limitValue}
          variant={LEVEL_VARIANT[usageLevel(used, limitValue)]}
        />
      </VStack>
    ) : null

  const hasRateLimit =
    isEdit && (editKey.rate_limit_5h > 0 || editKey.rate_limit_1d > 0 || editKey.rate_limit_7d > 0)

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={(open) => !open && close()} width={560} purpose="form">
        <Layout
          header={
            <DialogHeader
              title={isEdit ? t('keys.editKey') : t('keys.createKey')}
              onOpenChange={(open) => !open && close()}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={5} hAlign="stretch">
                <TextInput
                  label={t('keys.nameLabel')}
                  value={form.name}
                  onChange={(name) => {
                    patch({ name })
                    setNameMissing(false)
                  }}
                  onEnter={() => void handleSubmit()}
                  placeholder={t('keys.namePlaceholder')}
                  isRequired
                  hasAutoFocus
                  status={nameMissing ? { type: 'error', message: t('common.required') } : undefined}
                />

                {!isEdit && (
                  <VStack gap={2} hAlign="stretch">
                    <Text type="label">{t('keys.providerLabel')}</Text>
                    <SegmentedControl
                      label={t('keys.providerLabel')}
                      layout="fill"
                      value={activeProvider}
                      onChange={(value) => {
                        if (value === activeProvider) return
                        setProvider(value as KeyGroupProvider)
                        patch({ groupId: null })
                      }}
                    >
                      {KEY_GROUP_PROVIDERS.map((value) => (
                        <SegmentedControlItem
                          key={value}
                          value={value}
                          label={t(`keys.providers.${value}`)}
                          isDisabled={groupsOf(value).length === 0}
                        />
                      ))}
                    </SegmentedControl>
                    <Text type="supporting">
                      {groups.length === 0
                        ? t('common.noGroupsAvailable')
                        : t(`keys.providerHints.${activeProvider}`)}
                    </Text>
                  </VStack>
                )}

                <VStack gap={1} hAlign="stretch">
                  <Selector
                    label={t('keys.groupLabel')}
                    isRequired
                    value={groupId === null ? '' : String(groupId)}
                    onChange={(value) => patch({ groupId: value ? Number(value) : null })}
                    options={groupSelect.options}
                    renderOption={groupSelect.renderOption}
                    renderValue={groupSelect.renderValue}
                    placeholder={t('keys.selectGroup')}
                    emptyText={t('common.noGroupsAvailable')}
                    hasSearch
                    searchPlaceholder={t('keys.searchGroup')}
                    emptySearchText={t('keys.noGroupFound')}
                  />
                  {selectedPeak && (
                    <Text type="supporting">{t('common.peakRateTooltip', { window: selectedPeak })}</Text>
                  )}
                </VStack>

                {!isEdit && (
                  <VStack gap={3} hAlign="stretch">
                    <Switch
                      label={t('keys.customKeyLabel')}
                      labelPosition="start"
                      labelSpacing="spread"
                      value={form.useCustomKey}
                      onChange={(useCustomKey) => patch({ useCustomKey })}
                    />
                    {form.useCustomKey && (
                      <TextInput
                        label={t('keys.customKeyLabel')}
                        isLabelHidden
                        value={form.customKey}
                        onChange={(customKey) => patch({ customKey })}
                        onEnter={() => void handleSubmit()}
                        placeholder={t('keys.customKeyPlaceholder')}
                        description={customKeyError ? undefined : t('keys.customKeyHint')}
                        status={customKeyError ? { type: 'error', message: customKeyError } : undefined}
                      />
                    )}
                  </VStack>
                )}

                {isEdit && (
                  <Selector
                    label={t('keys.statusLabel')}
                    value={form.status}
                    onChange={(status) => patch({ status: status as 'active' | 'inactive' })}
                    options={[
                      { value: 'active', label: t('common.active') },
                      { value: 'inactive', label: t('common.inactive') },
                    ]}
                    placeholder={t('keys.selectStatus')}
                  />
                )}

                <VStack gap={3} hAlign="stretch">
                  <Switch
                    label={t('keys.ipRestriction')}
                    labelPosition="start"
                    labelSpacing="spread"
                    value={form.enableIpRestriction}
                    onChange={(enableIpRestriction) => patch({ enableIpRestriction })}
                  />
                  {form.enableIpRestriction && (
                    <>
                      <TextArea
                        label={t('keys.ipWhitelist')}
                        description={t('keys.ipWhitelistHint')}
                        value={form.ipWhitelist}
                        onChange={(ipWhitelist) => patch({ ipWhitelist })}
                        rows={3}
                        placeholder={t('keys.ipWhitelistPlaceholder')}
                      />
                      <TextArea
                        label={t('keys.ipBlacklist')}
                        description={t('keys.ipBlacklistHint')}
                        value={form.ipBlacklist}
                        onChange={(ipBlacklist) => patch({ ipBlacklist })}
                        rows={3}
                        placeholder={t('keys.ipBlacklistPlaceholder')}
                      />
                    </>
                  )}
                </VStack>

                <VStack gap={3} hAlign="stretch">
                  <NumberInput
                    label={t('keys.quotaLimit')}
                    description={t('keys.quotaAmountHint')}
                    value={form.quota}
                    onChange={(quota: number | null) => patch({ quota })}
                    min={0}
                    step={0.01}
                    units="USD"
                    hasClear
                    placeholder={t('keys.quotaAmountPlaceholder')}
                  />
                  {isEdit && editKey.quota > 0 && (
                    <VStack gap={1} hAlign="stretch">
                      <Text type="label">{t('keys.quotaUsed')}</Text>
                      <HStack gap={2} vAlign="center">
                        <StackItem size="fill">
                          <Text type="body" hasTabularNumbers>
                            {usd(editKey.quota_used, 4)} / {usd(editKey.quota, 2)}
                          </Text>
                        </StackItem>
                        <Button
                          size="sm"
                          variant="secondary"
                          label={t('keys.reset')}
                          tooltip={t('keys.resetQuotaUsed')}
                          onClick={() => setResetQuotaOpen(true)}
                        />
                      </HStack>
                    </VStack>
                  )}
                </VStack>

                <VStack gap={3} hAlign="stretch">
                  <Switch
                    label={t('keys.rateLimitSection')}
                    labelPosition="start"
                    labelSpacing="spread"
                    value={form.enableRateLimit}
                    onChange={(enableRateLimit) => patch({ enableRateLimit })}
                  />
                  {form.enableRateLimit && (
                    <>
                      <Text type="supporting">{t('keys.rateLimitHint')}</Text>
                      <NumberInput
                        label={t('keys.rateLimit5h')}
                        value={form.rateLimit5h}
                        onChange={(rateLimit5h: number | null) => patch({ rateLimit5h })}
                        min={0}
                        step={0.01}
                        hasClear
                        placeholder="0"
                      />
                      {isEdit && windowUsage(editKey.usage_5h, editKey.rate_limit_5h, t('keys.rateLimit5h'))}
                      <NumberInput
                        label={t('keys.rateLimit1d')}
                        value={form.rateLimit1d}
                        onChange={(rateLimit1d: number | null) => patch({ rateLimit1d })}
                        min={0}
                        step={0.01}
                        hasClear
                        placeholder="0"
                      />
                      {isEdit && windowUsage(editKey.usage_1d, editKey.rate_limit_1d, t('keys.rateLimit1d'))}
                      <NumberInput
                        label={t('keys.rateLimit7d')}
                        value={form.rateLimit7d}
                        onChange={(rateLimit7d: number | null) => patch({ rateLimit7d })}
                        min={0}
                        step={0.01}
                        hasClear
                        placeholder="0"
                      />
                      {isEdit && windowUsage(editKey.usage_7d, editKey.rate_limit_7d, t('keys.rateLimit7d'))}
                      {hasRateLimit && (
                        <HStack>
                          <Button
                            size="sm"
                            variant="secondary"
                            label={t('keys.resetRateLimitUsage')}
                            onClick={() => onResetRateLimit?.(editKey)}
                          />
                        </HStack>
                      )}
                    </>
                  )}
                </VStack>

                <VStack gap={3} hAlign="stretch">
                  <Switch
                    label={t('keys.expiration')}
                    labelPosition="start"
                    labelSpacing="spread"
                    value={form.enableExpiration}
                    onChange={toggleExpiration}
                  />
                  {form.enableExpiration && (
                    <>
                      <SegmentedControl
                        label={t('keys.expiration')}
                        layout="fill"
                        value={form.expirationPreset}
                        onChange={selectExpirationPreset}
                      >
                        {EXPIRATION_DAY_PRESETS.map((days) => (
                          <SegmentedControlItem
                            key={days}
                            value={days}
                            label={isEdit ? t('keys.extendDays', { days }) : t('keys.expiresInDays', { days })}
                          />
                        ))}
                        <SegmentedControlItem value="custom" label={t('keys.customDate')} />
                      </SegmentedControl>
                      <DateTimeInput
                        label={t('keys.expirationDate')}
                        description={t('keys.expirationDateHint')}
                        value={(form.expirationDate || undefined) as ISODateTimeString | undefined}
                        onChange={(value) => patch({ expirationDate: value ?? '', expirationPreset: 'custom' })}
                        hasClear
                      />
                      {isEdit && editKey.expires_at && (
                        <Text type="supporting">
                          {t('keys.currentExpiration')}: {formatDateTime(editKey.expires_at)}
                        </Text>
                      )}
                    </>
                  )}
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" isDisabled={submitting} onClick={close} />
                <Button
                  label={submitting ? t('keys.saving') : isEdit ? t('common.update') : t('common.create')}
                  variant="primary"
                  isLoading={submitting}
                  onClick={() => void handleSubmit()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={resetQuotaOpen}
        onOpenChange={setResetQuotaOpen}
        title={t('keys.resetQuotaTitle')}
        description={t('keys.resetQuotaConfirmMessage', {
          name: editKey?.name ?? '',
          used: (editKey?.quota_used ?? 0).toFixed(4),
        })}
        actionLabel={t('keys.reset')}
        cancelLabel={t('common.cancel')}
        onAction={() => void resetQuotaUsed()}
      />
    </>
  )
}
