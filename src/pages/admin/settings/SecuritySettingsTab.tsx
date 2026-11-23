import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Code } from '@astryxdesign/core/Code'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { SystemSettings } from '~/lib/api/admin/settings'
import { toast } from '~/lib/toast'
import { ApiKeyAclSettings } from './security/ApiKeyAclSettings'
import { CaptchaSettings } from './security/CaptchaSettings'
import { DingTalkOAuthSettings } from './security/DingTalkOAuthSettings'
import { EmailOAuthSettings } from './security/EmailOAuthSettings'
import { LinuxDoOAuthSettings } from './security/LinuxDoOAuthSettings'
import { OidcOAuthSettings } from './security/OidcOAuthSettings'
import { PanelRateLimitSettings } from './security/PanelRateLimitSettings'
import { WeChatOAuthSettings } from './security/WeChatOAuthSettings'

interface SecuritySettingsTabProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

type ToggleField =
  | 'registration_enabled'
  | 'email_verify_enabled'
  | 'password_reset_enabled'
  | 'invitation_code_enabled'
  | 'promo_code_enabled'
  | 'registration_email_domain_quota_enabled'
  | 'totp_enabled'
  | 'passkey_enabled'
  | 'session_binding_enabled'
  | 'step_up_enabled'

type SecurityFormState = Record<ToggleField, boolean> & {
  audit_log_retention_days: number
  registration_email_suffix_whitelist: string[]
  api_key_acl_trust_forwarded_ip: boolean
}

interface ToggleOption {
  field: ToggleField
  label: string
  hint: string
}

type KeyAction = 'regenerate' | 'delete'

const REGISTRATION_TOGGLES: ToggleOption[] = [
  {
    field: 'registration_enabled',
    label: 'admin.settings.registration.enabled',
    hint: 'admin.settings.registration.enabledHint',
  },
  {
    field: 'email_verify_enabled',
    label: 'admin.settings.registration.emailVerify',
    hint: 'admin.settings.registration.emailVerifyHint',
  },
  {
    field: 'password_reset_enabled',
    label: 'admin.settings.registration.passwordReset',
    hint: 'admin.settings.registration.passwordResetHint',
  },
  {
    field: 'invitation_code_enabled',
    label: 'admin.settings.registration.invitationCode',
    hint: 'admin.settings.registration.invitationCodeHint',
  },
  {
    field: 'promo_code_enabled',
    label: 'admin.settings.registration.promoCode',
    hint: 'admin.settings.registration.promoCodeHint',
  },
  {
    field: 'registration_email_domain_quota_enabled',
    label: 'admin.settings.registration.emailDomainQuota',
    hint: 'admin.settings.registration.emailDomainQuotaHint',
  },
]

const AUTHENTICATION_TOGGLES: ToggleOption[] = [
  {
    field: 'totp_enabled',
    label: 'admin.settings.authentication.totp',
    hint: 'admin.settings.authentication.totpHint',
  },
  {
    field: 'passkey_enabled',
    label: 'admin.settings.authentication.passkey',
    hint: 'admin.settings.authentication.passkeyHint',
  },
  {
    field: 'session_binding_enabled',
    label: 'admin.settings.authentication.sessionBinding',
    hint: 'admin.settings.authentication.sessionBindingHint',
  },
  {
    field: 'step_up_enabled',
    label: 'admin.settings.authentication.stepUp',
    hint: 'admin.settings.authentication.stepUpHint',
  },
]

const SECTION_COLUMNS = { minWidth: 320, max: 2 }

// Used until a retention has been stored.
const DEFAULT_AUDIT_RETENTION_DAYS = 180

const messageOf = (error: unknown) => (error as { message?: string } | null)?.message

/** A number field words a rejected entry in English only, so the tab words it. */
const entryErrorMessage = (error: NumberInputEntryError) =>
  error.kind === 'fractional'
    ? 'admin.settings.features.affiliate.wholeNumber'
    : 'admin.settings.features.affiliate.invalidNumber'

function SettingsSection({
  title,
  description,
  note,
  children,
}: {
  title: string
  description: string
  /** A second paragraph under the description. */
  note?: string
  children: ReactNode
}) {
  return (
    <Grid columns={SECTION_COLUMNS} gap={10}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        <Text type="supporting" color="secondary">
          {description}
        </Text>
        {note && (
          <Text type="supporting" color="secondary">
            {note}
          </Text>
        )}
      </VStack>
      <VStack gap={4} hAlign="stretch">
        {children}
      </VStack>
    </Grid>
  )
}

