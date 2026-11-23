import { useMemo, useState } from 'react'
import { Selector, SelectorOption } from '@astryxdesign/core/Selector'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, StackItem } from '@astryxdesign/core/Stack'
import { PlayIcon } from '@heroicons/react/24/outline'
import type { AdminGroup, Proxy } from '@/types'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { selectIsSimpleMode, useAuthStore } from '~/stores/auth'

interface ProxyTestResult {
  success: boolean
  latency_ms?: number
  country?: string
}

interface ProxyPickerProps {
  value: number | null
  onChange: (proxyId: number | null) => void
  proxies: Proxy[]
  label: string
  isDisabled?: boolean
}

/**
 * Proxy picker with connection testing (port of ProxySelector.vue): "no
 * proxy" plus every proxy, searchable, with per-run test results shown on
 * each option.
 */
export function ProxyPicker({ value, onChange, proxies, label, isDisabled }: ProxyPickerProps) {
  const { t } = useI18n()
  const [testResults, setTestResults] = useState<Record<number, ProxyTestResult>>({})
  const [batchTesting, setBatchTesting] = useState(false)

  const proxyById = useMemo(() => new Map(proxies.map((proxy) => [String(proxy.id), proxy])), [proxies])

  const resultText = (result: ProxyTestResult | undefined) => {
    if (!result) return ''
    if (!result.success) return t('admin.proxies.testFailed')
    return [result.country, result.latency_ms ? `${result.latency_ms}ms` : ''].filter(Boolean).join(' ')
  }

  const options = useMemo(
    () => [
      { value: '', label: t('admin.accounts.noProxy') },
      ...proxies.map((proxy) => ({
        value: String(proxy.id),
        label: proxy.name,
        description: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
      })),
    ],
    [proxies, t],
  )

  const testProxy = async (proxy: Proxy) => {
    try {
      const result = await adminAPI.proxies.testProxy(proxy.id)
      setTestResults((prev) => ({ ...prev, [proxy.id]: result }))
    } catch {
      setTestResults((prev) => ({ ...prev, [proxy.id]: { success: false } }))
    }
  }

  const handleBatchTest = async () => {
    if (batchTesting || proxies.length === 0) return
    setBatchTesting(true)
    try {
      // Test all proxies in parallel
      await Promise.all(proxies.map(testProxy))
    } finally {
      setBatchTesting(false)
    }
  }

  return (
    <HStack gap={2} vAlign="end">
      <StackItem size="fill">
        <Selector
          label={label}
          isLabelHidden
          options={options}
          value={value === null ? '' : String(value)}
          onChange={(next) => onChange(next ? Number(next) : null)}
          hasSearch
          searchPlaceholder={t('admin.proxies.searchProxies')}
          emptySearchText={t('common.noOptionsFound')}
          isDisabled={isDisabled}
          renderOption={(option) => {
            const proxy = proxyById.get(option.value)
            if (!proxy) return <SelectorOption label={option.label || option.value} />
            const result = resultText(testResults[proxy.id])
            return (
              <SelectorOption
                label={proxy.name}
                description={result ? `${option.description} · ${result}` : option.description}
                endContent={
                  proxy.account_count !== undefined ? <Badge label={String(proxy.account_count)} variant="neutral" /> : undefined
                }
              />
            )
          }}
        />
      </StackItem>
      {proxies.length > 0 && (
        <Button
          label={t('admin.proxies.batchTest')}
          icon={<Icon icon={PlayIcon} />}
          isLoading={batchTesting}
          isDisabled={isDisabled}
          onClick={() => void handleBatchTest()}
        />
      )}
    </HStack>
  )
}

interface GroupPickerProps {
  value: number[]
  onChange: (groupIds: number[]) => void
  groups: (AdminGroup & { account_count?: number })[]
  label: string
  isDisabled?: boolean
}

/**
 * Multi-group picker (port of GroupSelector.vue): every group with its
 * platform, rate and account count; composite groups are hidden in simple mode.
 */
export function GroupPicker({ value, onChange, groups, label, isDisabled }: GroupPickerProps) {
  const { t } = useI18n()
  const isSimpleMode = useAuthStore(selectIsSimpleMode)

  const options = useMemo(() => {
    const visible = isSimpleMode ? groups.filter((group) => group.platform !== 'composite') : groups
    return visible.map((group) => {
      const platformKey = `admin.groups.platforms.${group.platform}`
      const platformLabel = t(platformKey) === platformKey ? group.platform : t(platformKey)
      const detail =
        group.rate_multiplier == null
          ? platformLabel
          : `${platformLabel} · ${t('admin.groups.rateAndAccounts', { rate: group.rate_multiplier, count: group.account_count || 0 })}`
      return { value: String(group.id), label: group.name, description: detail }
    })
  }, [groups, isSimpleMode, t])

  return (
    <MultiSelector
      label={label}
      isLabelHidden
      options={options}
      value={value.map(String)}
      onChange={(ids) => onChange(ids.map(Number))}
      hasSearch={options.length > 5}
      searchPlaceholder={t('common.searchPlaceholder')}
      emptyText={t('common.noGroupsAvailable')}
      triggerDisplay="badges"
      placeholder={t('admin.accounts.selectedCount', { count: 0 })}
      isDisabled={isDisabled}
    />
  )
}
