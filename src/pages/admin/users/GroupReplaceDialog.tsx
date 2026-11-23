import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Text } from '@astryxdesign/core/Text'
import { Center } from '@astryxdesign/core/Center'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { ArrowRight, Shield } from 'lucide-react'
import type { AdminGroup, AdminUser } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

/** Port of GroupReplaceModal.vue: swap one exclusive group of a user for another. */
export function GroupReplaceDialog({
  isOpen,
  user,
  oldGroup,
  allGroups,
  onClose,
  onSuccess,
}: {
  isOpen: boolean
  user: AdminUser | null
  oldGroup: { id: number; name: string } | null
  allGroups: AdminGroup[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useI18n()
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Active exclusive standard groups other than the one being replaced
  const availableGroups = useMemo(() => {
    if (!oldGroup) return []
    return allGroups.filter(
      (g) => g.status === 'active' && g.is_exclusive && g.subscription_type === 'standard' && g.id !== oldGroup.id,
    )
  }, [allGroups, oldGroup])

  useEffect(() => {
    if (isOpen) setSelectedGroupId(null)
  }, [isOpen])

  const handleReplace = async () => {
    if (!user || !oldGroup || !selectedGroupId) return
    setSubmitting(true)
    try {
      const result = await adminAPI.users.replaceGroup(user.id, oldGroup.id, selectedGroupId)
      toast.success(t('admin.users.replaceGroupSuccess', { count: result.migrated_keys }))
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
      console.error('Failed to replace group:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedName = availableGroups.find((g) => g.id === selectedGroupId)?.name

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={440} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.users.replaceGroupTitle')} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent isScrollable>
            {oldGroup && (
              <VStack gap={4} hAlign="stretch">
                <Text type="supporting">{t('admin.users.replaceGroupHint', { old: oldGroup.name })}</Text>
                <Card variant="muted" padding={3}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={Shield} size="sm" color="purple" />
                    <Text weight="medium">{oldGroup.name}</Text>
                    <StackItem size="fill">
                      <HStack gap={2} vAlign="center" hAlign="end">
                        <Icon icon={ArrowRight} size="sm" color="secondary" />
                        {selectedName ? (
                          <Text weight="medium" color="accent">
                            {selectedName}
                          </Text>
                        ) : (
                          <Text type="supporting">?</Text>
                        )}
                      </HStack>
                    </StackItem>
                  </HStack>
                </Card>
                {availableGroups.length > 0 ? (
                  <RadioList
                    label={t('admin.users.selectNewGroup')}
                    isLabelHidden
                    value={selectedGroupId ? String(selectedGroupId) : ''}
                    onChange={(value) => setSelectedGroupId(Number(value) || null)}>
                    {availableGroups.map((group) => (
                      <RadioListItem key={group.id} value={String(group.id)} label={group.name} description={group.platform} />
                    ))}
                  </RadioList>
                ) : (
                  <Center padding={6}>
                    <Text type="supporting">{t('admin.users.noOtherGroups')}</Text>
                  </Center>
                )}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button
                label={submitting ? t('common.saving') : t('admin.users.replaceGroupConfirm')}
                variant="primary"
                isDisabled={!selectedGroupId}
                isLoading={submitting}
                onClick={() => void handleReplace()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
