import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { adminAPI } from '~/lib/api/admin'
import type { PreviewFromCRSResult } from '~/lib/api/admin/accounts'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

type Step = 'input' | 'preview' | 'result'
type SyncResult = Awaited<ReturnType<typeof adminAPI.accounts.syncFromCrs>>

interface CrsForm {
  base_url: string
  username: string
  password: string
  sync_proxies: boolean
}

const EMPTY_FORM: CrsForm = { base_url: '', username: '', password: '', sync_proxies: true }

// Scroll caps for the preview lists (Vue: max-h-32 / max-h-48)
const EXISTING_LIST_MAX_HEIGHT = 'calc(var(--spacing-8) * 4)'
const NEW_LIST_MAX_HEIGHT = 'calc(var(--spacing-12) * 4)'

interface SyncFromCrsDialogProps {
  isOpen: boolean
  onClose: () => void
  onSynced: () => void
}

/**
 * Port of components/account/SyncFromCrsModal.vue: credentials, then a
 * preview where new CRS accounts can be picked, then the sync result.
 */
export function SyncFromCrsDialog({ isOpen, onClose, onSynced }: SyncFromCrsDialogProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('input')
  const [previewing, setPreviewing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewFromCRSResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [result, setResult] = useState<SyncResult | null>(null)
  const [form, setForm] = useState<CrsForm>(EMPTY_FORM)

  useEffect(() => {
    if (!isOpen) return
    setStep('input')
    setPreviewResult(null)
    setSelectedIds([])
    setResult(null)
    setForm(EMPTY_FORM)
  }, [isOpen])

  const patch = (next: Partial<CrsForm>) => setForm((prev) => ({ ...prev, ...next }))

  const hasNewButNoneSelected = !!previewResult && previewResult.new_accounts.length > 0 && selectedIds.length === 0

  const errorItems = useMemo(() => {
    if (!result?.items) return []
    return result.items.filter((i) => i.action === 'failed' || (i.action === 'skipped' && i.error !== 'not selected'))
  }, [result])

  const handleClose = () => {
    if (syncing || previewing) return
    onClose()
  }

  const handleBack = () => {
    setStep('input')
    setPreviewResult(null)
    setSelectedIds([])
  }

  const selectAll = () => {
    if (!previewResult) return
    setSelectedIds(previewResult.new_accounts.map((a) => a.crs_account_id))
  }

  const missingFields = () => !form.base_url.trim() || !form.username.trim() || !form.password.trim()

  const handlePreview = async () => {
    if (previewing) return
    if (missingFields()) {
      toast.error(t('admin.accounts.syncMissingFields'))
      return
    }
    setPreviewing(true)
    try {
      const res = await adminAPI.accounts.previewFromCrs({
        base_url: form.base_url.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      setPreviewResult(res)
      // Auto-select all new accounts
      setSelectedIds(res.new_accounts.map((a) => a.crs_account_id))
      setStep('preview')
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.accounts.crsPreviewFailed'))
    } finally {
      setPreviewing(false)
    }
  }

  const handleSync = async () => {
    if (missingFields()) {
      toast.error(t('admin.accounts.syncMissingFields'))
      return
    }
    setSyncing(true)
    try {
      const res = await adminAPI.accounts.syncFromCrs({
        base_url: form.base_url.trim(),
        username: form.username.trim(),
        password: form.password,
        sync_proxies: form.sync_proxies,
        selected_account_ids: [...selectedIds],
      })
      setResult(res)
      setStep('result')
      if (res.failed > 0) {
        toast.error(t('admin.accounts.syncCompletedWithErrors', res))
      } else {
        toast.success(t('admin.accounts.syncCompleted', res))
      }
      onSynced()
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.accounts.syncFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const accountTag = (acc: { platform: string; type: string }) => `${acc.platform} / ${acc.type}`

  const renderInput = () => (
    <VStack gap={4} hAlign="stretch">
      <Text color="secondary">{t('admin.accounts.syncFromCrsDesc')}</Text>
      <Card variant="muted" padding={3}>
        <Text type="supporting">{t('admin.accounts.crsUpdateBehaviorNote')}</Text>
      </Card>
      <Banner status="warning" title={t('admin.accounts.crsVersionRequirement')} />
      <TextInput
        label={t('admin.accounts.crsBaseUrl')}
        placeholder={t('admin.accounts.crsBaseUrlPlaceholder')}
        value={form.base_url}
        onChange={(base_url) => patch({ base_url })}
        onEnter={() => void handlePreview()}
        isRequired
      />
      <HStack gap={4} wrap="wrap">
        <StackItem size="fill">
          <TextInput
            label={t('admin.accounts.crsUsername')}
            autoComplete="username"
            value={form.username}
            onChange={(username) => patch({ username })}
            onEnter={() => void handlePreview()}
            isRequired
          />
        </StackItem>
        <StackItem size="fill">
          <TextInput
            label={t('admin.accounts.crsPassword')}
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(password) => patch({ password })}
            onEnter={() => void handlePreview()}
            isRequired
          />
        </StackItem>
      </HStack>
      <CheckboxInput
        label={t('admin.accounts.syncProxies')}
        value={form.sync_proxies}
        onChange={(sync_proxies) => patch({ sync_proxies })}
      />
    </VStack>
  )

  const renderPreview = (preview: PreviewFromCRSResult) => (
    <VStack gap={4} hAlign="stretch">
      {/* Existing accounts (read-only info) */}
      {preview.existing_accounts.length > 0 && (
        <Card variant="muted" padding={3}>
          <VStack gap={2} hAlign="stretch">
            <HStack gap={2} vAlign="center">
              <Text weight="medium">{t('admin.accounts.crsExistingAccounts')}</Text>
              <Badge label={preview.existing_accounts.length} />
            </HStack>
            <VStack isScrollable style={{ maxHeight: EXISTING_LIST_MAX_HEIGHT }}>
              <List density="compact">
                {preview.existing_accounts.map((acc) => (
                  <ListItem
                    key={acc.crs_account_id}
                    label={acc.name}
                    startContent={<Token label={accountTag(acc)} color="blue" size="sm" />}
                  />
                ))}
              </List>
            </VStack>
          </VStack>
        </Card>
      )}

      {/* New accounts (selectable) */}
      {preview.new_accounts.length > 0 && (
        <VStack gap={2} hAlign="stretch">
          <HStack gap={2} vAlign="center" hAlign="between">
            <HStack gap={2} vAlign="center">
              <Text weight="medium">{t('admin.accounts.crsNewAccounts')}</Text>
              <Badge label={preview.new_accounts.length} />
            </HStack>
            <HStack gap={1}>
              <Button label={t('admin.accounts.crsSelectAll')} variant="ghost" size="sm" onClick={selectAll} />
              <Button label={t('admin.accounts.crsSelectNone')} variant="ghost" size="sm" onClick={() => setSelectedIds([])} />
            </HStack>
          </HStack>
          <Card padding={2}>
            <VStack isScrollable style={{ maxHeight: NEW_LIST_MAX_HEIGHT }}>
              <CheckboxList
                label={t('admin.accounts.crsNewAccounts')}
                isLabelHidden
                density="compact"
                value={selectedIds}
                onChange={setSelectedIds}>
                {preview.new_accounts.map((acc) => (
                  <CheckboxListItem
                    key={acc.crs_account_id}
                    value={acc.crs_account_id}
                    label={acc.name}
                    endContent={<Token label={accountTag(acc)} color="green" size="sm" />}
                  />
                ))}
              </CheckboxList>
            </VStack>
          </Card>
          <Text type="supporting">{t('admin.accounts.crsSelectedCount', { count: selectedIds.length })}</Text>
        </VStack>
      )}

      {/* Sync options summary */}
      <HStack gap={2} vAlign="center">
        <Text type="supporting">{t('admin.accounts.syncProxies')}:</Text>
        <Token
          label={form.sync_proxies ? t('common.yes') : t('common.no')}
          color={form.sync_proxies ? 'green' : 'gray'}
          size="sm"
        />
      </HStack>

      {/* No new accounts */}
      {preview.new_accounts.length === 0 && (
        <Card variant="muted" padding={4}>
          <Text color="secondary" justify="center" display="block">
            {t('admin.accounts.crsNoNewAccounts')}
            {preview.existing_accounts.length > 0 &&
              ` ${t('admin.accounts.crsWillUpdate', { count: preview.existing_accounts.length })}`}
          </Text>
        </Card>
      )}
    </VStack>
  )

  const renderResult = (res: SyncResult) => (
    <Card padding={4}>
      <VStack gap={2} hAlign="stretch">
        <Text weight="medium">{t('admin.accounts.syncResult')}</Text>
        <Text>{t('admin.accounts.syncResultSummary', res)}</Text>
        {errorItems.length > 0 && (
          <Banner status="error" title={t('admin.accounts.syncErrors')} collapsible={false}>
            <CodeBlock
              code={errorItems
                .map((item) => `${item.kind} ${item.crs_account_id} — ${item.action}${item.error ? `: ${item.error}` : ''}`)
                .join('\n')}
              isWrapped
              hasCopyButton={false}
              maxHeight={NEW_LIST_MAX_HEIGHT}
              width="100%"
              size="sm"
              container="section"
            />
          </Banner>
        )}
      </VStack>
    </Card>
  )

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={560} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.accounts.syncFromCrsTitle')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            {step === 'input' && renderInput()}
            {step === 'preview' && previewResult && renderPreview(previewResult)}
            {step === 'result' && result && renderResult(result)}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              {step === 'input' && (
                <>
                  <Button label={t('common.cancel')} variant="secondary" isDisabled={previewing} onClick={handleClose} />
                  <Button
                    label={previewing ? t('admin.accounts.crsPreviewing') : t('admin.accounts.crsPreview')}
                    variant="primary"
                    isLoading={previewing}
                    onClick={() => void handlePreview()}
                  />
                </>
              )}
              {step === 'preview' && (
                <>
                  <Button label={t('admin.accounts.crsBack')} variant="secondary" isDisabled={syncing} onClick={handleBack} />
                  <Button
                    label={syncing ? t('admin.accounts.syncing') : t('admin.accounts.syncNow')}
                    variant="primary"
                    isLoading={syncing}
                    isDisabled={hasNewButNoneSelected}
                    onClick={() => void handleSync()}
                  />
                </>
              )}
              {step === 'result' && <Button label={t('common.close')} variant="secondary" onClick={handleClose} />}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
