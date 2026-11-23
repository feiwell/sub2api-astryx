import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import { Section } from '@astryxdesign/core/Section'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Text } from '@astryxdesign/core/Text'
import { Code } from '@astryxdesign/core/Code'
import { Banner } from '@astryxdesign/core/Banner'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { adminAPI } from '~/lib/api/admin'
import type { AffiliateWithdrawResult, SimpleUser } from '~/lib/api/admin/affiliates'
import { extractApiErrorCode, extractI18nErrorMessage } from '@/utils/apiError'
import {
  completeAffiliateWithdrawOperation,
  prepareAffiliateWithdrawOperation,
  type AffiliateWithdrawOperation,
} from '@/views/admin/affiliates/affiliateWithdrawOperation'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

/** Affiliate quota is booked with 8 decimals; amounts compare at that scale. */
const LEDGER_SCALE = 1e8

function formatPreciseAmount(value: number): string {
  const [intPart, fraction = ''] = Number(value || 0).toFixed(8).replace(/0+$/, '').split('.')
  return `${intPart}.${fraction.padEnd(2, '0')}`
}

interface AffiliateOfflineWithdrawDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (result: AffiliateWithdrawResult) => void
}

/** Port of views/admin/affiliates/AffiliateOfflineWithdrawDialog.vue. */
export function AffiliateOfflineWithdrawDialog({
  isOpen,
  onClose,
  onSuccess,
}: AffiliateOfflineWithdrawDialogProps) {
  const { t } = useI18n()

  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState<SimpleUser[]>([])
  const [searched, setSearched] = useState(false)
  const [selectedUser, setSelectedUser] = useState<SimpleUser | null>(null)
  const [availableQuota, setAvailableQuota] = useState(0)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // A submitted registration whose outcome is still unknown. While unknown the
  // user and amount stay locked and a retry reuses its idempotency key.
  const [outcomeUncertain, setOutcomeUncertain] = useState(false)

  const pendingOperation = useRef<AffiliateWithdrawOperation | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeq = useRef(0)
  const overviewSeq = useRef(0)

  const showError = useCallback(
    (error: unknown) => {
      toast.error(extractI18nErrorMessage(error, t, 'admin.affiliates.errors', t('common.error')))
    },
    [t],
  )

  const clearSearchTimer = useCallback(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
      searchTimer.current = null
    }
  }, [])

  const loadAvailableQuota = useCallback(
    async (userId: number) => {
      const seq = ++overviewSeq.current
      setOverviewLoading(true)
      try {
        const overview = await adminAPI.affiliates.getUserOverview(userId)
        if (seq !== overviewSeq.current) return
        setAvailableQuota(Number(overview.available_quota || 0))
      } catch (error) {
        if (seq !== overviewSeq.current) return
        setAvailableQuota(0)
        // Users who never earned a rebate have no affiliate profile: the
        // overview endpoint answers USER_NOT_FOUND and the quota is simply 0.
        if (extractApiErrorCode(error) === 'USER_NOT_FOUND') return
        if (pendingOperation.current?.outcomeUncertain !== true) setSelectedUser(null)
        showError(error)
      } finally {
        if (seq === overviewSeq.current) setOverviewLoading(false)
      }
    },
    [showError],
  )

  const searchUsers = useCallback(
    async (query: string) => {
      const seq = ++searchSeq.current
      try {
        const users = await adminAPI.affiliates.lookupUsers(query)
        if (seq !== searchSeq.current) return
        setUserResults(users || [])
        setSearched(true)
      } catch (error) {
        if (seq !== searchSeq.current) return
        showError(error)
      }
    },
    [showError],
  )

  const onUserQueryChange = useCallback(
    (next: string) => {
      setUserQuery(next)
      clearSearchTimer()
      setSearched(false)
      const query = next.trim()
      if (!query) {
        searchSeq.current++
        setUserResults([])
        return
      }
      searchTimer.current = setTimeout(() => {
        void searchUsers(query)
      }, 300)
    },
    [clearSearchTimer, searchUsers],
  )

  const selectUser = useCallback(
    (user: SimpleUser) => {
      clearSearchTimer()
      searchSeq.current++
      setSelectedUser(user)
      setUserQuery('')
      setUserResults([])
      setSearched(false)
      setAvailableQuota(0)
      setAmount('')
      void loadAvailableQuota(user.id)
    },
    [clearSearchTimer, loadAvailableQuota],
  )

  const clearUser = useCallback(() => {
    overviewSeq.current++
    setSelectedUser(null)
    setAvailableQuota(0)
    setOverviewLoading(false)
    setAmount('')
  }, [])

  const fillAll = useCallback(() => {
    setAmount(String(Math.round(availableQuota * LEDGER_SCALE) / LEDGER_SCALE))
  }, [availableQuota])

  const resetForm = useCallback(() => {
    clearSearchTimer()
    searchSeq.current++
    overviewSeq.current++
    pendingOperation.current = null
    setUserQuery('')
    setUserResults([])
    setSearched(false)
    setSelectedUser(null)
    setAvailableQuota(0)
    setOverviewLoading(false)
    setAmount('')
    setSubmitting(false)
    setOutcomeUncertain(false)
  }, [clearSearchTimer])

  useEffect(() => {
    if (isOpen) resetForm()
  }, [isOpen, resetForm])

  useEffect(() => clearSearchTimer, [clearSearchTimer])

  const amountText = amount.trim()
  const parsedAmount = amountText === '' ? Number.NaN : Number(amountText)

  const amountError = useMemo(() => {
    if (outcomeUncertain || !selectedUser || overviewLoading || amountText === '') return ''
    if (!Number.isFinite(parsedAmount) || Math.round(parsedAmount * LEDGER_SCALE) <= 0) {
      return t('admin.affiliates.withdraw.amountRequired')
    }
    if (Math.round(parsedAmount * LEDGER_SCALE) > Math.round(availableQuota * LEDGER_SCALE)) {
      return t('admin.affiliates.withdraw.amountExceeds')
    }
    return ''
  }, [amountText, availableQuota, outcomeUncertain, overviewLoading, parsedAmount, selectedUser, t])

  // A registration with an unknown outcome may already have been deducted, so a
  // retry is not bound by the refreshed available quota.
  const canSubmit = (() => {
    if (selectedUser === null || submitting) return false
    if (outcomeUncertain) return true
    return !overviewLoading && amountText !== '' && amountError === ''
  })()

  const handleClose = useCallback(() => {
    if (submitting) return
    onClose()
  }, [onClose, submitting])

  const submit = useCallback(async () => {
    const user = selectedUser
    if (!user || !canSubmit) return
    if (!pendingOperation.current) {
      pendingOperation.current = prepareAffiliateWithdrawOperation(user.id, parsedAmount)
      if (pendingOperation.current.outcomeUncertain) setOutcomeUncertain(true)
    }
    const operation = pendingOperation.current
    setSubmitting(true)
    try {
      const { result, replayed } = await adminAPI.affiliates.withdrawUserQuota(
        operation.userId,
        { amount: operation.amount },
        operation.key,
      )
      completeAffiliateWithdrawOperation(operation)
      pendingOperation.current = null
      setOutcomeUncertain(false)
      toast.success(
        t(replayed ? 'admin.affiliates.withdraw.replayed' : 'admin.affiliates.withdraw.success', {
          amount: `$${formatPreciseAmount(result.amount)}`,
          remaining: `$${formatPreciseAmount(result.available_quota_after)}`,
        }),
      )
      onSuccess(result)
    } catch (error) {
      showError(error)
      // On network errors, timeouts, 5xx and 408/409 the server may already have
      // registered it: keep the registration so a retry replays the same request
      // and idempotency key until the outcome is known.
      const status = (error as { status?: number } | null)?.status
      if (
        !operation.outcomeUncertain &&
        status &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 409
      ) {
        completeAffiliateWithdrawOperation(operation)
        pendingOperation.current = null
        setOutcomeUncertain(false)
      } else {
        operation.outcomeUncertain = true
        setOutcomeUncertain(true)
      }
      void loadAvailableQuota(operation.userId)
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, loadAvailableQuota, onSuccess, parsedAmount, selectedUser, showError, t])

  const amountLocked = !selectedUser || overviewLoading || submitting || outcomeUncertain

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={560} purpose="form">
      <Layout
        height="auto"
        header={
          <DialogHeader
            title={t('admin.affiliates.withdraw.title')}
            onOpenChange={(open) => !open && handleClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <VStack gap={1} hAlign="stretch">
                <Text type="label" weight="medium">
                  {t('admin.affiliates.withdraw.user')}
                </Text>
                {selectedUser ? (
                  <Section variant="muted" padding={2} data-test="withdraw-selected-user">
                    <HStack gap={3} vAlign="center">
                      <StackItem size="fill">
                        <Text maxLines={1}>
                          <Code color="secondary">#{selectedUser.id}</Code>
                          {' '}
                          <Text weight="medium">{selectedUser.email}</Text>
                          {selectedUser.username ? (
                            <Text color="secondary" size="xsm">
                              {` (${selectedUser.username})`}
                            </Text>
                          ) : null}
                        </Text>
                      </StackItem>
                      <IconButton
                        label={t('admin.affiliates.withdraw.changeUser')}
                        tooltip={t('admin.affiliates.withdraw.changeUser')}
                        icon={<Icon icon="close" size="sm" />}
                        variant="ghost"
                        size="sm"
                        isDisabled={submitting || outcomeUncertain}
                        data-test="withdraw-clear-user"
                        onClick={clearUser}
                      />
                    </HStack>
                  </Section>
                ) : (
                  <VStack gap={1} hAlign="stretch">
                    <TextInput
                      label={t('admin.affiliates.withdraw.user')}
                      isLabelHidden
                      value={userQuery}
                      onChange={onUserQueryChange}
                      placeholder={t('admin.affiliates.withdraw.userPlaceholder')}
                      startIcon="search"
                      data-test="withdraw-user-search"
                    />
                    {userResults.length > 0 ? (
                      <Section padding={0} dividers={['top', 'bottom', 'start', 'end']}>
                        <List density="compact" hasDividers>
                          {userResults.map((user) => (
                            <ListItem
                              key={user.id}
                              label={user.email}
                              description={user.username || undefined}
                              data-test="withdraw-user-option"
                              onClick={() => selectUser(user)}
                            />
                          ))}
                        </List>
                      </Section>
                    ) : searched ? (
                      <Text type="supporting" color="secondary">
                        {t('admin.affiliates.withdraw.noUserFound')}
                      </Text>
                    ) : null}
                  </VStack>
                )}
              </VStack>

              {selectedUser && (
                <Section variant="muted" padding={3}>
                  <VStack gap={1} hAlign="stretch">
                    <HStack gap={2} vAlign="center">
                      <StackItem size="fill">
                        <Text type="supporting" color="secondary">
                          {t('admin.affiliates.withdraw.availableQuota')}
                        </Text>
                      </StackItem>
                      {overviewLoading ? (
                        <Spinner size="sm" />
                      ) : (
                        <Text weight="semibold" hasTabularNumbers data-test="withdraw-available-quota">
                          {`$${formatPreciseAmount(availableQuota)}`}
                        </Text>
                      )}
                    </HStack>
                    <Text type="supporting" color="secondary" size="xsm">
                      {t('admin.affiliates.withdraw.frozenHint')}
                    </Text>
                  </VStack>
                </Section>
              )}

              <HStack gap={2} vAlign="end">
                <StackItem size="fill">
                  <TextInput
                    label={t('admin.affiliates.withdraw.amount')}
                    value={amount}
                    onChange={setAmount}
                    inputMode="decimal"
                    isDisabled={amountLocked}
                    description={amountError ? undefined : t('admin.affiliates.withdraw.amountHint')}
                    status={amountError ? { type: 'error', message: amountError } : undefined}
                    statusVariant="detached"
                    data-test="withdraw-amount"
                  />
                </StackItem>
                <Button
                  label={t('admin.affiliates.withdraw.fillAll')}
                  variant="secondary"
                  isDisabled={amountLocked || availableQuota <= 0}
                  data-test="withdraw-fill-all"
                  onClick={fillAll}
                />
              </HStack>

              {outcomeUncertain && (
                <Banner
                  status="info"
                  collapsible={false}
                  title={t('admin.affiliates.withdraw.uncertainHint')}
                  data-test="withdraw-uncertain-hint"
                />
              )}

              <Banner
                status="warning"
                collapsible={false}
                title={t('admin.affiliates.withdraw.warning')}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button
                label={t('common.cancel')}
                variant="secondary"
                isDisabled={submitting}
                onClick={handleClose}
              />
              <Button
                label={
                  submitting
                    ? t('admin.affiliates.withdraw.submitting')
                    : t('admin.affiliates.withdraw.submit')
                }
                variant="primary"
                isLoading={submitting}
                isDisabled={!canSubmit}
                data-test="withdraw-submit"
                onClick={() => void submit()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
