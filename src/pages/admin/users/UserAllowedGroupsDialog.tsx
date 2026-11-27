import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
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

/**
 * Which groups a user may use, and what that user is charged in each of them.
 *
 * The per-user rate is the group's `rate_multipliers` override: a blank cell
 * means "use the group default", which is what the placeholder shows. Saving
 * only touches groups whose rate actually changed — each such group is read
 * back, the single user's row is edited, and the whole list is written, because
 * that endpoint replaces every override in the group.
 */
export function UserAllowedGroupsDialog({ isOpen, user, onClose, onSaved }: UserAllowedGroupsDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set())
  // null = no override, the group default applies
  const [rates, setRates] = useState<Record<number, number | null>>({})
  const [originalRates, setOriginalRates] = useState<Record<number, number | null>>({})

  useEffect(() => {
    if (!isOpen || !user) return
    void loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const allGroups = await adminAPI.groups.getAll()
      setGroups(allGroups)
      setSelectedGroupIds(new Set(user?.allowed_groups || []))

      // One read per group: the endpoint is per group, so this is the only way
      // to learn the user's current override in each of them.
      const found: Record<number, number | null> = {}
      await Promise.all(
        allGroups.map(async (group) => {
          try {
            const entries = await adminAPI.groups.getGroupRateMultipliers(group.id)
            const mine = entries.find((entry) => entry.user_id === user?.id)
            found[group.id] = mine?.rate_multiplier ?? null
          } catch {
            found[group.id] = null
          }
        }),
      )
      setRates(found)
      setOriginalRates({ ...found })
    } catch {
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

      const changed = groups
        .map((group) => group.id)
        .filter((id) => (rates[id] ?? null) !== (originalRates[id] ?? null))

      for (const groupId of changed) {
        const entries = await adminAPI.groups.getGroupRateMultipliers(groupId)
        const nextRate = rates[groupId] ?? null
        const entries2 = entries
          .map((entry) => ({
            user_id: entry.user_id,
            rate_multiplier:
              entry.user_id === user.id ? nextRate : (entry.rate_multiplier ?? null),
          }))
          .filter((entry) => entry.rate_multiplier != null)
          .map((entry) => ({
            user_id: entry.user_id,
            rate_multiplier: entry.rate_multiplier as number,
          }))
        await adminAPI.groups.batchSetGroupRateMultipliers(groupId, entries2)
      }

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
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={620} purpose="form">
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
                  {groups.map((group) => {
                    const selected = selectedGroupIds.has(group.id)
                    return (
                      <Card key={group.id} padding={3}>
                        <HStack gap={3} vAlign="center">
                          <CheckboxInput
                            label={group.name}
                            isLabelHidden
                            value={selected}
                            onChange={() => toggleGroup(group.id)}
                          />
                          <VStack gap={0.5} hAlign="start" style={{ flex: 1, minWidth: 0 }}>
                            <Text weight="medium">{group.name}</Text>
                            <Text size="sm" color="secondary">
                              {t('admin.users.groupDefaultRate', {
                                value: String(group.rate_multiplier ?? 1),
                              })}
                            </Text>
                          </VStack>
                          <div style={{ width: 132, flexShrink: 0 }}>
                            <NumberInput
                              label={t('admin.users.rateOverride')}
                              isLabelHidden
                              size="sm"
                              value={rates[group.id] ?? null}
                              placeholder={String(group.rate_multiplier ?? 1)}
                              isDisabled={!selected}
                              onChange={(value) =>
                                setRates((prev) => ({ ...prev, [group.id]: value }))
                              }
                              hasClear
                              min={0.001}
                              step={0.001}
                              isWheelEnabled={false}
                            />
                          </div>
                        </HStack>
                      </Card>
                    )
                  })}
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
