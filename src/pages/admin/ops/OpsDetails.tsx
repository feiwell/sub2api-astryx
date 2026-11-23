import { OpsErrorDetailDialog } from './OpsErrorDetailDialog'
import { OpsErrorListDialog } from './OpsErrorListDialog'
import { OpsRequestDetailsDialog } from './OpsRequestDetailsDialog'
import type { OpsCustomRange, OpsFilters } from './filters'
import type { OpsDetails as OpsDetailsControl } from './useOpsDetails'

/**
 * The detail dialogs of the ops page. A list stays mounted, hidden, while one of its errors is on show:
 * going back finds its filters and page as they were, without asking the server again.
 */
export function OpsDetails({
  details,
  filters,
  customRange,
}: {
  details: OpsDetailsControl
  filters: OpsFilters
  /** The window picked by hand; only set while the time range is "custom". */
  customRange: OpsCustomRange | null
}) {
  const { list, error } = details.state

  return (
    <>
      {/* The key gives every opening a fresh list: filters and page do not carry over from the last one. */}
      {list?.type === 'requests' && (
        <OpsRequestDetailsDialog
          key={list.opening}
          isOpen={!error}
          preset={list.preset}
          filters={filters}
          customRange={customRange}
          // The ids in the request list are those of request errors, whichever error list was opened before.
          onOpenError={(id) => details.openError(id, 'request')}
          onClose={details.close}
        />
      )}
      {list?.type === 'errors' && (
        <OpsErrorListDialog
          key={list.opening}
          isOpen={!error}
          errorKind={list.errorKind}
          filters={filters}
          customRange={customRange}
          onOpenError={(id) => details.openError(id, list.errorKind)}
          onClose={details.close}
        />
      )}
      {error && (
        <OpsErrorDetailDialog
          errorId={error.id}
          errorKind={error.kind}
          onBack={details.backToList}
          onClose={details.close}
        />
      )}
    </>
  )
}
