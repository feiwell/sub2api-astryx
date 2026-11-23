import { toAppPath } from '@/utils/appPath'
import { Fragment, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { HStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { SystemSettings, UpdateSettingsRequest } from '~/lib/api/admin/settings'

interface WeChatOAuthSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

type AppID = 'open' | 'mp' | 'mobile'

interface AppOption {
  id: AppID
  name: string
  hint: string
  appIdLabel: string
  appIdPlaceholder: string
  appSecretLabel: string
  appSecretPlaceholder: string
}

// Secrets are write-only: each is sent only when one is typed.
type WeChatUpdate = Partial<SystemSettings> &
  Pick<
    UpdateSettingsRequest,
    'wechat_connect_open_app_secret' | 'wechat_connect_mp_app_secret' | 'wechat_connect_mobile_app_secret'
  >

const fieldsOf = (id: AppID) =>
  ({
    enabled: `wechat_connect_${id}_enabled`,
    appId: `wechat_connect_${id}_app_id`,
    appSecret: `wechat_connect_${id}_app_secret`,
    isSecretConfigured: `wechat_connect_${id}_app_secret_configured`,
  }) as const

export function WeChatOAuthSettings({ settings, onSave, saving }: WeChatOAuthSettingsProps) {
  const { t, locale } = useI18n()
  const localText = (zh: string, en: string) => (locale === 'zh' ? zh : en)

  const [form, setForm] = useState({
    wechat_connect_enabled: settings.wechat_connect_enabled ?? false,
    wechat_connect_open_enabled: settings.wechat_connect_open_enabled ?? false,
    wechat_connect_mp_enabled: settings.wechat_connect_mp_enabled ?? false,
    wechat_connect_mobile_enabled: settings.wechat_connect_mobile_enabled ?? false,
    wechat_connect_open_app_id: settings.wechat_connect_open_app_id || '',
    wechat_connect_open_app_secret: '',
    wechat_connect_mp_app_id: settings.wechat_connect_mp_app_id || '',
    wechat_connect_mp_app_secret: '',
    wechat_connect_mobile_app_id: settings.wechat_connect_mobile_app_id || '',
    wechat_connect_mobile_app_secret: '',
    wechat_connect_redirect_url: settings.wechat_connect_redirect_url || '',
    wechat_connect_frontend_redirect_url: settings.wechat_connect_frontend_redirect_url || toAppPath('/auth/oauth/callback'),
  })
  const [isSaving, setIsSaving] = useState(false)

  const setField =
    <K extends keyof typeof form>(field: K) =>
    (value: (typeof form)[K]) =>
      setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    const updates: WeChatUpdate = {
      wechat_connect_enabled: form.wechat_connect_enabled,
      wechat_connect_open_enabled: form.wechat_connect_open_enabled,
      wechat_connect_mp_enabled: form.wechat_connect_mp_enabled,
      wechat_connect_mobile_enabled: form.wechat_connect_mobile_enabled,
      wechat_connect_open_app_id: form.wechat_connect_open_app_id,
      wechat_connect_mp_app_id: form.wechat_connect_mp_app_id,
      wechat_connect_mobile_app_id: form.wechat_connect_mobile_app_id,
      wechat_connect_redirect_url: form.wechat_connect_redirect_url,
      wechat_connect_frontend_redirect_url: form.wechat_connect_frontend_redirect_url,
    }
    if (form.wechat_connect_open_app_secret) {
      updates.wechat_connect_open_app_secret = form.wechat_connect_open_app_secret
    }
    if (form.wechat_connect_mp_app_secret) {
      updates.wechat_connect_mp_app_secret = form.wechat_connect_mp_app_secret
    }
    if (form.wechat_connect_mobile_app_secret) {
      updates.wechat_connect_mobile_app_secret = form.wechat_connect_mobile_app_secret
    }
    setIsSaving(true)
    try {
      if (await onSave(updates)) {
        // A stored secret is never sent back, so a typed one does not stay on screen either.
        setForm(prev => ({
          ...prev,
          wechat_connect_open_app_secret: '',
          wechat_connect_mp_app_secret: '',
          wechat_connect_mobile_app_secret: '',
        }))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const apps: AppOption[] = [
    {
      id: 'open',
      name: localText('PC 应用', 'PC App'),
      hint: localText(
        '桌面浏览器通过微信开放平台扫码登录。可与公众号或移动应用同时存在。',
        'Desktop browsers sign in through WeChat Open Platform QR login. This can coexist with Official Account or Mobile App.',
      ),
      appIdLabel: localText('PC AppID', 'PC App ID'),
      appIdPlaceholder: localText('微信开放平台 PC 应用 AppID', 'WeChat Open Platform PC App ID'),
      appSecretLabel: localText('PC AppSecret', 'PC App Secret'),
      appSecretPlaceholder: localText('微信开放平台 PC 应用 AppSecret', 'WeChat Open Platform PC App Secret'),
    },
    {
      id: 'mp',
      name: localText('公众号', 'Official Account'),
      hint: localText(
        '仅在微信内浏览器可用；非微信环境下会显示不可用。',
        'Only available inside the WeChat browser. It is shown as unavailable outside WeChat.',
      ),
      appIdLabel: localText('公众号 AppID', 'Official Account App ID'),
      appIdPlaceholder: localText('公众号 AppID', 'Official Account App ID'),
      appSecretLabel: localText('公众号 AppSecret', 'Official Account App Secret'),
      appSecretPlaceholder: localText('公众号 AppSecret', 'Official Account App Secret'),
    },
    {
      id: 'mobile',
      name: localText('移动应用', 'Mobile App'),
      hint: localText(
        '原生移动端通过微信 SDK 唤起授权，网页端不会直接发起该流程。',
        'Native mobile clients start authorization through the WeChat SDK. The web UI does not launch this flow directly.',
      ),
      appIdLabel: localText('移动应用 AppID', 'Mobile App ID'),
      appIdPlaceholder: localText('移动应用 AppID', 'Mobile App ID'),
      appSecretLabel: localText('移动应用 AppSecret', 'Mobile App Secret'),
      appSecretPlaceholder: localText('移动应用 AppSecret', 'Mobile App Secret'),
    },
  ]

  const hasApp = form.wechat_connect_open_enabled || form.wechat_connect_mp_enabled || form.wechat_connect_mobile_enabled

  return (
    <>
      <CheckboxInput
        label={t('admin.settings.wechatConnect.enabledLabel')}
        description={t('admin.settings.wechatConnect.enabledHint')}
        value={form.wechat_connect_enabled}
        onChange={setField('wechat_connect_enabled')}
      />

      {form.wechat_connect_enabled && (
        <>
          {apps.map(({ id, name, hint, appIdLabel, appIdPlaceholder, appSecretLabel, appSecretPlaceholder }) => {
            const fields = fieldsOf(id)
            return (
              <Fragment key={id}>
                <CheckboxInput
                  label={name}
                  description={hint}
                  value={form[fields.enabled]}
                  onChange={setField(fields.enabled)}
                />
                {form[fields.enabled] && (
                  <>
                    <TextInput
                      label={appIdLabel}
                      value={form[fields.appId]}
                      onChange={setField(fields.appId)}
                      placeholder={appIdPlaceholder}
                    />
                    <TextInput
                      label={appSecretLabel}
                      type="password"
                      autoComplete="new-password"
                      value={form[fields.appSecret]}
                      onChange={setField(fields.appSecret)}
                      placeholder={
                        settings[fields.isSecretConfigured]
                          ? localText('密钥已配置，留空以保留当前值。', 'Secret configured. Leave empty to keep the current value.')
                          : appSecretPlaceholder
                      }
                    />
                  </>
                )}
              </Fragment>
            )
          })}

          {hasApp && (
            <>
              <TextInput
                label={localText('后端回调地址', 'Backend Callback URL')}
                type="url"
                value={form.wechat_connect_redirect_url}
                onChange={setField('wechat_connect_redirect_url')}
                placeholder="https://gateway.example.test/api/v1/auth/oauth/wechat/callback"
              />
              <TextInput
                label={localText('前端回跳地址', 'Frontend Callback URL')}
                value={form.wechat_connect_frontend_redirect_url}
                onChange={setField('wechat_connect_frontend_redirect_url')}
                placeholder={toAppPath('/auth/oauth/callback')}
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
