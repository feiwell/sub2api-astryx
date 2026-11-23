import { getGatewayBaseURL } from '@/api/url'
import { useId, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { ConfigFileBlock } from '~/components/keys/useKey/ConfigFileBlock'
import { CLAUDE, GEMINI, GPT, type ProviderBrand } from './providerBrands'

const API_KEY_PLACEHOLDER = 'YOUR_API_KEY'

interface Sample {
  id: string
  label: string
  brand: ProviderBrand
  /** The request as a terminal command, for the address the gateway is served at. */
  command: (root: string) => string
}

// One request per protocol the gateway speaks; each takes the key in that protocol's own header.
const SAMPLES: readonly [Sample, ...Sample[]] = [
  {
    id: 'claude',
    label: 'Claude',
    brand: CLAUDE,
    command: (root) => `curl ${root}/v1/messages \\
  -H "x-api-key: ${API_KEY_PLACEHOLDER}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  },
  {
    id: 'gpt',
    label: 'GPT',
    brand: GPT,
    command: (root) => `curl ${root}/v1/chat/completions \\
  -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    brand: GEMINI,
    command: (root) => `curl "${root}/v1beta/models/gemini-2.5-pro:generateContent" \\
  -H "x-goog-api-key: ${API_KEY_PLACEHOLDER}" \\
  -H "content-type: application/json" \\
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}]
  }'`,
  },
]

/** A sample request for each protocol, addressed to this site, behind one tab per provider. */
export function QuickStart({ apiBaseUrl, label }: { apiBaseUrl: string; label: string }) {
  const [activeId, setActiveId] = useState(SAMPLES[0].id)
  const panelId = useId()
  const sample = SAMPLES.find((candidate) => candidate.id === activeId) ?? SAMPLES[0]
  // Each protocol adds its own version segment, so the address is used without a trailing /v1.
  const root = (apiBaseUrl || getGatewayBaseURL()).replace(/\/v1\/?$/, '').replace(/\/+$/, '')

  return (
    <Card width="100%" maxWidth={820}>
      <VStack gap={4}>
        <TabList value={activeId} onChange={setActiveId} role="tablist" aria-label={label} hasDivider isFullBleed>
          {SAMPLES.map(({ id, label: name, brand }) => (
            <Tab
              key={id}
              value={id}
              label={name}
              icon={<Text aria-hidden weight="semibold" color="secondary">{brand.initials}</Text>}
              panelId={panelId}
            />
          ))}
        </TabList>
        <VStack id={panelId} role="tabpanel">
          <ConfigFileBlock
            key={sample.id}
            file={{ path: 'Terminal', language: 'bash', content: sample.command(root) }}
          />
        </VStack>
      </VStack>
    </Card>
  )
}
