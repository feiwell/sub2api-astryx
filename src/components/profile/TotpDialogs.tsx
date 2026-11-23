import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { Code } from '@astryxdesign/core/Code'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { ClipboardDocumentIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { totpAPI } from '@/api'
import type { TotpSetupResponse } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { toast } from '~/lib/toast'

type VerificationMethod = 'email' | 'password'

/**
 * Identity check shared by TOTP setup and disable (ports of
 * TotpSetupModal.vue / TotpDisableDialog.vue): loads whether the account
 * verifies by email code or password, and runs the 60s resend cooldown.
 */
function useTotpIdentityCheck(isOpen: boolean, onLoadFailed: () => void) {
  const { t } = useI18n()
  const [methodLoading, setMethodLoading] = useState(true)
  const [method, setMethod] = useState<VerificationMethod>('password')
  const [emailCode, setEmailCode] = useState('')
  const [password, setPassword] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setEmailCode('')
    setPassword('')
    setCooldown(0)
    setMethodLoading(true)
    totpAPI
      .getVerificationMethod()
      .then((result) => {
        if (active) setMethod(result.method)
      })
      .catch((error) => {
        if (!active) return
        toast.error(extractApiErrorMessage(error, t('common.error')))
        onLoadFailed()
      })
      .finally(() => {
        if (active) setMethodLoading(false)
      })
    return () => {
      active = false
    }
    // onLoadFailed is a close callback; reloading only on open is intended.
  }, [isOpen])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const sendCode = async () => {
    setSendingCode(true)
    try {
      await totpAPI.sendVerifyCode()
      toast.success(t('profile.totp.codeSent'))
      setCooldown(60)
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('profile.totp.sendCodeFailed')))
    } finally {
      setSendingCode(false)
    }
  }

  const canProceed = method === 'email' ? emailCode.length === 6 : password.length > 0
  const request = method === 'email' ? { email_code: emailCode } : { password }

  const fields =
    method === 'email' ? (
      <HStack gap={2} vAlign="end">
        <TextInput
          label={t('profile.totp.emailCode')}
          value={emailCode}
          onChange={(value) => setEmailCode(value.replace(/\D/g, '').slice(0, 6))}
          placeholder={t('profile.totp.enterEmailCode')}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        <Button
          label={cooldown > 0 ? `${cooldown}s` : sendingCode ? t('common.sending') : t('profile.totp.sendCode')}
          variant="secondary"
          isDisabled={sendingCode || cooldown > 0}
          onClick={() => void sendCode()}
        />
      </HStack>
    ) : (
      <TextInput
        label={t('profile.currentPassword')}
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={t('profile.totp.enterPassword')}
        autoComplete="current-password"
      />
    )

  return { methodLoading, method, canProceed, request, fields }
}

