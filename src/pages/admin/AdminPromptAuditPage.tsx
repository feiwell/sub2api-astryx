import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { AuditConfigPanel } from './promptAudit/AuditConfigPanel'
import { AuditEventsPanel } from './promptAudit/AuditEventsPanel'
import { formatAuditDate } from './promptAudit/eventText'
import { useAuditConfig } from './promptAudit/useAuditConfig'
import { useAuditEvents } from './promptAudit/useAuditEvents'

type PageTab = 'events' | 'config'

/**
 * Prompt audit: the events the guard recorded, and the configuration of the guard itself.
 * The page opens on the events, which is what an admin comes back for.
 */
export function AdminPromptAuditPage() {
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<PageTab>('events')
  const config = useAuditConfig()
  const events = useAuditEvents()
  // The header and the events tab go by what the server holds, not by a draft that may never be saved.
  const { saved, draft } = config

  return (
    <Page
      title={t('admin.promptAudit.title')}
      description={t('admin.promptAudit.description')}
      actions={
        saved && (
          <VStack gap={0.5} hAlign="end">
            <Text type="supporting" color="secondary">
              {t('admin.promptAudit.configVersion', { version: saved.config_version })}
            </Text>
            {saved.updated_at && (
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {formatAuditDate(saved.updated_at, locale, 'medium')}
              </Text>
            )}
          </VStack>
        )
      }
    >
      <VStack gap={4}>
        {config.failure != null && (
          <Banner
            status="error"
            title={t('admin.promptAudit.errors.loadConfig')}
            description={config.failure !== t('admin.promptAudit.errors.loadConfig') ? config.failure : undefined}
            endContent={
              <Button
                label={t('admin.promptAudit.actions.retry')}
                variant="secondary"
                size="sm"
                onClick={config.reload}
              />
            }
          />
        )}
        {/* Without the configuration the page cannot tell what is being audited:
            a first load that failed leaves only its notice. */}
        {(saved || config.failure == null) && (
          <>
            <TabList value={tab} onChange={(next) => setTab(next as PageTab)} hasDivider>
              <Tab value="events" label={t('admin.promptAudit.tabs.events')} />
              <Tab value="config" label={t('admin.promptAudit.tabs.config')} />
            </TabList>
            {tab === 'events' ? (
              <AuditEventsPanel
                list={events}
                hasPassNotice={!!saved?.enabled && !saved.store_pass_events}
                onOpenConfig={() => setTab('config')}
              />
            ) : draft ? (
              <AuditConfigPanel config={config} draft={draft} />
            ) : (
              <Center padding={8}>
                <Spinner label={t('common.loading')} />
              </Center>
            )}
          </>
        )}
      </VStack>
    </Page>
  )
}
