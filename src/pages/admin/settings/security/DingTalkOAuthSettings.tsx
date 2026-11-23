import { Fragment, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Grid } from '@astryxdesign/core/Grid'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useI18n } from '~/i18n'
import type { SystemSettings, UpdateSettingsRequest } from '~/lib/api/admin/settings'

interface DingTalkOAuthSettingsProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

// The secret is write-only: it is sent only when one is typed.
type DingTalkUpdate = Partial<SystemSettings> & Pick<UpdateSettingsRequest, 'dingtalk_connect_client_secret'>

// Each option copies one DingTalk value into a user attribute, named by a key and a display name.
const SYNC_OPTIONS = [
  {
    toggle: 'dingtalk_connect_sync_display_name',
    attrKey: 'dingtalk_connect_sync_display_name_attr_key',
    attrName: 'dingtalk_connect_sync_display_name_attr_name',
    label: 'admin.settings.dingtalk.syncDisplayName',
    hint: 'admin.settings.dingtalk.syncDisplayNameHint',
    permissionHint: null,
    target: 'admin.settings.dingtalk.syncDisplayNameTarget',
    targetHint: 'admin.settings.dingtalk.syncDisplayNameTargetHint',
    keyPlaceholder: 'dingtalk_name',
    namePlaceholder: { zh: '钉钉姓名', en: 'DingTalk Name' },
  },
  {
    toggle: 'dingtalk_connect_sync_corp_email',
    attrKey: 'dingtalk_connect_sync_corp_email_attr_key',
    attrName: 'dingtalk_connect_sync_corp_email_attr_name',
    label: 'admin.settings.dingtalk.syncCorpEmail',
    hint: 'admin.settings.dingtalk.syncCorpEmailHint',
    permissionHint: 'admin.settings.dingtalk.syncCorpEmailPermissionHint',
    target: 'admin.settings.dingtalk.syncCorpEmailTarget',
    targetHint: 'admin.settings.dingtalk.syncCorpEmailTargetHint',
    keyPlaceholder: 'dingtalk_email',
    namePlaceholder: { zh: '钉钉企业邮箱', en: 'DingTalk Corporate Email' },
  },
  {
    toggle: 'dingtalk_connect_sync_dept',
    attrKey: 'dingtalk_connect_sync_dept_attr_key',
    attrName: 'dingtalk_connect_sync_dept_attr_name',
    label: 'admin.settings.dingtalk.syncDept',
    hint: 'admin.settings.dingtalk.syncDeptHint',
    permissionHint: 'admin.settings.dingtalk.syncDeptPermissionHint',
    target: 'admin.settings.dingtalk.syncDeptTarget',
    targetHint: 'admin.settings.dingtalk.syncDeptTargetHint',
    keyPlaceholder: 'dingtalk_department',
    namePlaceholder: { zh: '钉钉部门', en: 'DingTalk Department' },
  },
] as const

const PAIR_COLUMNS = { minWidth: 180, max: 2 }

