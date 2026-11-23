import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { listPlatforms } from '@/constants/platformCatalog'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import {
  OPS_PRESET_TIME_RANGES,
  formatCustomRange,
  toLocalDateTimeValue,
  type OpsCustomRange,
  type OpsFilterChange,
  type OpsFilters,
} from './filters'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'
const CUSTOM = 'custom'
const HOUR_MS = 60 * 60 * 1000

interface GroupOption {
  id: number
  name: string
  platform: string
}

/** Platform, group and time range of the ops page, the refresh button, and the way to rules, settings and full screen. */
export function OpsToolbar({
  filters,
  customRange,
  isLoading,
  onFiltersChange,
  onCustomRange,
  onRefresh,
  onOpenAlertRules,
  onOpenSettings,
  onEnterFullscreen,
}: {
  filters: OpsFilters
  customRange: OpsCustomRange | null
  isLoading: boolean
  onFiltersChange: (change: OpsFilterChange) => void
  /** A custom window was confirmed; the page switches its time range to "custom". */
  onCustomRange: (range: OpsCustomRange) => void
  onRefresh: () => void
  onOpenAlertRules: () => void
  onOpenSettings: () => void
  onEnterFullscreen: () => void
}) {
  const { t } = useI18n()
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [isCustomOpen, setCustomOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    adminAPI.groups
      .getAll()
      .then((list) => {
        if (!cancelled) setGroups(list.map((group) => ({ id: group.id, name: group.name, platform: group.platform })))
      })
      .catch((error) => console.error('[ops] failed to load groups', error))
    return () => {
      cancelled = true
    }
  }, [])

  const platformOptions = [
    { value: ALL, label: t('admin.accounts.allPlatforms') },
    ...listPlatforms().map((spec) => ({ value: spec.id as string, label: spec.display_name })),
  ]

  const visibleGroups = filters.platform ? groups.filter((group) => group.platform === filters.platform) : groups
  const groupOptions = [
    { value: ALL, label: t('admin.accounts.allGroups') },
    // A group that came from the URL stays visible even before (or without) its entry in the list.
    ...(filters.groupId != null && !visibleGroups.some((group) => group.id === filters.groupId)
      ? [{ value: String(filters.groupId), label: `#${filters.groupId}` }]
      : []),
    ...visibleGroups.map((group) => ({ value: String(group.id), label: group.name })),
  ]

  const timeRangeOptions = [
    ...OPS_PRESET_TIME_RANGES.map((range) => ({ value: range as string, label: t(`admin.ops.timeRange.${range}`) })),
    {
      value: CUSTOM,
      label:
        filters.timeRange === CUSTOM && customRange
          ? `${t('admin.ops.timeRange.custom')} (${formatCustomRange(customRange)})`
          : t('admin.ops.timeRange.custom'),
    },
  ]

  const changePlatform = (value: string) => {
    const platform = value === ALL ? '' : value
    const group = groups.find((item) => item.id === filters.groupId)
    // A group belongs to one platform: switching to another platform drops it.
    const dropsGroup = !!platform && !!group && group.platform !== platform
    onFiltersChange(dropsGroup ? { platform, groupId: null } : { platform })
  }

  const changeGroup = (value: string) => {
    const id = value === ALL ? Number.NaN : Number.parseInt(value, 10)
    onFiltersChange({ groupId: Number.isFinite(id) && id > 0 ? id : null })
  }

  const changeTimeRange = (value: string) => {
    if (value === CUSTOM) {
      setCustomOpen(true)
      return
    }
    const preset = OPS_PRESET_TIME_RANGES.find((range) => range === value)
    if (preset) onFiltersChange({ timeRange: preset })
  }

  return (
    <>
      <Selector
        label={t('admin.ops.errorLog.platform')}
        isLabelHidden
        variant="secondary"
        width={150}
        value={filters.platform || ALL}
        onChange={changePlatform}
        options={platformOptions}
      />
      <Selector
        label={t('admin.ops.errorLog.group')}
        isLabelHidden
        variant="secondary"
        width={170}
        value={filters.groupId != null ? String(filters.groupId) : ALL}
        onChange={changeGroup}
        options={groupOptions}
      />
      <Selector
        label={t('admin.dashboard.timeRange')}
        isLabelHidden
        variant="secondary"
        value={filters.timeRange}
        onChange={changeTimeRange}
        options={timeRangeOptions}
      />
      {filters.timeRange === CUSTOM && (
        <IconButton
          label={t('admin.ops.timeRange.custom')}
          tooltip={t('admin.ops.timeRange.custom')}
          icon={<Icon icon={CalendarDaysIcon} />}
          onClick={() => setCustomOpen(true)}
        />
      )}
      <Button
        label={t('common.refresh')}
        variant="secondary"
        icon={<Icon icon={ArrowPathIcon} />}
        isLoading={isLoading}
        onClick={onRefresh}
      />
      <IconButton
        label={t('admin.ops.alertRules.manage')}
        tooltip={t('admin.ops.alertRules.manage')}
        icon={<Icon icon={BellAlertIcon} />}
        onClick={onOpenAlertRules}
      />
      <IconButton
        label={t('common.settings')}
        tooltip={t('common.settings')}
        icon={<Icon icon={Cog6ToothIcon} />}
        onClick={onOpenSettings}
      />
      <IconButton
        label={t('admin.ops.fullscreen.enter')}
        tooltip={t('admin.ops.fullscreen.enter')}
        icon={<Icon icon={ArrowsPointingOutIcon} />}
        onClick={onEnterFullscreen}
      />
      {isCustomOpen && (
        <CustomRangeDialog
          onClose={() => setCustomOpen(false)}
          onConfirm={(range) => {
            setCustomOpen(false)
            onCustomRange(range)
          }}
        />
      )}
    </>
  )
}

/** Start and end of a custom window. Mounted only while open, so each opening starts from the last hour. */
function CustomRangeDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (range: OpsCustomRange) => void }) {
  const { t } = useI18n()
  const [start, setStart] = useState(() => toLocalDateTimeValue(new Date(Date.now() - HOUR_MS)))
  const [end, setEnd] = useState(() => toLocalDateTimeValue(new Date()))

  const startDate = start ? new Date(start) : null
  const endDate = end ? new Date(end) : null
  const isValid = !!startDate && !!endDate && startDate.getTime() < endDate.getTime()

  const confirm = () => {
    if (!startDate || !endDate || !isValid) return
    onConfirm({ start: startDate.toISOString(), end: endDate.toISOString() })
  }

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={420} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.ops.timeRange.custom')} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <DateTimeInput
                label={t('admin.ops.customTimeRange.startTime')}
                value={(start || undefined) as ISODateTimeString | undefined}
                max={(end || undefined) as ISODateTimeString | undefined}
                onChange={(value) => setStart(value ?? '')}
              />
              <DateTimeInput
                label={t('admin.ops.customTimeRange.endTime')}
                value={(end || undefined) as ISODateTimeString | undefined}
                min={(start || undefined) as ISODateTimeString | undefined}
                onChange={(value) => setEnd(value ?? '')}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              <Button label={t('common.confirm')} variant="primary" isDisabled={!isValid} onClick={confirm} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
