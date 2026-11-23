import { Badge } from '@astryxdesign/core/Badge'
import { HoverCard } from '@astryxdesign/core/HoverCard'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Switch } from '@astryxdesign/core/Switch'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { DocumentDuplicateIcon, PencilSquareIcon, PlayIcon, TrashIcon } from '@heroicons/react/24/outline'
import { MonitorQuota } from '~/components/monitor/MonitorQuota'
import {
  checkModeLabel,
  formatAvailability,
  formatLatency,
  formatLatencyMs,
  formatMonitorModel,
  providerLabel,
} from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import type { ChannelMonitor, ExtraModelStatus } from '~/lib/api/admin/channelMonitor'
import { MonitorStatusBadge } from './MonitorStatusBadge'
import { extraModelsOf } from './monitorQuery'
import type { MonitorActions } from './useMonitorActions'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<ChannelMonitor, keyof ChannelMonitor>

function NameCell({ row }: { row: Row }) {
  const { t } = useI18n()
  const keyProblem = t('admin.channelMonitor.apiKeyDecryptFailed')
  return (
    <HStack gap={1.5} vAlign="center">
      <Text type="supporting" color="primary" weight="medium" wordBreak="break-all">
        {row.name}
      </Text>
      {/* The server skips the checks of such a monitor until its key is entered again. */}
      {row.api_key_decrypt_failed && <StatusDot variant="error" label={keyProblem} tooltip={keyProblem} />}
    </HStack>
  )
}

function ProviderCell({ row }: { row: Row }) {
  const { t } = useI18n()
  const readsQuota = row.check_mode === 'quota' || row.check_mode === 'quota_probe'
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <Token size="sm" label={providerLabel(row.provider, t)} />
      <Badge variant={readsQuota ? 'info' : 'neutral'} label={checkModeLabel(row.check_mode, t)} />
    </HStack>
  )
}

function ExtraModels({ models }: { models: ExtraModelStatus[] }) {
  const { t } = useI18n()
  return (
    <VStack gap={2} hAlign="stretch">
      <Text type="supporting" color="primary" weight="medium">
        {t('monitorCommon.extraModelsHeader')}
      </Text>
      {models.map((model) => (
        <HStack key={model.model} gap={4} hAlign="between" vAlign="center">
          <Text type="code">{model.model}</Text>
          <HStack gap={2} vAlign="center">
            {model.status && <MonitorStatusBadge status={model.status} />}
            <Text type="supporting" hasTabularNumbers textWrap="nowrap">
              {formatLatencyMs(model.latency_ms, t)}
            </Text>
          </HStack>
        </HStack>
      ))}
    </VStack>
  )
}

function PrimaryModelCell({ row }: { row: Row }) {
  const { t } = useI18n()
  const extraModels = extraModelsOf(row)
  return (
    <VStack gap={1} hAlign="stretch">
      <HStack gap={1.5} vAlign="center" wrap="wrap">
        <Text type="code" wordBreak="break-all">
          {formatMonitorModel(row.primary_model, t)}
        </Text>
        {row.primary_status && <MonitorStatusBadge status={row.primary_status} />}
        {extraModels.length > 0 && (
          <HoverCard content={<ExtraModels models={extraModels} />} label={t('monitorCommon.extraModelsHeader')}>
            <Token size="sm" color="gray" label={t('monitorCommon.extraModelsCount', { n: extraModels.length })} />
          </HoverCard>
        )}
      </HStack>
      {row.latest_quota && <MonitorQuota snapshot={row.latest_quota} />}
    </VStack>
  )
}

