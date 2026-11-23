import { grokCliConfig } from './grokCliConfig'
import type { ConfigFile, ConfigLanguage, ShellId, Translate } from './types'

interface Terminal {
  path: string
  language: ConfigLanguage
  /** One line that sets an environment variable. */
  setVariable: (name: string, value: string) => string
}

const TERMINAL: Terminal = {
  path: 'Terminal',
  language: 'bash',
  setVariable: (name, value) => `export ${name}="${value}"`,
}

const COMMAND_PROMPT: Terminal = {
  path: 'Command Prompt',
  language: 'cmd',
  setVariable: (name, value) => `set ${name}=${value}`,
}

const POWERSHELL: Terminal = {
  path: 'PowerShell',
  language: 'powershell',
  setVariable: (name, value) => `$env:${name}="${value}"`,
}

/** Clients that only ask for the operating system get their Windows variables for PowerShell. */
function terminalFor(shell: ShellId): Terminal {
  if (shell === 'cmd') return COMMAND_PROMPT
  if (shell === 'powershell' || shell === 'windows') return POWERSHELL
  return TERMINAL
}

export function environmentFile(shell: ShellId, variables: Record<string, string>): ConfigFile {
  const terminal = terminalFor(shell)
  return {
    path: terminal.path,
    language: terminal.language,
    content: Object.entries(variables)
      .map(([name, value]) => terminal.setVariable(name, value))
      .join('\n'),
  }
}

function claudeCodeEnvironment(baseUrl: string, apiKey: string, shell: ShellId): string {
  if (shell === 'cmd') {
    return `set ANTHROPIC_BASE_URL=${baseUrl}
set ANTHROPIC_AUTH_TOKEN=${apiKey}
set CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
  }
  if (shell === 'powershell') {
    return `$env:ANTHROPIC_BASE_URL="${baseUrl}"
$env:ANTHROPIC_AUTH_TOKEN="${apiKey}"
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
  }
  return `export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_AUTH_TOKEN="${apiKey}"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`
}

/** The user-level settings file, which keeps the same variables between sessions. */
function claudeSettingsFile(env: Record<string, string>, shell: ShellId, t: Translate): ConfigFile {
  return {
    path: shell === 'unix' ? '~/.claude/settings.json' : '%USERPROFILE%\\.claude\\settings.json',
    language: 'json',
    content: JSON.stringify({ $schema: 'https://json.schemastore.org/claude-code-settings.json', env }, null, 2),
    hint: t('keys.useKeyModal.claudeSettingsHint'),
  }
}

export function claudeCodeFiles(baseUrl: string, apiKey: string, shell: ShellId, t: Translate): ConfigFile[] {
  const { path, language } = terminalFor(shell)
  const env = {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
  return [
    { path, language, content: claudeCodeEnvironment(baseUrl, apiKey, shell) },
    claudeSettingsFile(env, shell, t),
  ]
}

/** Claude Code asks for Anthropic model names, so each of them is pointed at the Grok model. */
export function grokClaudeCodeFiles(baseUrl: string, apiKey: string, shell: ShellId, t: Translate): ConfigFile[] {
  const env = {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_MODEL: 'grok-4.5',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'grok-4.5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'grok-4.5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'grok-4.5',
    ANTHROPIC_DEFAULT_FABLE_MODEL: 'grok-4.5',
    CLAUDE_CODE_SUBAGENT_MODEL: 'grok-4.5',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
  return [environmentFile(shell, env), claudeSettingsFile(env, shell, t)]
}

export function geminiCliFile(baseUrl: string, apiKey: string, shell: ShellId, t: Translate): ConfigFile {
  const file = environmentFile(shell, {
    GOOGLE_GEMINI_BASE_URL: baseUrl,
    GEMINI_API_KEY: apiKey,
    GEMINI_MODEL: 'gemini-2.0-flash',
  })
  // A Command Prompt line cannot end in a comment, so the remark about the model is left out there.
  if (shell === 'cmd') return file
  return { ...file, content: `${file.content}  # ${t('keys.useKeyModal.gemini.modelComment')}` }
}

export function grokCliFiles(baseUrl: string, apiKey: string, shell: ShellId, t: Translate): ConfigFile[] {
  return [
    environmentFile(shell, { GROK_MODELS_BASE_URL: baseUrl, XAI_API_KEY: apiKey }),
    {
      path: shell === 'windows' ? '%userprofile%\\.grok\\config.toml' : '~/.grok/config.toml',
      language: 'toml',
      content: grokCliConfig(baseUrl, apiKey, `${baseUrl.replace(/\/+$/, '')}/models`),
      hint: t('keys.useKeyModal.grok.configTomlHint'),
    },
  ]
}

const SYSTEM_ONE_REQUEST = {
  model: 'jev-latest',
  state: 'Text to evaluate',
  questions: {
    safety: {
      type: 'noul',
      instructions: 'Evaluate whether the text is unsafe',
    },
  },
}

/** A sample request to the System One endpoint, which no CLI client speaks. */
export function systemOneFile(baseUrl: string, apiKey: string, shell: ShellId): ConfigFile {
  const endpoint = `${baseUrl}/v1/systemone`
  const body = JSON.stringify(SYSTEM_ONE_REQUEST, null, 2)
  if (shell === 'powershell') {
    return {
      path: 'PowerShell',
      language: 'powershell',
      content: `$headers = @{ Authorization = "Bearer ${apiKey}" }
$body = @'
${body}
'@
Invoke-RestMethod -Method Post -Uri "${endpoint}" -Headers $headers -ContentType "application/json" -Body $body`,
    }
  }
  if (shell === 'cmd') {
    // Command Prompt has no single-quoted strings: the JSON goes on one line with every quote escaped.
    const oneLine = JSON.stringify(SYSTEM_ONE_REQUEST).replace(/"/g, '\\"')
    return {
      path: 'Command Prompt',
      language: 'cmd',
      content: `curl -X POST "${endpoint}" ^
  -H "Authorization: Bearer ${apiKey}" ^
  -H "Content-Type: application/json" ^
  --data "${oneLine}"`,
    }
  }
  return {
    path: 'Terminal',
    language: 'bash',
    content: `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  --data '${body}'`,
  }
}
