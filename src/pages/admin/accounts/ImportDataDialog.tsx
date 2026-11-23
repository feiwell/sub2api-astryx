import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { AdminDataImportResult, AdminDataPayload } from '@/types'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const SUPPORTED_DATA_TYPES = ['sub2api-data', 'sub2api-bundle']
const SUPPORTED_DATA_VERSION = 1
const ERROR_LIST_MAX_HEIGHT = 'calc(var(--spacing-12) * 4)'

const readFileAsText = async (sourceFile: File): Promise<string> => {
  if (typeof sourceFile.text === 'function') {
    return sourceFile.text()
  }
  if (typeof sourceFile.arrayBuffer === 'function') {
    const buffer = await sourceFile.arrayBuffer()
    return new TextDecoder().decode(buffer)
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsText(sourceFile)
  })
}

// Mirrors the backend validateDataHeader: each file is checked before merging so a
// bad file is reported by name instead of failing the merged payload.
const isValidDataPayload = (payload: unknown): payload is AdminDataPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const candidate = payload as Record<string, unknown>
  if (candidate.type !== undefined && candidate.type !== '' && !SUPPORTED_DATA_TYPES.includes(candidate.type as string)) {
    return false
  }
  if (candidate.version !== undefined && candidate.version !== 0 && candidate.version !== SUPPORTED_DATA_VERSION) {
    return false
  }
  return Array.isArray(candidate.proxies) && Array.isArray(candidate.accounts)
}

const mergeDataPayloads = (payloads: AdminDataPayload[]): AdminDataPayload => {
  const [firstPayload] = payloads
  if (payloads.length === 1 && firstPayload) return firstPayload
  return {
    type: payloads.find((item) => typeof item.type === 'string')?.type,
    version: payloads.find((item) => typeof item.version === 'number')?.version,
    exported_at: new Date().toISOString(),
    proxies: payloads.flatMap((item) => item.proxies),
    accounts: payloads.flatMap((item) => item.accounts),
    skipped_shadows: payloads.reduce((sum, item) => {
      const count = Number(item.skipped_shadows || 0)
      return Number.isFinite(count) ? sum + count : sum
    }, 0),
  }
}

interface ImportDataDialogProps {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

/**
 * Port of components/admin/account/ImportDataModal.vue: pick one or more
 * exported JSON files, validate and merge them, then import accounts/proxies.
 */
export function ImportDataDialog({ isOpen, onClose, onImported }: ImportDataDialogProps) {
  const { t } = useI18n()
  const [importing, setImporting] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [hasCreatedData, setHasCreatedData] = useState(false)
  const [result, setResult] = useState<AdminDataImportResult | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setFiles([])
    setHasCreatedData(false)
    setResult(null)
  }, [isOpen])

  const errorItems = result?.errors || []

  // FileInput's accept filter drops non-JSON files and reports them inline
  const handleFilesChange = (next: File | File[] | null) => {
    if (importing) return
    setFiles(next == null ? [] : Array.isArray(next) ? next : [next])
    setResult(null)
  }

  const handleClose = () => {
    if (importing) return
    if (hasCreatedData) {
      setHasCreatedData(false)
      onImported()
    }
    onClose()
  }

  const handleImport = async () => {
    if (files.length === 0) {
      toast.error(t('admin.accounts.dataImportSelectFile'))
      return
    }
    setImporting(true)
    try {
      const dataPayloads: AdminDataPayload[] = []
      for (const sourceFile of files) {
        let parsed: unknown
        try {
          parsed = JSON.parse(await readFileAsText(sourceFile))
        } catch {
          toast.error(t('admin.accounts.dataImportParseFailedFile', { name: sourceFile.name }))
          return
        }
        if (!isValidDataPayload(parsed)) {
          toast.error(t('admin.accounts.dataImportInvalidFile', { name: sourceFile.name }))
          return
        }
        dataPayloads.push(parsed)
      }
      const dataPayload = mergeDataPayloads(dataPayloads)

      const res = await adminAPI.accounts.importData({
        data: dataPayload,
        skip_default_group_bind: true,
      })
      setResult(res)

      const msgParams: Record<string, unknown> = {
        account_created: res.account_created,
        account_failed: res.account_failed,
        proxy_created: res.proxy_created,
        proxy_reused: res.proxy_reused,
        proxy_failed: res.proxy_failed,
      }
      if (res.account_failed > 0 || res.proxy_failed > 0) {
        // Partial success still created data; refresh the list when the dialog closes
        if (res.account_created > 0 || res.proxy_created > 0) {
          setHasCreatedData(true)
        }
        toast.error(t('admin.accounts.dataImportCompletedWithErrors', msgParams))
      } else {
        toast.success(t('admin.accounts.dataImportSuccess', msgParams))
        onImported()
      }
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.accounts.dataImportFailed'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={560} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.accounts.dataImportTitle')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Text color="secondary">{t('admin.accounts.dataImportHint')}</Text>
              <Banner status="warning" title={t('admin.accounts.dataImportWarning')} />
              <FileInput
                label={t('admin.accounts.dataImportFile')}
                description="JSON (.json)"
                placeholder={t('admin.accounts.dataImportSelectFile')}
                mode="dropzone"
                accept="application/json,.json"
                isMultiple
                value={files}
                onChange={handleFilesChange}
                isDisabled={importing}
              />
              {result && (
                <Card padding={4}>
                  <VStack gap={2} hAlign="stretch">
                    <Text weight="medium">{t('admin.accounts.dataImportResult')}</Text>
                    <Text>{t('admin.accounts.dataImportResultSummary', { ...result })}</Text>
                    {errorItems.length > 0 && (
                      <Banner status="error" title={t('admin.accounts.dataImportErrors')} collapsible={false}>
                        <CodeBlock
                          code={errorItems
                            .map((item) => `${item.kind} ${item.name || item.proxy_key || '-'} — ${item.message}`)
                            .join('\n')}
                          isWrapped
                          hasCopyButton={false}
                          maxHeight={ERROR_LIST_MAX_HEIGHT}
                          width="100%"
                          size="sm"
                          container="section"
                        />
                      </Banner>
                    )}
                  </VStack>
                </Card>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={importing} onClick={handleClose} />
              <Button
                label={importing ? t('admin.accounts.dataImporting') : t('admin.accounts.dataImportButton')}
                variant="primary"
                isLoading={importing}
                onClick={() => void handleImport()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
