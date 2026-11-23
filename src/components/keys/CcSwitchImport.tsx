import { getGatewayBaseURL } from '@/api/url'
import { useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { CommandLineIcon, SparklesIcon } from '@heroicons/react/24/outline'
import type { ApiKey, PublicSettings } from '@/types'
import { CC_SWITCH_USAGE_SCRIPT, buildCcSwitchImportDeeplink, type CcSwitchClientType } from '@/utils/ccswitchImport'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

/**
 * "Import to CC Switch" for an API key row (port of KeysView.vue
 * importToCcswitch): opens the ccswitch:// deeplink; Antigravity keys first ask
 * which client (Claude Code or Gemini CLI) the provider is for.
 */
export function useCcSwitchImport(publicSettings: PublicSettings | null) {
  const { t } = useI18n()
  const [pendingKey, setPendingKey] = useState<ApiKey | null>(null)

  const executeImport = (row: ApiKey, clientType: CcSwitchClientType) => {
    const deeplink = buildCcSwitchImportDeeplink({
      baseUrl: publicSettings?.api_base_url || getGatewayBaseURL(),
      platform: row.group?.platform || 'anthropic',
      clientType,
      providerName: (publicSettings?.site_name || 'sub2api').trim() || 'sub2api',
      apiKey: row.key,
      usageScript: CC_SWITCH_USAGE_SCRIPT,
    })
    try {
      window.open(deeplink, '_self')
      // Still focused right after means no protocol handler took the link.
      setTimeout(() => {
        if (document.hasFocus()) toast.error(t('keys.ccSwitchNotInstalled'))
      }, 100)
    } catch {
      toast.error(t('keys.ccSwitchNotInstalled'))
    }
  }

  const importKey = (row: ApiKey) => {
    const platform = row.group?.platform || 'anthropic'
    if (platform === 'antigravity') {
      setPendingKey(row)
      return
    }
    executeImport(row, platform === 'gemini' ? 'gemini' : 'claude')
  }

  const selectClient = (clientType: CcSwitchClientType) => {
    if (pendingKey) executeImport(pendingKey, clientType)
    setPendingKey(null)
  }

  const clientSelectDialog = (
    <Dialog isOpen={pendingKey !== null} onOpenChange={(open) => !open && setPendingKey(null)} width={480}>
      <Layout
        header={<DialogHeader title={t('keys.ccsClientSelect.title')} onOpenChange={(open) => !open && setPendingKey(null)} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <Text color="secondary">{t('keys.ccsClientSelect.description')}</Text>
              <Grid columns={2} gap={3}>
                <ClickableCard label={t('keys.ccsClientSelect.claudeCode')} onClick={() => selectClient('claude')} padding={4}>
                  <VStack gap={2} hAlign="center">
                    <Icon icon={CommandLineIcon} size="lg" color="secondary" />
                    <Text weight="medium" justify="center">
                      {t('keys.ccsClientSelect.claudeCode')}
                    </Text>
                    <Text type="supporting" justify="center">
                      {t('keys.ccsClientSelect.claudeCodeDesc')}
                    </Text>
                  </VStack>
                </ClickableCard>
                <ClickableCard label={t('keys.ccsClientSelect.geminiCli')} onClick={() => selectClient('gemini')} padding={4}>
                  <VStack gap={2} hAlign="center">
                    <Icon icon={SparklesIcon} size="lg" color="secondary" />
                    <Text weight="medium" justify="center">
                      {t('keys.ccsClientSelect.geminiCli')}
                    </Text>
                    <Text type="supporting" justify="center">
                      {t('keys.ccsClientSelect.geminiCliDesc')}
                    </Text>
                  </VStack>
                </ClickableCard>
              </Grid>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={() => setPendingKey(null)} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )

  return { importKey, clientSelectDialog }
}
