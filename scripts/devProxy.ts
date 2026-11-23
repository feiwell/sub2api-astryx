import type { ProxyOptions } from 'vite'

// Vite matches the whole request URL, including its query string. The deployment proxy matches the path.
const backendPaths = [
  /^\/(?:api|v1|v1beta|backend-api|antigravity)(?=[/?]|$)/,
  /^\/setup\/[^?]+/,
  /^\/health(?:\?|$)/,
  /^\/\.well-known\/(?:oauth-authorization-server|oauth-protected-resource(?:\/api\/v1\/mcp)?)\/?(?:\?|$)/,
  /^\/(?:models|responses|images|videos|custom-voices|(?:v3\/)?contents\/generations\/tasks)(?=[/?]|$)/,
  /^\/(?:chat\/completions|messages\/count_tokens|alpha\/search|embeddings|web_search|x_search|tts|stt|realtime)\/?(?:\?|$)/,
]

export function devProxy(target: string): Record<string, ProxyOptions> {
  return Object.fromEntries(backendPaths.map((path) => [path.source, { target, changeOrigin: true, ws: true }]))
}
