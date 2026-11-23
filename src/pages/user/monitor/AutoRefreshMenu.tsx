import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuDivider,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { AUTO_REFRESH_SECONDS, countdownDigits } from './autoRefresh'
import type { AutoRefresh } from './useAutoRefresh'

/**
 * Whether the page refreshes by itself, and how often. The button counts down to the next refresh while it
 * does; its menu switches refreshing on and off and chooses the interval.
 */
export function AutoRefreshMenu({ refresh }: { refresh: AutoRefresh }) {
  const { t } = useI18n()
  const title = t('common.autoRefresh.title')
  const { remaining, seconds } = refresh
  const label =
    remaining == null ? title : t('common.autoRefresh.countdown', { seconds: countdownDigits(remaining, seconds) })

  return (
    <DropdownMenu
      button={{
        size: 'sm',
        variant: 'secondary',
        label,
        // Every digit takes the same room, so the button keeps its width as the seconds pass.
        children: (
          <Text type="label" color="inherit" hasTabularNumbers>
            {label}
          </Text>
        ),
      }}
      alignment="end"
    >
      <DropdownMenuCheckboxItem
        label={t('common.autoRefresh.enable')}
        value={refresh.enabled}
        onChange={refresh.setEnabled}
      />
      <DropdownMenuDivider />
      <DropdownMenuRadioGroup
        label={title}
        value={String(seconds)}
        onChange={(value) => refresh.setSeconds(Number(value))}
      >
        {AUTO_REFRESH_SECONDS.map((choice) => (
          <DropdownMenuRadioItem
            key={choice}
            value={String(choice)}
            label={t('common.autoRefresh.seconds', { n: choice })}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  )
}
