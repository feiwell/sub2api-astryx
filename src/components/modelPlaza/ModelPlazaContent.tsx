import { useState, useMemo } from 'react'
import { VStack, HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import type { ModelPlazaResponse, ModelPlazaGroup } from '@/api/modelPlaza'
import { useAuthStore } from '~/stores/auth'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface ModelPlazaContentProps {
  response: ModelPlazaResponse | null
  loading: boolean
  error: boolean
  embedded?: boolean
}

/**
 * ModelPlazaContent - Complete model marketplace display
 * Ported from frontend/src/components/modelPlaza/ModelPlazaContent.vue
 */
export function ModelPlazaContent({ response, loading, error, embedded }: ModelPlazaContentProps) {
  const isAuthenticated = useAuthStore((s) => !!s.token && !!s.user)

  const [selectedPlatform, setSelectedPlatform] = useState<string>('all')
  const [selectedGroupId, setSelectedGroupId] = useState<number | 'all'>('all')
  const [selectedRate, setSelectedRate] = useState<number | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const searchActive = searchQuery.trim() !== ''

  const descriptionHtml = useMemo(() => {
    const md = response?.description?.trim()
    if (!md) return ''
    return DOMPurify.sanitize(marked.parse(md) as string)
  }, [response?.description])

  function effectiveRate(g: ModelPlazaGroup): number {
    return g.user_rate_multiplier ?? g.rate_multiplier
  }

  const platforms = useMemo(
    () => [...new Set((response?.groups ?? []).map((g) => g.platform).filter(Boolean))].sort(),
    [response?.groups]
  )

  const groupOptions = useMemo(
    () =>
      (response?.groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        platform: g.platform,
        rate: effectiveRate(g),
      })),
    [response?.groups]
  )

  const rates = useMemo(
    () => [...new Set((response?.groups ?? []).map(effectiveRate))].sort((a, b) => a - b),
    [response?.groups]
  )

  const filteredGroups = useMemo(() => {
    let groups = response?.groups ?? []
    if (selectedPlatform !== 'all') {
      groups = groups.filter((g) => g.platform === selectedPlatform)
    }
    if (selectedGroupId !== 'all') {
      groups = groups.filter((g) => g.id === selectedGroupId)
    }
    if (selectedRate !== 'all') {
      groups = groups.filter((g) => effectiveRate(g) === selectedRate)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      groups = groups
        .map((g) => ({ ...g, models: g.models.filter((m) => m.name.toLowerCase().includes(q)) }))
        .filter((g) => g.models.length > 0)
    }
    return [...groups].sort(
      (a, b) => effectiveRate(a) - effectiveRate(b) || a.name.localeCompare(b.name)
    )
  }, [response?.groups, selectedPlatform, selectedGroupId, selectedRate, searchQuery])

  if (loading) {
    return (
      <Center axis="both" padding={8} style={{ minHeight: '240px' }}>
        <Spinner />
      </Center>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        Failed to load model plaza data
      </div>
    )
  }

  return (
    <VStack gap={5}>
      {!embedded && (
        <VStack gap={1}>
          <Text size="2xl" weight="bold">
            Model Plaza
          </Text>
          <Text color="secondary" size="sm">
            Browse available models and pricing
          </Text>
        </VStack>
      )}

      {descriptionHtml && (
        <div
          className="plaza-description rounded-2xl border border-gray-100 bg-white px-5 py-4 text-sm shadow-sm dark:border-dark-700/50 dark:bg-dark-800/50"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      {!isAuthenticated && (
        <Text size="sm" color="secondary" className="flex items-center gap-1.5">
          ℹ️ Login to see your custom pricing
        </Text>
      )}

      {/* Filter Bar */}
      <VStack gap={3}>
        <HStack gap={2} align="start">
          <Text size="sm" weight="semibold" className="w-10 shrink-0 pt-2 uppercase tracking-wider text-gray-400 dark:text-dark-500">
            Platform
          </Text>
          <div className="flex flex-wrap gap-2">
            <button
              className={`chip ${selectedPlatform === 'all' ? 'chip-active' : 'chip-inactive'}`}
              onClick={() => setSelectedPlatform('all')}
            >
              All
            </button>
            {platforms.map((p) => (
              <button
                key={p}
                className={`chip ${selectedPlatform === p ? 'chip-active' : 'chip-inactive'}`}
                onClick={() => setSelectedPlatform(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </HStack>

        <HStack gap={2} align="start">
          <Text size="sm" weight="semibold" className="w-10 shrink-0 pt-2 uppercase tracking-wider text-gray-400 dark:text-dark-500">
            Group
          </Text>
          <div className="flex flex-wrap gap-2">
            <button
              className={`chip ${selectedGroupId === 'all' ? 'chip-active' : 'chip-inactive'}`}
              onClick={() => setSelectedGroupId('all')}
            >
              All
            </button>
            {groupOptions.map((g) => (
              <button
                key={g.id}
                className={`chip ${selectedGroupId === g.id ? 'chip-active' : 'chip-inactive'}`}
                onClick={() => setSelectedGroupId(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </HStack>

        <HStack gap={2} align="start">
          <Text size="sm" weight="semibold" className="w-10 shrink-0 pt-2 uppercase tracking-wider text-gray-400 dark:text-dark-500">
            Rate
          </Text>
          <div className="flex flex-wrap gap-2">
            <button
              className={`chip ${selectedRate === 'all' ? 'chip-active' : 'chip-inactive'}`}
              onClick={() => setSelectedRate('all')}
            >
              All
            </button>
            {rates.map((r) => (
              <button
                key={r}
                className={`chip ${selectedRate === r ? 'chip-active' : 'chip-inactive'}`}
                onClick={() => setSelectedRate(r)}
              >
                {r}x
              </button>
            ))}
          </div>
        </HStack>

        <HStack gap={2} align="start">
          <Text size="sm" weight="semibold" className="w-10 shrink-0 pt-2 uppercase tracking-wider text-gray-400 dark:text-dark-500">
            Model
          </Text>
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="input w-full rounded-lg py-1.5 pl-3 pr-9"
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            )}
          </div>
        </HStack>
      </VStack>

      {/* Model Groups */}
      {filteredGroups.length > 0 ? (
        <VStack gap={5}>
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-dark-800/50 dark:border-dark-700"
            >
              <div className="border-b border-gray-100 px-5 py-4 dark:border-dark-700/60">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600 dark:bg-primary-900/20 dark:text-primary-400">
                    {group.name} · {effectiveRate(group)}x
                  </span>
                  {group.is_exclusive && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                      🛡️ Exclusive
                    </span>
                  )}
                </div>
                {group.description && (
                  <Text size="sm" color="secondary" className="mt-2">
                    {group.description}
                  </Text>
                )}
              </div>
              <div className="p-5">
                {group.models.length > 0 ? (
                  <VStack gap={2}>
                    {group.models.map((model) => (
                      <div key={model.name} className="flex justify-between py-2">
                        <Text size="sm" weight="medium">
                          {model.name}
                        </Text>
                        <Text size="sm" color="secondary" className="font-mono">
                          {model.pricing?.input_price != null
                            ? `$${(model.pricing.input_price * effectiveRate(group) * 1000000).toFixed(2)}/M`
                            : '-'}
                        </Text>
                      </div>
                    ))}
                  </VStack>
                ) : (
                  <Text size="sm" color="secondary" className="text-center">
                    No models
                  </Text>
                )}
              </div>
            </div>
          ))}
        </VStack>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-12 text-center text-sm text-gray-500 dark:border-dark-600 dark:text-dark-400">
          {searchActive ? 'No models found' : 'No models available'}
        </div>
      )}
    </VStack>
  )
}
