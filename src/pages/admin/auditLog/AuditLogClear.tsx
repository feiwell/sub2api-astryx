import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TrashIcon } from '@heroicons/react/24/outline'
import { totpAPI } from '@/api/totp'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { auditErrorMessage } from './auditText'

const CODE_LENGTH = 6

/** Where the clearing stands: asking whether two-factor is on, the "are you sure", then the code. */
type Step = 'idle' | 'checking' | 'confirm' | 'code'

/**
 * The "clear all" button and what follows it. The whole log goes at once, and only with a fresh
 * two-factor code, which the server checks.
 */
export function AuditLogClearButton({ onCleared }: { onCleared: () => void }) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('idle')
  const [code, setCode] = useState('')
  const [isClearing, setClearing] = useState(false)

  const start = () => {
    if (step !== 'idle') return
    setStep('checking')
    totpAPI
      .getStatus()
      .then((status) => {
        // Without two-factor the server refuses the clearing: say how to get it, rather than ask for
        // a code nobody can give.
        if (!status.enabled) {
          toast.error(t('stepUp.notEnabled'))
          setStep('idle')
          return
        }
        setStep('confirm')
      })
      .catch((error) => {
        console.error('[audit-log] failed to read the two-factor status', error)
        toast.error(auditErrorMessage(error, 'admin.audit.loadFailed'))
        setStep('idle')
      })
  }

  const cancelCode = () => {
    if (!isClearing) setStep('idle')
  }

  const submit = () => {
    if (isClearing || code.length !== CODE_LENGTH) return
    setClearing(true)
    adminAPI.audit
      .clear(code)
      .then((answer) => {
        setStep('idle')
        toast.success(t('admin.audit.clearConfirm.success', { count: answer.deleted }))
        onCleared()
      })
      .catch((error) => {
        console.error('[audit-log] failed to clear the log', error)
        toast.error(auditErrorMessage(error, 'admin.audit.clearConfirm.failed'))
        // A code is good once: the next try starts from an empty field.
        setCode('')
      })
      .finally(() => setClearing(false))
  }

  return (
    <>
      <Button
        label={t('admin.audit.clearAll')}
        variant="destructive"
        icon={<Icon icon={TrashIcon} />}
        isLoading={step === 'checking'}
        onClick={start}
      />

      {step === 'confirm' && (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setStep('idle')
          }}
          title={t('admin.audit.clearConfirm.title')}
          description={t('admin.audit.clearConfirm.message')}
          actionLabel={t('admin.audit.clearAll')}
          cancelLabel={t('common.cancel')}
          onAction={() => {
            setCode('')
            setStep('code')
          }}
        />
      )}

      {step === 'code' && (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) cancelCode()
          }}
          width={420}
          purpose="form">
          <Layout
            header={
              <DialogHeader
                title={t('admin.audit.clearConfirm.totpTitle')}
                onOpenChange={(open) => {
                  if (!open) cancelCode()
                }}
              />
            }
            content={
              <LayoutContent>
                <VStack gap={3} hAlign="stretch">
                  <Text color="secondary">{t('admin.audit.clearConfirm.totpHint')}</Text>
                  <TextInput
                    label={t('admin.audit.clearConfirm.totpTitle')}
                    isLabelHidden
                    width="100%"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    hasAutoFocus
                    value={code}
                    onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                    onEnter={submit}
                  />
                </VStack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <Button label={t('common.cancel')} variant="secondary" isDisabled={isClearing} onClick={cancelCode} />
                  <Button
                    label={t('admin.audit.clearAll')}
                    variant="destructive"
                    isLoading={isClearing}
                    isDisabled={code.length !== CODE_LENGTH}
                    onClick={submit}
                  />
                </HStack>
              </LayoutFooter>
            }
          />
        </Dialog>
      )}
    </>
  )
}
