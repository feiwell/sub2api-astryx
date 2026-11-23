import { toAppPath } from '@/utils/appPath'
import { useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { InputGroup, InputGroupText } from '@astryxdesign/core/InputGroup'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { NotifyEmailEntry } from '@/types'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'

interface EmailFormState {
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_from_email: string
  smtp_from_name: string
  smtp_use_tls: boolean
  subscription_expiry_notify_enabled: boolean
  balance_low_notify_enabled: boolean
  balance_low_notify_threshold: number
  balance_low_notify_recharge_url: string
  account_quota_notify_enabled: boolean
  account_quota_notify_emails: NotifyEmailEntry[]
}

type EmailSettingsUpdate = Partial<EmailFormState>
type SystemSettings = EmailSettingsUpdate & { smtp_password_configured?: boolean }

interface EmailSettingsTabProps {
  settings: SystemSettings
  onSave: (updates: EmailSettingsUpdate) => Promise<boolean>
  saving: boolean
}

const SECTION_COLUMNS = { minWidth: 320, max: 2 }
const PAIR_COLUMNS = { minWidth: 180, max: 2 }

const hasAddress = (entry: NotifyEmailEntry) => entry.email.trim() !== ''

const messageOf = (error: unknown) => (error as { message?: string } | null)?.message

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

export function EmailSettingsTab({ settings, onSave, saving }: EmailSettingsTabProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<EmailFormState>({
    smtp_host: settings.smtp_host || '',
    smtp_port: settings.smtp_port || 587,
    smtp_username: settings.smtp_username || '',
    smtp_password: '',
    smtp_from_email: settings.smtp_from_email || '',
    smtp_from_name: settings.smtp_from_name || '',
    smtp_use_tls: settings.smtp_use_tls ?? true,
    subscription_expiry_notify_enabled: settings.subscription_expiry_notify_enabled ?? false,
    balance_low_notify_enabled: settings.balance_low_notify_enabled ?? false,
    balance_low_notify_threshold: settings.balance_low_notify_threshold || 0,
    balance_low_notify_recharge_url: settings.balance_low_notify_recharge_url || '',
    account_quota_notify_enabled: settings.account_quota_notify_enabled ?? false,
    account_quota_notify_emails: settings.account_quota_notify_emails || [],
  })
  const [testingConnection, setTestingConnection] = useState(false)
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState('')

  const setField = <K extends keyof EmailFormState>(field: K) => (value: EmailFormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }))

  // The backend only notifies entries marked verified. Addresses an admin adds here are trusted,
  // as on the Vue page; without the flag a new address would never receive anything.
  const addQuotaNotifyEmail = () =>
    setForm(prev => ({
      ...prev,
      account_quota_notify_emails: [
        ...prev.account_quota_notify_emails,
        { email: '', disabled: false, verified: true },
      ],
    }))

  const removeQuotaNotifyEmail = (index: number) =>
    setForm(prev => ({
      ...prev,
      account_quota_notify_emails: prev.account_quota_notify_emails.filter((_, i) => i !== index),
    }))

  const updateQuotaNotifyEmail = (index: number, patch: Partial<NotifyEmailEntry>) =>
    setForm(prev => ({
      ...prev,
      account_quota_notify_emails: prev.account_quota_notify_emails.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry
      ),
    }))

  const handleSave = async () => {
    const updates: EmailSettingsUpdate = {
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_username: form.smtp_username,
      smtp_from_email: form.smtp_from_email,
      smtp_from_name: form.smtp_from_name,
      smtp_use_tls: form.smtp_use_tls,
      subscription_expiry_notify_enabled: form.subscription_expiry_notify_enabled,
      balance_low_notify_enabled: form.balance_low_notify_enabled,
      balance_low_notify_threshold: form.balance_low_notify_threshold,
      balance_low_notify_recharge_url: form.balance_low_notify_recharge_url,
      account_quota_notify_enabled: form.account_quota_notify_enabled,
      account_quota_notify_emails: form.account_quota_notify_emails.filter(hasAddress),
    }

    // An empty password means "keep the stored one".
    if (form.smtp_password) {
      updates.smtp_password = form.smtp_password
    }

    const saved = await onSave(updates)
    if (!saved) return
    // Show what is stored now: the password is write-only, and rows without an address were not sent.
    setForm(prev => ({
      ...prev,
      smtp_password: '',
      account_quota_notify_emails: prev.account_quota_notify_emails.filter(hasAddress),
    }))
  }

  const handleTestConnection = async () => {
    if (!form.smtp_host || !form.smtp_port) {
      toast.error(t('admin.settings.email.testConnectionMissingFields'))
      return
    }

    try {
      setTestingConnection(true)
      const result = await adminAPI.settings.testSmtpConnection({
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        smtp_use_tls: form.smtp_use_tls,
      })
      toast.success(result?.message || t('admin.settings.email.testConnectionSuccess'))
    } catch (error) {
      toast.error(messageOf(error) || t('admin.settings.email.testConnectionFailed'))
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error(t('admin.settings.email.testEmailMissingAddress'))
      return
    }

    if (!form.smtp_host || !form.smtp_port || !form.smtp_from_email) {
      toast.error(t('admin.settings.email.testEmailMissingFields'))
      return
    }

    try {
      setSendingTestEmail(true)
      await adminAPI.settings.sendTestEmail({
        email: testEmailAddress,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        smtp_from_email: form.smtp_from_email,
        smtp_from_name: form.smtp_from_name,
        smtp_use_tls: form.smtp_use_tls,
      })
      toast.success(t('admin.settings.email.testEmailSuccess'))
    } catch (error) {
      toast.error(messageOf(error) || t('admin.settings.email.testEmailFailed'))
    } finally {
      setSendingTestEmail(false)
    }
  }

  const passwordLabel = settings.smtp_password_configured
    ? `${t('admin.settings.email.smtp.password')} (${t('admin.settings.email.smtp.passwordConfigured')})`
    : t('admin.settings.email.smtp.password')

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.email.smtp.title')}
        description={t('admin.settings.email.smtp.description')}
      >
        <Grid columns={PAIR_COLUMNS} gap={4}>
          <TextInput
            label={t('admin.settings.email.smtp.host')}
            value={form.smtp_host}
            onChange={setField('smtp_host')}
            placeholder="smtp.example.test"
          />
          <NumberInput
            label={t('admin.settings.email.smtp.port')}
            value={form.smtp_port}
            onChange={setField('smtp_port')}
            min={1}
            max={65535}
            isIntegerOnly
            isWheelEnabled={false}
            placeholder="587"
          />
          <TextInput
            label={t('admin.settings.email.smtp.username')}
            value={form.smtp_username}
            onChange={setField('smtp_username')}
            placeholder={t('admin.settings.email.smtp.usernamePlaceholder')}
          />
          <TextInput
            label={passwordLabel}
            type="password"
            autoComplete="new-password"
            value={form.smtp_password}
            onChange={setField('smtp_password')}
            placeholder={
              settings.smtp_password_configured
                ? t('admin.settings.email.smtp.passwordPlaceholderConfigured')
                : t('admin.settings.email.smtp.passwordPlaceholder')
            }
          />
          <TextInput
            label={t('admin.settings.email.smtp.fromEmail')}
            type="email"
            value={form.smtp_from_email}
            onChange={setField('smtp_from_email')}
            placeholder="noreply@example.test"
          />
          <TextInput
            label={t('admin.settings.email.smtp.fromName')}
            value={form.smtp_from_name}
            onChange={setField('smtp_from_name')}
            placeholder={t('admin.settings.email.smtp.fromNamePlaceholder')}
          />
        </Grid>
        <CheckboxInput
          label={t('admin.settings.email.smtp.useTls')}
          description={t('admin.settings.email.smtp.useTlsHint')}
          value={form.smtp_use_tls}
          onChange={setField('smtp_use_tls')}
        />
        <HStack>
          <Button
            label={testingConnection ? t('admin.settings.email.testing') : t('admin.settings.email.testConnection')}
            isLoading={testingConnection}
            onClick={() => void handleTestConnection()}
          />
        </HStack>
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.email.testEmail.title')}
        description={t('admin.settings.email.testEmail.description')}
      >
        <InputGroup label={t('admin.settings.email.testEmail.address')}>
          <TextInput
            label={t('admin.settings.email.testEmail.address')}
            isLabelHidden
            type="email"
            value={testEmailAddress}
            onChange={setTestEmailAddress}
            placeholder={t('admin.settings.email.testEmail.addressPlaceholder')}
          />
          <Button
            label={sendingTestEmail ? t('admin.settings.email.sending') : t('admin.settings.email.sendTest')}
            isLoading={sendingTestEmail}
            onClick={() => void handleSendTestEmail()}
          />
        </InputGroup>
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.subscriptionExpiryNotify.title')}
        description={t('admin.settings.subscriptionExpiryNotify.description')}
      >
        <CheckboxInput
          label={t('admin.settings.subscriptionExpiryNotify.enabled')}
          description={t('admin.settings.subscriptionExpiryNotify.enabledHint')}
          value={form.subscription_expiry_notify_enabled}
          onChange={setField('subscription_expiry_notify_enabled')}
        />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.balanceNotify.title')}
        description={t('admin.settings.balanceNotify.description')}
      >
        <CheckboxInput
          label={t('admin.settings.balanceNotify.enabled')}
          value={form.balance_low_notify_enabled}
          onChange={setField('balance_low_notify_enabled')}
        />
        {form.balance_low_notify_enabled && (
          <>
            <InputGroup
              label={t('admin.settings.balanceNotify.threshold')}
              description={t('admin.settings.balanceNotify.thresholdHint')}
            >
              <InputGroupText>$</InputGroupText>
              <NumberInput
                label={t('admin.settings.balanceNotify.threshold')}
                isLabelHidden
                value={form.balance_low_notify_threshold}
                onChange={setField('balance_low_notify_threshold')}
                min={0}
                step={0.01}
                isWheelEnabled={false}
                placeholder="0"
              />
            </InputGroup>
            <TextInput
              label={t('admin.settings.balanceNotify.rechargeUrl')}
              description={t('admin.settings.balanceNotify.rechargeUrlHint')}
              type="url"
              value={form.balance_low_notify_recharge_url}
              onChange={setField('balance_low_notify_recharge_url')}
              placeholder={typeof window !== 'undefined' ? window.location.origin + toAppPath('') : ''}
            />
          </>
        )}
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.quotaNotify.title')}
        description={t('admin.settings.quotaNotify.description')}
      >
        <CheckboxInput
          label={t('admin.settings.quotaNotify.enabled')}
          value={form.account_quota_notify_enabled}
          onChange={setField('account_quota_notify_enabled')}
        />
        {form.account_quota_notify_enabled && (
          <VStack gap={2} hAlign="stretch">
            <VStack gap={1}>
              <Text type="body" weight="medium">
                {t('admin.settings.quotaNotify.emails')}
              </Text>
              <Text type="supporting" color="secondary">
                {t('admin.settings.quotaNotify.emailsHint')}
              </Text>
            </VStack>
            {form.account_quota_notify_emails.map((entry, index) => (
              <HStack key={index} gap={3} vAlign="center">
                <CheckboxInput
                  label={t('common.enabled')}
                  value={!entry.disabled}
                  onChange={(checked) => updateQuotaNotifyEmail(index, { disabled: !checked })}
                />
                <StackItem size="fill">
                  <TextInput
                    label={`${t('admin.settings.quotaNotify.emails')} ${index + 1}`}
                    isLabelHidden
                    type="email"
                    value={entry.email}
                    onChange={(email) => updateQuotaNotifyEmail(index, { email })}
                    placeholder={t('admin.settings.quotaNotify.emailPlaceholder')}
                    width="100%"
                  />
                </StackItem>
                <IconButton
                  variant="ghost"
                  size="sm"
                  label={t('common.delete')}
                  tooltip={t('common.delete')}
                  icon={<Icon icon={TrashIcon} />}
                  onClick={() => removeQuotaNotifyEmail(index)}
                />
              </HStack>
            ))}
            <HStack>
              <Button
                size="sm"
                icon={<Icon icon={PlusIcon} />}
                label={t('admin.settings.quotaNotify.addEmail')}
                onClick={addQuotaNotifyEmail}
              />
            </HStack>
          </VStack>
        )}
      </SettingsSection>

      <Divider />

      <Grid columns={SECTION_COLUMNS} gap={10}>
        <VStack gap={1} />
        <HStack>
          <Button
            variant="primary"
            label={saving ? t('common.saving') : t('common.save')}
            isLoading={saving}
            onClick={() => void handleSave()}
          />
        </HStack>
      </Grid>
    </VStack>
  )
}
