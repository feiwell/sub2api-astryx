import type { GroupPlatform } from '@/types'
import type { CodexCatalogModel } from '@/utils/codexCatalogConfig'

export type ClientId = 'claude' | 'codex' | 'codex-ws' | 'gemini' | 'grok' | 'opencode' | 'systemone'

/** `windows` stands for clients that keep their settings in a file, where only the operating system matters. */
export type ShellId = 'unix' | 'cmd' | 'powershell' | 'windows'

export type Translate = (key: string) => string

/** The parts of a key's group that decide which setup guides apply. */
export interface KeyGroup {
  platform: GroupPlatform
  claudeCodeOnly: boolean
  allowMessagesDispatch: boolean
}

export type ConfigLanguage = 'bash' | 'cmd' | 'powershell' | 'toml' | 'json'

export interface ConfigFile {
  /** A file path, or the name of the terminal the commands are meant for. */
  path: string
  content: string
  language: ConfigLanguage
  hint?: string
}

export type CodexAuthMode = 'legacy' | 'api-key'

export interface CodexCatalog {
  /** Whether Codex loads the model catalog from the gateway or from a downloaded file. */
  mode: 'remote' | 'file'
  /** Models of the catalog fetched in the dialog; empty until it has been fetched. */
  models: CodexCatalogModel[]
}

export interface CodexSetup {
  shell: ShellId
  apiKey: string
  authMode: CodexAuthMode
  catalog: CodexCatalog
}

export interface ConfigRequest {
  group: KeyGroup
  client: ClientId
  shell: ShellId
  apiKey: string
  /** Never empty: the site's API address, or the page origin when the site has none. */
  baseUrl: string
  codexAuthMode: CodexAuthMode
  codexCatalog: CodexCatalog
}
