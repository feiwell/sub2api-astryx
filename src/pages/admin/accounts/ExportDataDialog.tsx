import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '~/components/auth/StepUp'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

export type AccountExportFilters = NonNullable<NonNullable<Parameters<typeof adminAPI.accounts.exportData>[0]>['filters']>

const formatExportTimestamp = () => {
  const now = new Date()
  const pad2 = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
}

interface ExportDataDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Selected account ids; when empty the current list filters are exported */
  selectedIds: number[]
  filters: AccountExportFilters
}

/**
 * Export confirmation from AccountsView.vue: include-proxies option, TOTP
 * step-up retry, and a JSON file download of the selected or filtered accounts.
 */
export function ExportDataDialog({ isOpen, onClose, selectedIds, filters }: ExportDataDialogProps) {
  const { t } = useI18n()
  const stepUp = useStepUp()
  const [includeProxies, setIncludeProxies] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (isOpen) setIncludeProxies(true)
  }, [isOpen])

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const dataPayload = await stepUp.run(() =>
        adminAPI.accounts.exportData(
          selectedIds.length > 0 ? { ids: selectedIds, includeProxies } : { includeProxies, filters },
        ),
      )
      const timestamp = formatExportTimestamp()
      const filename = `sub2api-account-${timestamp}.json`
      const blob = new Blob([JSON.stringify(dataPayload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      // Spark shadow accounts are excluded from the backup (their credentials pass through
      // the parent account); say so explicitly instead of silently exporting fewer accounts.
      if (dataPayload.skipped_shadows && dataPayload.skipped_shadows > 0) {
        toast.warning(t('admin.accounts.dataExportedSkippedShadows', { count: dataPayload.skipped_shadows }))
      } else {
        toast.success(t('admin.accounts.dataExported'))
      }
    } catch (error) {
      if (isStepUpCancelled(error)) {
        // The user dismissed the step-up prompt; return silently.
      } else if (isStepUpBlocked(error)) {
        toast.error(
          stepUpBlockReason(error) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
            ? t('stepUp.adminApiKeyForbidden')
            : t('stepUp.notEnabled'),
        )
      } else {
        toast.error((error as { message?: string })?.message || t('admin.accounts.dataExportFailed'))
      }
    } finally {
      setExporting(false)
      onClose()
    }
  }

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={440}>
        <Layout
          header={<DialogHeader title={t('admin.accounts.dataExport')} onOpenChange={(open) => !open && onClose()} />}
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <Text color="secondary">{t('admin.accounts.dataExportConfirmMessage')}</Text>
                <CheckboxInput
                  label={t('admin.accounts.dataExportIncludeProxies')}
                  value={includeProxies}
                  onChange={setIncludeProxies}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
                <Button
                  label={t('admin.accounts.dataExportConfirm')}
                  variant="primary"
                  isLoading={exporting}
                  onClick={() => void handleExport()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      {stepUp.dialog}
    </>
  )
}
