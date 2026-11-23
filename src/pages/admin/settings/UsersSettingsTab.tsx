import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { listPlatformIds } from '@/constants/platformCatalog'
import { useI18n } from '~/i18n'
import {
  appendAuthSourceDefaultsToUpdateRequest,
  buildAuthSourceDefaultsState,
  normalizePlatformQuotasMap,
  type AuthSourceType,
  type DefaultPlatformQuotasMap,
  type PlatformQuotaLimits,
  type QuotaWindowType,
  type SystemSettings,
} from '~/lib/api/admin/settings'

interface UsersSettingsTabProps {
  settings: SystemSettings
  onSave: (updates: Partial<SystemSettings>) => Promise<boolean>
  saving: boolean
}

const AUTH_SOURCES: { source: AuthSourceType; name: string }[] = [
  { source: 'email', name: 'Email' },
  { source: 'linuxdo', name: 'LinuxDo' },
  { source: 'oidc', name: 'OIDC' },
  { source: 'wechat', name: 'WeChat' },
  { source: 'github', name: 'GitHub' },
  { source: 'google', name: 'Google' },
  { source: 'dingtalk', name: 'DingTalk' },
]

const QUOTA_WINDOWS: QuotaWindowType[] = ['daily', 'weekly', 'monthly']
const UNLIMITED: PlatformQuotaLimits = { daily: null, weekly: null, monthly: null }

type QuotaChangeHandler = (platform: string, window: QuotaWindowType, value: number | null) => void

interface QuotaRow extends Record<string, unknown>, PlatformQuotaLimits {
  platform: string
}

const hasAnyQuota = (quotas: DefaultPlatformQuotasMap) =>
  Object.values(quotas).some(limits => QUOTA_WINDOWS.some(window => limits?.[window] != null))

const withQuota = (
  quotas: DefaultPlatformQuotasMap,
  platform: string,
  window: QuotaWindowType,
  value: number | null,
): DefaultPlatformQuotasMap => ({
  ...quotas,
  [platform]: { ...UNLIMITED, ...quotas[platform], [window]: value },
})

function SettingsSection({
  title,
  description,
  note,
  children,
}: {
  title: string
  description?: string
  note?: string
  children: ReactNode
}) {
  return (
    <VStack gap={4} hAlign="stretch">
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && (
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        )}
        {note && (
          <Text type="supporting" color="primary">
            {note}
          </Text>
        )}
      </VStack>
      {children}
    </VStack>
  )
}

function QuotaTable({ quotas, onChange }: { quotas: DefaultPlatformQuotasMap; onChange: QuotaChangeHandler }) {
  const { t } = useI18n()

  const rows = useMemo<QuotaRow[]>(
    () => listPlatformIds().map(platform => ({ platform, ...UNLIMITED, ...quotas[platform] })),
    [quotas],
  )

  const columns = useMemo<TableColumn<QuotaRow>[]>(
    () => [
      {
        key: 'platform',
        header: t('admin.settings.platformQuota.platform'),
        width: proportional(1, { minWidth: 130 }),
        renderCell: row => <Text type="code">{row.platform}</Text>,
      },
      ...QUOTA_WINDOWS.map((window): TableColumn<QuotaRow> => {
        const header = t(`admin.settings.platformQuota.${window}`)
        return {
          key: window,
          header,
          width: proportional(1, { minWidth: 170 }),
          renderCell: row => (
            <NumberInput
              label={`${row.platform} ${header}`}
              isLabelHidden
              size="sm"
              width={160}
              value={row[window]}
              // Blank means unlimited and 0 blocks the window, so a negative typo must not turn into either.
              onChange={(value: number | null) => {
                if (value === null || value >= 0) onChange(row.platform, window, value)
              }}
              hasClear
              step={0.01}
              isWheelEnabled={false}
              placeholder={t('admin.settings.platformQuota.placeholder')}
            />
          ),
        }
      }),
    ],
    [t, onChange],
  )

  return <Table data={rows} columns={columns} idKey="platform" density="compact" />
}

