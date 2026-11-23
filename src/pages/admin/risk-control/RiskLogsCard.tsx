import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { ArrowPathIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { useElementWidth } from '../promptAudit/useElementWidth'
import { RiskLogBlocks } from './RiskLogBlocks'
import { LOG_TABLE_MIN_WIDTH, riskLogColumns, type LogRow } from './riskLogColumns'
import { RiskLogDetailDialog } from './RiskLogDetailDialog'
import { RiskLogFilters } from './RiskLogFilters'
import { modelFilterSummary, normalizeModelFilter } from './riskModel'
import type { RiskControl } from './useRiskControl'
import type { RiskLogs } from './useRiskLogs'

// How many model names the scope line spells out before it only counts the rest.
const MODEL_PREVIEW_COUNT = 6
// A table in a card reaches this far into the card's padding, on either side.
const TABLE_BLEED = 12

/** Which models the saved setup lets the audit see: the records below only ever hold those. */
function ModelScope({ config }: { config: NonNullable<RiskControl['config']> }) {
  const { t } = useI18n()
  const filter = normalizeModelFilter(config.model_filter)
  const shown = filter.models.slice(0, MODEL_PREVIEW_COUNT)
  const hiddenCount = filter.models.length - shown.length
  return (
    <Card variant="muted" padding={3}>
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Icon icon={FunnelIcon} size="sm" color="secondary" />
          <Text type="supporting" color="primary" weight="medium">
            {t('admin.riskControl.modelFilter')}
          </Text>
          <Text type="supporting">{modelFilterSummary(filter, t)}</Text>
        </HStack>
        {shown.length > 0 && (
          <HStack gap={1.5} vAlign="center" wrap="wrap">
            {shown.map((model) => (
              <Token key={model} size="sm" label={model} />
            ))}
            {hiddenCount > 0 && <Token size="sm" label={`+${hiddenCount}`} />}
          </HStack>
        )}
      </HStack>
    </Card>
  )
}

/**
 * The audit records: filters, the list with its pages, the unban of a user a record got banned,
 * and a record in full. The list itself lives in the page, see useRiskLogs: the overview above
 * tells its total, and saving the settings reloads it.
 */
export function RiskLogsCard({ control, list }: { control: RiskControl; list: RiskLogs }) {
  const { t, locale } = useI18n()
  // The room the list really has decides, not the window: the sidebar can be folded away.
  const [listArea, listWidth] = useElementWidth()
  const isWide = listWidth == null || listWidth + 2 * TABLE_BLEED >= LOG_TABLE_MIN_WIDTH
  const [detail, setDetail] = useState<LogRow | null>(null)

  const rows: LogRow[] = list.items
  const total = list.total ?? 0
  const failureTitle = t('admin.riskControl.logsFailed')

  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
          <VStack gap={1}>
            <Heading level={4}>{t('admin.riskControl.records')}</Heading>
            <Text type="supporting">{t('admin.riskControl.recordsHint')}</Text>
          </VStack>
          <Button
            label={t('admin.riskControl.refresh')}
            variant="secondary"
            icon={<Icon icon={ArrowPathIcon} />}
            isLoading={list.isLoading}
            onClick={list.reload}
          />
        </HStack>

        {control.config && <ModelScope config={control.config} />}

        <RiskLogFilters list={list} groups={control.groups} />

        {list.failure != null && (
          <Banner
            status="error"
            title={failureTitle}
            description={list.failure !== failureTitle ? list.failure : undefined}
          />
        )}

        <VStack ref={listArea} gap={4}>
          {rows.length === 0 ? (
            // A failed first load leaves only its banner.
            (list.isLoading || list.failure == null) && (
              <Center padding={8}>
                {list.isLoading ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <EmptyState isCompact headingLevel={5} title={t('admin.riskControl.emptyLogs')} />
                )}
              </Center>
            )
          ) : isWide ? (
            <Table<LogRow>
              data={rows}
              columns={riskLogColumns({ t, locale, list, onView: setDetail })}
              idKey={(row) => row.id}
              density="compact"
              dividers="rows"
              verticalAlign="top"
              hasHover
            />
          ) : (
            <RiskLogBlocks rows={rows} list={list} onView={setDetail} />
          )}

          {total > 0 && (
            <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
              <Text type="supporting" hasTabularNumbers>
                {`${t('common.total')}: ${total} ${t('pagination.results')}`}
              </Text>
              <Pagination
                page={list.page}
                onChange={list.setPage}
                totalItems={total}
                pageSize={list.pageSize}
                pageSizeOptions={list.pageSizeOptions}
                onPageSizeChange={list.changePageSize}
                variant="input"
                size="sm"
              />
            </HStack>
          )}
        </VStack>
      </VStack>

      {detail && <RiskLogDetailDialog log={detail} onClose={() => setDetail(null)} />}
    </Card>
  )
}
