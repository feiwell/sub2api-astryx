import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import type { PromptAuditRuntime } from '@/features/prompt-audit/types'
import { useI18n } from '~/i18n'
import { getRuntime } from './api'
import { modeLabel, processTone, statusLabel, type Tone } from './configText'
import { NO_VALUE, auditErrorMessage, formatAuditDate } from './eventText'

/** How the service is running right now. `reloadKey` is not sent; a change of it asks again. */
function useAuditRuntime(reloadKey: number) {
  const [runtime, setRuntime] = useState<PromptAuditRuntime | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    getRuntime()
      .then((answer) => {
        if (!isStale) setRuntime(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[prompt-audit] failed to load runtime', error)
        // The figures of the last good load stay, under the error.
        setFailure(auditErrorMessage(error, 'admin.promptAudit.errors.loadRuntime'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [reloadKey, tick])

  return { runtime, isLoading, failure, reload: () => setTick((value) => value + 1) }
}

/** A figure with its name above it. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
      {children}
    </VStack>
  )
}

const figure = (value: string) => (
  <Text weight="medium" hasTabularNumbers>
    {value}
  </Text>
)

/** A state in words, with the dot that gives it its colour. */
function Marked({ tone, text }: { tone: Tone; text: string }) {
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={tone} label={text} />
      <Text weight="medium">{text}</Text>
    </HStack>
  )
}

function RuntimeFigures({ runtime }: { runtime: PromptAuditRuntime }) {
  const { t, locale } = useI18n()
  const number = new Intl.NumberFormat(locale)
  const count = (value: number | null | undefined) => number.format(value ?? 0)
  const pair = (first: number, second: number) => `${count(first)} / ${count(second)}`
  const dependency = (name: string, status: string) => (
    <Marked tone={status === 'ok' ? 'success' : 'error'} text={`${name} ${status}`} />
  )

  const { queue, guard_metrics: metrics } = runtime
  const guardFigures = [
    { label: t('admin.promptAudit.metrics.total'), value: count(metrics.total) },
    { label: t('admin.promptAudit.metrics.allowed'), value: count(metrics.allowed) },
    { label: t('admin.promptAudit.metrics.flagged'), value: count(metrics.flagged) },
    { label: t('admin.promptAudit.metrics.blocked'), value: count(metrics.blocked) },
    { label: t('admin.promptAudit.metrics.unavailable'), value: count(metrics.unavailable) },
    { label: t('admin.promptAudit.metrics.timeouts'), value: count(metrics.timeouts) },
    { label: t('admin.promptAudit.metrics.failovers'), value: count(metrics.failovers) },
    { label: 'P95', value: metrics.latency_p95_ms != null ? `${count(metrics.latency_p95_ms)} ms` : NO_VALUE },
  ]
  // What the last probe of each node found; the server keeps these, so they outlive the page.
  const probes = Object.entries(runtime.endpoints ?? {})

  return (
    <>
      {/* The service could not take over the saved configuration: the reason it runs degraded. */}
      {runtime.config_load_error && <Banner status="warning" title={runtime.config_load_error} />}

      <Grid columns={{ minWidth: 150, max: 6 }} gap={4}>
        <Fact label={t('admin.promptAudit.runtime.process')}>
          <Marked tone={processTone(runtime.process_status)} text={statusLabel(runtime.process_status)} />
        </Fact>
        <Fact label={t('admin.promptAudit.runtime.mode')}>
          <Text weight="medium">{modeLabel(runtime.effective_mode)}</Text>
        </Fact>
        <Fact label={t('admin.promptAudit.runtime.version')}>
          {figure(`${runtime.active_config_version} / ${runtime.expected_config_version}`)}
        </Fact>
        <Fact label={t('admin.promptAudit.runtime.workers')}>
          {figure(pair(runtime.worker_active, runtime.worker_total))}
        </Fact>
        <Fact label={t('admin.promptAudit.runtime.queue')}>{figure(pair(queue.active, runtime.queue_capacity))}</Fact>
        <Fact label={t('admin.promptAudit.runtime.dependencies')}>
          <HStack gap={3} vAlign="center" wrap="wrap">
            {dependency('DB', runtime.database_status)}
            {dependency('Redis', runtime.redis_status)}
          </HStack>
        </Fact>
      </Grid>

      <Divider />

      <Grid columns={{ minWidth: 340, max: 2 }} gap={6}>
        <VStack gap={3}>
          <Heading level={5}>{t('admin.promptAudit.runtime.guardMetrics')}</Heading>
          <Grid columns={{ minWidth: 96, max: 4 }} gap={3}>
            {guardFigures.map(({ label, value }) => (
              <Fact key={label} label={label}>
                {figure(value)}
              </Fact>
            ))}
          </Grid>
          <VStack gap={0.5}>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {t('admin.promptAudit.runtime.queueBreakdown', {
                queued: count(queue.queued),
                processing: count(queue.processing),
                retry: count(queue.retry),
                done: count(queue.done),
                failed: count(queue.failed),
              })}
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {t('admin.promptAudit.runtime.deliveryTotals', {
                enqueued: count(runtime.enqueued_total),
                dropped: count(runtime.dropped_total),
                processed: count(runtime.processed_total),
                failed: count(runtime.failed_total),
              })}
            </Text>
          </VStack>
        </VStack>

        <VStack gap={3} hAlign="start">
          <Heading level={5}>{t('admin.promptAudit.runtime.latest')}</Heading>
          {figure(
            runtime.last_processed_at
              ? formatAuditDate(runtime.last_processed_at, locale, 'medium')
              : t('admin.promptAudit.common.never'),
          )}
          {runtime.last_error_code && (
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Badge variant="error" label={runtime.last_error_code} />
              {runtime.last_error_message && (
                <Text type="supporting" wordBreak="break-word">
                  {runtime.last_error_message}
                </Text>
              )}
            </HStack>
          )}
          {probes.length > 0 && (
            <HStack gap={2} wrap="wrap">
              {probes.map(([id, probe]) => (
                <Badge
                  key={id}
                  variant={probe.ok ? 'success' : 'error'}
                  label={`${id} · ${statusLabel(probe.status)} · ${count(probe.latency_ms)} ms`}
                />
              ))}
            </HStack>
          )}
        </VStack>
      </Grid>
    </>
  )
}

/**
 * What the server is doing with the configuration it has: the saved one, never the draft below.
 * Asked for when the tab opens, on "refresh", and again after each save (`reloadKey`).
 */
export function AuditRuntimeOverview({ reloadKey }: { reloadKey: number }) {
  const { t } = useI18n()
  const { runtime, isLoading, failure, reload } = useAuditRuntime(reloadKey)

  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
          <VStack gap={0.5}>
            <Heading level={4}>{t('admin.promptAudit.runtime.title')}</Heading>
            <Text type="supporting" color="secondary">
              {t('admin.promptAudit.runtime.description')}
            </Text>
          </VStack>
          {/* The first load already shows as placeholders below; the button spins for the later ones. */}
          <Button
            label={t('admin.promptAudit.actions.refresh')}
            variant="secondary"
            icon={<Icon icon={ArrowPathIcon} />}
            isLoading={isLoading && runtime != null}
            isDisabled={isLoading && runtime == null}
            onClick={reload}
          />
        </HStack>

        {failure != null && (
          <Banner
            status="error"
            title={t('admin.promptAudit.errors.loadRuntime')}
            description={failure !== t('admin.promptAudit.errors.loadRuntime') ? failure : undefined}
          />
        )}

        {runtime ? (
          <RuntimeFigures runtime={runtime} />
        ) : (
          isLoading && (
            <>
              <Grid columns={{ minWidth: 150, max: 6 }} gap={4}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <Skeleton key={index} height={44} index={index} />
                ))}
              </Grid>
              <Skeleton height={112} />
            </>
          )
        )}
      </VStack>
    </Card>
  )
}
