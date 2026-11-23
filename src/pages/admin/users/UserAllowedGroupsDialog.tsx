import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Text } from '@astryxdesign/core/Text'
import { Card } from '@astryxdesign/core/Card'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import type { AdminUser, AdminGroup } from '@/types'

interface UserAllowedGroupsDialogProps {
  isOpen: boolean
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
}

export function UserAllowedGroupsDialog({ isOpen, user, onClose, onSaved }: UserAllowedGroupsDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!isOpen || !user) return
    loadGroups()
  }, [isOpen, user?.id])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const allGroups = await adminAPI.groups.getAll()
      setGroups(allGroups)
      setSelectedGroupIds(new Set(user?.allowed_groups || []))
    } catch (error: any) {
      toast.error(t('admin.users.failedToLoadGroups'))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await adminAPI.users.update(user.id, {
        allowed_groups: Array.from(selectedGroupIds),
      })
      toast.success(t('common.success'))
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const toggleGroup = (groupId: number) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={560} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={`${t('admin.users.groupConfig')} - ${user?.email || ''}`}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {loading ? (
                <Center minHeight={300}>
                  <Spinner />
                </Center>
              ) : groups.length === 0 ? (
                <Center minHeight={300}>
                  <EmptyState title={t('common.noGroupsAvailable')} />
                </Center>
              ) : (
                <VStack gap={2} hAlign="stretch">
                  {groups.map((group) => (
                    <Card key={group.id} padding={3}>
                      <HStack gap={3} vAlign="center">
                        <CheckboxInput
                          label={group.name}
                          isLabelHidden
                          value={selectedGroupIds.has(group.id)}
                          onChange={() => toggleGroup(group.id)}
                        />
                        <Text weight="medium">{group.name}</Text>
                      </HStack>
                    </Card>
                  ))}
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
                label={saving ? t('common.saving') : t('common.save')}
                variant="primary"
                isLoading={saving}
                onClick={handleSave}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
