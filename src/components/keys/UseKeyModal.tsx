import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack } from '@astryxdesign/core/Stack'
import type { ApiKey } from '@/types'
import { useI18n } from '~/i18n'
import { ClientSetup } from './useKey/ClientSetup'
import type { KeyGroup } from './useKey/types'

interface UseKeyModalProps {
  isOpen: boolean
  onClose: () => void
  apiKey: ApiKey | null
  /** The site's public API address; when empty, the guides use the address of this page. */
  apiBaseUrl?: string
}

// Config files are wide; this is the width of the Vue dialog.
const DIALOG_WIDTH = 896

/** Which guides a key gets is decided by its group; a key without a group has none. */
function keyGroupOf(apiKey: ApiKey | null): KeyGroup | null {
  const group = apiKey?.group
  if (!group?.platform) return null
  return {
    platform: group.platform,
    claudeCodeOnly: group.claude_code_only || false,
    allowMessagesDispatch: group.allow_messages_dispatch || false,
  }
}

/** Setup guides for using one API key in the command-line clients its group supports. */
export function UseKeyModal({ isOpen, onClose, apiKey, apiBaseUrl = '' }: UseKeyModalProps) {
  const { t } = useI18n()
  // Nothing is kept while closed, so every opening starts on the group's first client.
  if (!isOpen) return null

  const group = keyGroupOf(apiKey)
  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={DIALOG_WIDTH} maxHeight="90dvh">
      <Layout
        header={<DialogHeader title={t('keys.useKeyModal.title')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            {group ? (
              <ClientSetup
                // A group that offers other clients starts over on its own first client.
                key={`${group.platform}|${group.claudeCodeOnly}|${group.allowMessagesDispatch}`}
                group={group}
                apiKey={apiKey?.key || ''}
                apiBaseUrl={apiBaseUrl}
              />
            ) : (
              <Banner
                status="warning"
                title={t('keys.useKeyModal.noGroupTitle')}
                description={t('keys.useKeyModal.noGroupDescription')}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