export function SecuritySettingsTab({ settings, onSave, saving }: SecuritySettingsTabProps) {
  const { t, locale } = useI18n()
  const isZh = locale === 'zh'
  // The save request sends these keys in this order.
  const [form, setForm] = useState<SecurityFormState>({
    registration_enabled: settings.registration_enabled ?? true,
    email_verify_enabled: settings.email_verify_enabled ?? false,
    password_reset_enabled: settings.password_reset_enabled ?? true,
    invitation_code_enabled: settings.invitation_code_enabled ?? false,
    promo_code_enabled: settings.promo_code_enabled ?? false,
    totp_enabled: settings.totp_enabled ?? false,
    passkey_enabled: settings.passkey_enabled ?? false,
    session_binding_enabled: settings.session_binding_enabled ?? false,
    step_up_enabled: settings.step_up_enabled ?? false,
    // A stored 0 is a real setting: it keeps the logs forever.
    audit_log_retention_days: settings.audit_log_retention_days ?? DEFAULT_AUDIT_RETENTION_DAYS,
    registration_email_suffix_whitelist: settings.registration_email_suffix_whitelist || [],
    registration_email_domain_quota_enabled: settings.registration_email_domain_quota_enabled ?? false,
    api_key_acl_trust_forwarded_ip: settings.api_key_acl_trust_forwarded_ip ?? false,
  })
  const [retentionError, setRetentionError] = useState<NumberInputEntryError | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [adminApiKeyExists, setAdminApiKeyExists] = useState(false)
  const [adminApiKeyMasked, setAdminApiKeyMasked] = useState('')
  const [adminApiKeyOperating, setAdminApiKeyOperating] = useState(false)
  const [newAdminApiKey, setNewAdminApiKey] = useState('')
  // The action stays set while the dialog closes, so its text does not change on the way out.
  const [keyConfirm, setKeyConfirm] = useState<{ isOpen: boolean; action: KeyAction }>({
    isOpen: false,
    action: 'regenerate',
  })

  useEffect(() => {
    const loadAdminApiKey = async () => {
      try {
        const status = await adminAPI.settings.getAdminApiKey()
        setAdminApiKeyExists(status.exists)
        setAdminApiKeyMasked(status.masked_key)
      } catch (error) {
        console.error('Failed to load admin API key:', error)
      }
    }
    void loadAdminApiKey()
  }, [])

  const closeKeyConfirm = () => setKeyConfirm(prev => ({ ...prev, isOpen: false }))

  const regenerateAdminApiKey = async () => {
    try {
      setAdminApiKeyOperating(true)
      const result = await adminAPI.settings.regenerateAdminApiKey()
      setNewAdminApiKey(result.key)
      setAdminApiKeyExists(true)
      closeKeyConfirm()
      const status = await adminAPI.settings.getAdminApiKey()
      setAdminApiKeyMasked(status.masked_key)
      toast.success(t('admin.settings.adminApiKey.regenerateSuccess'))
    } catch (error) {
      toast.error(messageOf(error) || t('admin.settings.adminApiKey.regenerateFailed'))
    } finally {
      setAdminApiKeyOperating(false)
    }
  }

  const deleteAdminApiKey = async () => {
    try {
      setAdminApiKeyOperating(true)
      await adminAPI.settings.deleteAdminApiKey()
      setAdminApiKeyExists(false)
      setAdminApiKeyMasked('')
      setNewAdminApiKey('')
      closeKeyConfirm()
      toast.success(t('admin.settings.adminApiKey.deleteSuccess'))
    } catch (error) {
      toast.error(messageOf(error) || t('admin.settings.adminApiKey.deleteFailed'))
    } finally {
      setAdminApiKeyOperating(false)
    }
  }

  const copyNewKey = async () => {
    try {
      await navigator.clipboard.writeText(newAdminApiKey)
      toast.success(t('admin.settings.adminApiKey.copied'))
    } catch {
      toast.error(t('admin.settings.adminApiKey.copyFailed'))
    }
  }

  const handleSave = async () => {
    if (retentionError) {
      toast.error(t('admin.settings.features.affiliate.fixNumbers'))
      return
    }
    setIsSaving(true)
    try {
      await onSave(form)
    } finally {
      setIsSaving(false)
    }
  }

  const renderToggle = ({ field, label, hint }: ToggleOption) => (
    <CheckboxInput
      key={field}
      label={t(label)}
      description={t(hint)}
      value={form[field]}
      onChange={checked => setForm(prev => ({ ...prev, [field]: checked }))}
    />
  )

  return (
    <>
      <VStack gap={6} hAlign="stretch">
        <SettingsSection
          title={t('admin.settings.registration.title')}
          description={t('admin.settings.registration.description')}
        >
          {REGISTRATION_TOGGLES.map(renderToggle)}
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={t('admin.settings.authentication.title')}
          description={t('admin.settings.authentication.description')}
        >
          {AUTHENTICATION_TOGGLES.map(renderToggle)}
          <NumberInput
            label={t('admin.settings.authentication.auditLogRetention')}
            description={t('admin.settings.authentication.auditLogRetentionHint')}
            value={form.audit_log_retention_days}
            onChange={value => setForm(prev => ({ ...prev, audit_log_retention_days: value }))}
            onEntryErrorChange={setRetentionError}
            status={retentionError ? { type: 'error', message: t(entryErrorMessage(retentionError)) } : undefined}
            min={0}
            isIntegerOnly
            isWheelEnabled={false}
          />
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Button
              variant="primary"
              label={isSaving ? t('common.saving') : t('common.save')}
              isLoading={isSaving}
              isDisabled={saving && !isSaving}
              onClick={() => void handleSave()}
            />
            <Text type="supporting" color="secondary">
              {t('admin.settings.authentication.saveHint')}
            </Text>
          </HStack>
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={t('admin.settings.apiKeyAcl.title')}
          description={t('admin.settings.apiKeyAcl.description')}
        >
          <ApiKeyAclSettings settings={settings} onSave={onSave} />
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={t('admin.settings.panelRateLimit.title')}
          description={t('admin.settings.panelRateLimit.description')}
          note={t('admin.settings.panelRateLimit.proxySafeNote')}
        >
          <PanelRateLimitSettings />
        </SettingsSection>

        {adminApiKeyExists && (
          <>
            <Divider />

            <SettingsSection
              title={t('admin.settings.adminApiKey.title')}
              description={t('admin.settings.adminApiKey.description')}
            >
              <Banner status="warning" title={t('admin.settings.adminApiKey.securityWarning')} />
              <HStack gap={4} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <VStack gap={1} hAlign="start">
                    <Text type="label">{t('admin.settings.adminApiKey.currentKey')}</Text>
                    <Code>{adminApiKeyMasked}</Code>
                  </VStack>
                </StackItem>
                <HStack gap={2}>
                  <Button
                    variant="secondary"
                    label={t('admin.settings.adminApiKey.regenerate')}
                    isDisabled={adminApiKeyOperating}
                    onClick={() => setKeyConfirm({ isOpen: true, action: 'regenerate' })}
                  />
                  <Button
                    variant="destructive"
                    label={t('admin.settings.adminApiKey.delete')}
                    isDisabled={adminApiKeyOperating}
                    onClick={() => setKeyConfirm({ isOpen: true, action: 'delete' })}
                  />
                </HStack>
              </HStack>
              {newAdminApiKey && (
                <Banner
                  status="success"
                  title={t('admin.settings.adminApiKey.keyWarning')}
                  description={t('admin.settings.adminApiKey.usage')}
                  collapsible={false}
                  endContent={
                    <Button
                      size="sm"
                      label={t('admin.settings.adminApiKey.copyKey')}
                      onClick={() => void copyNewKey()}
                    />
                  }
                >
                  <Text wordBreak="break-all">
                    <Code>{newAdminApiKey}</Code>
                  </Text>
                </Banner>
              )}
            </SettingsSection>
          </>
        )}

        <Divider />

        <SettingsSection
          title={t('admin.settings.captcha.title')}
          description={t('admin.settings.captcha.description')}
        >
          <CaptchaSettings settings={settings} onSave={onSave} saving={saving} />
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={t('admin.settings.linuxdo.title')}
          description={t('admin.settings.linuxdo.description')}
        >
          <LinuxDoOAuthSettings settings={settings} onSave={onSave} saving={saving} />
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={isZh ? '邮箱快捷登录' : 'Email OAuth Sign-in'}
          description={
            isZh
              ? '开启 GitHub 或 Google 邮箱授权登录后，系统会读取已验证邮箱，存在则直接登录，不存在则自动注册。'
              : 'After GitHub or Google email OAuth is enabled, the system reads a verified email, signs in matching users, and auto-registers missing users.'
          }
        >
          <EmailOAuthSettings settings={settings} onSave={onSave} saving={saving} />
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={t('admin.settings.wechatConnect.title')}
          description={t('admin.settings.wechatConnect.description')}
        >
          <WeChatOAuthSettings settings={settings} onSave={onSave} saving={saving} />
        </SettingsSection>

        <Divider />

        <SettingsSection
          title={t('admin.settings.dingtalk.title')}
          description={t('admin.settings.dingtalk.description')}
        >
          <DingTalkOAuthSettings settings={settings} onSave={onSave} saving={saving} />
        </SettingsSection>

        <Divider />

        <SettingsSection title={t('admin.settings.oidc.title')} description={t('admin.settings.oidc.description')}>
          <OidcOAuthSettings settings={settings} onSave={onSave} saving={saving} />
        </SettingsSection>
      </VStack>

      <AlertDialog
        isOpen={keyConfirm.isOpen}
        onOpenChange={open => {
          if (!open && !adminApiKeyOperating) closeKeyConfirm()
        }}
        title={t('admin.settings.adminApiKey.title')}
        description={t(
          keyConfirm.action === 'delete'
            ? 'admin.settings.adminApiKey.deleteConfirm'
            : 'admin.settings.adminApiKey.regenerateConfirm',
        )}
        actionLabel={t(
          keyConfirm.action === 'delete' ? 'admin.settings.adminApiKey.delete' : 'admin.settings.adminApiKey.regenerate',
        )}
        cancelLabel={t('common.cancel')}
        isActionLoading={adminApiKeyOperating}
        onAction={() => void (keyConfirm.action === 'delete' ? deleteAdminApiKey() : regenerateAdminApiKey())}
      />
    </>
  )
}
