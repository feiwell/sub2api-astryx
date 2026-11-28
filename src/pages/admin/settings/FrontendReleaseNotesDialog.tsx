import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { UiUpdateStatus } from '~/lib/api/admin/uiUpdate'
import { useI18n } from '~/i18n'

interface Props {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  status: UiUpdateStatus
}

export function FrontendReleaseNotesDialog({ isOpen, onOpenChange, status }: Props) {
  const { t, locale } = useI18n()
  const notes = status.release_notes
  const releases = notes?.state === 'available' ? notes.releases : []
  const revision = notes?.sha || status.latest_sha || status.current_sha

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width="48rem">
      <Layout
        header={
          <DialogHeader
            title={t(status.has_update
              ? 'admin.settings.update.uiPreviewNotes'
              : 'admin.settings.update.uiViewNotes')}
            subtitle={revision
              ? t('admin.settings.update.uiNotesRevision', { sha: revision.slice(0, 7) })
              : undefined}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Text size="sm" color="secondary">
                {t(status.has_update
                  ? 'admin.settings.update.uiTargetNotesHint'
                  : 'admin.settings.update.uiInstalledNotesHint')}
              </Text>
              {releases.length > 0 ? releases.map((release, index) => (
                <VStack key={`${release.date}-${index}`} gap={3} hAlign="stretch">
                  {index > 0 && <Divider />}
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text weight="semibold">{release.title[locale]}</Text>
                    <Text size="sm" color="secondary">{release.date}</Text>
                  </HStack>
                  <VStack gap={2} hAlign="stretch" role="list" aria-label={release.title[locale]}>
                    {release.changes[locale].map((change, changeIndex) => (
                      <Text key={changeIndex} size="sm" role="listitem">{change}</Text>
                    ))}
                  </VStack>
                </VStack>
              )) : (
                <Text size="sm" color="secondary" role="status">
                  {t(notes?.state === 'unavailable'
                    ? 'admin.settings.update.uiNotesUnavailable'
                    : 'admin.settings.update.noNotes')}
                </Text>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  )
}
