import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { Token, type TokenColor } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { TrophyIcon } from '@heroicons/react/24/solid'
import { useI18n } from '~/i18n'
import { rankKind, rankLabel, rankPlace, type RankKind } from './statusFormat'

const COLORS: Record<Exclude<RankKind, 'unranked'>, TokenColor> = {
  gold: 'yellow',
  silver: 'gray',
  bronze: 'orange',
  place: 'default',
}

/** A place in the ranking. The first three carry a trophy; a user who is not ranked shows a dash. */
export function RankBadge({ rank }: { rank: number | null | undefined }) {
  const { t } = useI18n()
  const kind = rankKind(rank)
  const label = rankLabel(rank)

  if (kind === 'unranked') {
    return (
      <Tooltip content={t('channelMonitorV2.rank.unranked')}>
        <Text color="secondary">{label}</Text>
      </Tooltip>
    )
  }
  const meaning = kind === 'place' ? t('channelMonitorV2.rank.place', { n: rankPlace(rank) }) : t(`channelMonitorV2.rank.${kind}`)
  return (
    <Tooltip content={meaning}>
      <Token
        size="sm"
        color={COLORS[kind]}
        label={label}
        icon={kind === 'place' ? undefined : <Icon icon={TrophyIcon} />}
      />
    </Tooltip>
  )
}
