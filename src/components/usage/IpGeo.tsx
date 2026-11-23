import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { HoverCard } from '@astryxdesign/core/HoverCard'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon, ExclamationCircleIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { effect } from '@vue/reactivity'
import { fetchBatch, fetchOne, getEntry, type IpGeoDetail, type IpGeoEntry } from '@/utils/ipGeoLookup'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

/**
 * Calls `onChange` whenever the lookup of one of these addresses changes state. The shared lookup keeps its
 * results in a Vue-reactive map; an effect that reads the entries is how anything outside Vue hears of a change.
 */
function watchLookups(ips: string[], onChange: () => void): () => void {
  let isFirstRun = true
  const runner = effect(() => {
    for (const ip of ips) getEntry(ip)
    if (isFirstRun) isFirstRun = false
    else onChange()
  })
  return () => runner.effect.stop()
}

function useIpGeoEntry(ip: string): IpGeoEntry {
  const subscribe = useCallback((onChange: () => void) => watchLookups([ip], onChange), [ip])
  return useSyncExternalStore(subscribe, () => getEntry(ip))
}

/** A lookup that has not been made, or that failed, can still be made. */
const isPending = (ip: string) => {
  const { status } = getEntry(ip)
  return status === 'idle' || status === 'error'
}

function geoDetailLines(detail: IpGeoDetail | undefined, t: (key: string) => string): { label: string; value: string }[] {
  if (!detail) return []
  const lines = [
    { label: t('usage.ipGeo.detailOrg'), value: detail.organization },
    { label: t('usage.ipGeo.detailTimezone'), value: detail.timezone },
    { label: t('usage.ipGeo.detailAccuracy'), value: detail.accuracy != null ? `${detail.accuracy}km` : undefined },
    {
      label: t('usage.ipGeo.detailCoordinates'),
      value: detail.latitude && detail.longitude ? `${detail.latitude}, ${detail.longitude}` : undefined,
    },
  ]
  return lines.flatMap((line) => (line.value ? [{ label: line.label, value: line.value }] : []))
}

/**
 * Where an address is, under the address in a table cell. Nothing is looked up until it is asked for: a lookup
 * sends the address to a public geolocation service.
 */
export function IpGeoCell({ ip }: { ip: string }) {
  const { t } = useI18n()
  const entry = useIpGeoEntry(ip)

  if (entry.status === 'loading') {
    return (
      <HStack gap={1} vAlign="center">
        <Spinner size="sm" />
        <Text type="supporting">{t('usage.ipGeo.fetching')}</Text>
      </HStack>
    )
  }
  if (entry.status === 'private') return <Text type="supporting">{t('usage.ipGeo.private')}</Text>
  if (entry.status === 'error') {
    return (
      <HStack gap={1} vAlign="center">
        <Icon icon={ExclamationCircleIcon} size="xsm" color="error" />
        <Link type="supporting" onClick={() => void fetchOne(ip)}>
          {t('usage.ipGeo.failed')}
        </Link>
      </HStack>
    )
  }
  if (entry.status !== 'success') {
    return (
      <Link type="supporting" onClick={() => void fetchOne(ip)}>
        {t('usage.ipGeo.fetch')}
      </Link>
    )
  }

  const lines = geoDetailLines(entry.detail, t)
  const place = (
    <Link
      type="supporting"
      color="secondary"
      href={`https://www.iplocation.net/ip-lookup?query=${encodeURIComponent(ip)}`}
      isExternalLink>
      {entry.label || ip}
    </Link>
  )
  return (
    <HStack gap={0.5} vAlign="center">
      {lines.length > 0 ? (
        <HoverCard
          content={
            <VStack gap={1} hAlign="stretch">
              {lines.map((line) => (
                <HStack key={line.label} gap={4} hAlign="between" vAlign="center">
                  <Text type="supporting">{line.label}</Text>
                  <Text type="supporting" color="primary" hasTabularNumbers>
                    {line.value}
                  </Text>
                </HStack>
              ))}
            </VStack>
          }>
          {place}
        </HoverCard>
      ) : (
        place
      )}
      <IconButton
        label={t('usage.ipGeo.refreshTitle')}
        tooltip={t('usage.ipGeo.refreshTitle')}
        icon={<Icon icon={ArrowPathIcon} />}
        variant="ghost"
        size="sm"
        onClick={() => void fetchOne(ip, true)}
      />
    </HStack>
  )
}

/**
 * Looks up every address of the page that has no result yet, in one go. Renders nothing while the page has no
 * addresses at all.
 */
export function IpGeoBatchButton({ ips }: { ips: Array<string | null | undefined> }) {
  const { t } = useI18n()
  const [isFetching, setFetching] = useState(false)
  // The list is a new array on every render; its content is what the subscription depends on.
  const key = [...new Set(ips.filter((ip): ip is string => Boolean(ip)))].join('\n')
  const unique = useMemo(() => (key ? key.split('\n') : []), [key])
  const subscribe = useCallback((onChange: () => void) => watchLookups(unique, onChange), [unique])
  const pendingCount = useSyncExternalStore(subscribe, () => unique.filter(isPending).length)

  if (unique.length === 0) return null

  const fetchAll = async () => {
    setFetching(true)
    try {
      const isComplete = await fetchBatch(unique)
      if (!isComplete) toast.error(t('usage.ipGeo.batchFailed'))
    } finally {
      setFetching(false)
    }
  }

  return (
    <HStack gap={2} vAlign="center">
      {pendingCount > 0 && <Text type="supporting">{t('usage.ipGeo.pending', { count: pendingCount })}</Text>}
      <Button
        label={isFetching ? t('usage.ipGeo.batchFetching') : t('usage.ipGeo.batchFetch')}
        variant="ghost"
        size="sm"
        icon={<Icon icon={GlobeAltIcon} />}
        isLoading={isFetching}
        isDisabled={pendingCount === 0}
        onClick={() => void fetchAll()}
      />
    </HStack>
  )
}
