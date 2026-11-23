import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { VStack, HStack, StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Table, pixel, type TableColumn } from '@astryxdesign/core/Table'
import { Minus, Plus } from 'lucide-react'
import { Card } from '@astryxdesign/core/Card'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import type { AdminUser } from '@/types'
import { formatDateTime } from '@/utils/format'

interface UserBalanceHistoryDialogProps {
  isOpen: boolean
  user: AdminUser | null
  onClose: () => void
  /** Hides the deposit / withdraw controls (read-only view, as in UsersView.vue). */
  hideActions?: boolean
  onDeposit?: () => void
  onWithdraw?: () => void
}

interface BalanceHistoryRow {
  __id: string
  id: number
  code: string
  type: string
  value: number
  status: string
  created_at: string
  notes?: string
  [key: string]: any
}

export function UserBalanceHistoryDialog({
  isOpen,
  user,
  onClose,
  hideActions = false,
  onDeposit,
  onWithdraw,
}: UserBalanceHistoryDialogProps) {
  const { t } = useI18n()
  const [historyItems, setHistoryItems] = useState<BalanceHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [totalRecharged, setTotalRecharged] = useState(0)

  useEffect(() => {
    if (!isOpen || !user) return
    loadHistory()
  }, [isOpen, user?.id, typeFilter])

  const loadHistory = async () => {
    if (!user) return
    setLoading(true)
    try {
      const response = await adminAPI.users.getUserBalanceHistory(user.id, 1, 100, typeFilter || undefined)
      setHistoryItems(
        (response.items || []).map((item) => ({
          __id: String(item.id),
          id: item.id,
          code: item.code,
          type: item.type,
          value: item.value,
          status: item.status,
          created_at: item.created_at,
          notes: item.notes,
        }))
      )
      setTotalRecharged(response.total_recharged || 0)
    } catch (error: any) {
      toast.error(t('admin.users.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  const typeOptions = [
    { value: '', label: t('admin.users.allTypes') },
    { value: 'balance', label: t('admin.users.typeBalance') },
    { value: 'affiliate_balance', label: t('admin.users.typeAffiliateBalance') },
    { value: 'admin_balance', label: t('admin.users.typeAdminBalance') },
  ]

  const columns: TableColumn<BalanceHistoryRow>[] = [
    {
      key: 'code',
      header: t('admin.users.code'),
      width: pixel(100),
      renderCell: (row) => <Text type="code" size="sm">{row.code}</Text>,
    },
    {
      key: 'type',
      header: t('admin.users.type'),
      width: pixel(120),
      renderCell: (row) => <Badge label={row.type} variant="neutral" />,
    },
    {
      key: 'value',
      header: t('admin.users.amount'),
      width: pixel(100),
      renderCell: (row) => {
        const isPositive = row.value > 0
        return (
          <Text weight="medium">
            {isPositive ? '+' : ''}{row.value.toFixed(2)}
          </Text>
        )
      },
    },
    {
      key: 'status',
      header: t('admin.users.columns.status'),
      width: pixel(100),
      renderCell: (row) => <Badge label={row.status} variant="neutral" />,
    },
    {
      key: 'created_at',
      header: t('admin.users.columns.created'),
      width: pixel(160),
      renderCell: (row) => <Text color="secondary">{formatDateTime(row.created_at)}</Text>,
    },
  ]

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={900}>
      <Layout
        header={
          <DialogHeader
            title={`${t('admin.users.balanceHistoryTitle')} - ${user?.email || ''}`}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <HStack gap={3} vAlign="center">
                <Text type="supporting" weight="medium">
                  {t('admin.users.currentBalance')}: ${user?.balance.toFixed(2) || '0.00'}
                </Text>
                <Text type="supporting" weight="medium" color="secondary">
                  {t('admin.users.totalRecharged')}: ${totalRecharged.toFixed(2)}
                </Text>
              </HStack>

              <HStack gap={3} vAlign="end">
                <StackItem size="fill">
                  <Selector
                    label={t('admin.users.type')}
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={typeOptions}
                  />
                </StackItem>
                {!hideActions && onDeposit && (
                  <Button
                    label={t('admin.users.deposit')}
                    variant="secondary"
                    icon={<Icon icon={Plus} size="sm" />}
                    onClick={onDeposit}
                  />
                )}
                {!hideActions && onWithdraw && (
                  <Button
                    label={t('admin.users.withdraw')}
                    variant="secondary"
                    icon={<Icon icon={Minus} size="sm" />}
                    onClick={onWithdraw}
                  />
                )}
              </HStack>

              {loading ? (
                <Center minHeight={400}>
                  <Spinner />
                </Center>
              ) : historyItems.length === 0 ? (
                <Center minHeight={400}>
                  <EmptyState
                    title={t('admin.users.noBalanceHistory')}
                  />
                </Center>
              ) : (
                <Card padding={0}>
                  <Table
                    data={historyItems}
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
