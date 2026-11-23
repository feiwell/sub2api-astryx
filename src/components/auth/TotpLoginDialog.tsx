import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { useI18n } from '~/i18n'

/**
 * Second step of a TOTP-protected login. Auto-submits once six digits are
 * entered (also works with password-manager one-time-code autofill).
 */
export function TotpLoginDialog({
  isOpen,
  userEmailMasked,
  isVerifying,
  resetSignal,
  onVerify,
  onCancel,
}: {
  isOpen: boolean
  userEmailMasked?: string
  isVerifying: boolean
  /** Increment to clear the code after a failed attempt. */
  resetSignal: number
  onVerify: (code: string) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [code, setCode] = useState('')

  useEffect(() => setCode(''), [resetSignal, isOpen])

  const handleChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6 && !isVerifying) onVerify(digits)
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onCancel()} width={420}>
      <DialogHeader
        title={t('profile.totp.loginTitle')}
        subtitle={t('profile.totp.loginHint')}
        onOpenChange={(open) => !open && onCancel()}
      />
      <VStack gap={4} hAlign="stretch">
        {userEmailMasked && (
          <Text type="body" weight="semibold" justify="center">
            {userEmailMasked}
          </Text>
        )}
        <TextInput
          label={t('profile.totp.loginTitle')}
          isLabelHidden
          value={code}
          onChange={handleChange}
          autoComplete="one-time-code"
          placeholder="000000"
          size="lg"
          hasAutoFocus
          isDisabled={isVerifying}
          onEnter={() => code.length === 6 && onVerify(code)}
        />
        <HStack gap={2} justify="end">
          <Button label={t('common.cancel')} variant="secondary" onClick={onCancel} isDisabled={isVerifying} />
          <Button
            label={isVerifying ? t('common.verifying') : t('common.confirm')}
            variant="primary"
            isLoading={isVerifying}
            isDisabled={code.length !== 6}
            onClick={() => onVerify(code)}
          />
        </HStack>
      </VStack>
    </Dialog>
  )
}
