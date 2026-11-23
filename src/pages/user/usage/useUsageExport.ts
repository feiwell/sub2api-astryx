import { useState } from 'react'
import { usageAPI } from '@/api'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { EXPORT_PAGE_SIZE, buildUsageCsv, downloadCsv, fetchAllUsageLogs } from './usageExport'
import { buildUsageListParams, type UsageFilters, type UsageSort } from './usageQuery'

/** Exports the usage list to a CSV file: every row the filters match, in the order the list is in. */
export function useUsageExport() {
  const { t } = useI18n()
  const [isExporting, setExporting] = useState(false)

  /** `total` is how many rows the list has under these filters; it says how many pages to fetch. */
  const exportCsv = async (filters: UsageFilters, sort: UsageSort, total: number) => {
    if (total === 0) {
      toast.warning(t('usage.noDataToExport'))
      return
    }
    setExporting(true)
    toast.info(t('usage.preparingExport'))
    try {
      const logs = await fetchAllUsageLogs({
        total,
        params: buildUsageListParams(filters, 1, EXPORT_PAGE_SIZE, sort),
        query: (params) => usageAPI.query(params),
        onRateLimited: (seconds) => toast.info(t('usage.exportRateLimited', { seconds })),
      })
      if (logs.length === 0) {
        toast.warning(t('usage.noDataToExport'))
        return
      }
      downloadCsv(`usage_${filters.range.start}_to_${filters.range.end}.csv`, buildUsageCsv(logs, t))
      toast.success(t('usage.exportSuccess'))
    } catch (error) {
      console.error('[usage] CSV export failed', error)
      toast.error(t('usage.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  return { isExporting, exportCsv }
}
