import { useCallback, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { MonitorCoverage, MonitorMatrixRow } from '@/api/channelMonitorV2'
import {
  formatMonitorMs,
  formatMonitorPercent,
  formatMonitorTokensPerSecond,
  type HealthDisplayMode,
} from '@/features/channel-monitor-v2/monitorFormat'
import { clientXRatio, sliceByZoom } from '@/features/channel-monitor-v2/monitorZoom'
import { healthVariant } from '~/components/monitor/monitorStatus'
import { useI18n } from '~/i18n'
import { alignRows, bucketRange, bucketStarts, moveCell, timeFormats, zoomScope, type PulseSlot } from './pulseAxis'
import { HealthSwatch, PulseLegend } from './PulseLegend'
import { healthFill } from './pulseScale'
import { bucketLines, emptyLines, rowKey, rowLabel, successRateText } from './pulseText'
import { PulseTrack } from './PulseTrack'
import { exactTokensPerSecond, healthLegendKey, isMissingValue, latencyDetail } from './statusFormat'
import { TrendCardHeader } from './TrendCardHeader'
import { useAxisZoom } from './useAxisZoom'

interface MatrixTableRow extends Record<string, unknown> {
  key: string
  index: number
  label: string
  row: MonitorMatrixRow
  slots: PulseSlot[]
}

/** One block of the matrix, named by its row and the start of its interval so it survives a refresh and a zoom. */
interface BlockId {
  rowKey: string
  start: string
}

function isSameBlock(a: BlockId | null, b: BlockId | null): boolean {
  return a?.rowKey === b?.rowKey && a?.start === b?.start
}

/** How far across a strip of blocks the wheel was turned; null away from the strips, where it scrolls the page. */
function trackRatio(event: WheelEvent): number | null {
  const track = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pulse-track]') : null
  return track ? clientXRatio(event.clientX, track) : null
}

/**
 * How each combination of platform, group and model fared over the chosen range: a row with its figures for
 * the whole range and a strip of blocks, one for each interval, filled by the health measure the viewer chose.
 *
 * Pointing at a block, or moving to it with the arrow keys, shows what was measured in it. Turning the wheel
 * over the blocks zooms into the range around the pointer.
 */
