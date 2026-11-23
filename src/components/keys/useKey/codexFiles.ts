import { buildCodexModelCatalogUrl } from '@/api/codex'
import type { GroupPlatform } from '@/types'
import { buildCodexApiKeyAuthConfig } from '@/utils/codexAuthConfig'
import { formatCodexReasoningEffortTomlLine, selectCodexConfigReasoningEffort } from '@/utils/codexCatalogConfig'
import { environmentFile } from './clientFiles'
import type { CodexCatalog, CodexSetup, ConfigFile, ShellId, Translate } from './types'

// Codex expands a leading ~/ on every system but not %userprofile%, so config.toml always names
// the catalog file with ~/.
const CATALOG_FILE_IN_CONFIG = '~/.codex/codex-models.json'

function configDir(shell: ShellId): string {
  return shell === 'windows' ? '%userprofile%\\.codex' : '~/.codex'
}

function configFilePath(shell: ShellId, name: string): string {
  return shell === 'windows' ? `${configDir(shell)}\\${name}` : `${configDir(shell)}/${name}`
}

/** Where a downloaded catalog has to be saved. */
export function codexCatalogFilePath(shell: ShellId): string {
  return configFilePath(shell, 'codex-models.json')
}

function catalogFileLine(catalog: CodexCatalog): string {
  return catalog.mode === 'file' ? `model_catalog_json = "${CATALOG_FILE_IN_CONFIG}"\n` : ''
}

function catalogUrlLine(catalog: CodexCatalog, baseUrl: string): string {
  if (catalog.mode !== 'remote') return ''
  const url = buildCodexModelCatalogUrl(baseUrl).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `model_catalog_url = "${url}"\n`
}

/** The preferred model while the fetched catalog offers it or nothing was fetched; otherwise the catalog's first model. */
function pickModel(catalog: CodexCatalog, preferred: string): string {
  if (catalog.models.some((model) => model.slug === preferred)) return preferred
  return catalog.models[0]?.slug || preferred
}

function reasoningEffortLine(catalog: CodexCatalog, slug: string): string {
  const model = catalog.models.find((entry) => entry.slug === slug)
  return formatCodexReasoningEffortTomlLine(selectCodexConfigReasoningEffort(model))
}

/** Codex pointed at an OpenAI group, over HTTP or over WebSocket. */
export function openAICodexFiles(
  baseUrl: string,
  { shell, apiKey, authMode, catalog }: CodexSetup,
  isWebSocket: boolean,
  t: Translate,
): ConfigFile[] {
  const model = pickModel(catalog, 'gpt-6.1-sol')
  const isRemote = catalog.mode === 'remote'
  const isApiKeyMode = authMode === 'api-key'
  const auth = isApiKeyMode ? buildCodexApiKeyAuthConfig(apiKey) : 'requires_openai_auth = true'

  const content = `model_provider = "OpenAI"
model = "${model}"
review_model = "${model}"
web_search = "live"
${reasoningEffortLine(catalog, model)}disable_response_storage = true
${catalogFileLine(catalog)}network_access = "enabled"
windows_wsl_setup_acknowledged = true

[model_providers.OpenAI]
name = "OpenAI"
base_url = "${baseUrl}"
${catalogUrlLine(catalog, baseUrl)}wire_api = "responses"
${isWebSocket ? 'supports_websockets = true\n' : ''}${auth}

[features]
${isRemote ? 'api_key_model_discovery = true\n' : ''}${isApiKeyMode ? 'image_generation = true\n' : ''}${isWebSocket ? 'responses_websockets_v2 = true\n' : ''}goals = true`

  // These two paths keep a forward slash on Windows as well, as in the Vue dialog.
  const files: ConfigFile[] = [
    {
      path: `${configDir(shell)}/config.toml`,
      language: 'toml',
      content,
      hint: t('keys.useKeyModal.openai.configTomlHint'),
    },
  ]
  // Older clients read the key from auth.json instead of the provider section.
  if (!isApiKeyMode) {
    files.push({
      path: `${configDir(shell)}/auth.json`,
      language: 'json',
      content: JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2),
    })
  }
  return files
}

