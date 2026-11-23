import { getGatewayBaseURL } from '@/api/url'
import { useId, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Icon } from '@astryxdesign/core/Icon'
import { Section } from '@astryxdesign/core/Section'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { CommandLineIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { buildCodexModelCatalogUrl } from '@/api/codex'
import { useI18n } from '~/i18n'
import {
  SHELL_LABELS,
  clientDescription,
  clientLabel,
  clientNote,
  clientsFor,
  offersCodexAuthMode,
  shellsFor,
  usesCodexCatalog,
} from './clients'
import { CodexCatalogPanel } from './CodexCatalogPanel'
import { codexCatalogFilePath } from './codexFiles'
import { ConfigFileBlock } from './ConfigFileBlock'
import { buildConfigFiles } from './configFiles'
import { SetupHint } from './SetupHint'
import type { ClientId, CodexAuthMode, KeyGroup, ShellId } from './types'
import { useCodexCatalog } from './useCodexCatalog'

interface CodexAuthModePanelProps {
  mode: CodexAuthMode
  onChange: (mode: CodexAuthMode) => void
}

/** How Codex signs in: the key inside config.toml, or the older pair of config.toml and auth.json. */
function CodexAuthModePanel({ mode, onChange }: CodexAuthModePanelProps) {
  const { t } = useI18n()
  return (
    <Section variant="muted" padding={4}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text as="h3" type="label">
            {t('keys.useKeyModal.openai.authModeTitle')}
          </Text>
          <Text type="supporting" color="secondary">
            {t('keys.useKeyModal.openai.authModeDescription')}
          </Text>
        </VStack>
        <SegmentedControl
          value={mode}
          onChange={(next) => onChange(next as CodexAuthMode)}
          label={t('keys.useKeyModal.openai.authModeTitle')}
          layout="fill"
        >
          <SegmentedControlItem value="legacy" label={t('keys.useKeyModal.openai.authModeLegacy')} />
          <SegmentedControlItem value="api-key" label={t('keys.useKeyModal.openai.authModeApiKey')} />
        </SegmentedControl>
        {mode === 'api-key' && <SetupHint text={t('keys.useKeyModal.openai.authModeApiKeyRestartNotice')} />}
      </VStack>
    </Section>
  )
}

interface ClientSetupProps {
  group: KeyGroup
  apiKey: string
  /** The site's public API address; empty when the site has none, and this page's address is used. */
  apiBaseUrl: string
}

/** The setup guides of one key: pick a client and a system, then copy the files it shows. */
export function ClientSetup({ group, apiKey, apiBaseUrl }: ClientSetupProps) {
  const { t } = useI18n()
  const { platform } = group
  const clients = clientsFor(group)
  const [client, setClient] = useState<ClientId>(clients[0])
  const [shell, setShell] = useState<ShellId>('unix')
  const [authMode, setAuthMode] = useState<CodexAuthMode>('api-key')
  const catalog = useCodexCatalog(apiBaseUrl, apiKey)
  const clientPanelId = useId()
  const shellPanelId = useId()

  const shells = shellsFor(client)
  const showsCatalog = usesCodexCatalog(client)
  const note = clientNote(platform, client, shell, t)
  const files = buildConfigFiles(
    {
      group,
      client,
      shell,
      apiKey,
      baseUrl: apiBaseUrl || getGatewayBaseURL(),
      codexAuthMode: authMode,
      codexCatalog: catalog.catalog,
    },
    t,
  )

  const selectClient = (next: string) => {
    const nextClient = next as ClientId
    setClient(nextClient)
    // Clients offer different systems, so each guide starts on its first one.
    setShell('unix')
    // A fetched catalog belongs to the Codex guides; it is fetched again after coming back.
    if (!usesCodexCatalog(nextClient)) catalog.discard()
  }

  return (
    <VStack gap={4}>
      <Text color="secondary">{clientDescription(platform, client, t)}</Text>

      <TabList value={client} onChange={selectClient} role="tablist" hasDivider>
        {clients.map((id) => (
          <Tab
            key={id}
            value={id}
            label={clientLabel(id, t)}
            icon={<Icon icon={id === 'gemini' ? SparklesIcon : CommandLineIcon} />}
            panelId={clientPanelId}
          />
        ))}
      </TabList>

      <VStack gap={4} id={clientPanelId} role="tabpanel">
        {offersCodexAuthMode(platform, client) && <CodexAuthModePanel mode={authMode} onChange={setAuthMode} />}

        {shells.length > 0 && (
          <TabList value={shell} onChange={(next) => setShell(next as ShellId)} role="tablist" size="sm" hasDivider>
            {shells.map((id) => (
              <Tab key={id} value={id} label={SHELL_LABELS[id]} panelId={shellPanelId} />
            ))}
          </TabList>
        )}

        <VStack gap={4} id={shellPanelId} role={shells.length > 0 ? 'tabpanel' : undefined}>
          {files.map((file) => (
            <ConfigFileBlock key={`${client}|${shell}|${file.path}`} file={file} />
          ))}

          {showsCatalog && (
            <CodexCatalogPanel
              control={catalog}
              location={
                catalog.catalog.mode === 'remote' ? buildCodexModelCatalogUrl(apiBaseUrl) : codexCatalogFilePath(shell)
              }
              canFetch={apiKey !== ''}
            />
          )}

          {note && <Banner status="info" title={t('common.info')} description={note} />}
        </VStack>
      </VStack>
    </VStack>
  )
}
