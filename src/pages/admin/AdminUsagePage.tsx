import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { ArrowDownTrayIcon, ArrowPathIcon, InboxIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { AdminUser } from '@/types'
import { Page } from '~/components/common/Page'
import { ColumnPicker, useHiddenColumns } from '~/components/usage/ColumnPicker'
import { IpGeoBatchButton } from '~/components/usage/IpGeo'
import { UsageStatsCards } from '~/components/usage/UsageStatsCards'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { UsageRangeBar } from '~/pages/user/usage/UsageCharts'
import { AdminUsageCharts } from './usage/AdminUsageCharts'
import { AdminUsageCleanupDialog } from './usage/AdminUsageCleanupDialog'
import { AdminUsageErrorsTable, adminErrorColumnChoices } from './usage/AdminUsageErrorsTable'
import { AdminUsageExportDialog } from './usage/AdminUsageExportDialog'
import { AdminUsageFilterBar, type AdminUsageTab } from './usage/AdminUsageFilterBar'
import { AdminUsageTable, adminUsageColumnChoices } from './usage/AdminUsageTable'
import { AdminUserRanking } from './usage/AdminUserRanking'
import { filtersFromRoute, type PickedOption } from './usage/adminUsageQuery'
import { useAdminUsage } from './usage/useAdminUsage'
import { useAdminUsageColumns } from './usage/useAdminUsageColumns'
import { useAdminUsageErrors } from './usage/useAdminUsageErrors'
import { useAdminUsageExport } from './usage/useAdminUsageExport'
import { useAdminUserRanking } from './usage/useAdminUserRanking'
import { UserBalanceHistoryDialog } from './users/UserBalanceHistoryDialog'

const TABS: AdminUsageTab[] = ['usage', 'errors', 'ranking']

// The storage key and the default are the Vue page's: a column hidden in one frontend is hidden in the other.
const ERROR_COLUMNS_KEY = 'usage-error-hidden-columns'
const ERROR_COLUMNS_HIDDEN_BY_DEFAULT = ['user_agent']

/**
 * Everyone's usage: totals, distributions and trend over a date range, and under them, by tab, the request
 * list, the failed requests and the users who used the most. One set of filters narrows all of it.
 * Port of views/admin/UsageView.vue.
 */
export function AdminUsagePage() {
  const { t } = useI18n()
  // Links from other pages open this one on a user and a date range.
  const usage = useAdminUsage(() => filtersFromRoute(window.location.search))
  const [tab, setTab] = useState<AdminUsageTab>('usage')
  const isUsage = tab === 'usage'
  const isErrors = tab === 'errors'
  const isRanking = tab === 'ranking'
  const errors = useAdminUsageErrors({ filters: usage.filters, isActive: isErrors, reloadTick: usage.reloadTick })
  const ranking = useAdminUserRanking({ filters: usage.filters, isActive: isRanking, reloadTick: usage.reloadTick })
  const [hiddenColumns, setHiddenColumns] = useAdminUsageColumns()
  const [hiddenErrorColumns, setHiddenErrorColumns] = useHiddenColumns(
    ERROR_COLUMNS_KEY,
    ERROR_COLUMNS_HIDDEN_BY_DEFAULT,
  )
  const [balanceUser, setBalanceUser] = useState<AdminUser | null>(null)
  const exporter = useAdminUsageExport()
  const [isCleanupOpen, setCleanupOpen] = useState(false)

  const showBalanceOf = async (userId: number) => {
    try {
      // Rows of deleted users are still listed; their history can still be read.
      setBalanceUser(await adminAPI.users.getById(userId, true))
    } catch {
      toast.error(t('admin.usage.failedToLoadUser'))
    }
  }

  // A user of the ranking is looked into in the request list.
  const narrowToUser = (user: PickedOption) => {
    // A key belongs to one user: the key filter does not outlive a change of user.
    usage.changeFilters({ user, apiKey: null })
    setTab('usage')
  }

  // The request list and the failed requests sit in one frame: what went wrong, the rows, and the pages.
  const list = isErrors ? errors : usage
  // Addresses are only looked up in bulk while their column shows.
  const usageIps = hiddenColumns.includes('ip_address') ? [] : usage.rows.map((row) => row.ip_address)
  const errorIps = hiddenErrorColumns.includes('client_ip') ? [] : errors.rows.map((row) => row.client_ip)

  return (
    <Page
      title={t('admin.usage.title')}
      description={t('admin.usage.description')}
      actions={
        <>
          <IconButton
            label={t('common.refresh')}
            tooltip={t('common.refresh')}
            icon={<Icon icon={ArrowPathIcon} />}
            isLoading={isRanking ? ranking.isLoading : list.isLoading}
            onClick={usage.refresh}
          />
          {/* The ranking always shows all of its columns. */}
          {isErrors && (
            <ColumnPicker
              columns={adminErrorColumnChoices(t)}
              hidden={hiddenErrorColumns}
              onChange={setHiddenErrorColumns}
            />
          )}
          {isUsage && (
            <>
              <ColumnPicker columns={adminUsageColumnChoices(t)} hidden={hiddenColumns} onChange={setHiddenColumns} />
              {/* Only the request list is exported, and only its records are cleaned up. */}
              <Button
                label={t('admin.usage.cleanup.button')}
                variant="destructive"
                icon={<Icon icon={TrashIcon} />}
                onClick={() => setCleanupOpen(true)}
              />
              <Button
                label={exporter.progress ? t('usage.exporting') : t('usage.exportCsv')}
                variant="primary"
                icon={<Icon icon={ArrowDownTrayIcon} />}
                isLoading={exporter.progress !== null}
                onClick={() => void exporter.exportCsv(usage.filters, usage.sort, usage.total)}
              />
            </>
          )}
        </>
      }>
      <VStack gap={4}>
        <UsageStatsCards stats={usage.stats} accountCost={usage.stats?.total_account_cost} />
        <UsageRangeBar usage={usage} />
        <AdminUsageCharts usage={usage} />

        <TabList value={tab} onChange={(value) => setTab(TABS.find((key) => key === value) ?? 'usage')} hasDivider>
          <Tab value="usage" label={t('usage.tabs.usage')} />
          <Tab value="errors" label={t('usage.tabs.errors')} />
          <Tab value="ranking" label={t('usage.tabs.ranking')} />
        </TabList>

        <Card>
          <VStack gap={4}>
            <AdminUsageFilterBar
              usage={usage}
              tab={tab}
              trailing={isRanking ? undefined : <IpGeoBatchButton ips={isErrors ? errorIps : usageIps} />}
            />

            {isRanking ? (
              <AdminUserRanking ranking={ranking} onPickUser={narrowToUser} />
            ) : (
              <VStack gap={4}>
                {list.hasFailed && (
                  <Banner status="error" title={isErrors ? t('usage.errors.failedToLoad') : t('usage.failedToLoad')} />
                )}

                {list.rows.length === 0 ? (
                  // A failed first load leaves only its banner.
                  (list.isLoading || !list.hasFailed) && (
                    <Center padding={8}>
                      {list.isLoading ? (
                        <Spinner label={t('common.loading')} />
                      ) : (
                        <EmptyState
                          isCompact
                          headingLevel={5}
                          icon={<Icon icon={InboxIcon} size="lg" color="secondary" />}
                          title={isErrors ? t('admin.ops.errorLog.noErrors') : t('usage.noRecords')}
                        />
                      )}
                    </Center>
                  )
                ) : isErrors ? (
                  <AdminUsageErrorsTable
                    rows={errors.rows}
                    hiddenColumns={hiddenErrorColumns}
                    sort={errors.sort}
                    onSortChange={errors.changeSort}
                    onUserClick={(userId) => void showBalanceOf(userId)}
                  />
                ) : (
                  <AdminUsageTable
                    rows={usage.rows}
                    hiddenColumns={hiddenColumns}
                    sort={usage.sort}
                    onSortChange={usage.changeSort}
                    onUserClick={(userId) => void showBalanceOf(userId)}
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
            )}
          </VStack>
        </Card>
      </VStack>

      <UserBalanceHistoryDialog
        isOpen={balanceUser !== null}
        user={balanceUser}
        hideActions
        onClose={() => setBalanceUser(null)}
      />
      {exporter.progress && <AdminUsageExportDialog progress={exporter.progress} onCancel={exporter.cancel} />}
      {isCleanupOpen && <AdminUsageCleanupDialog usage={usage} onClose={() => setCleanupOpen(false)} />}
    </Page>
  )
}
