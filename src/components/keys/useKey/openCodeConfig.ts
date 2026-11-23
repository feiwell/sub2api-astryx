import {
  anthropicModels,
  antigravityClaudeModels,
  antigravityGeminiModels,
  geminiModels,
  grokModels,
  openaiModels,
} from './openCodeModels'
import type { ConfigFile, Translate } from './types'

export type OpenCodeProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'antigravity-claude'
  | 'antigravity-gemini'
  | 'grok'

// Field order is the order the fields appear in the generated file.
const PROVIDERS: Record<OpenCodeProvider, { npm?: string; name?: string; models: object }> = {
  anthropic: { npm: '@ai-sdk/anthropic', models: anthropicModels },
  openai: { models: openaiModels },
  gemini: { npm: '@ai-sdk/google', models: geminiModels },
  'antigravity-claude': { npm: '@ai-sdk/anthropic', name: 'Antigravity (Claude)', models: antigravityClaudeModels },
  'antigravity-gemini': { npm: '@ai-sdk/google', name: 'Antigravity (Gemini)', models: antigravityGeminiModels },
  grok: { npm: '@ai-sdk/openai-compatible', name: 'Grok via Sub2API', models: grokModels },
}

export function openCodeFile(
  provider: OpenCodeProvider,
  baseUrl: string,
  apiKey: string,
  t: Translate,
  path = 'opencode.json',
): ConfigFile {
  const agent =
    provider === 'openai' ? { build: { options: { store: false } }, plan: { options: { store: false } } } : undefined
  const content = JSON.stringify(
    {
      provider: { [provider]: { options: { baseURL: baseUrl, apiKey }, ...PROVIDERS[provider] } },
      ...(agent && { agent }),
      $schema: 'https://opencode.ai/config.json',
    },
    null,
    2,
  )
  return { path, language: 'json', content, hint: t('keys.useKeyModal.opencode.hint') }
}
