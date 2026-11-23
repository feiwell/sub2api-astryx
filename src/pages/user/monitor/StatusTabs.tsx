import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import type { MonitorErrorRow, MonitorModelRow, MonitorUserRow } from '@/api/channelMonitorV2'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { StatusErrorsList } from './StatusErrorsList'
import { StatusModelsTable } from './StatusModelsTable'
import type { StatusTab } from './statusQuery'
import { StatusUsersTable } from './StatusUsersTable'

/**
 * The breakdown under the figures: by model, by kind of error, and by user. Rows already on screen stay while
 * newer ones are fetched, and stay when fetching fails.
 */
export function StatusTabs({
  tab,
  onTabChange,
  modelRows,
  errorRows,
  userRows,
  isLoading,
  loadError,
  isBootstrapping,
  isAdmin,
  canSeeUsers,
  showThroughput,
  onDrill,
  onRetry,
}: {
  tab: StatusTab
  onTabChange: (tab: StatusTab) => void
  modelRows: MonitorModelRow[]
  errorRows: MonitorErrorRow[]
  userRows: MonitorUserRow[]
  isLoading: boolean
  loadError: unknown
  isBootstrapping: boolean
  isAdmin: boolean
  canSeeUsers: boolean
  showThroughput: boolean
  onDrill: (row: MonitorModelRow) => void
  onRetry: () => void
}) {
  const { t } = useI18n()
  const isEmpty = (tab === 'models' ? modelRows : tab === 'errors' ? errorRows : userRows).length === 0
  const hasFailed = loadError != null
  const failure = t('channelMonitorV2.detailLoadFailed')
  const reason = hasFailed ? extractApiErrorMessage(loadError, failure) : ''

  return (
    <Card padding={4}>
      <VStack gap={4} hAlign="stretch">
        <HStack gap={3} vAlign="center">
          <TabList
            value={tab}
            onChange={(value) => onTabChange(value as StatusTab)}
            hasDivider
            aria-label={t('channelMonitorV2.tabs.aria')}
          >
            <Tab value="models" label={t('channelMonitorV2.tabs.models')} />
            <Tab value="errors" label={t('channelMonitorV2.tabs.errors')} />
            {canSeeUsers && <Tab value="users" label={t('channelMonitorV2.tabs.users')} />}
          </TabList>
          {isLoading && !isEmpty && <Spinner size="sm" />}
        </HStack>

        {hasFailed && (
          <Banner
            status="error"
            title={failure}
            description={reason !== failure ? reason : undefined}
            endContent={
              <Button size="sm" variant="secondary" label={t('common.refresh')} isLoading={isLoading} onClick={onRetry} />
            }
          />
        )}

        {!isEmpty ? (
          tab === 'models' ? (
            <StatusModelsTable rows={modelRows} showThroughput={showThroughput} onDrill={onDrill} />
          ) : tab === 'errors' ? (
            <StatusErrorsList rows={errorRows} isAdmin={isAdmin} />
          ) : (
            <StatusUsersTable rows={userRows} showThroughput={showThroughput} />
          )
        ) : isLoading ? (
          <Center padding={8}>
            <Spinner />
          </Center>
        ) : (
          !hasFailed && (
            <EmptyState
              title={t(isBootstrapping ? 'channelMonitorV2.bootstrap.title' : 'channelMonitorV2.empty.title')}
              description={t(
                isBootstrapping ? 'channelMonitorV2.bootstrap.description' : 'channelMonitorV2.empty.description',
              )}
            />
          )
        )}
      </VStack>
    </Card>
  )
}
