import type { GroupPlatform } from '@/types'
import type { ClientId, KeyGroup, ShellId, Translate } from './types'

/** Clients a key of this group can be set up for. The first one is selected when the dialog opens. */
export function clientsFor({ platform, claudeCodeOnly, allowMessagesDispatch }: KeyGroup): ClientId[] {
  if (claudeCodeOnly) return ['claude']
  switch (platform) {
    case 'openai':
      return allowMessagesDispatch ? ['codex', 'codex-ws', 'claude', 'opencode'] : ['codex', 'codex-ws', 'opencode']
    case 'gemini':
      return ['gemini', 'codex', 'opencode']
    case 'antigravity':
      return ['claude', 'gemini', 'codex', 'opencode']
    case 'grok':
      return ['grok', 'claude', 'codex', 'opencode']
    case 'typesafe':
      return ['systemone']
    default:
      return ['claude', 'codex', 'opencode']
  }
}

export function clientLabel(client: ClientId, t: Translate): string {
  switch (client) {
    case 'claude':
      return t('keys.useKeyModal.cliTabs.claudeCode')
    case 'codex':
      return t('keys.useKeyModal.cliTabs.codexCli')
    case 'codex-ws':
      return t('keys.useKeyModal.cliTabs.codexCliWs')
    case 'gemini':
      return t('keys.useKeyModal.cliTabs.geminiCli')
    case 'grok':
      return t('keys.useKeyModal.cliTabs.grokCli')
    case 'opencode':
      return t('keys.useKeyModal.cliTabs.opencode')
    case 'systemone':
      return t('keys.useKeyModal.cliTabs.systemOne')
  }
}

/** Product names, written the same in every language. */
export const SHELL_LABELS: Record<ShellId, string> = {
  unix: 'macOS / Linux',
  cmd: 'Windows CMD',
  powershell: 'PowerShell',
  windows: 'Windows',
}

/** OpenCode has one configuration file for every system, so it offers no choice. */
export function shellsFor(client: ClientId): ShellId[] {
  if (client === 'opencode') return []
  if (client === 'codex' || client === 'codex-ws' || client === 'grok') return ['unix', 'windows']
  return ['unix', 'cmd', 'powershell']
}

export function usesCodexCatalog(client: ClientId): boolean {
  return client === 'codex' || client === 'codex-ws'
}

/** Only an OpenAI group lets Codex choose how it signs in. */
export function offersCodexAuthMode(platform: GroupPlatform, client: ClientId): boolean {
  return platform === 'openai' && usesCodexCatalog(client)
}

/** Platforms whose Codex guide has texts of its own; every other platform shares the routed-group texts. */
function hasOwnCodexTexts(platform: GroupPlatform): boolean {
  return (
    platform === 'openai' ||
    platform === 'grok' ||
    platform === 'deepseek' ||
    platform === 'minimax' ||
    platform === 'composite'
  )
}

export function clientDescription(platform: GroupPlatform, client: ClientId, t: Translate): string {
  if (client === 'codex' && !hasOwnCodexTexts(platform)) return t('keys.useKeyModal.routedCodex.description')
  switch (platform) {
    case 'openai':
      return client === 'claude' ? t('keys.useKeyModal.description') : t('keys.useKeyModal.openai.description')
    case 'gemini':
      return t('keys.useKeyModal.gemini.description')
    case 'antigravity':
      return t('keys.useKeyModal.antigravity.description')
    case 'grok':
      if (client === 'claude') return t('keys.useKeyModal.grok.claudeDescription')
      if (client === 'codex') return t('keys.useKeyModal.grok.codexDescription')
      return t('keys.useKeyModal.grok.description')
    case 'deepseek':
      return client === 'codex'
        ? t('keys.useKeyModal.deepseek.codexDescription')
        : t('keys.useKeyModal.deepseek.description')
    case 'minimax':
      return client === 'codex'
        ? t('keys.useKeyModal.minimax.codexDescription')
        : t('keys.useKeyModal.minimax.description')
    case 'composite':
      return client === 'codex'
        ? t('keys.useKeyModal.composite.codexDescription')
        : t('keys.useKeyModal.composite.description')
    case 'typesafe':
      return t('keys.useKeyModal.typesafe.description')
    default:
      return t('keys.useKeyModal.description')
  }
}

/** The closing note of a guide; OpenCode has none. */
export function clientNote(platform: GroupPlatform, client: ClientId, shell: ShellId, t: Translate): string | null {
  if (client === 'opencode') return null
  if (client === 'codex' && !hasOwnCodexTexts(platform)) return t('keys.useKeyModal.routedCodex.note')
  switch (platform) {
    case 'openai':
      if (client === 'claude') return t('keys.useKeyModal.note')
      return shell === 'windows' ? t('keys.useKeyModal.openai.noteWindows') : t('keys.useKeyModal.openai.note')
    case 'gemini':
      return t('keys.useKeyModal.gemini.note')
    case 'antigravity':
      return client === 'claude'
        ? t('keys.useKeyModal.antigravity.claudeNote')
        : t('keys.useKeyModal.antigravity.geminiNote')
    case 'grok':
      if (client === 'claude') return t('keys.useKeyModal.grok.claudeNote')
      if (client === 'codex') {
        return shell === 'windows' ? t('keys.useKeyModal.grok.codexNoteWindows') : t('keys.useKeyModal.grok.codexNote')
      }
      return shell === 'windows' ? t('keys.useKeyModal.grok.noteWindows') : t('keys.useKeyModal.grok.note')
    case 'deepseek':
      return client === 'codex' ? t('keys.useKeyModal.deepseek.codexNote') : t('keys.useKeyModal.note')
    case 'minimax':
      return client === 'codex' ? t('keys.useKeyModal.minimax.codexNote') : t('keys.useKeyModal.note')
    case 'composite':
      return client === 'codex' ? t('keys.useKeyModal.composite.codexNote') : t('keys.useKeyModal.note')
    case 'typesafe':
      return t('keys.useKeyModal.typesafe.note')
    default:
      return t('keys.useKeyModal.note')
  }
}
