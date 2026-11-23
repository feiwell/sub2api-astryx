import { memo, type CSSProperties, type RefObject } from 'react'
import { HStack, StackItem } from '@astryxdesign/core/Stack'
import type { HealthDisplayMode } from '@/features/channel-monitor-v2/monitorFormat'
import { useI18n } from '~/i18n'
import type { PulseSlot } from './pulseAxis'
import { healthFill, UNKNOWN_FILL } from './pulseScale'
import { cellName } from './pulseText'

const OUTLINE_STYLE: CSSProperties = {
  outline: 'var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color)',
  outlineOffset: 'var(--border-width)',
  // Lifts the outline over the blocks after this one.
  position: 'relative',
  zIndex: 1,
}

function blockStyle(slot: PulseSlot, healthMode: HealthDisplayMode, isOutlined: boolean): CSSProperties {
  const { bucket } = slot
  return {
    height: 'var(--spacing-4)',
    minWidth: 0,
    borderRadius: 'var(--radius-inner)',
    background: bucket ? healthFill(bucket.health, healthMode, bucket.metrics.request_count) : UNKNOWN_FILL,
    // An interval without traffic recedes behind those that were measured.
    opacity: bucket ? undefined : 0.55,
    ...(isOutlined ? OUTLINE_STYLE : null),
  }
}

/**
 * The intervals of one row as a strip of blocks, each filled by how the row scored in it. The blocks share
 * the width of the strip, so fewer of them are wider.
 *
 * The matrix listens for the pointer and the keyboard on all strips at once and finds the block by its
 * `data-row` and `data-col`; `activeStart`, `focusStart` and `tabStart` name the block its tooltip is on, the
 * block the keyboard is on and the block Tab stops at, when they are in this row. The first two are outlined:
 * the pointer can be on one block while the keyboard is on another.
 */
export const PulseTrack = memo(function PulseTrack({
  row,
  label,
  slots,
  ranges,
  healthMode,
  activeStart,
  focusStart,
  tabStart,
  activeRef,
}: {
  row: number
  label: string
  slots: readonly PulseSlot[]
  /** The time each block covers, in the order of `slots`. */
  ranges: readonly string[]
  healthMode: HealthDisplayMode
  activeStart: string | null
  focusStart: string | null
  tabStart: string | null
  /** Receives the active block, for the tooltip to point at. */
  activeRef: RefObject<HTMLDivElement | null>
}) {
  const { t } = useI18n()

  return (
    <HStack gap={0.5} vAlign="center" role="group" aria-label={label} data-pulse-track>
      {slots.map((slot, col) => {
        const isActive = slot.start === activeStart
        return (
          <StackItem
            key={slot.start}
            ref={isActive ? activeRef : undefined}
            size="fill"
            role="img"
            aria-label={cellName(slot.bucket, ranges[col], healthMode, t)}
            tabIndex={slot.start === tabStart ? 0 : -1}
            data-pulse-cell={slot.bucket ? 'data' : 'empty'}
            data-row={row}
            data-col={col}
            style={blockStyle(slot, healthMode, isActive || slot.start === focusStart)}
          />
        )
      })}
    </HStack>
  )
})
