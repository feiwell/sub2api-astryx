import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/Stack'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { status, type UserMonitorDetail, type UserMonitorModelDetail, type UserMonitorView } from '@/api/channelMonitor'
import { extractApiErrorMessage } from '@/utils/apiError'
import { monitorStatusVariant } from '~/components/monitor/monitorStatus'
import { formatLatency, formatMonitorModel, formatPercent, statusLabel } from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'

const DIALOG_WIDTH = 960
// The headings of the latency columns are the longest, with the unit in them: those columns get the most room.
const LATENCY_WIDTH = proportional(1.5, { minWidth: 150 })
const SHARE_WIDTH = proportional(1.1, { minWidth: 115 })

interface ModelRow extends Record<string, unknown> {
  model: string
  entry: UserMonitorModelDetail
}

/** What one try at fetching the figures gave. */
interface Answer {
  attempt: number
  detail: UserMonitorDetail | null
  error: unknown
}

/**
 * The figures of every model a monitor checks: how the latest check went and how often checks passed over
 * seven, fifteen and thirty days. They are fetched when the dialog is made, so each opening should be its own
 * dialog (give it a `key`) and shows figures of that moment. When they cannot be fetched the dialog says why
 * and offers to try again.
 */
export function ProbeDetailDialog({
  monitor,
  isOpen,
  onClose,
}: {
  monitor: Pick<UserMonitorView, 'id' | 'name'>
  isOpen: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    let isCurrent = true
    status(monitor.id)
      .then((detail) => {
        if (isCurrent) setAnswer({ attempt, detail, error: null })
      })
      .catch((error: unknown) => {
        if (isCurrent) setAnswer({ attempt, detail: null, error })
      })
    return () => {
      isCurrent = false
    }
  }, [monitor.id, attempt])

  // An answer to an earlier try is not shown while the next one is on its way.
  const current = answer?.attempt === attempt ? answer : null
  const rows = useMemo<ModelRow[]>(
    () => (current?.detail?.models || []).map((entry) => ({ model: entry.model, entry })),
    [current],
  )
  const failure = t('channelStatus.detailLoadError')
  const reason = current && !current.detail ? extractApiErrorMessage(current.error, failure) : ''
  const close = (open: boolean) => {
    if (!open) onClose()
  }

  const figure = (text: string) => <Text hasTabularNumbers>{text}</Text>
  // The server sends 0 for a model that was never checked, but it has no share of passed checks, not 0%.
  const share = (entry: UserMonitorModelDetail, percent: number | null | undefined) =>
    figure(formatPercent(entry.latest_status ? percent : null))
  const columns: TableColumn<ModelRow>[] = [
    {
      key: 'model',
      header: t('channelStatus.detailColumns.model'),
      width: proportional(1.5, { minWidth: 150 }),
      renderCell: ({ entry }) => <Text weight="medium">{formatMonitorModel(entry.model, t)}</Text>,
    },
    {
      key: 'latest_status',
      header: t('channelStatus.detailColumns.latestStatus'),
      width: proportional(1, { minWidth: 100 }),
      renderCell: ({ entry }) => (
        <Badge variant={monitorStatusVariant(entry.latest_status)} label={statusLabel(entry.latest_status, t)} />
      ),
    },
    {
      key: 'latest_latency_ms',
      header: t('channelStatus.detailColumns.latestLatency'),
      width: LATENCY_WIDTH,
      align: 'end',
      renderCell: ({ entry }) => figure(formatLatency(entry.latest_latency_ms, t)),
    },
    {
      key: 'availability_7d',
      header: t('channelStatus.detailColumns.availability7d'),
      width: SHARE_WIDTH,
      align: 'end',
      renderCell: ({ entry }) => share(entry, entry.availability_7d),
    },
    {
      key: 'availability_15d',
      header: t('channelStatus.detailColumns.availability15d'),
      width: SHARE_WIDTH,
      align: 'end',
      renderCell: ({ entry }) => share(entry, entry.availability_15d),
    },
    {
      key: 'availability_30d',
      header: t('channelStatus.detailColumns.availability30d'),
      width: SHARE_WIDTH,
      align: 'end',
      renderCell: ({ entry }) => share(entry, entry.availability_30d),
    },
    {
      key: 'avg_latency_7d_ms',
      header: t('channelStatus.detailColumns.avgLatency7d'),
      width: LATENCY_WIDTH,
      align: 'end',
      renderCell: ({ entry }) => figure(formatLatency(entry.avg_latency_7d_ms, t)),
    },
  ]

  return (
    <Dialog isOpen={isOpen} onOpenChange={close} width={DIALOG_WIDTH}>
      <Layout
        header={<DialogHeader title={monitor.name || t('channelStatus.detailTitle')} onOpenChange={close} />}
        content={
          <LayoutContent isScrollable>
            {!current ? (
              <Center padding={8}>
                <Spinner />
              </Center>
            ) : current.detail ? (
              <Table data={rows} columns={columns} idKey="model" density="compact" />
            ) : (
              <Banner
                status="error"
                title={failure}
                description={reason !== failure ? reason : undefined}
                endContent={
                  <Button
                    size="sm"
                    variant="secondary"
                    label={t('common.refresh')}
                    onClick={() => setAttempt((count) => count + 1)}
                  />
                }
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('channelStatus.closeDetail')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
