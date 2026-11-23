import {
  memo,
  useContext,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import type { MonitorTimelinePoint } from '@/api/channelMonitor'
import { useI18n } from '~/i18n'
import { checkText, moveBar, TIMELINE_LENGTH, timelineBars, type TimelineBar } from './probeCards'
import { RefreshCountdown } from './refreshCountdown'

const OUTLINE_STYLE: CSSProperties = {
  outline: 'var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color)',
  outlineOffset: 'var(--border-width)',
  // Lifts the outline over the bars after this one.
  position: 'relative',
  zIndex: 1,
}

function barStyle(bar: TimelineBar, isOutlined: boolean): CSSProperties {
  return {
    height: 'var(--spacing-6)',
    minWidth: 0,
    borderRadius: 'var(--radius-inner)',
    // The bar rises from the bottom as far as the check went well. The place answers to the pointer over its
    // whole height, so a short bar is as easy to point at as a tall one.
    background: `linear-gradient(to top, ${bar.fill} ${bar.height}, transparent ${bar.height})`,
    // A place without a check recedes behind those that have one.
    opacity: bar.point ? undefined : 0.55,
    ...(isOutlined ? OUTLINE_STYLE : null),
  }
}

/** The place on the timeline an event happened at; null away from the bars. */
function placeAt(target: EventTarget | null): number | null {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-probe-bar]') : null
  return element ? Number(element.dataset.col) : null
}

/** When the page next refreshes by itself. Nothing while it does not. */
function NextUpdate() {
  const { t } = useI18n()
  const remaining = useContext(RefreshCountdown)
  if (remaining == null) return null
  return (
    <Text type="supporting" hasTabularNumbers>
      {t('monitorCommon.nextUpdateIn', { n: remaining })}
    </Text>
  )
}

/**
 * The latest checks of a monitor as a strip of bars, the newest last: the better a check went, the taller its
 * bar. Pointing at a bar, or moving to it with the arrow keys, tells when the check was, how it went and how
 * long the answer took. Tab stops at one bar of the strip, not at each.
 */
export const ProbeTimeline = memo(function ProbeTimeline({
  points,
  label,
}: {
  /** The checks as the server sends them, the newest first. */
  points: readonly MonitorTimelinePoint[] | null | undefined
  /** What the strip is, for a viewer who cannot see it. */
  label: string
}) {
  const { t } = useI18n()
  const bars = useMemo(() => timelineBars(points), [points])
  // The checks stand at the end of the strip: from the oldest of them to the last place.
  const first = bars.findIndex((bar) => bar.point)
  const last = bars.length - 1

  const [hovered, setHovered] = useState<number | null>(null)
  // The bar the keyboard was last on. Tab stops there.
  const [cursor, setCursor] = useState<number | null>(null)
  // Whether the keyboard is on that bar now. A bar focused by a press of the mouse does not count.
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false)
  // What "ago" is counted from: the moment the viewer last turned to a bar.
  const [now, setNow] = useState(() => Date.now())
  const activeRef = useRef<HTMLDivElement>(null)

  const hasCheck = (place: number | null): place is number => place != null && Boolean(bars[place]?.point)
  const focused = hasKeyboardFocus && hasCheck(cursor) ? cursor : null
  const candidate = hovered ?? focused
  const active = hasCheck(candidate) ? candidate : null
  const activePoint = active == null ? null : bars[active].point
  // Before the keyboard has been here, Tab stops at the newest check.
  const tabStop = hasCheck(cursor) ? cursor : first >= 0 ? last : null

  const onMouseMove = (event: MouseEvent<HTMLElement>) => {
    const place = placeAt(event.target)
    // Between two bars the pointer is still on the strip, and the tooltip stays with the bar it left.
    if (place == null || place === hovered) return
    setHovered(place)
    setNow(Date.now())
  }

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const place = placeAt(event.target)
    if (place == null) return
    setCursor(place)
    setNow(Date.now())
    // The browser marks focus that came from the keyboard.
    setHasKeyboardFocus(event.target.matches(':focus-visible'))
  }

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setHasKeyboardFocus(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const from = placeAt(event.target)
    if (from == null) return
    // A key pressed on a bar that the mouse focused puts the keyboard on it.
    setHasKeyboardFocus(true)
    const to = moveBar(from, event.key, first, last)
    if (to == null) return
    event.preventDefault()
    event.currentTarget.querySelector<HTMLElement>(`[data-probe-bar][data-col="${to}"]`)?.focus()
  }

  return (
    <VStack gap={1.5} hAlign="stretch">
      <HStack gap={2} hAlign="between" vAlign="center">
        <Text type="supporting">{t('monitorCommon.history60pts', { n: TIMELINE_LENGTH })}</Text>
        <NextUpdate />
      </HStack>
      <HStack
        gap={0.5}
        role="group"
        aria-label={label}
        data-probe-timeline
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        {bars.map((bar, place) => {
          const { point } = bar
          return (
            <StackItem
              key={place}
              ref={place === active ? activeRef : undefined}
              size="fill"
              role={point ? 'img' : undefined}
              aria-label={point ? checkText(point, now, t) : undefined}
              aria-hidden={point ? undefined : true}
              tabIndex={point ? (place === tabStop ? 0 : -1) : undefined}
              data-probe-bar={point ? point.status || 'unknown' : 'empty'}
              data-col={place}
              style={barStyle(bar, place === active || place === focused)}
            />
          )
        })}
      </HStack>
      <HStack gap={2} hAlign="between" aria-hidden>
        <Text type="supporting">{t('monitorCommon.past')}</Text>
        <Text type="supporting">{t('monitorCommon.now')}</Text>
      </HStack>
      {active != null && activePoint && (
        // A tooltip finds its place when it appears, so it appears anew for each bar.
        <Tooltip key={active} anchorRef={activeRef} isOpen content={checkText(activePoint, now, t)} />
      )}
    </VStack>
  )
})