export function StatusPulseMatrix({
  rows,
  coverage,
  healthMode,
  showThroughput,
}: {
  rows: MonitorMatrixRow[]
  coverage: MonitorCoverage
  healthMode: HealthDisplayMode
  /** Whether the viewer may see how much traffic there is. */
  showThroughput: boolean
}) {
  const { t, locale } = useI18n()
  const { zoom, isZoomed, resetZoom, hostRef } = useAxisZoom(zoomScope(coverage), trackRatio)

  const allStarts = useMemo(() => bucketStarts(coverage), [coverage])
  const starts = useMemo(() => sliceByZoom(allStarts, zoom), [allStarts, zoom])
  const formats = useMemo(() => timeFormats(locale), [locale])
  const ranges = useMemo(
    () => starts.map((start) => bucketRange(start, coverage.bucket_seconds, formats)),
    [starts, coverage.bucket_seconds, formats],
  )
  const otherModels = t('channelMonitorV2.otherModels')
  const data = useMemo<MatrixTableRow[]>(() => {
    const slotsByRow = alignRows(rows, starts)
    return rows.map((row, index) => ({ key: rowKey(row), index, label: rowLabel(row, otherModels), row, slots: slotsByRow[index] }))
  }, [rows, starts, otherModels])

  const [hovered, setHovered] = useState<BlockId | null>(null)
  // The block the keyboard was last on. Tab stops there, so the matrix is one stop and not one for every block.
  const [cursor, setCursor] = useState<BlockId | null>(null)
  // Whether the keyboard is on that block now. A block focused by a press of the mouse does not count: it
  // shows what it holds while it is pointed at, like any other, and lets go when the pointer leaves.
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false)
  const activeRef = useRef<HTMLDivElement>(null)

  const isOnAxis = (block: BlockId | null) =>
    Boolean(block && starts.includes(block.start) && data.some((item) => item.key === block.rowKey))
  const focused = hasKeyboardFocus ? cursor : null
  const candidate = hovered ?? focused
  const active = isOnAxis(candidate) ? candidate : null
  const tabStop: BlockId | null = isOnAxis(cursor) ? cursor : data.length && starts.length ? { rowKey: data[0].key, start: starts[0] } : null

  const blockAt = useCallback(
    (target: EventTarget | null): BlockId | null => {
      const element = target instanceof Element ? target.closest<HTMLElement>('[data-pulse-cell]') : null
      if (!element) return null
      const item = data[Number(element.dataset.row)]
      const start = starts[Number(element.dataset.col)]
      return item && start ? { rowKey: item.key, start } : null
    },
    [data, starts],
  )

  const onMouseMove = (event: MouseEvent<HTMLElement>) => {
    const block = blockAt(event.target)
    if (block) {
      if (!isSameBlock(block, hovered)) setHovered(block)
      return
    }
    // Between two blocks the pointer is still on the strip, and the tooltip stays with the block it left.
    const isOnTrack = event.target instanceof Element && event.target.closest('[data-pulse-track]')
    if (hovered && !isOnTrack) setHovered(null)
  }

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const block = blockAt(event.target)
    if (!block) return
    setCursor(block)
    // The browser marks focus that came from the keyboard.
    setHasKeyboardFocus(event.target.matches(':focus-visible'))
  }

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!blockAt(event.relatedTarget)) setHasKeyboardFocus(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pulse-cell]') : null
    if (!element) return
    // A key pressed on a block that the mouse focused puts the keyboard on it.
    setHasKeyboardFocus(true)
    const from = { row: Number(element.dataset.row), col: Number(element.dataset.col) }
    const to = moveCell(from, event.key, data.length, starts.length)
    if (!to) return
    event.preventDefault()
    event.currentTarget.querySelector<HTMLElement>(`[data-pulse-cell][data-row="${to.row}"][data-col="${to.col}"]`)?.focus()
  }

  const activeCol = active ? starts.indexOf(active.start) : -1
  const activeSlot = active ? data.find((item) => item.key === active.rowKey)?.slots[activeCol] : undefined
  const activeLines = !activeSlot
    ? []
    : activeSlot.bucket
      ? bucketLines(activeSlot.bucket, ranges[activeCol], { healthMode, showThroughput, t })
      : emptyLines(ranges[activeCol], t)

  const figure = (text: string, detail?: string) => {
    const value = <Text hasTabularNumbers>{text}</Text>
    return detail && !isMissingValue(detail) ? <Tooltip content={detail}>{value}</Tooltip> : value
  }

  const columns: TableColumn<MatrixTableRow>[] = [
    {
      key: 'dimension',
      header: t('channelMonitorV2.matrix.dimension'),
      width: proportional(1.6, { minWidth: 180 }),
      renderCell: ({ row, label }) => (
        <HStack gap={2} vAlign="center">
          <HealthSwatch
            fill={healthFill(row.health, healthMode, row.metrics.request_count)}
            label={t(healthLegendKey(healthVariant(row.health, healthMode, row.metrics.request_count)))}
          />
          <Text weight="semibold" maxLines={2}>
            {label}
          </Text>
        </HStack>
      ),
    },
    {
      key: 'success',
      header: t('channelMonitorV2.metrics.successRate'),
      align: 'end',
      width: proportional(0.7, { minWidth: 80 }),
      renderCell: ({ row }) => figure(successRateText(row.metrics, showThroughput)),
    },
    {
      key: 'ttft',
      header: t('channelMonitorV2.metrics.ttft'),
      align: 'end',
      width: proportional(0.7, { minWidth: 80 }),
      renderCell: ({ row }) => figure(formatMonitorMs(row.metrics.ttft.p50_ms), latencyDetail(row.metrics.ttft)),
    },
    ...(showThroughput
      ? [
          {
            key: 'tps',
            header: t('channelMonitorV2.metrics.tps'),
            align: 'end' as const,
            width: proportional(0.7, { minWidth: 80 }),
            renderCell: ({ row }: MatrixTableRow) =>
              figure(formatMonitorTokensPerSecond(row.metrics.tpm), exactTokensPerSecond(row.metrics.tpm, locale)),
          },
        ]
      : []),
    {
      key: 'cache',
      header: t('channelMonitorV2.metrics.cacheRate'),
      align: 'end',
      width: proportional(0.7, { minWidth: 80 }),
      renderCell: ({ row }) => figure(formatMonitorPercent(row.metrics.cache_rate)),
    },
    {
      key: 'pulse',
      // The ends of the visible range stand in for a time axis.
      header: (
        <HStack gap={3} hAlign="between" data-pulse-axis>
          <Text type="inherit" color="inherit">
            {starts.length > 0 ? formats.axis.format(new Date(starts[0])) : ''}
          </Text>
          <Text type="inherit" color="inherit">
            {starts.length > 0 ? formats.axis.format(new Date(starts[starts.length - 1])) : ''}
          </Text>
        </HStack>
      ),
      width: proportional(4, { minWidth: 320 }),
      renderCell: ({ key, index, label, slots }) => (
        <PulseTrack
          row={index}
          label={label}
          slots={slots}
          ranges={ranges}
          healthMode={healthMode}
          activeStart={active?.rowKey === key ? active.start : null}
          focusStart={focused?.rowKey === key ? focused.start : null}
          tabStart={tabStop?.rowKey === key ? tabStop.start : null}
          activeRef={activeRef}
        />
      ),
    },
  ]

  return (
    <Card padding={6}>
      {/*
        The pointer and the keyboard are listened for here, on the blocks of all rows at once. The table stands
        between the head and the legend: as the first or last thing in its container it would spread into the
        padding of the card, over them.
      */}
      <VStack
        ref={hostRef}
        gap={4}
        hAlign="stretch"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        <TrendCardHeader
          title={t('channelMonitorV2.matrix.title')}
          description={t('channelMonitorV2.matrix.description')}
          bucketSeconds={coverage.bucket_seconds}
          hint={t('channelMonitorV2.matrix.wheelZoomX')}
          resetLabel={t('channelMonitorV2.matrix.resetZoom')}
          isZoomed={isZoomed}
          onResetZoom={resetZoom}
        />
        {data.length === 0 ? (
          <EmptyState title={t('channelMonitorV2.matrix.emptyTitle')} description={t('channelMonitorV2.empty.description')} />
        ) : (
          <Table data={data} columns={columns} idKey="key" density="compact" />
        )}
        <PulseLegend />
        {active && activeSlot && (
          <Tooltip
            // A tooltip finds its place when it appears, so it appears anew for each block and after each zoom.
            key={`${active.rowKey}|${active.start}|${zoom.span}|${zoom.offset}`}
            anchorRef={activeRef}
            isOpen
            content={
              <VStack gap={0.5}>
                {activeLines.map((line, index) => (
                  <Text key={index} type="inherit" color="inherit" weight={index === 0 ? 'semibold' : undefined}>
                    {line}
                  </Text>
                ))}
              </VStack>
            }
          />
        )}
      </VStack>
    </Card>
  )
}