const ROUTED_MODELS: Record<string, string> = {
  openai: 'gpt-6.1-sol',
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-pro',
  antigravity: 'claude-sonnet-4-6',
  grok: 'grok-4.5',
  kimi: 'kimi-k2.5',
  zhipu: 'glm-4.7',
  deepseek: 'deepseek-v4-pro',
  minimax: 'MiniMax-M3',
  opencode_go: 'glm-5.3',
  composite: 'gpt-6.1-sol',
}

const PLATFORM_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
  kimi: 'Kimi',
  zhipu: 'Zhipu',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  opencode_go: 'OpenCode',
  typesafe: 'TypeSafe / Jev',
  command_code: 'Command Code',
  cline: 'Cline',
  composite: 'Composite',
}

function routedConfigHint(platform: GroupPlatform, t: Translate): string {
  switch (platform) {
    case 'deepseek':
      return t('keys.useKeyModal.deepseek.codexConfigTomlHint')
    case 'minimax':
      return t('keys.useKeyModal.minimax.codexConfigTomlHint')
    case 'composite':
      return t('keys.useKeyModal.composite.codexConfigTomlHint')
    default:
      return t('keys.useKeyModal.routedCodex.configTomlHint')
  }
}

/** Codex pointed at a group of another platform: the key comes from the environment and the gateway routes by model. */
export function routedCodexFiles(
  baseUrl: string,
  platform: GroupPlatform,
  { shell, apiKey, catalog }: CodexSetup,
  t: Translate,
): ConfigFile[] {
  const model = pickModel(catalog, ROUTED_MODELS[platform] ?? '')
  // A platform the backend registered after this table was written is named by its identifier.
  const label = PLATFORM_LABELS[platform] ?? platform

  const content = `# Codex CLI -> Sub2API ${label} group
model_provider = "sub2api"
model = "${model}"
review_model = "${model}"
disable_response_storage = true
${catalogFileLine(catalog)}
[model_providers.sub2api]
name = "Sub2API ${label}"
base_url = "${baseUrl}"
${catalogUrlLine(catalog, baseUrl)}env_key = "SUB2API_API_KEY"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false${catalog.mode === 'remote' ? '\n\n[features]\napi_key_model_discovery = true' : ''}`

  return [
    environmentFile(shell, { SUB2API_API_KEY: apiKey }),
    {
      path: configFilePath(shell, 'config.toml'),
      language: 'toml',
      content,
      hint: routedConfigHint(platform, t),
    },
  ]
}

/** Codex pointed at a Grok group. The comments are part of what the user copies. */
export function grokCodexFiles(baseUrl: string, { shell, apiKey, catalog }: CodexSetup, t: Translate): ConfigFile[] {
  const model = pickModel(catalog, 'grok-4.5')
  const features =
    catalog.mode === 'remote'
      ? '[features]\napi_key_model_discovery = true\n\n# Optional:'
      : '# Optional:\n# [features]'

  const content = `# Codex CLI → Sub2API Grok group
# Docs: Codex config reference (model_providers.*, wire_api = "responses")
#
# Text models only. Image/video: grok-imagine-image / grok-imagine-video on media endpoints.
# Switch model: grok-4.5 | grok-4.3 | grok-build-0.1 | grok-4.20-multi-agent-0309 (text / web_search)

model_provider = "sub2api"
model = "${model}"
${catalogFileLine(catalog)}# Optional:
# review_model = "${model}"
# model_reasoning_effort = "medium"
# model_context_window = 500000
# disable_response_storage = true
# network_access = "enabled"
# windows_wsl_setup_acknowledged = true

[model_providers.sub2api]
name = "Sub2API Grok"
base_url = "${baseUrl}"
${catalogUrlLine(catalog, baseUrl)}# Prefer env_key (variable NAME). Do not combine with experimental_bearer_token.
env_key = "SUB2API_API_KEY"
# Fallback only if you cannot set env (discouraged — keeps secret on disk):
# experimental_bearer_token = "${apiKey}"
wire_api = "responses"
# API-key providers: do not require ChatGPT OAuth login
requires_openai_auth = false
# Grok/Sub2API path is HTTP/SSE; disable WS (Codex may otherwise try WebSocket first)
supports_websockets = false

${features}
# goals = true`

  return [
    environmentFile(shell, { SUB2API_API_KEY: apiKey }),
    {
      path: configFilePath(shell, 'config.toml'),
      language: 'toml',
      content,
      hint: t('keys.useKeyModal.grok.codexConfigTomlHint'),
    },
  ]
}
