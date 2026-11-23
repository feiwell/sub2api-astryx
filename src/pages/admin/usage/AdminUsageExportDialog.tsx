import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { exportPercent } from './adminUsageExport'
import type { ExportProgress } from './useAdminUsageExport'

/** Shown while the usage list is being exported: how far the export is, and the way to call it off. */
export function AdminUsageExportDialog({ progress, onCancel }: { progress: ExportProgress; onCancel: () => void }) {
  const { t } = useI18n()
  const percent = exportPercent(progress.current, progress.total)
  // Closing the dialog is calling the export off: there is no export going on unseen.
  const close = (isOpen: boolean) => {
    if (!isOpen) onCancel()
  }

  return (
    <Dialog isOpen onOpenChange={close} width={420} purpose="form">
      <Layout
        header={<DialogHeader title={t('usage.exporting')} onOpenChange={close} />}
        content={
          <LayoutContent>
            <VStack gap={3} hAlign="stretch">
              <Text color="secondary">{t('usage.exportingProgress')}</Text>
              <HStack gap={3} hAlign="between" vAlign="center">
                <Text hasTabularNumbers>
                  {t('usage.exportedCount', { current: progress.current, total: progress.total })}
                </Text>
                <Text weight="medium" hasTabularNumbers>{`${percent}%`}</Text>
              </HStack>
              <ProgressBar label={t('usage.exportingProgress')} isLabelHidden value={percent} />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('usage.cancelExport')} variant="secondary" onClick={onCancel} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
