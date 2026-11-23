import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import type { AdminUser } from '@/types'

interface UserCreateEditDialogProps {
  isOpen: boolean
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
}

export function UserCreateEditDialog({ isOpen, user, onClose, onSaved }: UserCreateEditDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    notes: '',
    role: 'user' as 'admin' | 'user',
    concurrency: 0,
    rpm_limit: 0,
  })

  useEffect(() => {
    if (!isOpen) return
    if (user) {
      setForm({
        email: user.email,
        password: '',
        username: user.username || '',
        notes: user.notes || '',
        role: user.role as 'admin' | 'user',
        concurrency: user.concurrency || 0,
        rpm_limit: user.rpm_limit || 0,
      })
    } else {
      setForm({
        email: '',
        password: '',
        username: '',
        notes: '',
        role: 'user',
        concurrency: 0,
        rpm_limit: 0,
      })
    }
  }, [isOpen, user])

  const handleSave = async () => {
    if (!form.email.trim()) {
      toast.error(t('admin.users.emailRequired'))
      return
    }

    if (!user && !form.password.trim()) {
      toast.error(t('admin.users.passwordRequired'))
      return
    }

    setLoading(true)
    try {
      if (user) {
        await adminAPI.users.update(user.id, {
          username: form.username.trim() || undefined,
          notes: form.notes.trim() || undefined,
          role: form.role,
          concurrency: form.concurrency,
          rpm_limit: form.rpm_limit,
        })
        toast.success(t('admin.users.userUpdated'))
      } else {
        await adminAPI.users.create({
          email: form.email.trim(),
          password: form.password.trim(),
          username: form.username.trim() || undefined,
          notes: form.notes.trim() || undefined,
          role: form.role,
          concurrency: form.concurrency,
          rpm_limit: form.rpm_limit,
        })
        toast.success(t('admin.users.userCreated'))
      }
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || t('common.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={560} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={user ? t('admin.users.editUser') : t('admin.users.createUser')}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <TextInput
                label={t('admin.users.email')}
                value={form.email}
                onChange={(val) => setForm(f => ({ ...f, email: val }))}
                isRequired
                isDisabled={!!user}
              />
              {!user && (
                <TextInput
                  label={t('admin.users.password')}
                  type="password"
                  value={form.password}
                  onChange={(val) => setForm(f => ({ ...f, password: val }))}
                  isRequired
                />
              )}
              <TextInput
                label={t('admin.users.username')}
                value={form.username}
                onChange={(val) => setForm(f => ({ ...f, username: val }))}
              />
              <TextInput
                label={t('admin.users.notes')}
                value={form.notes}
                onChange={(val) => setForm(f => ({ ...f, notes: val }))}
              />
              <Selector
                label={t('admin.users.columns.role')}
                value={form.role}
                onChange={(val) => setForm(f => ({ ...f, role: val as 'admin' | 'user' }))}
                options={[
                  { value: 'user', label: t('admin.users.user') },
                  { value: 'admin', label: t('admin.users.admin') },
                ]}
              />
              <NumberInput
                label={t('admin.users.columns.concurrency')}
                value={form.concurrency}
                onChange={(val) => setForm(f => ({ ...f, concurrency: val }))}
                min={0}
                isIntegerOnly
              />
              <NumberInput
                label={t('admin.users.form.rpmLimit')}
                value={form.rpm_limit}
                onChange={(val) => setForm(f => ({ ...f, rpm_limit: val }))}
                min={0}
                isIntegerOnly
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={loading ? t('common.saving') : t('common.save')}
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
