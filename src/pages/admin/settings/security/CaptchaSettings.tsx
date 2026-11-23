import { useId, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Field } from '@astryxdesign/core/Field'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { SystemSettings, UpdateSettingsRequest } from '~/lib/api/admin/settings'

const PROVIDERS = ['turnstile', 'tencent', 'aliyun'] as const

type CaptchaProvider = (typeof PROVIDERS)[number]

type SecretField =
  | 'turnstile_secret_key'
  | 'tencent_captcha_app_secret_key'
  | 'tencent_captcha_cloud_secret_id'
  | 'tencent_captcha_cloud_secret_key'
  | 'aliyun_captcha_access_key_secret'

// Secrets are write-only: each is sent only when one is typed.
type CaptchaUpdate = Partial<SystemSettings> & Pick<UpdateSettingsRequest, SecretField>

interface CaptchaSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

const PROVIDER_SECRETS: Record<CaptchaProvider, SecretField[]> = {
  turnstile: ['turnstile_secret_key'],
  tencent: ['tencent_captcha_app_secret_key', 'tencent_captcha_cloud_secret_id', 'tencent_captcha_cloud_secret_key'],
  aliyun: ['aliyun_captcha_access_key_secret'],
}

export function CaptchaSettings({ settings, onSave, saving }: CaptchaSettingsProps) {
  const { t } = useI18n()
  const providerGroupID = useId()
  const tencentRegionGroupID = useId()
  const aliyunRegionGroupID = useId()
  const [captchaEnabled, setCaptchaEnabled] = useState(
    settings.turnstile_enabled || settings.tencent_captcha_enabled || settings.aliyun_captcha_enabled,
  )

  const getCurrentProvider = (): CaptchaProvider => {
    if (settings.turnstile_enabled) return 'turnstile'
    if (settings.tencent_captcha_enabled) return 'tencent'
    if (settings.aliyun_captcha_enabled) return 'aliyun'
    return 'turnstile'
  }

  const [provider, setProvider] = useState<CaptchaProvider>(getCurrentProvider)
  const [form, setForm] = useState({
    turnstile_site_key: settings.turnstile_site_key || '',
    turnstile_secret_key: '',
    tencent_captcha_region: settings.tencent_captcha_region || 'cn',
    tencent_captcha_app_id: settings.tencent_captcha_app_id || '',
    tencent_captcha_app_secret_key: '',
    tencent_captcha_cloud_secret_id: '',
    tencent_captcha_cloud_secret_key: '',
    aliyun_captcha_region: settings.aliyun_captcha_region || 'cn',
    aliyun_captcha_prefix: settings.aliyun_captcha_prefix || '',
    aliyun_captcha_scene_id: settings.aliyun_captcha_scene_id || '',
    aliyun_captcha_access_key_id: settings.aliyun_captcha_access_key_id || '',
    aliyun_captcha_access_key_secret: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const setField =
    <K extends keyof typeof form>(field: K) =>
    (value: (typeof form)[K]) =>
      setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    const updates: CaptchaUpdate = {
      turnstile_enabled: captchaEnabled && provider === 'turnstile',
      tencent_captcha_enabled: captchaEnabled && provider === 'tencent',
      aliyun_captcha_enabled: captchaEnabled && provider === 'aliyun',
    }
    // Only the chosen provider's fields are sent, and none while captcha is off.
    const sentSecrets = captchaEnabled ? PROVIDER_SECRETS[provider] : []

    if (captchaEnabled) {
      if (provider === 'turnstile') {
        updates.turnstile_site_key = form.turnstile_site_key
      } else if (provider === 'tencent') {
        updates.tencent_captcha_region = form.tencent_captcha_region
        updates.tencent_captcha_app_id = form.tencent_captcha_app_id
      } else {
        updates.aliyun_captcha_region = form.aliyun_captcha_region
        updates.aliyun_captcha_prefix = form.aliyun_captcha_prefix
        updates.aliyun_captcha_scene_id = form.aliyun_captcha_scene_id
        updates.aliyun_captcha_access_key_id = form.aliyun_captcha_access_key_id
      }
      for (const field of sentSecrets) {
        if (form[field]) updates[field] = form[field]
      }
    }

    setIsSaving(true)
    try {
      if (await onSave(updates)) {
        // A stored secret is never sent back, so a typed one does not stay on screen either.
        setForm(prev => {
          const next = { ...prev }
          for (const field of sentSecrets) next[field] = ''
          return next
        })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const secretHint = (isConfigured: boolean) =>
    isConfigured ? t('admin.settings.tencentCaptcha.configured') : t('admin.settings.tencentCaptcha.required')

  return (
    <>
      <CheckboxInput
        label={t('admin.settings.captcha.enable')}
        description={t('admin.settings.captcha.enableHint')}
        value={captchaEnabled}
        onChange={setCaptchaEnabled}
      />

      {captchaEnabled && (
        <>
          <Field label={t('admin.settings.captcha.provider')} inputID={providerGroupID} isGroupLabel>
            <SegmentedControl
              label={t('admin.settings.captcha.provider')}
              value={provider}
              onChange={value => setProvider(PROVIDERS.find(item => item === value) ?? provider)}
            >
              <SegmentedControlItem value="turnstile" label={t('admin.settings.captcha.providerTurnstile')} />
              <SegmentedControlItem value="tencent" label={t('admin.settings.captcha.providerTencent')} />
              <SegmentedControlItem value="aliyun" label={t('admin.settings.captcha.providerAliyun')} />
            </SegmentedControl>
          </Field>

          {provider === 'turnstile' && (
            <>
              <TextInput
                label={t('admin.settings.turnstile.siteKey')}
                description={t('admin.settings.turnstile.siteKeyHint')}
                value={form.turnstile_site_key}
                onChange={setField('turnstile_site_key')}
                placeholder="0x4AAAAAAA..."
              />
              <TextInput
                label={t('admin.settings.turnstile.secretKey')}
                description={
                  settings.turnstile_secret_key_configured
                    ? t('admin.settings.turnstile.secretKeyConfiguredHint')
                    : t('admin.settings.turnstile.secretKeyHint')
                }
                type="password"
                autoComplete="new-password"
                value={form.turnstile_secret_key}
                onChange={setField('turnstile_secret_key')}
                placeholder="0x4AAAAAAA..."
              />
              <HStack>
                <Link href="https://dash.cloudflare.com/" isExternalLink type="supporting">
                  {t('admin.settings.turnstile.cloudflareDashboard')}
                </Link>
              </HStack>
            </>
          )}

          {provider === 'tencent' && (
            <>
              <Field
                label={t('admin.settings.tencentCaptcha.region')}
                description={t('admin.settings.tencentCaptcha.regionHint')}
                inputID={tencentRegionGroupID}
                isGroupLabel
              >
                <SegmentedControl
                  label={t('admin.settings.tencentCaptcha.region')}
                  value={form.tencent_captcha_region}
                  onChange={setField('tencent_captcha_region')}
                >
                  <SegmentedControlItem value="cn" label={t('admin.settings.tencentCaptcha.regionCn')} />
                  <SegmentedControlItem value="intl" label={t('admin.settings.tencentCaptcha.regionIntl')} />
                </SegmentedControl>
              </Field>

              <VStack gap={1}>
                <Heading level={3}>{t('admin.settings.tencentCaptcha.appCredentialsTitle')}</Heading>
                <Text type="supporting" color="secondary">
                  {t('admin.settings.tencentCaptcha.appCredentialsHint')}
                </Text>
              </VStack>
              <TextInput
                label={t('admin.settings.tencentCaptcha.appId')}
                value={form.tencent_captcha_app_id}
                onChange={setField('tencent_captcha_app_id')}
                placeholder="123456789"
              />
              <TextInput
                label={t('admin.settings.tencentCaptcha.appSecretKey')}
                description={secretHint(settings.tencent_captcha_app_secret_key_configured)}
                type="password"
                autoComplete="new-password"
                value={form.tencent_captcha_app_secret_key}
                onChange={setField('tencent_captcha_app_secret_key')}
                placeholder={t('admin.settings.tencentCaptcha.keepExisting')}
              />

              <VStack gap={1}>
                <Heading level={3}>{t('admin.settings.tencentCaptcha.cloudCredentialsTitle')}</Heading>
                <Text type="supporting" color="secondary">
                  {t('admin.settings.tencentCaptcha.cloudCredentialsHint')}
                </Text>
              </VStack>
              <TextInput
                label={t('admin.settings.tencentCaptcha.cloudSecretId')}
                description={secretHint(settings.tencent_captcha_cloud_secret_id_configured)}
                type="password"
                autoComplete="new-password"
                value={form.tencent_captcha_cloud_secret_id}
                onChange={setField('tencent_captcha_cloud_secret_id')}
                placeholder={t('admin.settings.tencentCaptcha.keepExisting')}
              />
              <TextInput
                label={t('admin.settings.tencentCaptcha.cloudSecretKey')}
                description={secretHint(settings.tencent_captcha_cloud_secret_key_configured)}
                type="password"
                autoComplete="new-password"
                value={form.tencent_captcha_cloud_secret_key}
                onChange={setField('tencent_captcha_cloud_secret_key')}
                placeholder={t('admin.settings.tencentCaptcha.keepExisting')}
              />
              <VStack gap={1}>
                <Text type="supporting" color="secondary">
                  {t('admin.settings.tencentCaptcha.camPermissionHint')}
                </Text>
                <Text type="supporting" color="secondary">
                  {t('admin.settings.tencentCaptcha.aidEncryptedHint')}
                </Text>
              </VStack>
              <HStack gap={4} wrap="wrap">
                <Link href="https://console.cloud.tencent.com/captcha" isExternalLink type="supporting">
                  {t('admin.settings.tencentCaptcha.openCaptchaConsole')}
                </Link>
                <Link href="https://console.cloud.tencent.com/cam/capi" isExternalLink type="supporting">
                  {t('admin.settings.tencentCaptcha.createCloudKeys')}
                </Link>
                <Link href="https://cloud.tencent.com/document/product/1110/36841" isExternalLink type="supporting">
                  {t('admin.settings.tencentCaptcha.openWebDocs')}
                </Link>
              </HStack>
            </>
          )}

          {provider === 'aliyun' && (
            <>
              <Field
                label={t('admin.settings.aliyunCaptcha.region')}
                description={t('admin.settings.aliyunCaptcha.regionHint')}
                inputID={aliyunRegionGroupID}
                isGroupLabel
              >
                <SegmentedControl
                  label={t('admin.settings.aliyunCaptcha.region')}
                  value={form.aliyun_captcha_region}
                  onChange={setField('aliyun_captcha_region')}
                >
                  <SegmentedControlItem value="cn" label={t('admin.settings.aliyunCaptcha.regionCn')} />
                  <SegmentedControlItem value="sgp" label={t('admin.settings.aliyunCaptcha.regionSgp')} />
                </SegmentedControl>
              </Field>
              <TextInput
                label={t('admin.settings.aliyunCaptcha.prefix')}
                description={t('admin.settings.aliyunCaptcha.prefixHint')}
                value={form.aliyun_captcha_prefix}
                onChange={setField('aliyun_captcha_prefix')}
                placeholder="14xxxxx"
              />
              <TextInput
                label={t('admin.settings.aliyunCaptcha.sceneId')}
                description={t('admin.settings.aliyunCaptcha.sceneIdHint')}
                value={form.aliyun_captcha_scene_id}
                onChange={setField('aliyun_captcha_scene_id')}
                placeholder="1cxxxxxx"
              />
              <TextInput
                label={t('admin.settings.aliyunCaptcha.accessKeyId')}
                description={t('admin.settings.aliyunCaptcha.accessKeyIdHint')}
                value={form.aliyun_captcha_access_key_id}
                onChange={setField('aliyun_captcha_access_key_id')}
                placeholder="LTAI..."
              />
              <TextInput
                label={t('admin.settings.aliyunCaptcha.accessKeySecret')}
                description={
                  settings.aliyun_captcha_access_key_secret_configured
                    ? t('admin.settings.aliyunCaptcha.accessKeySecretConfiguredHint')
                    : t('admin.settings.aliyunCaptcha.accessKeySecretHint')
                }
                type="password"
                autoComplete="new-password"
                value={form.aliyun_captcha_access_key_secret}
                onChange={setField('aliyun_captcha_access_key_secret')}
                placeholder="••••••••"
              />
            </>
          )}
        </>
      )}

      <HStack>
        <Button
          variant="primary"
          label={isSaving ? t('common.saving') : t('common.save')}
          isLoading={isSaving}
          isDisabled={saving && !isSaving}
          onClick={() => void handleSave()}
        />
      </HStack>
    </>
  )
}
