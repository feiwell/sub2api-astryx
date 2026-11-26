/**
 * A busy cue for a list card whose data is being replaced.
 *
 * It used to be a dark sheet over the rows, which read as an error state and
 * hid the very rows the user was watching. Now it is a thin bar running along
 * the top edge: the refresh is visible, the table stays readable, and nothing
 * is blocked while the next page loads.
 *
 * The card must be positioned (`position: relative`).
 */
export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="list-busy" aria-busy="true" aria-live="polite">
      <span className="list-busy__bar" />
    </div>
  )
}
