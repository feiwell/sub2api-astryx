import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { Account, AccountListItem, TempUnschedulableStatus } from '@/types'
import { formatDateTime } from '@/utils/format'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const ERROR_BLOCK_MAX_HEIGHT = 'calc(var(--spacing-8) * 4)'

interface TempUnschedulableStatusDialogProps {
  isOpen: boolean
  account: AccountListItem | Account | null
  onClose: () => void
  /** Called with the account returned by recoverState so the list can be refreshed. */
  onReset: (account: Account) => void
}

/**
 * Port of components/account/TempUnschedStatusModal.vue: shows why an account
 * is temporarily unschedulable (rule match, trigger evidence, remaining time)
 * and recovers its runtime state.
 */
export function TempUnschedulableStatusDialog({
  isOpen,
  account,
  onClose,
  onReset,
}: TempUnschedulableStatusDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [status, setStatus] = useState<TempUnschedulableStatus | null>(null)
  // Guards against a stale response overwriting a newer account's status
  const requestVersion = useRef(0)

  const accountId = account?.id ?? null

  useEffect(() => {
    requestVersion.current++
    if (!isOpen || accountId == null) {
      setStatus(null)
      setLoading(false)
      return
    }
    const version = requestVersion.current
    setStatus(null)
    setLoading(true)
    void adminAPI.accounts
      .getTempUnschedulableStatus(accountId)
      .then((result) => {
        if (version !== requestVersion.current) return
        setStatus(result)
      })
      .catch((error: unknown) => {
        if (version !== requestVersion.current) return
        toast.error((error as { message?: string })?.message || t('admin.accounts.tempUnschedulable.failedToLoad'))
        setStatus(null)
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false)
      })
  }, [isOpen, accountId, t])

  const state = status?.state ?? null
  const isActive = !!status?.active && !!state && state.until_unix * 1000 > Date.now()

  const ruleIndexDisplay = !state || !state.matched_keyword || state.rule_index < 0 ? '-' : String(state.rule_index + 1)

  const remainingText = useMemo(() => {
    if (!state) return '-'
    const remainingMs = state.until_unix * 1000 - Date.now()
    if (remainingMs <= 0) return t('admin.accounts.tempUnschedulable.expired')
    const minutes = Math.ceil(remainingMs / 60000)
    if (minutes < 60) return t('admin.accounts.tempUnschedulable.remainingMinutes', { minutes })
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (rest === 0) return t('admin.accounts.tempUnschedulable.remainingHours', { hours })
    return t('admin.accounts.tempUnschedulable.remainingHoursMinutes', { hours, minutes: rest })
  }, [state, t])

  const triggerEvidenceText = useMemo(() => {
    const count = state?.trigger_count || 0
    const threshold = state?.trigger_threshold || 0
    const minutes = state?.trigger_window_minutes || 0
    if (threshold > 0 && minutes > 0) {
      return t('admin.accounts.tempUnschedulable.multipleErrorTrigger', { count, threshold, minutes })
    }
    if (threshold > 0) {
      return t('admin.accounts.tempUnschedulable.multipleErrorTriggerNoWindow', { count, threshold })
    }
    if (minutes > 0) {
      return t('admin.accounts.tempUnschedulable.multipleErrorCountInWindow', { count, minutes })
    }
    return t('admin.accounts.tempUnschedulable.multipleErrorCount', { count })
  }, [state, t])

  const hasThresholdEvidence = (state?.trigger_count || 0) > 1

  const handleReset = useCallback(async () => {
    if (!account) return
    setResetting(true)
    try {
      const updated = await adminAPI.accounts.recoverState(account.id)
      toast.success(t('admin.accounts.tempUnschedulable.resetSuccess'))
      onReset(updated)
      onClose()
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.accounts.tempUnschedulable.resetFailed'))
    } finally {
      setResetting(false)
    }
  }, [account, onClose, onReset, t])

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={560}>
      <Layout
        header={
          <DialogHeader
            title={t('admin.accounts.tempUnschedulable.statusTitle')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {loading ? (
              <Center minHeight={160}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : !isActive ? (
              <Card variant="muted" padding={4}>
                <Text color="secondary">{t('admin.accounts.tempUnschedulable.notActive')}</Text>
              </Card>
            ) : (
              <VStack gap={4} hAlign="stretch">
                <Banner status="success" title={t('admin.accounts.recoverStateHint')} collapsible={false} />
                <MetadataList columns="multi" label={{ position: 'top' }}>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.accountName')}>
                    {account?.name || '-'}
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.triggeredAt')}>
                    {state?.triggered_at_unix ? formatDateTime(new Date(state.triggered_at_unix * 1000)) : '-'}
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.until')}>
                    {state?.until_unix ? formatDateTime(new Date(state.until_unix * 1000)) : '-'}
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.remaining')}>
                    {remainingText}
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.errorCode')}>
                    {state?.status_code ? String(state.status_code) : '-'}
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.matchedKeyword')}>
                    {state?.matched_keyword || '-'}
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.accounts.tempUnschedulable.ruleOrder')}>
                    {ruleIndexDisplay}
                  </MetadataListItem>
                </MetadataList>
                <VStack gap={1} hAlign="stretch">
                  <Text type="supporting" color="secondary">
                    {t('admin.accounts.tempUnschedulable.errorMessage')}
                  </Text>
                  <CodeBlock
                    code={state?.error_message || '-'}
                    isWrapped
                    hasCopyButton={false}
                    maxHeight={ERROR_BLOCK_MAX_HEIGHT}
                    width="100%"
                    size="sm"
                    container="section"
                  />
                </VStack>
                {hasThresholdEvidence && (
                  <Banner
                    status="info"
                    title={triggerEvidenceText}
                    collapsible={false}
                    data-testid="temp-unsched-trigger-evidence"
                  />
                )}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
              <Button
                label={t('admin.accounts.recoverState')}
                variant="primary"
                isDisabled={!isActive}
                isLoading={resetting}
                onClick={() => void handleReset()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
