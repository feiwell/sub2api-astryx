import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Badge } from '@astryxdesign/core/Badge'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Card } from '@astryxdesign/core/Card'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { adminAPI } from '~/lib/api/admin'
import type { AdminUser, ApiKey } from '@/types'
import { formatDateTime } from '@/utils/format'

interface UserApiKeysDialogProps {
  isOpen: boolean
  user: AdminUser | null
  onClose: () => void
}

interface ApiKeyRow extends ApiKey {
  __id: string
  [key: string]: any
}

export function UserApiKeysDialog({ isOpen, user, onClose }: UserApiKeysDialogProps) {
  const { t } = useI18n()
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !user) return
    loadApiKeys()
  }, [isOpen, user?.id])

  const loadApiKeys = async () => {
    if (!user) return
    setLoading(true)
    try {
      const response = await adminAPI.users.getUserApiKeys(user.id)
      setApiKeys(response.items || [])
    } catch (error: any) {
      toast.error(t('admin.users.failedToLoadApiKeys'))
    } finally {
      setLoading(false)
    }
  }

  const rows = apiKeys.map((key) => ({
    ...key,
    __id: String(key.id),
  }))

  const columns: TableColumn<ApiKeyRow>[] = [
    {
      key: 'name',
      header: t('admin.users.keyName'),
      width: proportional(1.5),
      renderCell: (row) => <Text weight="medium">{row.name}</Text>,
    },
    {
      key: 'status',
      header: t('admin.users.columns.status'),
      width: pixel(100),
      renderCell: (row) => (
        <Badge
          label={row.status}
          variant={row.status === 'active' ? 'success' : 'neutral'}
        />
      ),
    },
    {
      key: 'key',
      header: t('admin.users.keyValue'),
      width: proportional(2),
      renderCell: (row) => (
        <Text type="code" color="secondary">
          {row.key.substring(0, 20)}...{row.key.substring(row.key.length - 8)}
        </Text>
      ),
    },
    {
      key: 'created_at',
      header: t('admin.users.columns.created'),
      width: pixel(160),
      renderCell: (row) => <Text color="secondary">{formatDateTime(row.created_at)}</Text>,
    },
  ]

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={800}>
      <Layout
        header={
          <DialogHeader
            title={`${t('admin.users.userApiKeys')} - ${user?.email || ''}`}
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
              ) : apiKeys.length === 0 ? (
                <Center minHeight={300}>
                  <EmptyState
                    title={t('admin.users.noApiKeys')}
                    description={t('admin.users.noApiKeysDescription')}
                  />
                </Center>
              ) : (
                <Card padding={0}>
                  <Table
                    data={rows}
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
