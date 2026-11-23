import { useCallback, useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { PanelRateLimitSettings as PanelRateLimit } from '~/lib/api/admin/settings'
import { toast } from '~/lib/toast'

type RpmField = 'user_rpm' | 'heavy_rpm' | 'public_ip_rpm'

interface RpmOption {
  field: RpmField
  label: string
  hint: string
}

const RPM_OPTIONS: RpmOption[] = [
  {
    field: 'user_rpm',
    label: 'admin.settings.panelRateLimit.userRpm',
    hint: 'admin.settings.panelRateLimit.userRpmHint',
  },
  {
    field: 'heavy_rpm',
    label: 'admin.settings.panelRateLimit.heavyRpm',
    hint: 'admin.settings.panelRateLimit.heavyRpmHint',
  },
  {
    field: 'public_ip_rpm',
    label: 'admin.settings.panelRateLimit.publicIpRpm',
    hint: 'admin.settings.panelRateLimit.publicIpRpmHint',
  },
]

// The server caps every limit here; 0 means no limit.
const RPM_RANGE = { min: 0, max: 100000 }

const messageOf = (error: unknown) => (error as { message?: string } | null)?.message

/** A number field words a rejected entry in English only, so the section words it. */
const entryErrorMessage = (error: NumberInputEntryError) =>
  error.kind === 'fractional'
    ? 'admin.settings.features.affiliate.wholeNumber'
    : 'admin.settings.features.affiliate.invalidNumber'

export function PanelRateLimitSettings() {
  const { t } = useI18n()
  // The form stays null until the stored limits arrive: defaults are never shown as if they were stored.
  const [form, setForm] = useState<PanelRateLimit | null>(null)
  const [hasLoadFailed, setHasLoadFailed] = useState(false)
  const [entryErrors, setEntryErrors] = useState<Partial<Record<RpmField, NumberInputEntryError>>>({})
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setForm(await adminAPI.settings.getPanelRateLimitSettings())
    } catch (error) {
      console.error('Failed to fetch panel rate limit settings:', error)
      setHasLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (hasLoadFailed) {
    const retry = () => {
      setHasLoadFailed(false)
      void load()
    }
    return (
      <Banner
        status="error"
        title={t('common.loadFailed')}
        endContent={<Button size="sm" label={t('common.refresh')} onClick={retry} />}
      />
    )
  }

  if (!form) {
    return (
      <HStack gap={2} vAlign="center">
        <Spinner size="sm" />
        <Text color="secondary">{t('common.loading')}</Text>
      </HStack>
    )
  }

  const handleSave = async () => {
    if (Object.values(entryErrors).some(Boolean)) {
      toast.error(t('admin.settings.features.affiliate.fixNumbers'))
      return
    }
    setIsSaving(true)
    try {
      setForm(await adminAPI.settings.updatePanelRateLimitSettings(form))
      toast.success(t('admin.settings.panelRateLimit.saved'))
    } catch (error) {
      console.error('Failed to save panel rate limit settings:', error)
      toast.error(messageOf(error) || t('admin.settings.panelRateLimit.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const setField =
    <K extends keyof PanelRateLimit>(field: K) =>
    (value: PanelRateLimit[K]) =>
      setForm(prev => prev && { ...prev, [field]: value })

  return (
    <>
      <CheckboxInput
        label={t('admin.settings.panelRateLimit.enabled')}
        description={t('admin.settings.panelRateLimit.enabledHint')}
        value={form.enabled}
        onChange={checked => {
          setField('enabled')(checked)
          // The limit fields come and go with this switch, and a rejected entry goes with them.
          setEntryErrors({})
        }}
      />
      {form.enabled && (
        <>
          {RPM_OPTIONS.map(({ field, label, hint }) => {
            const entryError = entryErrors[field]
            return (
              <NumberInput
                key={field}
                label={t(label)}
                description={t(hint)}
                value={form[field]}
                onChange={setField(field)}
                onEntryErrorChange={error => setEntryErrors(prev => ({ ...prev, [field]: error ?? undefined }))}
                status={entryError ? { type: 'error', message: t(entryErrorMessage(entryError)) } : undefined}
                {...RPM_RANGE}
                units={t('admin.settings.panelRateLimit.perMinute')}
                isIntegerOnly
                isWheelEnabled={false}
              />
            )
          })}
          <CheckboxInput
            label={t('admin.settings.panelRateLimit.exemptAdmin')}
            description={t('admin.settings.panelRateLimit.exemptAdminHint')}
            value={form.exempt_admin}
            onChange={setField('exempt_admin')}
          />
        </>
      )}
      <HStack>
        <Button
          variant="primary"
          label={isSaving ? t('common.saving') : t('common.save')}
          isLoading={isSaving}
          onClick={() => void handleSave()}
        />
      </HStack>
    </>
  )
}
