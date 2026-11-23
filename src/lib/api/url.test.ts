import { afterEach, it, expect, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
it.each([
  ['/demo/api/v1', `${window.location.origin}/demo`],
  ['/api/v1', window.location.origin],
  ['https://demo.example.test/panel/api/v1/', 'https://demo.example.test/panel'],
  ['https://api.example.test/nonstandard', 'https://api.example.test'],
])('preserves the gateway mount paired with %s', async (base, gateway) => {
  vi.stubEnv('VITE_API_BASE_URL', base)
  const { buildGatewayUrl, buildApiUrl } = await import('./url')
  expect(buildGatewayUrl('/v1/models')).toBe(`${gateway}/v1/models`)
  expect(buildGatewayUrl('/api/v1/admin/ops/ws/qps')).toBe(`${gateway}/api/v1/admin/ops/ws/qps`)
  expect(buildApiUrl('/api/v1/auth/me')).toBe(`${base.replace(/\/$/, '')}/auth/me`)
})
