import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Pagination } from '@astryxdesign/core/Pagination'
import { ScrollableArea } from '@astryxdesign/core/ScrollableArea'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { formatNumber } from '@/utils/format'
import { useI18n } from '~/i18n'
import {
  opsAPI,
  type OpsOpenAITokenStatsItem,
  type OpsOpenAITokenStatsResponse,
  type OpsOpenAITokenStatsTimeRange,
} from '~/lib/api/admin/ops'
import { OpsFacts } from './OpsStatCard'
import { errorCode, errorMessage } from './errors'

type ViewMode = 'topn' | 'pagination'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<OpsOpenAITokenStatsItem, keyof OpsOpenAITokenStatsItem>
type FigureKey = Exclude<keyof Row, 'model'>

const TIME_RANGES: OpsOpenAITokenStatsTimeRange[] = ['30m', '1h', '1d', '15d', '30d']
const SIZE_CHOICES = [10, 20, 50, 100]
const DEFAULT_SIZE = 20
/** Beyond this many rows the table scrolls inside the card instead of stretching the page. */
const ROWS_BEFORE_SCROLL = 10
const SCROLL_HEIGHT = 420

const NO_VALUE = '-'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const whole = (value: unknown): string => (isNumber(value) ? formatNumber(Math.round(value)) : NO_VALUE)
const precise = (value: unknown): string => (isNumber(value) ? value.toFixed(2) : NO_VALUE)

/**
 * Output speed and first-token delay per model, for OpenAI-compatible requests.
 * It keeps its own time range: these figures are read over days, not over the page's last hour.
 */
