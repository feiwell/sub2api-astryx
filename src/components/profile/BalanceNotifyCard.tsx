import { useEffect, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Switch } from '@astryxdesign/core/Switch'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { BellAlertIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import { userAPI } from '@/api'
import type { NotifyEmailEntry, User } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useAuthStore } from '~/stores/auth'

const MAX_TOTAL_EMAILS = 3

interface PendingEmail {
  email: string
  codeSent: boolean
  code: string
  sending: boolean
  verifying: boolean
  countdown: number
}

/** Ticks a seconds countdown down to zero. */
function useCountdown(seconds: number, setSeconds: (update: (value: number) => number) => void) {
  useEffect(() => {
    if (seconds <= 0) return
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds, setSeconds])
}

/**
 * Low-balance notification settings (port of ProfileBalanceNotifyCard.vue):
 * on/off switch, custom threshold, and up to three extra notification emails
 * that each need an emailed verification code.
 */
export function BalanceNotifyCard({ user, systemDefaultThreshold }: { user: User; systemDefaultThreshold: number }) {
  const { t } = useI18n()
  const setUser = useAuthStore((s) => s.setUser)

  const [notifyEnabled, setNotifyEnabled] = useState(user.balance_notify_enabled ?? true)
  const [customThreshold, setCustomThreshold] = useState<number | null>(user.balance_notify_threshold)
  const [emailEntries, setEmailEntries] = useState<NotifyEmailEntry[]>(user.balance_notify_extra_emails ?? [])
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [togglingEmail, setTogglingEmail] = useState('')
  const [removingEmail, setRemovingEmail] = useState('')

  // Inline verification for saved-but-unverified emails.
  const [verifyingEmail, setVerifyingEmail] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyingSaved, setVerifyingSaved] = useState(false)
  const [sendingSavedCode, setSendingSavedCode] = useState(false)
  const [verifyCountdown, setVerifyCountdown] = useState(0)
  useCountdown(verifyCountdown, setVerifyCountdown)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => setNotifyEnabled(user.balance_notify_enabled ?? true), [user.balance_notify_enabled])
  useEffect(() => setCustomThreshold(user.balance_notify_threshold), [user.balance_notify_threshold])
  useEffect(() => setEmailEntries(user.balance_notify_extra_emails ?? []), [user.balance_notify_extra_emails])

  // With no saved emails, pre-fill the add field with the account email.
  useEffect(() => {
    if ((user.balance_notify_extra_emails ?? []).length === 0 && user.email) setNewEmail(user.email)
    // Only on first mount, like the Vue card.
  }, [])

  // One shared ticker for pending-email resend countdowns.
  const hasPendingCountdown = pendingEmails.some((entry) => entry.countdown > 0)
  useEffect(() => {
    if (!hasPendingCountdown) return
    const timer = setTimeout(() => {
      setPendingEmails((prev) =>
        prev.map((entry) => (entry.countdown > 0 ? { ...entry, countdown: entry.countdown - 1 } : entry)),
      )
    }, 1000)
    return () => clearTimeout(timer)
  }, [hasPendingCountdown, pendingEmails])

  const canAddMore = emailEntries.length + pendingEmails.length < MAX_TOTAL_EMAILS

  const applyUser = (updated: User) => {
    setUser(updated)
    setEmailEntries([...(updated.balance_notify_extra_emails ?? [])])
  }

  const patchPending = (email: string, patch: Partial<PendingEmail>) => {
    setPendingEmails((prev) => prev.map((entry) => (entry.email === email ? { ...entry, ...patch } : entry)))
  }

  const handleToggle = async (checked: boolean) => {
    setNotifyEnabled(checked)
    try {
      setUser(await userAPI.updateProfile({ balance_notify_enabled: checked }))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
      setNotifyEnabled(!checked)
    }
  }

  const handleThresholdUpdate = async () => {
    setSavingThreshold(true)
    try {
      const threshold = customThreshold && customThreshold > 0 ? customThreshold : 0
      setUser(await userAPI.updateProfile({ balance_notify_threshold: threshold }))
      toast.success(t('common.saved'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSavingThreshold(false)
    }
  }

  const handleEmailToggle = async (entry: NotifyEmailEntry) => {
    setTogglingEmail(entry.email)
    try {
      applyUser(await userAPI.toggleNotifyEmail(entry.email, !entry.disabled))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setTogglingEmail('')
    }
  }

  const addPendingEmail = () => {
    const email = newEmail.trim()
    if (!email) return
    const lower = email.toLowerCase()
    const isDuplicate =
      emailEntries.some((entry) => entry.email.toLowerCase() === lower) ||
      pendingEmails.some((entry) => entry.email.toLowerCase() === lower)
    if (isDuplicate) {
      toast.error(t('profile.balanceNotify.emailDuplicate'))
      return
    }
    setPendingEmails((prev) => [
      ...prev,
      { email, codeSent: false, code: '', sending: false, verifying: false, countdown: 0 },
    ])
    setNewEmail('')
  }

  const sendCodeFor = async (email: string) => {
    patchPending(email, { sending: true })
    try {
      await userAPI.sendNotifyEmailCode(email)
      if (!mounted.current) return
      patchPending(email, { codeSent: true, countdown: 60 })
      toast.success(t('profile.balanceNotify.codeSent'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      patchPending(email, { sending: false })
    }
  }

  const verifyPending = async (entry: PendingEmail) => {
    if (entry.code.length !== 6) return
    patchPending(entry.email, { verifying: true })
    try {
      await userAPI.verifyNotifyEmail(entry.email, entry.code)
      setPendingEmails((prev) => prev.filter((item) => item.email !== entry.email))
      toast.success(t('profile.balanceNotify.verifySuccess'))
      applyUser(await userAPI.getProfile())
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
      patchPending(entry.email, { verifying: false })
    }
  }

  const handleRemoveEmail = async (email: string) => {
    setRemovingEmail(email)
    try {
      await userAPI.removeNotifyEmail(email)
      toast.success(t('profile.balanceNotify.removeSuccess'))
      applyUser(await userAPI.getProfile())
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setRemovingEmail('')
    }
  }

  const sendCodeForSaved = async (email: string) => {
    setSendingSavedCode(true)
    try {
      await userAPI.sendNotifyEmailCode(email)
      if (!mounted.current) return
      setVerifyingEmail(email)
      setVerifyCode('')
      setVerifyCountdown(60)
      toast.success(t('profile.balanceNotify.codeSent'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSendingSavedCode(false)
    }
  }

  const verifySavedEmail = async (email: string) => {
    if (verifyCode.length !== 6) return
    setVerifyingSaved(true)
    try {
      await userAPI.verifyNotifyEmail(email, verifyCode)
      setVerifyingEmail('')
      setVerifyCode('')
      setVerifyCountdown(0)
      toast.success(t('profile.balanceNotify.verifySuccess'))
      applyUser(await userAPI.getProfile())
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setVerifyingSaved(false)
    }
  }

  const savedEntryActions = (entry: NotifyEmailEntry) => {
    if (entry.verified) {
      return (
        <HStack gap={1.5} vAlign="center">
          <StatusDot variant="success" label={t('profile.balanceNotify.verified')} />
          <Text type="supporting">{t('profile.balanceNotify.verified')}</Text>
        </HStack>
      )
    }
    if (verifyingEmail === entry.email) {
      return (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <TextInput
            label={t('profile.balanceNotify.codePlaceholder')}
            isLabelHidden
            size="sm"
            width={110}
            value={verifyCode}
            onChange={(value) => setVerifyCode(value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('profile.balanceNotify.codePlaceholder')}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <Button
            size="sm"
            variant="primary"
            label={t('profile.balanceNotify.verify')}
            isLoading={verifyingSaved}
            isDisabled={verifyCode.length !== 6}
            onClick={() => void verifySavedEmail(entry.email)}
          />
          <Button
            size="sm"
            variant="ghost"
            label={verifyCountdown > 0 ? `${verifyCountdown}s` : t('profile.balanceNotify.resend')}
            isDisabled={verifyCountdown > 0 || sendingSavedCode}
            onClick={() => void sendCodeForSaved(entry.email)}
          />
          <Button size="sm" variant="ghost" label={t('common.cancel')} onClick={() => setVerifyingEmail('')} />
        </HStack>
      )
    }
    return (
      <HStack gap={2} vAlign="center">
        <StatusDot variant="warning" label={t('profile.balanceNotify.unverified')} />
        <Text type="supporting">{t('profile.balanceNotify.unverified')}</Text>
        <Button
          size="sm"
          variant="secondary"
          label={t('profile.balanceNotify.verify')}
          isLoading={sendingSavedCode}
          onClick={() => void sendCodeForSaved(entry.email)}
        />
      </HStack>
    )
  }

  return (
    <Card padding={6}>
      <VStack gap={5}>
        <HStack gap={3} vAlign="start">
          <Icon icon={BellAlertIcon} color="secondary" />
          <VStack gap={1}>
            <Heading level={4}>{t('profile.balanceNotify.title')}</Heading>
            <Text color="secondary">{t('profile.balanceNotify.description')}</Text>
          </VStack>
        </HStack>

        <Switch
          label={t('profile.balanceNotify.enabled')}
          value={notifyEnabled}
          onChange={(checked) => void handleToggle(checked)}
          labelPosition="start"
          labelSpacing="spread"
        />

        {notifyEnabled && (
          <VStack gap={5}>
            <HStack gap={2} vAlign="end" wrap="wrap">
              <NumberInput
                label={t('profile.balanceNotify.threshold')}
                description={t('profile.balanceNotify.thresholdHint')}
                value={customThreshold}
                onChange={(value) => setCustomThreshold(value)}
                hasClear
                min={0}
                step={0.01}
                startIcon={CurrencyDollarIcon}
                placeholder={
                  systemDefaultThreshold > 0
                    ? `${t('profile.balanceNotify.systemDefault')} $${systemDefaultThreshold}`
                    : t('profile.balanceNotify.thresholdPlaceholder')
                }
                width={280}
              />
              <Button
                label={savingThreshold ? t('common.saving') : t('common.save')}
                variant="primary"
                isLoading={savingThreshold}
                onClick={() => void handleThresholdUpdate()}
              />
            </HStack>

            <VStack gap={3}>
              <VStack gap={1}>
                <Text type="label">{t('profile.balanceNotify.extraEmails')}</Text>
                <Text type="supporting">{t('profile.balanceNotify.extraEmailsHint')}</Text>
              </VStack>

              {emailEntries.length > 0 && (
                <List hasDividers>
                  {emailEntries.map((entry) => (
                    <ListItem
                      key={entry.email}
                      label={entry.email}
                      startContent={
                        <Switch
                          label={entry.email}
                          isLabelHidden
                          size="sm"
                          value={!entry.disabled}
                          isLoading={togglingEmail === entry.email}
                          onChange={() => void handleEmailToggle(entry)}
                        />
                      }
                      endContent={
                        <HStack gap={2} vAlign="center" wrap="wrap">
                          {savedEntryActions(entry)}
                          <Button
                            size="sm"
                            variant="ghost"
                            label={t('profile.balanceNotify.removeEmail')}
                            isLoading={removingEmail === entry.email}
                            onClick={() => void handleRemoveEmail(entry.email)}
                          />
                        </HStack>
                      }
                    />
                  ))}
                </List>
              )}

              {pendingEmails.length > 0 && (
                <List hasDividers>
                  {pendingEmails.map((entry) => (
                    <ListItem
                      key={entry.email}
                      label={entry.email}
                      startContent={<StatusDot variant="warning" label={t('profile.balanceNotify.unverified')} />}
                      endContent={
                        entry.codeSent ? (
                          <HStack gap={2} vAlign="center" wrap="wrap">
                            <TextInput
                              label={t('profile.balanceNotify.codePlaceholder')}
                              isLabelHidden
                              size="sm"
                              width={110}
                              value={entry.code}
                              onChange={(value) => patchPending(entry.email, { code: value.replace(/\D/g, '').slice(0, 6) })}
                              placeholder={t('profile.balanceNotify.codePlaceholder')}
                              inputMode="numeric"
                              autoComplete="one-time-code"
                            />
                            <Button
                              size="sm"
                              variant="primary"
                              label={t('profile.balanceNotify.verify')}
                              isLoading={entry.verifying}
                              isDisabled={entry.code.length !== 6}
                              onClick={() => void verifyPending(entry)}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              label={entry.countdown > 0 ? `${entry.countdown}s` : t('profile.balanceNotify.resend')}
                              isDisabled={entry.countdown > 0 || entry.sending}
                              onClick={() => void sendCodeFor(entry.email)}
                            />
                          </HStack>
                        ) : (
                          <HStack gap={2} vAlign="center">
                            <Button
                              size="sm"
                              variant="secondary"
                              label={t('profile.balanceNotify.sendCode')}
                              isLoading={entry.sending}
                              onClick={() => void sendCodeFor(entry.email)}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              label={t('profile.balanceNotify.removeEmail')}
                              onClick={() => setPendingEmails((prev) => prev.filter((item) => item.email !== entry.email))}
                            />
                          </HStack>
                        )
                      }
                    />
                  ))}
                </List>
              )}

              {canAddMore ? (
                <HStack gap={2} vAlign="end">
                  <TextInput
                    label={t('profile.balanceNotify.extraEmails')}
                    isLabelHidden
                    type="email"
                    value={newEmail}
                    onChange={setNewEmail}
                    onEnter={addPendingEmail}
                    placeholder={t('profile.balanceNotify.emailPlaceholder')}
                    width="100%"
                  />
                  <Button label={t('common.add')} variant="secondary" isDisabled={!newEmail} onClick={addPendingEmail} />
                </HStack>
              ) : (
                <Text type="supporting">{t('profile.balanceNotify.maxEmailsReached')}</Text>
              )}
            </VStack>
          </VStack>
        )}
      </VStack>
    </Card>
  )
}
