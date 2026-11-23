const initials = new Map([
  ['openai', 'OA'], ['anthropic', 'AN'], ['claude', 'CL'], ['gpt', 'GPT'],
  ['gemini', 'GE'], ['grok', 'GK'], ['antigravity', 'AG'], ['kimi', 'KI'],
  ['zhipu', 'ZP'], ['deepseek', 'DS'], ['minimax', 'MM'], ['opencode_go', 'OC'],
])

export function providerInitials(provider: string): string {
  const name = provider.trim()
  return initials.get(name.toLowerCase()) ?? (Array.from(name)[0]?.toUpperCase() || '?')
}
