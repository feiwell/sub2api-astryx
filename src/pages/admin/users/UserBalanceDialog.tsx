import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import type { AdminUser } from '@/types'

interface UserBalanceDialogProps {
  isOpen: boolean
  user: AdminUser | null
  operation: 'add' | 'subtract'
  onClose: () => void
  onSaved: () => void
}

export function UserBalanceDialog({ isOpen, user, operation, onClose, onSaved }: UserBalanceDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState(0)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (isOpen) {
      setAmount(0)
      setNotes('')
    }
  }, [isOpen])

  const handleSave = async () => {
    if (!user || amount <= 0) {
      toast.error(t('admin.users.amountRequired'))
      return
    }

    if (operation === 'subtract' && amount > user.balance) {
      toast.error(t('admin.users.insufficientBalance'))
      return
    }

    setLoading(true)
    try {
      await adminAPI.users.updateBalance(user.id, amount, operation, notes)
      toast.success(t('common.success'))
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || t('common.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const newBalance = user
    ? operation === 'add'
      ? user.balance + amount
      : Math.max(0, user.balance - amount)
    : 0

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={480} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={operation === 'add' ? t('admin.users.deposit') : t('admin.users.withdraw')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {user && (
                <VStack gap={2} hAlign="stretch">
                  <Text type="supporting" weight="medium">{user.email}</Text>
                  <HStack gap={3} vAlign="center">
                    <Text type="supporting" color="secondary">{t('admin.users.currentBalance')}:</Text>
                    <Badge label={`$${user.balance.toFixed(2)}`} variant="neutral" />
                  </HStack>
                </VStack>
              )}

              <NumberInput
                label={operation === 'add' ? t('admin.users.depositAmount') : t('admin.users.withdrawAmount')}
                value={amount}
                onChange={setAmount}
                min={0}
                step={0.01}
              />

              <TextInput
                label={t('admin.users.notes')}
                value={notes}
                onChange={setNotes}
                placeholder={t('admin.users.notesPlaceholder')}
              />

              {amount > 0 && (
                <VStack gap={1} hAlign="stretch">
                  <HStack gap={2} vAlign="center">
                    <Text type="supporting">{t('admin.users.newBalance')}:</Text>
                    <Badge label={`$${newBalance.toFixed(2)}`} variant="info" />
                  </HStack>
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={loading ? t('common.saving') : t('common.confirm')}
                variant={operation === 'add' ? 'primary' : 'destructive'}
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
