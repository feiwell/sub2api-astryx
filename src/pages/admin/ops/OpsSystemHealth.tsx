import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { formatMemorySizeMB } from '@/views/admin/ops/utils/opsFormatters'
import { useI18n } from '~/i18n'
import type { OpsDashboardOverview, OpsJobHeartbeat } from '~/lib/api/admin/ops'
import { OpsStatCard } from './OpsStatCard'
import {
  GOROUTINES_CRITICAL_AT,
  GOROUTINES_WARN_AT,
  ceilingTone,
  countFailingJobs,
  finite,
  isJobFailing,
  poolUsagePercent,
  type OpsTone,
} from './health'

const TONE_LABEL_KEY: Record<OpsTone, string> = {
  success: 'admin.ops.ok',
  warning: 'common.warning',
  error: 'common.critical',
  neutral: 'admin.ops.noData',
}

const orDash = (value: number | null): string => (value == null ? '-' : value.toLocaleString())
const percent = (value: number | null): string => (value == null ? '-' : `${value.toFixed(1)}%`)

/** The host behind the gateway: processor, memory, connection pools, goroutines and background jobs. */
export function OpsSystemHealth({ overview }: { overview: OpsDashboardOverview }) {
  const { t } = useI18n()
  const [isJobsOpen, setJobsOpen] = useState(false)
  const metrics = overview.system_metrics ?? null
  // The list can carry empty entries; they are skipped, as the Vue header does.
  const jobs = (overview.job_heartbeats ?? []).filter((job) => !!job)

  const status = (tone: OpsTone) => ({ tone, label: t(TONE_LABEL_KEY[tone]) })
  const warningLabel = t('common.warning')
  const criticalLabel = t('common.critical')

  const cpu = finite(metrics?.cpu_usage_percent)
  const memory = finite(metrics?.memory_usage_percent)
  const memoryUsed = finite(metrics?.memory_used_mb)
  const memoryTotal = finite(metrics?.memory_total_mb)

  // A pool reads FAIL when its health check failed, its usage when known, else just "ok".
  const pool = (isOk: boolean | null | undefined, usage: number | null) => {
    const tone: OpsTone =
      isOk === false ? 'error' : usage != null ? ceilingTone(usage, 70, 90) : isOk === true ? 'success' : 'neutral'
    const value =
      isOk === false ? 'FAIL' : usage != null ? `${usage.toFixed(0)}%` : isOk === true ? t('admin.ops.ok') : t('admin.ops.noData')
    return { value, status: status(tone), bar: usage ?? undefined }
  }

  const dbActive = finite(metrics?.db_conn_active)
  const dbIdle = finite(metrics?.db_conn_idle)
  const dbWaiting = finite(metrics?.db_conn_waiting)
  const dbOpen = dbActive != null && dbIdle != null ? dbActive + dbIdle : null
  const dbMax = finite(metrics?.db_max_open_conns)
  const db = pool(metrics?.db_ok, poolUsagePercent(dbOpen, dbMax))

  const redisTotal = finite(metrics?.redis_conn_total)
  const redisIdle = finite(metrics?.redis_conn_idle)
  const redisActive = redisTotal != null && redisIdle != null ? Math.max(redisTotal - redisIdle, 0) : null
  const redisSize = finite(metrics?.redis_pool_size)
  const redis = pool(metrics?.redis_ok, poolUsagePercent(redisTotal, redisSize))

  const goroutines = finite(metrics?.goroutine_count)
  const queueDepth = finite(metrics?.concurrency_queue_depth)

  const failingJobs = countFailingJobs(jobs)
  const jobsTone: OpsTone = jobs.length === 0 ? 'neutral' : failingJobs > 0 ? 'warning' : 'success'

  return (
    <VStack gap={3}>
      <Heading level={3}>{t('admin.ops.systemHealth')}</Heading>
      <Grid columns={{ minWidth: 280, max: 3, repeat: 'fill' }} gap={4}>
        <OpsStatCard
          title="CPU"
          help={t('admin.ops.tooltips.cpu')}
          value={percent(cpu)}
          status={cpu == null ? undefined : status(ceilingTone(cpu, 80, 95))}
          bar={cpu ?? undefined}
          facts={[
            { label: warningLabel, value: '80%' },
            { label: criticalLabel, value: '95%' },
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.memory')}
          help={t('admin.ops.tooltips.memory')}
          value={percent(memory)}
          status={memory == null ? undefined : status(ceilingTone(memory, 85, 95))}
          bar={memory ?? undefined}
          note={
            memoryUsed == null || memoryTotal == null
              ? undefined
              : `${formatMemorySizeMB(memoryUsed)} / ${formatMemorySizeMB(memoryTotal)}`
          }
        />
        <OpsStatCard
          title={t('admin.ops.db')}
          help={t('admin.ops.tooltips.db')}
          value={db.value}
          status={db.status}
          bar={db.bar}
          facts={[
            ...(dbOpen != null || dbMax != null
              ? [{ label: t('admin.ops.conns'), value: `${orDash(dbOpen)} / ${orDash(dbMax)}` }]
              : []),
            ...(dbActive != null ? [{ label: t('admin.ops.active'), value: orDash(dbActive) }] : []),
            ...(dbIdle != null ? [{ label: t('admin.ops.idle'), value: orDash(dbIdle) }] : []),
            ...(dbWaiting != null ? [{ label: t('admin.ops.waiting'), value: orDash(dbWaiting) }] : []),
          ]}
        />
        <OpsStatCard
          title="Redis"
          help={t('admin.ops.tooltips.redis')}
          value={redis.value}
          status={redis.status}
          bar={redis.bar}
          facts={[
            ...(redisTotal != null || redisSize != null
              ? [{ label: t('admin.ops.conns'), value: `${orDash(redisTotal)} / ${orDash(redisSize)}` }]
              : []),
            ...(redisActive != null ? [{ label: t('admin.ops.active'), value: orDash(redisActive) }] : []),
            ...(redisIdle != null ? [{ label: t('admin.ops.idle'), value: orDash(redisIdle) }] : []),
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.goroutines')}
          help={t('admin.ops.tooltips.goroutines')}
          value={orDash(goroutines)}
          status={
            goroutines == null ? undefined : status(ceilingTone(goroutines, GOROUTINES_WARN_AT, GOROUTINES_CRITICAL_AT))
          }
          facts={[
            { label: warningLabel, value: GOROUTINES_WARN_AT.toLocaleString() },
            { label: criticalLabel, value: GOROUTINES_CRITICAL_AT.toLocaleString() },
            ...(queueDepth != null ? [{ label: t('admin.ops.queue'), value: orDash(queueDepth) }] : []),
          ]}
        />
        <OpsStatCard
          title={t('admin.ops.jobs')}
          help={t('admin.ops.tooltips.jobs')}
          action={
            <Button
              label={t('admin.ops.requestDetails.details')}
              variant="ghost"
              size="sm"
              onClick={() => setJobsOpen(true)}
            />
          }
          value={t(TONE_LABEL_KEY[jobsTone])}
          status={status(jobsTone)}
          facts={[
            { label: t('common.total'), value: jobs.length.toLocaleString() },
            { label: warningLabel, value: failingJobs.toLocaleString() },
          ]}
        />
      </Grid>
      {isJobsOpen && <JobsDialog jobs={jobs} onClose={() => setJobsOpen(false)} />}
    </VStack>
  )
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Time of day for today, date and time for anything older. */
function formatJobTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

// Table rows must be index-signature compatible, which an interface is not; the mapped alias is.
type JobRow = Pick<OpsJobHeartbeat, keyof OpsJobHeartbeat>

/** Heartbeat of every background job: when it last ran, succeeded and failed, and with what result. */
function JobsDialog({ jobs, onClose }: { jobs: JobRow[]; onClose: () => void }) {
  const { t } = useI18n()

  const time = (key: 'last_run_at' | 'last_success_at' | 'last_error_at', header: string): TableColumn<JobRow> => ({
    key,
    header,
    width: proportional(1, { minWidth: 104 }),
    renderCell: (job) => (
      <Text hasTabularNumbers textWrap="nowrap">
        {formatJobTime(job[key])}
      </Text>
    ),
  })

  const columns: TableColumn<JobRow>[] = [
    {
      key: 'job_name',
      header: t('admin.ops.jobs'),
      width: proportional(3, { minWidth: 220 }),
      renderCell: (job) => (
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={isJobFailing(job) ? 'warning' : 'success'}
              label={t(isJobFailing(job) ? 'common.warning' : 'admin.ops.ok')}
            />
            <StackItem size="fill">
              <Text weight="medium" maxLines={1}>
                {job.job_name}
              </Text>
            </StackItem>
          </HStack>
          {job.last_error && (
            <Text type="supporting" color="secondary" maxLines={3}>
              {job.last_error}
            </Text>
          )}
        </VStack>
      ),
    },
    time('last_run_at', t('admin.ops.lastRun')),
    time('last_success_at', t('admin.ops.lastSuccess')),
    time('last_error_at', t('admin.ops.lastError')),
    {
      key: 'last_result',
      header: t('admin.ops.result'),
      width: proportional(2, { minWidth: 120 }),
      renderCell: (job) => <Text maxLines={2}>{job.last_result || '-'}</Text>,
    },
    {
      key: 'last_duration_ms',
      header: t('admin.ops.requestDetails.table.duration'),
      width: proportional(1, { minWidth: 80 }),
      align: 'end',
      renderCell: (job) => (
        <Text hasTabularNumbers textWrap="nowrap">
          {job.last_duration_ms == null ? '-' : `${job.last_duration_ms.toLocaleString()}ms`}
        </Text>
      ),
    },
  ]

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={960} purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.ops.jobs')} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            {jobs.length === 0 ? (
              <EmptyState isCompact headingLevel={3} title={t('admin.ops.noData')} />
            ) : (
              <Table data={jobs} columns={columns} idKey="job_name" density="compact" />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
