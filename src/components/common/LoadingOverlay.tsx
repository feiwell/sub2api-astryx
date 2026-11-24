import { Spinner } from '@astryxdesign/core/Spinner'

/**
 * A busy overlay for a list card whose data is being replaced. The card must be
 * positioned (`position: relative`); the overlay covers it and blocks clicks so
 * a refresh or filter change cannot be applied twice.
 *
 * It is deliberately a plain element rather than a library component: the table
 * keeps its rows on screen while the next page loads, so the overlay only has
 * to say "wait", not to re-render the list.
 */
export function LoadingOverlay({ show, label }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, var(--astryx-color-neutral-1, #000) 45%, transparent)',
        borderRadius: 'inherit',
        cursor: 'progress',
      }}
    >
      <Spinner label={label} />
    </div>
  )
}