function ActionsCell({
  row,
  actions,
  canRun,
  onEdit,
}: {
  row: Row
  actions: MonitorActions
  canRun: boolean
  onEdit?: (monitor: ChannelMonitor) => void
}) {
  const { t } = useI18n()
  const isRunning = actions.runningId === row.id
  const isDuplicating = actions.duplicatingIds.has(row.id)
  // A copy is made on the server from the stored key; a key that cannot be read cannot be copied.
  const cannotCopy = Boolean(row.api_key_decrypt_failed)
  const duplicateHint = cannotCopy
    ? t('admin.channelMonitor.duplicateKeyUnavailable')
    : isDuplicating
      ? t('admin.channelMonitor.duplicating')
      : t('admin.channelMonitor.duplicate')

  return (
    <HStack gap={0.5} vAlign="center">
      <IconButton
        label={t('admin.channelMonitor.runNow')}
        // Why nothing can be run is what the tab is called while the system does not probe.
        tooltip={canRun ? t('admin.channelMonitor.runNow') : t('channelMonitorV2.admin.tabV1History')}
        variant="ghost"
        size="sm"
        icon={<Icon icon={PlayIcon} />}
        isLoading={isRunning}
        isDisabled={!canRun || (actions.runningId !== null && !isRunning)}
        onClick={() => actions.runNow(row)}
      />
      <IconButton
        label={t('admin.channelMonitor.duplicate')}
        tooltip={duplicateHint}
        variant="ghost"
        size="sm"
        icon={<Icon icon={DocumentDuplicateIcon} />}
        isLoading={isDuplicating}
        isDisabled={cannotCopy}
        onClick={() => actions.duplicate(row)}
      />
      <IconButton
        label={t('common.edit')}
        tooltip={t('common.edit')}
        variant="ghost"
        size="sm"
        icon={<Icon icon={PencilSquareIcon} />}
        isDisabled={!onEdit}
        onClick={() => onEdit?.(row)}
      />
      <IconButton
        label={t('common.delete')}
        tooltip={t('common.delete')}
        variant="ghost"
        size="sm"
        icon={<Icon icon={TrashIcon} />}
        onClick={() => actions.askToDelete(row)}
      />
    </HStack>
  )
}

/**
 * The monitors of the page on show, one a row: what is checked and how, how the last check went, and what
 * can be done to the monitor. Port of the table of views/admin/ChannelMonitorView.vue.
 */
export function MonitorTable({
  rows,
  actions,
  canRun,
  onEdit,
}: {
  rows: ChannelMonitor[]
  actions: MonitorActions
  /** Whether a check can be run by hand: only while the system probes. */
  canRun: boolean
  onEdit?: (monitor: ChannelMonitor) => void
}) {
  const { t } = useI18n()

  // The three columns that share the spare width keep their proportions, so the narrowest the table gets is
  // set by the column whose least width is largest for its share. Each asks for 100px a share here, which
  // lets the whole table show without scrolling sideways on a 1280px screen.
  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: t('admin.channelMonitor.columns.name'),
      width: proportional(1.5, { minWidth: 150 }),
      renderCell: (row) => <NameCell row={row} />,
    },
    {
      key: 'provider',
      header: t('admin.channelMonitor.columns.provider'),
      width: proportional(1.3, { minWidth: 130 }),
      renderCell: (row) => <ProviderCell row={row} />,
    },
    {
      key: 'primary_model',
      header: t('admin.channelMonitor.columns.primaryModel'),
      width: proportional(2, { minWidth: 200 }),
      renderCell: (row) => <PrimaryModelCell row={row} />,
    },
    {
      key: 'availability_7d',
      header: t('admin.channelMonitor.columns.availability7d'),
      align: 'end',
      width: pixel(120),
      renderCell: (row) => (
        <Text type="supporting" color="primary" hasTabularNumbers>
          {formatAvailability(row)}
        </Text>
      ),
    },
    {
      key: 'primary_latency_ms',
      header: t('admin.channelMonitor.columns.latency'),
      align: 'end',
      width: pixel(110),
      renderCell: (row) => (
        <Text type="supporting" color="primary" hasTabularNumbers>
          {formatLatency(row.primary_latency_ms, t)}
        </Text>
      ),
    },
    {
      key: 'enabled',
      header: t('admin.channelMonitor.columns.enabled'),
      width: pixel(88),
      renderCell: (row) => (
        <Switch
          // Each switch is named after its monitor: "enabled" alone would be the name of every one of them.
          label={`${t('admin.channelMonitor.columns.enabled')}: ${row.name}`}
          isLabelHidden
          size="sm"
          value={row.enabled}
          isLoading={actions.togglingIds.has(row.id)}
          onChange={(enabled) => actions.setEnabled(row, enabled)}
        />
      ),
    },
    {
      key: 'actions',
      header: t('admin.channelMonitor.columns.actions'),
      width: pixel(152),
      renderCell: (row) => <ActionsCell row={row} actions={actions} canRun={canRun} onEdit={onEdit} />,
    },
  ]

  return (
    <Table<Row> data={rows} columns={columns} idKey={(row) => row.id} density="compact" dividers="rows" hasHover />
  )
}