export function DingTalkOAuthSettings({ settings, onSave, saving }: DingTalkOAuthSettingsProps) {
  const { t, locale } = useI18n()
  const isZh = locale === 'zh'

  const [form, setForm] = useState({
    dingtalk_connect_enabled: settings.dingtalk_connect_enabled ?? false,
    dingtalk_connect_client_id: settings.dingtalk_connect_client_id || '',
    dingtalk_connect_client_secret: '',
    dingtalk_connect_redirect_url: settings.dingtalk_connect_redirect_url || '',
    dingtalk_connect_corp_restriction_policy: settings.dingtalk_connect_corp_restriction_policy || 'none',
    dingtalk_connect_bypass_registration: settings.dingtalk_connect_bypass_registration ?? false,
    dingtalk_connect_sync_display_name: settings.dingtalk_connect_sync_display_name ?? false,
    dingtalk_connect_sync_display_name_attr_key: settings.dingtalk_connect_sync_display_name_attr_key || 'dingtalk_name',
    dingtalk_connect_sync_display_name_attr_name: settings.dingtalk_connect_sync_display_name_attr_name || '',
    dingtalk_connect_sync_corp_email: settings.dingtalk_connect_sync_corp_email ?? false,
    dingtalk_connect_sync_corp_email_attr_key: settings.dingtalk_connect_sync_corp_email_attr_key || 'dingtalk_email',
    dingtalk_connect_sync_corp_email_attr_name: settings.dingtalk_connect_sync_corp_email_attr_name || '',
    dingtalk_connect_sync_dept: settings.dingtalk_connect_sync_dept ?? false,
    dingtalk_connect_sync_dept_attr_key: settings.dingtalk_connect_sync_dept_attr_key || 'dingtalk_department',
    dingtalk_connect_sync_dept_attr_name: settings.dingtalk_connect_sync_dept_attr_name || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const setField =
    <K extends keyof typeof form>(field: K) =>
    (value: (typeof form)[K]) =>
      setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    const updates: DingTalkUpdate = {
      dingtalk_connect_enabled: form.dingtalk_connect_enabled,
      dingtalk_connect_client_id: form.dingtalk_connect_client_id,
      dingtalk_connect_redirect_url: form.dingtalk_connect_redirect_url,
      dingtalk_connect_corp_restriction_policy: form.dingtalk_connect_corp_restriction_policy,
      dingtalk_connect_bypass_registration: form.dingtalk_connect_bypass_registration,
      dingtalk_connect_sync_display_name: form.dingtalk_connect_sync_display_name,
      dingtalk_connect_sync_display_name_attr_key: form.dingtalk_connect_sync_display_name_attr_key,
      dingtalk_connect_sync_display_name_attr_name: form.dingtalk_connect_sync_display_name_attr_name,
      dingtalk_connect_sync_corp_email: form.dingtalk_connect_sync_corp_email,
      dingtalk_connect_sync_corp_email_attr_key: form.dingtalk_connect_sync_corp_email_attr_key,
      dingtalk_connect_sync_corp_email_attr_name: form.dingtalk_connect_sync_corp_email_attr_name,
      dingtalk_connect_sync_dept: form.dingtalk_connect_sync_dept,
      dingtalk_connect_sync_dept_attr_key: form.dingtalk_connect_sync_dept_attr_key,
      dingtalk_connect_sync_dept_attr_name: form.dingtalk_connect_sync_dept_attr_name,
    }
    if (form.dingtalk_connect_client_secret) {
      updates.dingtalk_connect_client_secret = form.dingtalk_connect_client_secret
    }
    setIsSaving(true)
    try {
      // The stored secret is never sent back, so the typed one does not stay on screen either.
      if (await onSave(updates)) setForm(prev => ({ ...prev, dingtalk_connect_client_secret: '' }))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <CheckboxInput
        label={t('admin.settings.dingtalk.enable')}
        description={t('admin.settings.dingtalk.enableHint')}
        value={form.dingtalk_connect_enabled}
        onChange={setField('dingtalk_connect_enabled')}
      />

      {form.dingtalk_connect_enabled && (
        <>
          <TextInput
            label={t('admin.settings.dingtalk.clientId')}
            description={t('admin.settings.dingtalk.clientIdHint')}
            value={form.dingtalk_connect_client_id}
            onChange={setField('dingtalk_connect_client_id')}
            placeholder={t('admin.settings.dingtalk.clientIdPlaceholder')}
          />
          <TextInput
            label={t('admin.settings.dingtalk.clientSecret')}
            description={
              settings.dingtalk_connect_client_secret_configured
                ? t('admin.settings.dingtalk.clientSecretConfiguredHint')
                : t('admin.settings.dingtalk.clientSecretHint')
            }
            type="password"
            autoComplete="new-password"
            value={form.dingtalk_connect_client_secret}
            onChange={setField('dingtalk_connect_client_secret')}
            placeholder={
              settings.dingtalk_connect_client_secret_configured
                ? t('admin.settings.dingtalk.clientSecretConfiguredPlaceholder')
                : t('admin.settings.dingtalk.clientSecretPlaceholder')
            }
          />
          <TextInput
            label={t('admin.settings.dingtalk.redirectUrl')}
            description={t('admin.settings.dingtalk.redirectUrlHint')}
            type="url"
            value={form.dingtalk_connect_redirect_url}
            onChange={setField('dingtalk_connect_redirect_url')}
            placeholder={t('admin.settings.dingtalk.redirectUrlPlaceholder')}
          />

          <RadioList
            label={t('admin.settings.dingtalk.corpPolicy.label')}
            description={t('admin.settings.dingtalk.corpPolicy.hint')}
            value={form.dingtalk_connect_corp_restriction_policy}
            onChange={setField('dingtalk_connect_corp_restriction_policy')}
          >
            <RadioListItem value="none" label={t('admin.settings.dingtalk.corpPolicy.none')} />
            <RadioListItem value="internal_only" label={t('admin.settings.dingtalk.corpPolicy.internalOnly')} />
          </RadioList>

          {form.dingtalk_connect_corp_restriction_policy === 'internal_only' && (
            <>
              <CheckboxInput
                label={t('admin.settings.dingtalk.bypassRegistration')}
                description={t('admin.settings.dingtalk.bypassRegistrationHint')}
                value={form.dingtalk_connect_bypass_registration}
                onChange={setField('dingtalk_connect_bypass_registration')}
              />

              {SYNC_OPTIONS.map(option => (
                <Fragment key={option.toggle}>
                  <CheckboxInput
                    label={t(option.label)}
                    description={
                      option.permissionHint
                        ? `${t(option.hint)}${isZh ? '；' : ' '}${t(option.permissionHint)}`
                        : t(option.hint)
                    }
                    value={form[option.toggle]}
                    onChange={setField(option.toggle)}
                  />
                  {form[option.toggle] && (
                    <VStack gap={2} hAlign="stretch">
                      <Grid columns={PAIR_COLUMNS} gap={4}>
                        <TextInput
                          label={t(option.target)}
                          value={form[option.attrKey]}
                          onChange={setField(option.attrKey)}
                          placeholder={option.keyPlaceholder}
                        />
                        <TextInput
                          label={t('admin.settings.dingtalk.syncAttrDisplayName')}
                          value={form[option.attrName]}
                          onChange={setField(option.attrName)}
                          placeholder={isZh ? option.namePlaceholder.zh : option.namePlaceholder.en}
                        />
                      </Grid>
                      <Text type="supporting" color="secondary">
                        {t(option.targetHint)}
                      </Text>
                    </VStack>
                  )}
                </Fragment>
              ))}
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
