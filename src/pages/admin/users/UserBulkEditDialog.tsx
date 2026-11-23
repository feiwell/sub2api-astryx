import { useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'

interface UserBulkEditDialogProps {
  isOpen: boolean
  selectedIds: number[]
  onClose: () => void
  onSaved: () => void
}

export function UserBulkEditDialog({ isOpen, selectedIds, onClose, onSaved }: UserBulkEditDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [enableConcurrency, setEnableConcurrency] = useState(false)
  const [enableRpmLimit, setEnableRpmLimit] = useState(false)
  const [concurrency, setConcurrency] = useState(0)
  const [rpmLimit, setRpmLimit] = useState(0)

  const handleSave = async () => {
    if (!enableConcurrency && !enableRpmLimit) {
      toast.error(t('admin.users.bulkLimits.selectAtLeastOne'))
      return
    }

    const confirmed = confirm(
      t('admin.users.bulkLimits.confirm', {
        count: selectedIds.length,
        fields: [
          enableConcurrency && `${t('admin.users.columns.concurrency')}: ${concurrency}`,
          enableRpmLimit && `${t('admin.users.form.rpmLimit')}: ${rpmLimit}`
        ].filter(Boolean).join(', ')
      })
    )
    if (!confirmed) return

    setLoading(true)
    try {
      await adminAPI.users.batchUpdateLimits({
        user_ids: selectedIds,
        concurrency: enableConcurrency ? concurrency : undefined,
        rpm_limit: enableRpmLimit ? rpmLimit : undefined,
      })
      toast.success(t('admin.users.bulkLimits.success', { count: selectedIds.length }))
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || t('common.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={480} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={t('admin.users.bulkLimits.title')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Text type="body" color="secondary">
                {t('admin.users.bulkLimits.selectedCount', { count: selectedIds.length })}
              </Text>

              <VStack gap={3} hAlign="stretch">
                <HStack gap={3} vAlign="center" hAlign="between">
                  <Text type="body">{t('admin.users.columns.concurrency')}</Text>
                  <Switch value={enableConcurrency} onChange={setEnableConcurrency} label="" />
                </HStack>
                {enableConcurrency && (
                  <NumberInput
                    label={t('admin.users.columns.concurrency')}
                    value={concurrency}
                    onChange={setConcurrency}
                    min={0}
                    isIntegerOnly
                  />
                )}
              </VStack>

              <VStack gap={3} hAlign="stretch">
                <HStack gap={3} vAlign="center" hAlign="between">
                  <Text type="body">{t('admin.users.form.rpmLimit')}</Text>
                  <Switch value={enableRpmLimit} onChange={setEnableRpmLimit} label="" />
                </HStack>
                {enableRpmLimit && (
                  <NumberInput
                    label={t('admin.users.form.rpmLimit')}
                    value={rpmLimit}
                    onChange={setRpmLimit}
                    min={0}
                    isIntegerOnly
                    description={rpmLimit === 0 ? t('admin.users.bulkLimits.unlimited') : undefined}
                  />
                )}
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={loading ? t('common.saving') : t('admin.users.bulkLimits.apply')}
                variant="primary"
                isLoading={loading}
                onClick={handleSave}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
