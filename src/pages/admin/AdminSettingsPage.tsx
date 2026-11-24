import { useEffect, useState, useCallback } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Icon } from '@astryxdesign/core/Icon'
import {
  Home,
  FileText,
  Zap,
  Shield,
  Users,
  Server,
  CreditCard,
  Mail,
  Database,
  Download,
} from 'lucide-react'
import { adminAPI } from '~/lib/api/admin'
type SystemSettings = any
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

// Tab components
import { GeneralSettingsTab } from './settings/GeneralSettingsTab'
import { AgreementSettingsTab } from './settings/AgreementSettingsTab'
import { SecuritySettingsTab } from './settings/SecuritySettingsTab'
import { GatewaySettingsTab } from './settings/GatewaySettingsTab'
import { PaymentSettingsTab } from './settings/PaymentSettingsTab'
import { EmailSettingsTab } from './settings/EmailSettingsTab'
import { FeaturesSettingsTab } from './settings/FeaturesSettingsTab'
import { UsersSettingsTab } from './settings/UsersSettingsTab'
import { BackupSettingsTab } from './settings/BackupSettingsTab'
import { UpdateSettingsTab } from './settings/UpdateSettingsTab'

type SettingsTab = 'general' | 'agreement' | 'features' | 'security' | 'users' | 'gateway' | 'payment' | 'email' | 'backup' | 'update'

const TAB_ICONS = {
  general: Home,
  agreement: FileText,
  features: Zap,
  security: Shield,
  users: Users,
  gateway: Server,
  payment: CreditCard,
  email: Mail,
  backup: Database,
  update: Download,
}

export function AdminSettingsPage() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const data = await adminAPI.settings.getSettings()
      setSettings(data)
    } catch (error: any) {
      toast.error(error.message || t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = useCallback(async (updates: Partial<SystemSettings>) => {
    try {
      setSaving(true)
      const updated = await adminAPI.settings.updateSettings(updates)
      setSettings(updated)
      toast.success(t('admin.settings.saveSuccess'))
      return true
    } catch (error: any) {
      toast.error(error.message || t('common.saveFailed'))
      return false
    } finally {
      setSaving(false)
    }
  }, [t])

  if (loading) {
    return (
      <Page title={t('admin.settings.title')}>
        <Center style={{ minHeight: 400 }}>
          <Spinner />
        </Center>
      </Page>
    )
  }

  if (!settings) {
    return (
      <Page title={t('admin.settings.title')}>
        <Card padding={6}>
          <Text color="secondary">{t('common.loadFailed')}</Text>
        </Card>
      </Page>
    )
  }

  return (
    <Page title={t('admin.settings.title')}>
      <Layout>
        <LayoutContent style={{ maxWidth: "1200px" }}>
          <VStack gap={6} hAlign="stretch">
            <TabList
              value={activeTab}
              onChange={(key) => setActiveTab(key as SettingsTab)}
            >
              <Tab value="general" icon={<Icon icon={TAB_ICONS.general} />} label={t('admin.settings.tabs.general')} />
              <Tab value="agreement" icon={<Icon icon={TAB_ICONS.agreement} />} label={t('admin.settings.tabs.agreement')} />
              <Tab value="features" icon={<Icon icon={TAB_ICONS.features} />} label={t('admin.settings.tabs.features')} />
              <Tab value="security" icon={<Icon icon={TAB_ICONS.security} />} label={t('admin.settings.tabs.security')} />
              <Tab value="users" icon={<Icon icon={TAB_ICONS.users} />} label={t('admin.settings.tabs.users')} />
              <Tab value="gateway" icon={<Icon icon={TAB_ICONS.gateway} />} label={t('admin.settings.tabs.gateway')} />
              <Tab value="payment" icon={<Icon icon={TAB_ICONS.payment} />} label={t('admin.settings.tabs.payment')} />
              <Tab value="email" icon={<Icon icon={TAB_ICONS.email} />} label={t('admin.settings.tabs.email')} />
              <Tab value="backup" icon={<Icon icon={TAB_ICONS.backup} />} label={t('admin.settings.tabs.backup')} />
              <Tab value="update" icon={<Icon icon={TAB_ICONS.update} />} label={t('admin.settings.tabs.update')} />
            </TabList>

            {activeTab === 'general' && (
              <GeneralSettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'agreement' && (
              <AgreementSettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'security' && (
              <SecuritySettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'gateway' && (
              <GatewaySettingsTab />
            )}
            {activeTab === 'payment' && (
              <PaymentSettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'email' && (
              <EmailSettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'features' && (
              <FeaturesSettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'users' && (
              <UsersSettingsTab settings={settings} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'backup' && (
              <BackupSettingsTab />
            )}
            {activeTab === 'update' && (
              <UpdateSettingsTab />
            )}
          </VStack>
        </LayoutContent>
      </Layout>
    </Page>
  )
}
