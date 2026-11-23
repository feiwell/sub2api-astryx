import { useRef, type ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { VStack } from '@astryxdesign/core/Stack'
import { useI18n } from '~/i18n'
import { OpsCardHeader } from './OpsStatCard'
import { OPS_CHART_HEIGHT, chartStateOf, useOpsChartTheme, type OpsChartTheme } from './opsChart'
import type { OpsPanel } from './useOpsDashboardData'

/** A chart of the ops page: the title row, then the plot or what stands in for it while there is nothing to draw. */
export function OpsChartCard({
  title,
  help,
  action,
  lead,
  plotHeight = OPS_CHART_HEIGHT,
  panel,
  hasData,
  emptyText,
  children,
}: {
  title: string
  help?: string
  /** Control at the end of the title row. */
  action?: ReactNode
  /** A row between the title and the plot. */
  lead?: ReactNode
  plotHeight?: number
  /** The load the chart draws from: its spinner and its failure take the place of the plot. */
  panel: OpsPanel<unknown>
  /** Whether the answer holds anything to draw. */
  hasData: boolean
  /** Said under "no data" when the window holds nothing to draw. */
  emptyText: string
  /** Draws the plot; called once the colours are known and only while there is data. */
  children: (theme: OpsChartTheme) => ReactNode
}) {
  const { t } = useI18n()
  const hostRef = useRef<HTMLElement>(null)
  const theme = useOpsChartTheme(hostRef)
  const state = chartStateOf(hasData, panel)
  const notice =
    state === 'failed' && panel.error
      ? { title: panel.error.title, description: panel.error.detail || undefined }
      : { title: t('common.noData'), description: emptyText }

  return (
    <Card height="100%">
      <VStack gap={3}>
        <OpsCardHeader title={title} help={help} action={action} />
        {lead}
        <VStack ref={hostRef} height={plotHeight}>
          {state === 'ready' ? (
            theme && children(theme)
          ) : (
            <Center height="100%">
              {state === 'loading' ? (
                <Spinner />
              ) : (
                <EmptyState isCompact headingLevel={5} title={notice.title} description={notice.description} />
              )}
            </Center>
          )}
        </VStack>
      </VStack>
    </Card>
  )
}
