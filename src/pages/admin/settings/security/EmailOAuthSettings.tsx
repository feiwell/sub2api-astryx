import { toAppPath } from '@/utils/appPath'
import { buildGatewayUrl } from '@/api/url'
import { Fragment, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { Link } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { SystemSettings, UpdateSettingsRequest } from '~/lib/api/admin/settings'

interface EmailOAuthSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

type ProviderID = 'github' | 'google'

interface ProviderOption {
  id: ProviderID
  name: string
  hint: string
  guide: ReactNode
  isSecretConfigured: boolean
}

// Secrets are write-only: each is sent only when one is typed.
type EmailOAuthUpdate = Partial<SystemSettings> &
  Pick<UpdateSettingsRequest, 'github_oauth_client_secret' | 'google_oauth_client_secret'>

const fieldsOf = (id: ProviderID) =>
  ({
    enabled: `${id}_oauth_enabled`,
    clientId: `${id}_oauth_client_id`,
    clientSecret: `${id}_oauth_client_secret`,
    redirectUrl: `${id}_oauth_redirect_url`,
    frontendRedirectUrl: `${id}_oauth_frontend_redirect_url`,
  }) as const

export function EmailOAuthSettings({ settings, onSave, saving }: EmailOAuthSettingsProps) {
  const { t, locale } = useI18n()
  const isZh = locale === 'zh'

  const [form, setForm] = useState({
    github_oauth_enabled: settings.github_oauth_enabled ?? false,
    github_oauth_client_id: settings.github_oauth_client_id || '',
    github_oauth_client_secret: '',
    github_oauth_redirect_url: settings.github_oauth_redirect_url || '',
    github_oauth_frontend_redirect_url: settings.github_oauth_frontend_redirect_url || toAppPath('/auth/oauth/callback'),
    google_oauth_enabled: settings.google_oauth_enabled ?? false,
    google_oauth_client_id: settings.google_oauth_client_id || '',
    google_oauth_client_secret: '',
    google_oauth_redirect_url: settings.google_oauth_redirect_url || '',
    google_oauth_frontend_redirect_url: settings.google_oauth_frontend_redirect_url || toAppPath('/auth/oauth/callback'),
  })
  const [isSaving, setIsSaving] = useState(false)

  const setField =
    <K extends keyof typeof form>(field: K) =>
    (value: (typeof form)[K]) =>
      setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    const updates: EmailOAuthUpdate = {
      github_oauth_enabled: form.github_oauth_enabled,
      github_oauth_client_id: form.github_oauth_client_id,
      github_oauth_redirect_url: form.github_oauth_redirect_url,
      github_oauth_frontend_redirect_url: form.github_oauth_frontend_redirect_url,
      google_oauth_enabled: form.google_oauth_enabled,
      google_oauth_client_id: form.google_oauth_client_id,
      google_oauth_redirect_url: form.google_oauth_redirect_url,
      google_oauth_frontend_redirect_url: form.google_oauth_frontend_redirect_url,
    }
    if (form.github_oauth_client_secret) {
      updates.github_oauth_client_secret = form.github_oauth_client_secret
    }
    if (form.google_oauth_client_secret) {
      updates.google_oauth_client_secret = form.google_oauth_client_secret
    }
    setIsSaving(true)
    try {
      if (await onSave(updates)) {
        // A stored secret is never sent back, so a typed one does not stay on screen either.
        setForm(prev => ({ ...prev, github_oauth_client_secret: '', google_oauth_client_secret: '' }))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleQuickSetCopy = (id: ProviderID) => {
    const url = buildGatewayUrl(`/api/v1/auth/oauth/${id}/callback`)
    setField(fieldsOf(id).redirectUrl)(url)
    // Copying is a convenience: the address is in the field either way.
    void navigator.clipboard?.writeText(url).catch(() => undefined)
  }

  const githubApps = (
    <Link href="https://github.com/settings/developers" isExternalLink hasUnderline type="inherit">
      OAuth Apps
    </Link>
  )

  const providers: ProviderOption[] = [
    {
      id: 'github',
      name: 'GitHub',
      hint: isZh
        ? 'GitHub OAuth App 需要 read:user user:email 权限，回调地址填写下方后端地址。'
        : 'GitHub OAuth App needs read:user user:email scopes. Use the backend callback URL below.',
      guide: isZh ? (
        <>
          开通引导：GitHub Settings → Developer settings → {githubApps} → New OAuth App；Homepage URL
          填站点域名，Authorization callback URL 填下面的后端回调地址。
        </>
      ) : (
        <>
          Setup guide: GitHub Settings → Developer settings → {githubApps} → New OAuth App. Use your site origin as
          Homepage URL and the backend callback URL below as Authorization callback URL.
        </>
      ),
      isSecretConfigured: settings.github_oauth_client_secret_configured,
    },
    {
      id: 'google',
      name: 'Google',
      hint: isZh
        ? 'Google OAuth 客户端需要 openid email profile 范围，并在凭据里登记后端回调地址。'
        : 'Google OAuth client needs openid email profile scopes and the backend callback URL registered in credentials.',
      guide: isZh
        ? '开通引导：Google Cloud Console → APIs & Services → OAuth consent screen 完成同意屏幕；Credentials → Create Credentials → OAuth client ID，类型选择 Web application，并把下面地址加入 Authorized redirect URIs。'
        : 'Setup guide: Google Cloud Console → APIs & Services → OAuth consent screen, then Credentials → Create Credentials → OAuth client ID, choose Web application, and add the URL below to Authorized redirect URIs.',
      isSecretConfigured: settings.google_oauth_client_secret_configured,
    },
  ]

  return (
    <>
      {providers.map(({ id, name, hint, guide, isSecretConfigured }, index) => {
        const fields = fieldsOf(id)
        return (
          <Fragment key={id}>
            {index > 0 && <Divider />}
            <CheckboxInput
              label={name}
              description={hint}
              value={form[fields.enabled]}
              onChange={setField(fields.enabled)}
            />
            {form[fields.enabled] && (
              <>
                <Text type="supporting" color="secondary">
                  {guide}
                </Text>
                <TextInput
                  label="Client ID"
                  value={form[fields.clientId]}
                  onChange={setField(fields.clientId)}
                  placeholder={`${name} OAuth Client ID`}
                />
                <TextInput
                  label="Client Secret"
                  type="password"
                  autoComplete="new-password"
                  value={form[fields.clientSecret]}
                  onChange={setField(fields.clientSecret)}
                  placeholder={
                    isSecretConfigured
                      ? isZh
                        ? '密钥已配置，留空以保留当前值。'
                        : 'Secret configured. Leave empty to keep the current value.'
                      : `${name} OAuth Client Secret`
                  }
                />
                <VStack gap={2} hAlign="stretch">
                  <TextInput
                    label={isZh ? '后端回调地址' : 'Backend Callback URL'}
                    type="url"
                    value={form[fields.redirectUrl]}
                    onChange={setField(fields.redirectUrl)}
                    placeholder={`https://gateway.example.test/api/v1/auth/oauth/${id}/callback`}
                  />
                  <HStack>
                    <Button
                      variant="secondary"
                      size="sm"
                      label={isZh ? '生成并复制' : 'Generate and copy'}
                      onClick={() => handleQuickSetCopy(id)}
                    />
                  </HStack>
                </VStack>
                <TextInput
                  label={isZh ? '前端回跳地址' : 'Frontend Callback URL'}
                  value={form[fields.frontendRedirectUrl]}
                  onChange={setField(fields.frontendRedirectUrl)}
                  placeholder={toAppPath('/auth/oauth/callback')}
                />
              </>
            )}
          </Fragment>
        )
      })}

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
