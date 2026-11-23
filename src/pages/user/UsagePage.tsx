import { useEffect, useState } from 'react'
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
import { ArrowDownTrayIcon, ArrowPathIcon, InboxIcon } from '@heroicons/react/24/outline'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'
import { Page } from '~/components/common/Page'
import { ColumnPicker, useHiddenColumns } from '~/components/usage/ColumnPicker'
import { IpGeoBatchButton } from '~/components/usage/IpGeo'
import { UsageLogTable, usageLogColumnChoices } from '~/components/usage/UsageLogTable'
import { UsageStatsCards } from '~/components/usage/UsageStatsCards'
import { UserErrorRequests, userErrorColumnChoices } from '~/components/usage/UserErrorRequests'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import { UsageCharts, UsageRangeBar } from './usage/UsageCharts'
import { UsageErrorFilterBar, UsageFilterBar } from './usage/UsageFilterBar'
import { useUsageErrors } from './usage/useUsageErrors'
import { useUsageExport } from './usage/useUsageExport'
import { useUsageLogs } from './usage/useUsageLogs'

type TabKey = 'usage' | 'errors'

// The storage keys and the defaults are the Vue page's: a column hidden in one frontend is hidden in the other.
const USAGE_COLUMNS_KEY = 'user-usage-hidden-columns'
const ERROR_COLUMNS_KEY = 'user-usage-error-hidden-columns'
const HIDDEN_BY_DEFAULT = ['user_agent']

/**
 * The user's own usage: totals, distributions and trend over a date range, the request list under them, and,
 * where the site allows it, the list of the user's failed requests. Port of views/user/UsageView.vue.
 */
export function UsagePage() {
  const { t } = useI18n()
  const publicSettings = useAppStore((state) => state.publicSettings)
  const canViewErrors = publicSettings?.allow_user_view_error_requests ?? false
  const [tab, setTab] = useState<TabKey>('usage')
  // The site can stop showing failed requests while their tab is open; the page then falls back to the usage list.
  const isErrors = canViewErrors && tab === 'errors'

  const usage = useUsageLogs()
  const errors = useUsageErrors({ range: usage.filters.range, isActive: isErrors, reloadTick: usage.reloadTick })
  const { isExporting, exportCsv } = useUsageExport()
  const [hiddenUsageColumns, setHiddenUsageColumns] = useHiddenColumns(USAGE_COLUMNS_KEY, HIDDEN_BY_DEFAULT)
  const [hiddenErrorColumns, setHiddenErrorColumns] = useHiddenColumns(ERROR_COLUMNS_KEY, HIDDEN_BY_DEFAULT)

  useEffect(() => {
    void useAppStore.getState().fetchPublicSettings()
  }, [])

  // Both lists sit in one frame: filters, what went wrong, the rows, and the pages.
  const list = isErrors ? errors : usage
  // Addresses are only looked up in bulk while their column shows.
  const usageIps = hiddenUsageColumns.includes('ip_address') ? [] : usage.rows.map((row) => row.ip_address)
  const errorIps = hiddenErrorColumns.includes('client_ip') ? [] : errors.rows.map((row) => row.client_ip)
  const lookUpAll = <IpGeoBatchButton ips={isErrors ? errorIps : usageIps} />

  return (
    <Page
      title={t('usage.title')}
      description={t('usage.description')}
      actions={
        <>
          <IconButton
            label={t('common.refresh')}
            tooltip={t('common.refresh')}
            icon={<Icon icon={ArrowPathIcon} />}
            isLoading={list.isLoading}
            onClick={usage.refresh}
          />
          {isErrors ? (
            <ColumnPicker
              columns={userErrorColumnChoices(t)}
              hidden={hiddenErrorColumns}
              onChange={setHiddenErrorColumns}
            />
          ) : (
            <ColumnPicker
              columns={usageLogColumnChoices(t)}
              hidden={hiddenUsageColumns}
              onChange={setHiddenUsageColumns}
            />
          )}
          {!isErrors && (
            <Button
              label={isExporting ? t('usage.exporting') : t('usage.exportCsv')}
              variant="primary"
              icon={<Icon icon={ArrowDownTrayIcon} />}
              isLoading={isExporting}
              onClick={() => void exportCsv(usage.filters, usage.sort, usage.total)}
            />
          )}
        </>
      }>
      <VStack gap={4}>
        <UsageStatsCards stats={usage.stats} hasStruckStandardCost />
        <UsageRangeBar usage={usage} />
        <UsageCharts usage={usage} />

        {canViewErrors && (
          <TabList
            value={isErrors ? 'errors' : 'usage'}
            onChange={(value) => setTab(value === 'errors' ? 'errors' : 'usage')}
            hasDivider>
            <Tab value="usage" label={t('usage.tabs.usage')} />
            <Tab value="errors" label={t('usage.tabs.errors')} />
          </TabList>
        )}

        <Card>
          <VStack gap={4}>
            {isErrors ? (
              <UsageErrorFilterBar
                errors={errors}
                apiKeys={usage.apiKeys}
                onReset={() => {
                  usage.reset()
                  errors.reset()
                }}
                trailing={lookUpAll}
              />
            ) : (
              <UsageFilterBar
                usage={usage}
                hasBillingType={resolveFeatureFlag(publicSettings, FeatureFlags.subscription)}
                trailing={lookUpAll}
              />
            )}

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
                      title={isErrors ? t('usage.errors.empty') : t('usage.noRecords')}
                    />
                  )}
                </Center>
              )
            ) : isErrors ? (
              <UserErrorRequests
                rows={errors.rows}
                hiddenColumns={hiddenErrorColumns}
                sort={errors.sort}
                onSortChange={errors.changeSort}
              />
            ) : (
              <UsageLogTable
                rows={usage.rows}
                hiddenColumns={hiddenUsageColumns}
                sort={usage.sort}
                onSortChange={usage.changeSort}
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
      </VStack>
    </Page>
  )
}
