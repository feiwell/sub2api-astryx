import { toAppPath } from '@/utils/appPath'
import { buildGatewayUrl } from '@/api/url'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { SystemSettings, UpdateSettingsRequest } from '~/lib/api/admin/settings'

interface OidcOAuthSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

// The secret is write-only: it is sent only when one is typed.
type OidcUpdate = Partial<SystemSettings> & Pick<UpdateSettingsRequest, 'oidc_connect_client_secret'>

const ENDPOINT_FIELDS = [
  {
    field: 'oidc_connect_issuer_url',
    label: 'admin.settings.oidc.issuerUrl',
    placeholder: 'admin.settings.oidc.issuerUrlPlaceholder',
  },
  {
    field: 'oidc_connect_discovery_url',
    label: 'admin.settings.oidc.discoveryUrl',
    placeholder: 'admin.settings.oidc.discoveryUrlPlaceholder',
  },
  {
    field: 'oidc_connect_authorize_url',
    label: 'admin.settings.oidc.authorizeUrl',
    placeholder: 'admin.settings.oidc.authorizeUrlPlaceholder',
  },
  {
    field: 'oidc_connect_token_url',
    label: 'admin.settings.oidc.tokenUrl',
    placeholder: 'admin.settings.oidc.tokenUrlPlaceholder',
  },
  {
    field: 'oidc_connect_userinfo_url',
    label: 'admin.settings.oidc.userinfoUrl',
    placeholder: 'admin.settings.oidc.userinfoUrlPlaceholder',
  },
  {
    field: 'oidc_connect_jwks_url',
    label: 'admin.settings.oidc.jwksUrl',
    placeholder: 'admin.settings.oidc.jwksUrlPlaceholder',
  },
] as const

export function OidcOAuthSettings({ settings, onSave, saving }: OidcOAuthSettingsProps) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    oidc_connect_enabled: settings.oidc_connect_enabled ?? false,
    oidc_connect_provider_name: settings.oidc_connect_provider_name || '',
    oidc_connect_client_id: settings.oidc_connect_client_id || '',
    oidc_connect_client_secret: '',
    oidc_connect_issuer_url: settings.oidc_connect_issuer_url || '',
    oidc_connect_discovery_url: settings.oidc_connect_discovery_url || '',
    oidc_connect_authorize_url: settings.oidc_connect_authorize_url || '',
    oidc_connect_token_url: settings.oidc_connect_token_url || '',
    oidc_connect_userinfo_url: settings.oidc_connect_userinfo_url || '',
    oidc_connect_jwks_url: settings.oidc_connect_jwks_url || '',
    oidc_connect_scopes: settings.oidc_connect_scopes || 'openid email profile',
    oidc_connect_redirect_url: settings.oidc_connect_redirect_url || '',
    oidc_connect_frontend_redirect_url: settings.oidc_connect_frontend_redirect_url || toAppPath('/auth/oauth/callback'),
  })
  const [isSaving, setIsSaving] = useState(false)

  const setField =
    <K extends keyof typeof form>(field: K) =>
    (value: (typeof form)[K]) =>
      setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    const updates: OidcUpdate = {
      oidc_connect_enabled: form.oidc_connect_enabled,
      oidc_connect_provider_name: form.oidc_connect_provider_name,
      oidc_connect_client_id: form.oidc_connect_client_id,
      oidc_connect_issuer_url: form.oidc_connect_issuer_url,
      oidc_connect_discovery_url: form.oidc_connect_discovery_url,
      oidc_connect_authorize_url: form.oidc_connect_authorize_url,
      oidc_connect_token_url: form.oidc_connect_token_url,
      oidc_connect_userinfo_url: form.oidc_connect_userinfo_url,
      oidc_connect_jwks_url: form.oidc_connect_jwks_url,
      oidc_connect_scopes: form.oidc_connect_scopes,
      oidc_connect_redirect_url: form.oidc_connect_redirect_url,
      oidc_connect_frontend_redirect_url: form.oidc_connect_frontend_redirect_url,
    }
    if (form.oidc_connect_client_secret) {
      updates.oidc_connect_client_secret = form.oidc_connect_client_secret
    }
    setIsSaving(true)
    try {
      // The stored secret is never sent back, so the typed one does not stay on screen either.
      if (await onSave(updates)) setForm(prev => ({ ...prev, oidc_connect_client_secret: '' }))
    } finally {
      setIsSaving(false)
    }
  }

  const handleQuickSetCopy = () => {
    const url = buildGatewayUrl(`/api/v1/auth/oauth/oidc/callback`)
    setForm(prev => ({ ...prev, oidc_connect_redirect_url: url }))
    // Copying is a convenience: the address is in the field either way.
    void navigator.clipboard?.writeText(url).catch(() => undefined)
  }

  return (
    <>
      <CheckboxInput
        label={t('admin.settings.oidc.enable')}
        description={t('admin.settings.oidc.enableHint')}
        value={form.oidc_connect_enabled}
        onChange={setField('oidc_connect_enabled')}
      />

      {form.oidc_connect_enabled && (
        <>
          <TextInput
            label={t('admin.settings.oidc.providerName')}
            value={form.oidc_connect_provider_name}
            onChange={setField('oidc_connect_provider_name')}
            placeholder={t('admin.settings.oidc.providerNamePlaceholder')}
          />
          <TextInput
            label={t('admin.settings.oidc.clientId')}
            value={form.oidc_connect_client_id}
            onChange={setField('oidc_connect_client_id')}
            placeholder={t('admin.settings.oidc.clientIdPlaceholder')}
          />
          <TextInput
            label={t('admin.settings.oidc.clientSecret')}
            description={
              settings.oidc_connect_client_secret_configured
                ? t('admin.settings.oidc.clientSecretConfiguredHint')
                : t('admin.settings.oidc.clientSecretHint')
            }
            type="password"
            autoComplete="new-password"
            value={form.oidc_connect_client_secret}
            onChange={setField('oidc_connect_client_secret')}
            placeholder={
              settings.oidc_connect_client_secret_configured
                ? t('admin.settings.oidc.clientSecretConfiguredPlaceholder')
                : t('admin.settings.oidc.clientSecretPlaceholder')
            }
          />
          {ENDPOINT_FIELDS.map(({ field, label, placeholder }) => (
            <TextInput
              key={field}
              label={t(label)}
              type="url"
              value={form[field]}
              onChange={setField(field)}
              placeholder={t(placeholder)}
            />
          ))}
          <TextInput
            label={t('admin.settings.oidc.scopes')}
            description={t('admin.settings.oidc.scopesHint')}
            value={form.oidc_connect_scopes}
            onChange={setField('oidc_connect_scopes')}
            placeholder={t('admin.settings.oidc.scopesPlaceholder')}
          />
          <VStack gap={2} hAlign="stretch">
            <TextInput
              label={t('admin.settings.oidc.redirectUrl')}
              type="url"
              value={form.oidc_connect_redirect_url}
              onChange={setField('oidc_connect_redirect_url')}
              placeholder={t('admin.settings.oidc.redirectUrlPlaceholder')}
            />
            <HStack>
              <Button
                variant="secondary"
                size="sm"
                label={t('admin.settings.oidc.quickSetCopy')}
                onClick={handleQuickSetCopy}
              />
            </HStack>
          </VStack>
          <TextInput
            label={t('admin.settings.oidc.frontendRedirectUrl')}
            value={form.oidc_connect_frontend_redirect_url}
            onChange={setField('oidc_connect_frontend_redirect_url')}
            placeholder={toAppPath('/auth/oauth/callback')}
          />
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
