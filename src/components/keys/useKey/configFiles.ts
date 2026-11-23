import { claudeCodeFiles, geminiCliFile, grokClaudeCodeFiles, grokCliFiles, systemOneFile } from './clientFiles'
import { grokCodexFiles, openAICodexFiles, routedCodexFiles } from './codexFiles'
import { openCodeFile } from './openCodeConfig'
import type { CodexSetup, ConfigFile, ConfigRequest, Translate } from './types'

function withSuffix(url: string, suffix: string): string {
  const trimmed = url.replace(/\/+$/, '')
  return trimmed.endsWith(suffix) ? trimmed : `${trimmed}${suffix}`
}

/** The files or commands to copy for one client on one system, in the order they are shown. */
export function buildConfigFiles(request: ConfigRequest, t: Translate): ConfigFile[] {
  const { client, shell, apiKey, baseUrl } = request
  const { platform } = request.group
  // Clients disagree on who adds the version segment: Anthropic clients append /v1/messages
  // themselves, Codex appends only /responses, Gemini clients expect /v1beta.
  const root = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '')
  const apiBase = withSuffix(root, '/v1')
  const codex: CodexSetup = { shell, apiKey, authMode: request.codexAuthMode, catalog: request.codexCatalog }

  if (client === 'opencode') {
    switch (platform) {
      case 'anthropic':
        return [openCodeFile('anthropic', apiBase, apiKey, t)]
      case 'gemini':
        return [openCodeFile('gemini', withSuffix(root, '/v1beta'), apiKey, t)]
      case 'antigravity':
        return [
          openCodeFile(
            'antigravity-claude',
            withSuffix(`${root}/antigravity`, '/v1'),
            apiKey,
            t,
            'opencode.json (Claude)',
          ),
          openCodeFile(
            'antigravity-gemini',
            withSuffix(`${root}/antigravity`, '/v1beta'),
            apiKey,
            t,
            'opencode.json (Gemini)',
          ),
        ]
      case 'grok':
        return [openCodeFile('grok', apiBase, apiKey, t)]
      default:
        return [openCodeFile('openai', apiBase, apiKey, t)]
    }
  }

  switch (platform) {
    case 'typesafe':
      return [systemOneFile(root, apiKey, shell)]
    case 'openai':
      if (client === 'claude') return claudeCodeFiles(root, apiKey, shell, t)
      return openAICodexFiles(apiBase, codex, client === 'codex-ws', t)
    case 'gemini':
      if (client === 'codex') return routedCodexFiles(apiBase, platform, codex, t)
      return [geminiCliFile(baseUrl, apiKey, shell, t)]
    case 'antigravity':
      if (client === 'codex') return routedCodexFiles(apiBase, platform, codex, t)
      if (client === 'gemini') return [geminiCliFile(`${baseUrl}/antigravity`, apiKey, shell, t)]
      return claudeCodeFiles(`${baseUrl}/antigravity`, apiKey, shell, t)
    case 'grok':
      if (client === 'claude') return grokClaudeCodeFiles(root, apiKey, shell, t)
      if (client === 'codex') return grokCodexFiles(apiBase, codex, t)
      return grokCliFiles(apiBase, apiKey, shell, t)
    case 'deepseek':
    case 'minimax':
    case 'composite':
      if (client === 'codex') return routedCodexFiles(apiBase, platform, codex, t)
      return claudeCodeFiles(root, apiKey, shell, t)
    default:
      if (client === 'codex') return routedCodexFiles(apiBase, platform, codex, t)
      return claudeCodeFiles(baseUrl, apiKey, shell, t)
  }
}
