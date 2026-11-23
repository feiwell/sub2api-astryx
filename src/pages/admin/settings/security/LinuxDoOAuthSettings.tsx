import { buildGatewayUrl } from '@/api/url'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { SystemSettings, UpdateSettingsRequest } from '~/lib/api/admin/settings'

interface LinuxDoOAuthSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

// The secret is write-only: it is sent only when one is typed.
type LinuxDoUpdate = Partial<SystemSettings> & Pick<UpdateSettingsRequest, 'linuxdo_connect_client_secret'>

export function LinuxDoOAuthSettings({ settings, onSave, saving }: LinuxDoOAuthSettingsProps) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    linuxdo_connect_enabled: settings.linuxdo_connect_enabled ?? false,
    linuxdo_connect_client_id: settings.linuxdo_connect_client_id || '',
    linuxdo_connect_client_secret: '',
    linuxdo_connect_redirect_url: settings.linuxdo_connect_redirect_url || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const setField =
    <K extends keyof typeof form>(field: K) =>
    (value: (typeof form)[K]) =>
      setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    const updates: LinuxDoUpdate = {
      linuxdo_connect_enabled: form.linuxdo_connect_enabled,
      linuxdo_connect_client_id: form.linuxdo_connect_client_id,
      linuxdo_connect_redirect_url: form.linuxdo_connect_redirect_url,
    }
    if (form.linuxdo_connect_client_secret) {
      updates.linuxdo_connect_client_secret = form.linuxdo_connect_client_secret
    }
    setIsSaving(true)
    try {
      // The stored secret is never sent back, so the typed one does not stay on screen either.
      if (await onSave(updates)) setForm(prev => ({ ...prev, linuxdo_connect_client_secret: '' }))
    } finally {
      setIsSaving(false)
    }
  }

  const handleQuickSetCopy = () => {
    const url = buildGatewayUrl(`/api/v1/auth/oauth/linuxdo/callback`)
    setForm(prev => ({ ...prev, linuxdo_connect_redirect_url: url }))
    // Copying is a convenience: the address is in the field either way.
    void navigator.clipboard?.writeText(url).catch(() => undefined)
  }

  return (
    <>
      <CheckboxInput
        label={t('admin.settings.linuxdo.enable')}
        description={t('admin.settings.linuxdo.enableHint')}
        value={form.linuxdo_connect_enabled}
        onChange={setField('linuxdo_connect_enabled')}
      />
      {form.linuxdo_connect_enabled && (
        <>
          <TextInput
            label={t('admin.settings.linuxdo.clientId')}
            description={t('admin.settings.linuxdo.clientIdHint')}
            value={form.linuxdo_connect_client_id}
            onChange={setField('linuxdo_connect_client_id')}
            placeholder={t('admin.settings.linuxdo.clientIdPlaceholder')}
          />
          <TextInput
            label={t('admin.settings.linuxdo.clientSecret')}
            description={
              settings.linuxdo_connect_client_secret_configured
                ? t('admin.settings.linuxdo.clientSecretConfiguredHint')
                : t('admin.settings.linuxdo.clientSecretHint')
            }
            type="password"
            autoComplete="new-password"
            value={form.linuxdo_connect_client_secret}
            onChange={setField('linuxdo_connect_client_secret')}
            placeholder={
              settings.linuxdo_connect_client_secret_configured
                ? t('admin.settings.linuxdo.clientSecretConfiguredPlaceholder')
                : t('admin.settings.linuxdo.clientSecretPlaceholder')
            }
          />
          <VStack gap={2} hAlign="stretch">
            <TextInput
              label={t('admin.settings.linuxdo.redirectUrl')}
              description={t('admin.settings.linuxdo.redirectUrlHint')}
              type="url"
              value={form.linuxdo_connect_redirect_url}
              onChange={setField('linuxdo_connect_redirect_url')}
              placeholder={t('admin.settings.linuxdo.redirectUrlPlaceholder')}
            />
            <HStack>
              <Button
                variant="secondary"
                size="sm"
                label={t('admin.settings.linuxdo.quickSetCopy')}
                onClick={handleQuickSetCopy}
              />
            </HStack>
          </VStack>
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
