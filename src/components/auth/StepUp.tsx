import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Spinner } from '@astryxdesign/core/Spinner'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/Stack'
import { totpAPI } from '@/api/totp'
import { StepUpCancelledError, isStepUpBlocked, isStepUpRequired } from '@/composables/useStepUp'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

export { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason } from '@/composables/useStepUp'

/**
 * React port of composables/useStepUp.ts + TotpStepUpDialog.vue. `run(action)`
 * retries the action once after a STEP_UP_REQUIRED response and a verified
 * TOTP code; render `dialog` once in the page.
 */
export function useStepUp() {
  const { t } = useI18n()
  const [isOpen, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)
  const pendingRef = useRef<Promise<boolean> | null>(null)

  const settle = useCallback((ok: boolean) => {
    setOpen(false)
    setCode('')
    resolverRef.current?.(ok)
    resolverRef.current = null
    pendingRef.current = null
  }, [])

  const prompt = useCallback((): Promise<boolean> => {
    if (pendingRef.current) return pendingRef.current
    setCode('')
    setOpen(true)
    pendingRef.current = new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
    return pendingRef.current
  }, [])

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (err) {
        if (isStepUpBlocked(err) || !isStepUpRequired(err)) throw err
        if (!(await prompt())) throw new StepUpCancelledError()
        return await action()
      }
    },
    [prompt],
  )

  useEffect(() => () => resolverRef.current?.(false), [])

  async function submit(otp: string) {
    setVerifying(true)
    try {
      await totpAPI.stepUp(otp)
      settle(true)
    } catch (err) {
      toast.error((err as { message?: string })?.message || t('stepUp.verifyFailed'))
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  const dialog = (
    <Dialog
      isOpen={isOpen}
      purpose="required"
      onOpenChange={(open) => {
        if (!open && !verifying) settle(false)
      }}>
      <DialogHeader title={t('stepUp.title')} subtitle={t('stepUp.hint')} />
      <VStack gap={4} hAlign="stretch" padding={4}>
        <TextInput
          label={t('stepUp.title')}
          isLabelHidden
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          hasAutoFocus
          isDisabled={verifying}
          onChange={(value) => {
            const digits = value.replace(/\D/g, '').slice(0, 6)
            setCode(digits)
            if (digits.length === 6 && !verifying) void submit(digits)
          }}
        />
        {verifying && <Spinner label={t('common.verifying')} />}
        <Button label={t('common.cancel')} variant="secondary" width="100%" isDisabled={verifying} onClick={() => settle(false)} />
      </VStack>
    </Dialog>
  )

  return { run, prompt, dialog }
}
