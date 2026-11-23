import { useEffect, useRef, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Check, Copy, Zap } from 'lucide-react'
import type { CustomEndpoint } from '@/types'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'

interface EndpointPopoverProps {
  apiBaseUrl?: string
  customEndpoints?: CustomEndpoint[]
}

const COPIED_FEEDBACK_MS = 1800

const speedTestUrl = (endpoint: string) => `https://www.tcptest.cn/http/${encodeURIComponent(endpoint)}`

/**
 * The API endpoints a key can be used against, one chip each: click the
 * address to copy it, or open a latency test for it (port of EndpointPopover.vue).
 */
export function EndpointPopover({ apiBaseUrl, customEndpoints = [] }: EndpointPopoverProps) {
  const { t } = useI18n()
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null)
  const resetTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  const endpoints: Array<CustomEndpoint & { isDefault: boolean }> = []
  if (apiBaseUrl) {
    endpoints.push({ name: t('keys.endpoints.title'), endpoint: apiBaseUrl, description: '', isDefault: true })
  }
  for (const endpoint of customEndpoints) endpoints.push({ ...endpoint, isDefault: false })

  if (endpoints.length === 0) return null

  const copy = async (url: string) => {
    const success = await copyToClipboard(url, t('keys.endpoints.copied'))
    if (!success) return
    setCopiedEndpoint(url)
    window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => {
      setCopiedEndpoint((current) => (current === url ? null : current))
    }, COPIED_FEEDBACK_MS)
  }

  return (
    <HStack gap={2} wrap="wrap">
      {endpoints.map((item, index) => {
        const isCopied = copiedEndpoint === item.endpoint
        const hint = isCopied ? t('keys.endpoints.copiedHint') : t('keys.endpoints.clickToCopy')
        return (
          <Card key={index} padding={1}>
            <HStack gap={1} vAlign="center" paddingInlineStart={1.5}>
              <Text type="label" color="secondary">
                {item.name}
              </Text>
              {item.isDefault && <Badge variant="info" label={t('keys.endpoints.default')} />}
              <Button
                variant="ghost"
                size="sm"
                label={item.endpoint}
                tooltip={item.description ? `${item.description} · ${hint}` : hint}
                onClick={() => void copy(item.endpoint)}
              >
                <Text type="code" color="secondary">
                  {item.endpoint}
                </Text>
              </Button>
              <IconButton
                variant="ghost"
                size="sm"
                label={hint}
                icon={<Icon icon={isCopied ? Check : Copy} color={isCopied ? 'success' : 'inherit'} />}
                onClick={() => void copy(item.endpoint)}
              />
              <IconButton
                variant="ghost"
                size="sm"
                label={t('keys.endpoints.speedTest')}
                tooltip={t('keys.endpoints.speedTest')}
                icon={<Icon icon={Zap} />}
                href={speedTestUrl(item.endpoint)}
                target="_blank"
                rel="noopener noreferrer"
              />
            </HStack>
          </Card>
        )
      })}
    </HStack>
  )
}
