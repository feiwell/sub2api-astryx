import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ArrowPathIcon, MagnifyingGlassIcon, PlusIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { PROVIDERS } from '@/constants/channelMonitor'
import { providerLabel } from '~/components/monitor/monitorText'
import { useI18n } from '~/i18n'
import { toEnabledFilter, toProvider } from './monitorQuery'
import type { ChannelMonitors } from './useChannelMonitors'

// Selector values are strings, so "no filter" needs a value of its own.
const ALL = '__all__'

/**
 * What narrows the list of monitors, and what is done to the list as a whole. The search follows the typing;
 * a choice from a list applies at once. Port of components/admin/monitor/MonitorFiltersBar.vue.
 */
export function MonitorFilterBar({
  list,
  onCreate,
  onManageTemplates,
}: {
  list: ChannelMonitors
  onCreate?: () => void
  onManageTemplates?: () => void
}) {
  const { t } = useI18n()

  return (
    <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
      <HStack gap={3} vAlign="center" wrap="wrap">
        <TextInput
          label={t('common.search')}
          isLabelHidden
          type="search"
          width={260}
          placeholder={t('admin.channelMonitor.searchPlaceholder')}
          startIcon={MagnifyingGlassIcon}
          hasClear
          value={list.searchText}
          onChange={list.setSearchText}
        />
        <Selector
          label={t('admin.channelMonitor.filterByProvider')}
          isLabelHidden
          width={170}
          value={list.filters.provider || ALL}
          onChange={(value) => list.pick({ provider: toProvider(value) })}
          options={[
            { value: ALL, label: t('admin.channelMonitor.allProviders') },
            ...PROVIDERS.map((provider) => ({ value: provider as string, label: providerLabel(provider, t) })),
          ]}
        />
        <Selector
          label={t('admin.channelMonitor.enabledFilter')}
          isLabelHidden
          width={150}
          value={list.filters.enabled || ALL}
          onChange={(value) => list.pick({ enabled: toEnabledFilter(value) })}
          options={[
            { value: ALL, label: t('admin.channelMonitor.allStatus') },
            { value: 'true', label: t('admin.channelMonitor.onlyEnabled') },
            { value: 'false', label: t('admin.channelMonitor.onlyDisabled') },
          ]}
        />
      </HStack>

      <HStack gap={2} vAlign="center">
        <IconButton
          label={t('common.refresh')}
          tooltip={t('common.refresh')}
          icon={<Icon icon={ArrowPathIcon} />}
          isLoading={list.isLoading}
          onClick={list.reload}
        />
        <Button
          label={t('admin.channelMonitor.template.manageButton')}
          variant="secondary"
          icon={<Icon icon={Squares2X2Icon} />}
          isDisabled={!onManageTemplates}
          onClick={onManageTemplates}
        />
        <Button
          label={t('admin.channelMonitor.createButton')}
          variant="primary"
          icon={<Icon icon={PlusIcon} />}
          isDisabled={!onCreate}
          onClick={onCreate}
        />
      </HStack>
    </HStack>
  )
}
