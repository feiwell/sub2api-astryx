import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Table, pixel, type TableColumn } from '@astryxdesign/core/Table'
import { Card } from '@astryxdesign/core/Card'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import type { AdminUser } from '@/types'

interface UserPlatformQuotaDialogProps {
  isOpen: boolean
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
}

interface QuotaRow {
  __id: string
  platform: string
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
  [key: string]: any
}

export function UserPlatformQuotaDialog({ isOpen, user, onClose, onSaved }: UserPlatformQuotaDialogProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [quotas, setQuotas] = useState<QuotaRow[]>([])
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null)
  const [dailyLimit, setDailyLimit] = useState<number | null>(null)
  const [weeklyLimit, setWeeklyLimit] = useState<number | null>(null)
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen || !user) return
    loadQuotas()
  }, [isOpen, user?.id])

  const loadQuotas = async () => {
    if (!user) return
    setLoading(true)
    try {
      const response = await adminAPI.users.getPlatformQuotas(user.id)
      setQuotas(response.platform_quotas.map(q => ({
        __id: q.platform,
        ...q,
      })))
    } catch (error: any) {
      toast.error(t('admin.users.failedToLoadQuotas'))
    } finally {
      setLoading(false)
    }
  }

  const handleEditQuota = (quota: QuotaRow) => {
    setEditingPlatform(quota.platform)
    setDailyLimit(quota.daily_limit_usd)
    setWeeklyLimit(quota.weekly_limit_usd)
    setMonthlyLimit(quota.monthly_limit_usd)
  }

  const handleSaveQuota = async () => {
    if (!user || !editingPlatform) return
    setSaving(true)
    try {
      const updated = quotas.map(q =>
        q.platform === editingPlatform
          ? {
              platform: q.platform,
              daily_limit_usd: dailyLimit,
              weekly_limit_usd: weeklyLimit,
              monthly_limit_usd: monthlyLimit,
            }
          : {
              platform: q.platform,
              daily_limit_usd: q.daily_limit_usd,
              weekly_limit_usd: q.weekly_limit_usd,
              monthly_limit_usd: q.monthly_limit_usd,
            }
      )
      await adminAPI.users.updatePlatformQuotas(user.id, updated as any)
      toast.success(t('common.success'))
      loadQuotas()
      setEditingPlatform(null)
      onSaved()
    } catch (error: any) {
      toast.error(error?.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumn<QuotaRow>[] = [
    {
      key: 'platform',
      header: t('admin.accounts.columns.platform'),
      width: pixel(120),
      renderCell: (row) => <Badge label={row.platform} variant="info" />,
    },
    {
      key: 'daily_limit',
      header: t('admin.users.dailyLimit'),
      width: pixel(100),
      renderCell: (row) => (
        <Text>{row.daily_limit_usd !== null ? `$${row.daily_limit_usd.toFixed(2)}` : t('common.unlimited')}</Text>
      ),
    },
    {
      key: 'weekly_limit',
      header: t('admin.users.weeklyLimit'),
      width: pixel(100),
      renderCell: (row) => (
        <Text>{row.weekly_limit_usd !== null ? `$${row.weekly_limit_usd.toFixed(2)}` : t('common.unlimited')}</Text>
      ),
    },
    {
      key: 'monthly_limit',
      header: t('admin.users.monthlyLimit'),
      width: pixel(100),
      renderCell: (row) => (
        <Text>{row.monthly_limit_usd !== null ? `$${row.monthly_limit_usd.toFixed(2)}` : t('common.unlimited')}</Text>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: pixel(80),
      renderCell: (row) => (
        <Button
          label={t('common.edit')}
          variant="ghost"
          size="sm"
          onClick={() => handleEditQuota(row)}
        />
      ),
    },
  ]

  if (editingPlatform) {
    return (
      <Dialog isOpen={isOpen && !!editingPlatform} onOpenChange={(open) => !open && setEditingPlatform(null)} width={480} purpose="form">
        <Layout
          header={
            <DialogHeader
              title={`${t('admin.users.editQuota')} - ${editingPlatform}`}
              onOpenChange={(open) => !open && setEditingPlatform(null)}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <NumberInput
                  label={t('admin.users.dailyLimit')}
                  value={dailyLimit ?? 0}
                  onChange={(v) => setDailyLimit(v > 0 ? v : null)}
                  min={0}
                  step={0.01}
                  description={t('admin.users.nullMeansUnlimited')}
                />
                <NumberInput
                  label={t('admin.users.weeklyLimit')}
                  value={weeklyLimit ?? 0}
                  onChange={(v) => setWeeklyLimit(v > 0 ? v : null)}
                  min={0}
                  step={0.01}
                  description={t('admin.users.nullMeansUnlimited')}
                />
                <NumberInput
                  label={t('admin.users.monthlyLimit')}
                  value={monthlyLimit ?? 0}
                  onChange={(v) => setMonthlyLimit(v > 0 ? v : null)}
                  min={0}
                  step={0.01}
                  description={t('admin.users.nullMeansUnlimited')}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" onClick={() => setEditingPlatform(null)} />
                <Button
                  label={saving ? t('common.saving') : t('common.save')}
                  variant="primary"
                  isLoading={saving}
                  onClick={handleSaveQuota}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    )
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={900}>
      <Layout
        header={
          <DialogHeader
            title={`${t('admin.users.platformQuota.title')} - ${user?.email || ''}`}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {loading ? (
                <Center minHeight={400}>
                  <Spinner />
                </Center>
              ) : quotas.length === 0 ? (
                <Center minHeight={400}>
                  <EmptyState title={t('common.noData')} />
                </Center>
              ) : (
                <Card padding={0}>
                  <Table
                    data={quotas}
                    columns={columns}
                    idKey="__id"
                    density="compact"
                    dividers="rows"
                  />
                </Card>
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  )
}