export function TotpSetupDialog({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useI18n()
  const identity = useTotpIdentityCheck(isOpen, onClose)
  // 0 = verify identity, 1 = scan QR code, 2 = confirm a TOTP code
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep(0)
    setSetupData(null)
    setQrCodeDataUrl('')
    setCode('')
  }, [isOpen])

  useEffect(() => {
    const url = setupData?.qr_code_url
    if (!url) return
    let active = true
    QRCode.toDataURL(url, { width: 200, margin: 2 })
      .then((dataUrl) => {
        if (active) setQrCodeDataUrl(dataUrl)
      })
      .catch((error) => console.error('Failed to generate QR code:', error))
    return () => {
      active = false
    }
  }, [setupData?.qr_code_url])

  const stepDescription =
    step === 0
      ? identity.method === 'email'
        ? t('profile.totp.verifyEmailFirst')
        : t('profile.totp.verifyPasswordFirst')
      : step === 1
        ? t('profile.totp.setupStep1')
        : t('profile.totp.setupStep2')

  const handleVerifyAndSetup = async () => {
    setSetupLoading(true)
    try {
      setSetupData(await totpAPI.initiateSetup(identity.request))
      setStep(1)
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('profile.totp.setupFailed')))
    } finally {
      setSetupLoading(false)
    }
  }

  const handleVerify = async (totpCode = code) => {
    if (totpCode.length !== 6 || !setupData || verifying) return
    setVerifying(true)
    try {
      await totpAPI.enable({ totp_code: totpCode, setup_token: setupData.setup_token })
      toast.success(t('profile.totp.enableSuccess'))
      onSuccess()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('profile.totp.verifyFailed')))
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) void handleVerify(digits)
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} purpose="form" width={440}>
      <Layout
        header={
          <DialogHeader
            title={t('profile.totp.setupTitle')}
            subtitle={stepDescription}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {step === 0 &&
              (identity.methodLoading ? (
                <Center padding={6}>
                  <Spinner />
                </Center>
              ) : (
                identity.fields
              ))}
            {step === 1 && setupData && (
              <VStack gap={4} hAlign="center">
                <Card padding={3}>
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt={t('profile.totp.setupTitle')} width={192} height={192} />
                  ) : (
                    <Center padding={8}>
                      <Spinner />
                    </Center>
                  )}
                </Card>
                <VStack gap={2} hAlign="center">
                  <Text type="supporting">{t('profile.totp.manualEntry')}</Text>
                  <HStack gap={2} vAlign="center">
                    <Code>{setupData.secret}</Code>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<Icon icon={ClipboardDocumentIcon} />}
                      label={t('common.copy')}
                      onClick={() => void copyToClipboard(setupData.secret, t('common.copied'))}
                    />
                  </HStack>
                </VStack>
              </VStack>
            )}
            {step === 2 && (
              <TextInput
                label={t('profile.totp.enterCode')}
                value={code}
                onChange={handleCodeChange}
                onEnter={() => void handleVerify()}
                placeholder="000000"
                size="lg"
                inputMode="numeric"
                autoComplete="one-time-code"
                hasAutoFocus
                isDisabled={verifying}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              {step === 2 ? (
                <Button label={t('common.back')} variant="secondary" onClick={() => setStep(1)} />
              ) : (
                <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              )}
              {step === 0 && (
                <Button
                  label={setupLoading ? t('common.loading') : t('common.next')}
                  variant="primary"
                  isLoading={setupLoading}
                  isDisabled={identity.methodLoading || !identity.canProceed}
                  onClick={() => void handleVerifyAndSetup()}
                />
              )}
              {step === 1 && (
                <Button label={t('common.next')} variant="primary" isDisabled={!setupData} onClick={() => setStep(2)} />
              )}
              {step === 2 && (
                <Button
                  label={verifying ? t('common.verifying') : t('profile.totp.verify')}
                  variant="primary"
                  isLoading={verifying}
                  isDisabled={code.length !== 6}
                  onClick={() => void handleVerify()}
                />
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

export function TotpDisableDialog({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useI18n()
  const identity = useTotpIdentityCheck(isOpen, onClose)
  const [loading, setLoading] = useState(false)

  const handleDisable = async () => {
    if (!identity.canProceed) return
    setLoading(true)
    try {
      await totpAPI.disable(identity.request)
      toast.success(t('profile.totp.disableSuccess'))
      onSuccess()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('profile.totp.disableFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} purpose="form" width={440}>
      <Layout
        header={
          <DialogHeader
            title={t('profile.totp.disableTitle')}
            subtitle={t('profile.totp.disableWarning')}
            startContent={<Icon icon={ExclamationTriangleIcon} color="error" />}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {identity.methodLoading ? (
              <Center padding={6}>
                <Spinner />
              </Center>
            ) : (
              identity.fields
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={loading ? t('common.processing') : t('profile.totp.confirmDisable')}
                variant="destructive"
                isLoading={loading}
                isDisabled={identity.methodLoading || !identity.canProceed}
                onClick={() => void handleDisable()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
