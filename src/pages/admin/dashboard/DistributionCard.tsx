import { useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { DateRange } from '@astryxdesign/core/Calendar'
import type { ModelStat, UserSpendingRankingItem } from '@/types'
import { useI18n } from '~/i18n'
import { ModelDistributionTable } from './ModelDistributionTable'
import { SpendingRankingTable, type SpendingRanking } from './SpendingRankingTable'

type View = 'models' | 'ranking'

/** Where the usage of the selected range went: by model, or by the users who spent the most. */
export function DistributionCard({
  models,
  modelsLoading,
  ranking,
  rankingLoading,
  hasRankingError,
  range,
  onUserClick,
}: {
  models: ModelStat[]
  modelsLoading: boolean
  ranking: SpendingRanking
  rankingLoading: boolean
  hasRankingError: boolean
  range: DateRange
  onUserClick: (user: UserSpendingRankingItem) => void
}) {
  const { t } = useI18n()
  const [view, setView] = useState<View>('models')

  const modelsTitle = t('admin.dashboard.modelDistribution')
  const rankingTitle = t('admin.dashboard.spendingRankingTitle')
  const isModels = view === 'models'
  const hasData = isModels ? models.length > 0 : ranking.items.length > 0
  const loading = isModels ? modelsLoading : rankingLoading
  const hasError = !isModels && hasRankingError

  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={3}>{isModels ? modelsTitle : rankingTitle}</Heading>
          <SegmentedControl
            label={`${modelsTitle} / ${rankingTitle}`}
            size="sm"
            value={view}
            onChange={(next) => setView(next === 'ranking' ? 'ranking' : 'models')}
          >
            <SegmentedControlItem value="models" label={t('admin.dashboard.viewModelDistribution')} />
            <SegmentedControlItem value="ranking" label={t('admin.dashboard.viewSpendingRanking')} />
          </SegmentedControl>
        </HStack>
        {!hasData ? (
          loading ? (
            <Center padding={6}>
              <Spinner />
            </Center>
          ) : (
            <EmptyState
              isCompact
              headingLevel={4}
              title={hasError ? t('admin.dashboard.failedToLoad') : t('admin.dashboard.noDataAvailable')}
            />
          )
        ) : isModels ? (
          // Keyed by range: an open breakdown belongs to the dates it was loaded for.
          <ModelDistributionTable key={`${range.start}_${range.end}`} models={models} range={range} />
        ) : (
          <SpendingRankingTable ranking={ranking} onUserClick={onUserClick} />
        )}
      </VStack>
    </Card>
  )
}
