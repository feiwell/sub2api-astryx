import { useEffect, useMemo, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { keysAPI, userGroupsAPI } from '@/api'
import type { ApiKey, Group } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { maskApiKey } from '@/utils/maskApiKey'
import { useGroupOptions } from '~/components/keys/groupOptions'
import { t as translate, useI18n } from '~/i18n'
import type { Provider } from '~/lib/api/admin/channelMonitor'
import { keysFor, usableKeys } from './monitorKeys'

// As many keys as are read; an administrator checking the site itself rarely has more.
const KEYS_READ = 100

/**
 * Picks one of the administrator's own keys for a monitor that checks this site. Only keys that can be used
 * and that reach the monitor's provider are offered. Port of components/admin/monitor/MonitorKeyPickerDialog.vue.
 */
export function MonitorKeyPickerDialog({
  provider,
  onPick,
  onClose,
}: {
  provider: Provider
  /** The key picked, in full. */
  onPick: (key: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  // Null until the keys are read.
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [groupRates, setGroupRates] = useState<Record<number, number>>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    keysAPI.list(1, KEYS_READ, { status: 'active' }, { signal: controller.signal }).then(
      (answer) => setKeys(usableKeys(answer.items || [], Date.now())),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setKeys([])
        setFailure(extractApiErrorMessage(error, translate('keys.failedToLoad')))
      },
    )
    // The rates only add to what is shown of a group; a key can be picked without them.
    userGroupsAPI.getUserGroupRates().then(
      (rates) => {
        if (!controller.signal.aborted) setGroupRates(rates)
      },
      (error: unknown) => console.error('[channel-monitor] group rates failed to load', error),
    )
    return () => controller.abort()
  }, [])

  const groups = useMemo(() => {
    const byId = new Map<number, Group>()
    for (const key of keys ?? []) {
      if (key.group) byId.set(key.group.id, key.group)
    }
    return [...byId.values()]
  }, [keys])
  const { renderValue } = useGroupOptions(groups, groupRates)

  const offered = keysFor(keys ?? [], provider, search)
  const close = (isOpen: boolean) => {
    if (!isOpen) onClose()
  }

  return (
    <Dialog isOpen onOpenChange={close} width={520} maxHeight="80dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.channelMonitor.form.selectKeyTitle')} onOpenChange={close} />}
        content={
          <LayoutContent>
            <VStack gap={3} hAlign="stretch">
              <Text type="supporting">{t('admin.channelMonitor.form.selectKeyHint')}</Text>
              <TextInput
                label={t('common.search')}
                isLabelHidden
                type="search"
                width="100%"
                placeholder={t('keys.searchPlaceholder')}
                startIcon={MagnifyingGlassIcon}
                hasClear
                hasAutoFocus
                value={search}
                onChange={setSearch}
              />

              {failure && <Banner status="error" title={failure} />}

              {keys === null ? (
                <Center padding={6}>
                  <Spinner label={t('common.loading')} />
                </Center>
              ) : offered.length === 0 ? (
                // A failed load leaves only its banner.
                !failure && (
                  <Center padding={6}>
                    <Text type="supporting">
                      {search.trim() ? t('common.noOptionsFound') : t('admin.channelMonitor.form.noActiveKey')}
                    </Text>
                  </Center>
                )
              ) : (
                <List hasDividers>
                  {offered.map((key) => (
                    <ListItem
                      key={key.id}
                      label={key.name}
                      description={maskApiKey(key.key)}
                      endContent={
                        key.group ? renderValue({ value: String(key.group.id), label: key.group.name }) : undefined
                      }
                      onClick={() => onPick(key.key)}
                    />
                  ))}
                </List>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
