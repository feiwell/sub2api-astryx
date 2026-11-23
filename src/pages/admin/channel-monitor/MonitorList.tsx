import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { PlusIcon, SignalIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import type { ChannelMonitor } from '~/lib/api/admin/channelMonitor'
import { MonitorFilterBar } from './MonitorFilterBar'
import { MonitorFormDialog } from './MonitorFormDialog'
import { MonitorRunResultDialog } from './MonitorRunResultDialog'
import { MonitorTable } from './MonitorTable'
import { MonitorTemplateManagerDialog } from './MonitorTemplateManagerDialog'
import { useChannelMonitors } from './useChannelMonitors'
import { useMonitorActions } from './useMonitorActions'

/**
 * The monitors that probe: each checks one channel on a schedule. Here they are narrowed, created, edited,
 * switched on and off, checked by hand, copied and deleted, and the request templates they share are managed.
 */
export function MonitorList({ canRun }: { canRun: boolean }) {
  const { t } = useI18n()
  const list = useChannelMonitors()
  const actions = useMonitorActions(list)
  // The monitor in the form: one of the list, or a new one.
  const [editing, setEditing] = useState<ChannelMonitor | 'new' | null>(null)
  const [isManagingTemplates, setManagingTemplates] = useState(false)
  const loadError = t('admin.channelMonitor.loadError')
  const isNarrowed = Boolean(list.filters.search || list.filters.provider || list.filters.enabled)

  return (
    <>
      <Card>
        <VStack gap={4}>
          <MonitorFilterBar
            list={list}
            onCreate={() => setEditing('new')}
            onManageTemplates={() => setManagingTemplates(true)}
          />

          {list.failure && (
            // What the server said is the detail, when it said anything of its own.
            <Banner
              status="error"
              title={loadError}
              description={list.failure === loadError ? undefined : list.failure}
            />
          )}

          {list.items.length === 0 ? (
            // A failed first load leaves only its banner.
            (list.isLoading || !list.failure) && (
              <Center padding={8}>
                {list.isLoading ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <EmptyState
                    isCompact
                    headingLevel={5}
                    icon={<Icon icon={SignalIcon} size="lg" color="secondary" />}
                    title={t('admin.channelMonitor.noMonitorsYet')}
                    // "Create the first one" is only true while nothing narrows the list.
                    description={isNarrowed ? undefined : t('admin.channelMonitor.createFirstMonitor')}
                    actions={
                      isNarrowed ? undefined : (
                        <Button
                          label={t('admin.channelMonitor.createButton')}
                          variant="primary"
                          icon={<Icon icon={PlusIcon} />}
                          onClick={() => setEditing('new')}
                        />
                      )
                    }
                  />
                )}
              </Center>
            )
          ) : (
            <MonitorTable rows={list.items} actions={actions} canRun={canRun} onEdit={setEditing} />
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

      {editing && (
        <MonitorFormDialog
          monitor={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={list.reload}
        />
      )}

      {isManagingTemplates && (
        <MonitorTemplateManagerDialog onClose={() => setManagingTemplates(false)} onChanged={list.reload} />
      )}

      {actions.runResults && (
        <MonitorRunResultDialog results={actions.runResults} onClose={actions.dismissRunResults} />
      )}

      {actions.toDelete && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) actions.cancelDelete()
          }}
          title={t('common.delete')}
          description={t('admin.channelMonitor.deleteConfirm', { name: actions.toDelete.name })}
          actionLabel={t('common.delete')}
          actionVariant="destructive"
          cancelLabel={t('common.cancel')}
          isActionLoading={actions.isDeleting}
          onAction={actions.confirmDelete}
        />
      )}
    </>
  )
}
