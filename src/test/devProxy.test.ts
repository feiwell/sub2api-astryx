import { expect, it } from 'vitest'
import { devProxy } from '../../scripts/devProxy'

const target = 'https://gateway.example.test'
const proxy = devProxy(target)
function matches(url: string) {
  return Object.entries(proxy).find(([pattern]) => new RegExp(pattern).test(url))?.[1]
}

it.each([
  '/setup', '/setup/', '/setup/?next=1', '/setup?next=1', '/settings', '/healthcheck',
  '/v10', '/models-extra', '/apiary', '/chat/completions/other', '/payment/result',
])('leaves the page or unrelated path %s for Vite', (url) => {
  expect(matches(url)).toBeUndefined()
})

it.each([
  '/api', '/api?x=1', '/api/v1/admin/ops/ws', '/v1/messages', '/v1beta/models',
  '/backend-api', '/antigravity/v1beta', '/setup/status', '/setup/test-db?probe=1',
  '/health?probe=1', '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/api/v1/mcp', '/models', '/responses/123',
  '/images', '/videos/123', '/custom-voices', '/contents/generations/tasks/1',
  '/v3/contents/generations/tasks/1', '/chat/completions?stream=true', '/messages/count_tokens',
  '/alpha/search', '/embeddings', '/web_search', '/x_search', '/tts', '/stt', '/realtime?model=test',
])('proxies %s with WebSocket upgrade support', (url) => {
  expect(matches(url)).toMatchObject({ target, ws: true })
})