export function OpsTokenStatsCard({
  platform,
  groupId,
  refreshKey,
}: {
  platform: string
  groupId: number | null
  /** Changes on every page refresh; the card reloads with it. */
  refreshKey: number
}) {
  const { t } = useI18n()
  // Seven columns need about a thousand pixels; a narrower card lists each model with its figures instead.
  const isWide = useMediaQuery('(min-width: 1280px)', true)
  const [timeRange, setTimeRange] = useState<OpsOpenAITokenStatsTimeRange>('30d')
  const [viewMode, setViewMode] = useState<ViewMode>('topn')
  const [topN, setTopN] = useState(DEFAULT_SIZE)
  const [pageSize, setPageSize] = useState(DEFAULT_SIZE)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState<OpsOpenAITokenStatsResponse | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')

  // Another platform or group is another list of models: start again from its first page.
  const scope = `${platform}|${groupId ?? ''}`
  const [shownScope, setShownScope] = useState(scope)
  if (scope !== shownScope) {
    setShownScope(scope)
    setPage(1)
  }

  // refreshKey is not sent; it is here so a page refresh reloads the card.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setErrorText('')
    opsAPI
      .getOpenAITokenStats(
        {
          time_range: timeRange,
          platform: platform || undefined,
          group_id: groupId,
          ...(viewMode === 'topn' ? { top_n: topN } : { page, page_size: pageSize }),
        },
        { signal: controller.signal },
      )
      .then((next) => {
        if (controller.signal.aborted) return
        setStats(next)
        // Models can drop out between two loads; never stay on a page past the last one.
        const lastPage = Math.max(1, Math.ceil((next?.total ?? 0) / pageSize))
        if (viewMode === 'pagination' && page > lastPage) setPage(lastPage)
      })
      .catch((error) => {
        if (controller.signal.aborted || errorCode(error) === 'ERR_CANCELED') return
        console.error('[ops] failed to load OpenAI token stats', error)
        setStats(null)
        setErrorText(errorMessage(error) || t('admin.ops.openaiTokenStats.failedToLoad'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [timeRange, viewMode, topN, pageSize, page, platform, groupId, refreshKey, t])

  const rows: Row[] = stats?.items ?? []
  const total = stats?.total ?? 0

  const timeRangeLabels: Record<OpsOpenAITokenStatsTimeRange, string> = {
    '30m': t('admin.ops.timeRange.30m'),
    '1h': t('admin.ops.timeRange.1h'),
    '1d': t('admin.ops.timeRange.1d'),
    '15d': t('admin.ops.timeRange.15d'),
    '30d': t('admin.ops.timeRange.30d'),
  }
  const labels = {
    title: t('admin.ops.openaiTokenStats.title'),
    model: t('admin.ops.openaiTokenStats.table.model'),
    timeRange: t('admin.dashboard.timeRange'),
    viewMode: `${t('admin.ops.openaiTokenStats.viewModeTopN')} / ${t('admin.ops.openaiTokenStats.viewModePagination')}`,
  }

  // minWidth keeps each heading on one line; the headings differ a lot in length.
  const figures: Array<{ key: FigureKey; label: string; format: (value: unknown) => string; minWidth: number }> = [
    { key: 'request_count', label: t('admin.ops.openaiTokenStats.table.requestCount'), format: whole, minWidth: 88 },
    {
      key: 'avg_tokens_per_sec',
      label: t('admin.ops.openaiTokenStats.table.avgTokensPerSec'),
      format: precise,
      minWidth: 132,
    },
    {
      key: 'avg_first_token_ms',
      label: t('admin.ops.openaiTokenStats.table.avgFirstTokenMs'),
      format: precise,
      minWidth: 180,
    },
    {
      key: 'total_output_tokens',
      label: t('admin.ops.openaiTokenStats.table.totalOutputTokens'),
      format: whole,
      minWidth: 132,
    },
    { key: 'avg_duration_ms', label: t('admin.ops.openaiTokenStats.table.avgDurationMs'), format: whole, minWidth: 120 },
    {
      key: 'requests_with_first_token',
      label: t('admin.ops.openaiTokenStats.table.requestsWithFirstToken'),
      format: whole,
      minWidth: 132,
    },
  ]

  const columns: TableColumn<Row>[] = [
    {
      key: 'model',
      header: labels.model,
      width: proportional(2.5, { minWidth: 180 }),
      renderCell: (row) => (
        <Text weight="medium" wordBreak="break-all">
          {row.model}
        </Text>
      ),
    },
    ...figures.map(
      (figure): TableColumn<Row> => ({
        key: figure.key,
        header: figure.label,
        width: proportional(figure.minWidth / 88, { minWidth: figure.minWidth }),
        align: 'end',
        renderCell: (row) => <Text hasTabularNumbers>{figure.format(row[figure.key])}</Text>,
      }),
    ),
  ]

  const table = <Table<Row> data={rows} columns={columns} idKey="model" density="compact" />

  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
          <HStack gap={2} vAlign="center">
            <Heading level={4}>{labels.title}</Heading>
            {isLoading && stats && <Spinner size="sm" />}
          </HStack>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Selector
              label={labels.timeRange}
              isLabelHidden
              variant="secondary"
              width={132}
              value={timeRange}
              onChange={(value) => {
                setTimeRange(value as OpsOpenAITokenStatsTimeRange)
                setPage(1)
              }}
              options={TIME_RANGES.map((range) => ({ value: range, label: timeRangeLabels[range] }))}
            />
            <Selector
              label={labels.viewMode}
              isLabelHidden
              variant="secondary"
              width={110}
              value={viewMode}
              onChange={(value) => {
                setViewMode(value as ViewMode)
                setPage(1)
              }}
              options={[
                { value: 'topn', label: t('admin.ops.openaiTokenStats.viewModeTopN') },
                { value: 'pagination', label: t('admin.ops.openaiTokenStats.viewModePagination') },
              ]}
            />
            {viewMode === 'topn' && (
              <Selector
                label={t('admin.ops.openaiTokenStats.viewModeTopN')}
                isLabelHidden
                variant="secondary"
                width={110}
                value={String(topN)}
                onChange={(value) => setTopN(Number(value))}
                options={SIZE_CHOICES.map((size) => ({ value: String(size), label: `Top ${size}` }))}
              />
            )}
          </HStack>
        </HStack>

        {errorText && <Banner status="error" title={errorText} />}

        {rows.length === 0 ? (
          <Center padding={8}>
            {isLoading ? (
              <Spinner />
            ) : (
              !errorText && (
                <EmptyState
                  isCompact
                  headingLevel={5}
                  title={t('common.noData')}
                  description={t('admin.ops.openaiTokenStats.empty')}
                />
              )
            )}
          </Center>
        ) : !isWide ? (
          <VStack gap={3}>
            {rows.map((row, index) => (
              <VStack key={row.model} gap={2}>
                {index > 0 && <Divider />}
                <Text weight="medium" wordBreak="break-all">
                  {row.model}
                </Text>
                <OpsFacts
                  facts={figures.map((figure) => ({ label: figure.label, value: figure.format(row[figure.key]) }))}
                />
              </VStack>
            ))}
          </VStack>
        ) : rows.length > ROWS_BEFORE_SCROLL ? (
          <ScrollableArea label={labels.title} height={SCROLL_HEIGHT}>
            {table}
          </ScrollableArea>
        ) : (
          table
        )}

        {rows.length > 0 &&
          (viewMode === 'topn' ? (
            <Text type="supporting" color="secondary">
              {t('admin.ops.openaiTokenStats.totalModels', { total })}
            </Text>
          ) : (
            <Pagination
              page={page}
              onChange={setPage}
              totalItems={total}
              pageSize={pageSize}
              pageSizeOptions={SIZE_CHOICES}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
              variant="input"
              size="sm"
            />
          ))}
      </VStack>
    </Card>
  )
}
