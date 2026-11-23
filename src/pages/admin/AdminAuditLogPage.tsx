import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { EyeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import type { AuditLog } from '~/lib/api/admin/audit'
import { AuditLogClearButton } from './auditLog/AuditLogClear'
import { AuditLogDetailDialog } from './auditLog/AuditLogDetailDialog'
import { AuditLogFilters } from './auditLog/AuditLogFilters'
import { NO_VALUE, authMethodLabel, formatAuditTime, statusColor } from './auditLog/auditText'
import { useAuditLogs } from './auditLog/useAuditLogs'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<AuditLog, keyof AuditLog>

/**
 * The operation log: what was done on the management side, by whom, from where, and how it went.
 * Port of views/admin/AuditLogView.vue. Entries are read-only; the log can only be cleared whole.
 */
export default function AdminAuditLogPage() {
  const { t, locale } = useI18n()
  const list = useAuditLogs()
  const [detailId, setDetailId] = useState<number | null>(null)
  const rows: Row[] = list.items

  const columns: TableColumn<Row>[] = [
    {
      key: 'created_at',
      header: t('admin.audit.columns.time'),
      width: pixel(168),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {formatAuditTime(row.created_at, locale)}
        </Text>
      ),
    },
    {
      key: 'actor',
      header: t('admin.audit.columns.actor'),
      width: proportional(1.2, { minWidth: 180 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" weight="medium" maxLines={1} hasTruncateTooltip>
            {row.actor_email || NO_VALUE}
          </Text>
          <Text type="supporting" color="secondary" maxLines={1} hasTruncateTooltip>
            {[row.actor_role, row.auth_method && authMethodLabel(row.auth_method)].filter(Boolean).join(' · ')}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'action',
      header: t('admin.audit.columns.action'),
      width: proportional(1.8, { minWidth: 240 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="code" maxLines={1} hasTruncateTooltip>
            {row.action}
          </Text>
          <Text type="supporting" color="secondary" maxLines={1} hasTruncateTooltip>
            {`${row.method} ${row.path}`}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'status_code',
      header: t('admin.audit.columns.result'),
      width: pixel(84),
      renderCell: (row) => <Token size="sm" color={statusColor(row.status_code)} label={String(row.status_code)} />,
    },
    {
      key: 'latency_ms',
      header: t('admin.audit.detail.latency'),
      width: pixel(96),
      align: 'end',
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers textWrap="nowrap">
          {`${row.latency_ms} ms`}
        </Text>
      ),
    },
    {
      key: 'client_ip',
      header: t('admin.audit.columns.clientIp'),
      // An IPv6 address is shown whole, on two lines where one is too short.
      width: proportional(1, { minWidth: 150 }),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers wordBreak="break-all">
          {row.client_ip || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      // Wide enough for the English label, "Details".
      width: pixel(128),
      align: 'end',
      renderCell: (row) => (
        <Button
          label={t('admin.audit.columns.detail')}
          variant="ghost"
          size="sm"
          icon={<Icon icon={EyeIcon} />}
          onClick={() => setDetailId(row.id)}
        />
      ),
    },
  ]

  return (
    <Page
      title={t('admin.audit.title')}
      description={t('admin.audit.description')}
      actions={<AuditLogClearButton onCleared={list.search} />}>
      <Card>
        <VStack gap={4}>
          <AuditLogFilters list={list} />

          {list.failure != null && (
            <Banner
              status="error"
              title={t('admin.audit.loadFailed')}
              description={list.failure !== t('admin.audit.loadFailed') ? list.failure : undefined}
            />
          )}

          {rows.length === 0 ? (
            // A failed first load leaves only its banner.
            (list.isLoading || list.failure == null) && (
              <Center padding={8}>
                {list.isLoading ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <EmptyState
                    isCompact
                    headingLevel={5}
                    icon={<Icon icon={ShieldCheckIcon} size="lg" color="secondary" />}
                    title={t('admin.audit.empty')}
                  />
                )}
              </Center>
            )
          ) : (
            <Table<Row>
              data={rows}
              columns={columns}
              idKey={(row) => row.id}
              density="compact"
              dividers="rows"
              hasHover
            />
          )}

          {list.total > 0 && (
            <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {`${t('common.total')}: ${list.total} ${t('pagination.results')}`}
              </Text>
              <Pagination
                page={list.page}
                onChange={list.setPage}
                totalItems={list.total}
                pageSize={list.pageSize}
                pageSizeOptions={list.pageSizeOptions}
                onPageSizeChange={list.changePageSize}
                variant="input"
                size="sm"
              />
            </HStack>
          )}
        </VStack>
      </Card>

      {detailId != null && <AuditLogDetailDialog logId={detailId} onClose={() => setDetailId(null)} />}
    </Page>
  )
}
