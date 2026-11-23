import { useEffect, useRef, useState } from 'react'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { downloadCsv } from '~/pages/user/usage/usageExport'
import type { UsageSort } from '~/pages/user/usage/usageQuery'
import { ADMIN_EXPORT_PAGE_SIZE, buildAdminUsageCsv, fetchAllAdminUsageLogs } from './adminUsageExport'
import { buildAdminListParams, type AdminUsageFilters } from './adminUsageQuery'

/** How far an export is: rows fetched, of how many. */
export interface ExportProgress {
  current: number
  total: number
}

/**
 * Exports the admin usage list to a CSV file: every row the filters match, in the order the list is in. The
 * rows come a hundred at a time, so the export says how far it is and can be called off.
 */
export function useAdminUsageExport() {
  const { t } = useI18n()
  /** Null while nothing is being exported. */
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const running = useRef<AbortController | null>(null)

  // An export left behind with the page is called off.
  useEffect(() => () => running.current?.abort(), [])

  /** `listedTotal` is how many rows the list says it has; it stands in until the export has counted them itself. */
  const exportCsv = async (filters: AdminUsageFilters, sort: UsageSort, listedTotal: number) => {
    if (running.current) return
    const controller = new AbortController()
    running.current = controller
    setProgress({ current: 0, total: listedTotal })
    try {
      const logs = await fetchAllAdminUsageLogs({
        params: buildAdminListParams(filters, 1, ADMIN_EXPORT_PAGE_SIZE, sort, true),
        query: (params) => adminAPI.usage.list(params, { signal: controller.signal }),
        isCancelled: () => controller.signal.aborted,
        onProgress: (current, total) => setProgress({ current, total }),
      })
      // Called off: no file, and nothing to say about it.
      if (logs === null) return
      if (logs.length === 0) {
        toast.warning(t('usage.noDataToExport'))
        return
      }
      downloadCsv(`usage_${filters.range.start}_to_${filters.range.end}.csv`, buildAdminUsageCsv(logs, t))
      toast.success(t('usage.exportSuccess'))
    } catch (error) {
      // Calling off ends the request that is under way with an error of its own.
      if (controller.signal.aborted) return
      console.error('[admin-usage] CSV export failed', error)
      toast.error(t('usage.exportFailed'))
    } finally {
      running.current = null
      setProgress(null)
    }
  }

  return {
    progress,
    exportCsv,
    cancel: () => running.current?.abort(),
  }
}