function SourceQuotaTable({
  source,
  quotas,
  onChange,
}: {
  source: AuthSourceType
  quotas: DefaultPlatformQuotasMap
  onChange: (source: AuthSourceType, ...change: Parameters<QuotaChangeHandler>) => void
}) {
  const handleChange = useCallback<QuotaChangeHandler>(
    (platform, window, value) => onChange(source, platform, window, value),
    [onChange, source],
  )

  return <QuotaTable quotas={quotas} onChange={handleChange} />
}

export function UsersSettingsTab({ settings, onSave, saving }: UsersSettingsTabProps) {
  const { t } = useI18n()

  const [defaultPlatformQuotas, setDefaultPlatformQuotas] = useState(() =>
    normalizePlatformQuotasMap(settings.default_platform_quotas)
  )
  const [authSourceDefaults, setAuthSourceDefaults] = useState(() => buildAuthSourceDefaultsState(settings))

  // Sources that already carry overrides start expanded so existing values are never hidden.
  const [openSources, setOpenSources] = useState<string[]>(() =>
    AUTH_SOURCES.filter(({ source }) => hasAnyQuota(authSourceDefaults[source].platform_quotas)).map(
      ({ source }) => source
    )
  )

  const updateDefaultQuota = useCallback<QuotaChangeHandler>((platform, window, value) => {
    setDefaultPlatformQuotas(prev => withQuota(prev, platform, window, value))
  }, [])

  const updateSourceQuota = useCallback(
    (source: AuthSourceType, ...[platform, window, value]: Parameters<QuotaChangeHandler>) => {
      setAuthSourceDefaults(prev => ({
        ...prev,
        [source]: {
          ...prev[source],
          platform_quotas: withQuota(prev[source].platform_quotas, platform, window, value),
        },
      }))
    },
    [],
  )

  const handleSave = async () => {
    const updates: Partial<SystemSettings> = {
      default_platform_quotas: defaultPlatformQuotas,
    }

    appendAuthSourceDefaultsToUpdateRequest(updates, authSourceDefaults)

    await onSave(updates)
  }

  return (
    <VStack gap={6} hAlign="stretch">
      <SettingsSection
        title={t('admin.settings.defaults.defaultPlatformQuotas')}
        description={t('admin.settings.defaults.defaultPlatformQuotasHint')}
        note={t('admin.settings.defaults.platformQuotaNotice')}
      >
        <QuotaTable quotas={defaultPlatformQuotas} onChange={updateDefaultQuota} />
      </SettingsSection>

      <Divider />

      <SettingsSection
        title={t('admin.settings.authSourceDefaults.platformQuotasOverride')}
        description={t('admin.settings.authSourceDefaults.platformQuotasOverrideHint')}
      >
        <CollapsibleGroup
          type="multiple"
          hasDividers
          value={openSources}
          onChange={value => setOpenSources(Array.isArray(value) ? value : [value])}
        >
          {AUTH_SOURCES.map(({ source, name }) => (
            <Collapsible
              key={source}
              value={source}
              trigger={
                <HStack gap={3} vAlign="center">
                  <Text weight="semibold">{name}</Text>
                  <Text type="supporting" color="secondary">
                    {t(`admin.settings.authSourceDefaults.sourceUsers.${source}`)}
                  </Text>
                </HStack>
              }
            >
              <VStack hAlign="stretch" paddingBlockStart={2}>
                <SourceQuotaTable
                  source={source}
                  quotas={authSourceDefaults[source].platform_quotas}
                  onChange={updateSourceQuota}
                />
              </VStack>
            </Collapsible>
          ))}
        </CollapsibleGroup>
      </SettingsSection>

      <Divider />

      <HStack>
        <Button
          variant="primary"
          label={saving ? t('common.saving') : t('common.save')}
          isLoading={saving}
          onClick={() => void handleSave()}
        />
      </HStack>
    </VStack>
  )
}
