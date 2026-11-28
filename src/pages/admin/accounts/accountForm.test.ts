import { describe, expect, it } from 'vitest'
import type { Account } from '@/types'
import { buildAccountRequest, initialForm, typesFor } from './accountForm'

const t = (key: string) => key
const stored = { id: 3, name: 'existing', platform: 'openai', type: 'apikey', status: 'error',
  proxy_id: 7, group_ids: [11], credentials: { base_url: 'https://test.example', model_mapping: { old: 'new' } },
  extra: { quota_limit: 72, retained: true } } as unknown as Account

describe('account form payloads', () => {
  it('leaves unchanged settings out and supports explicit clears', () => {
    const form = initialForm(stored)
    expect(buildAccountRequest(form, stored, null, t).update).toEqual({})
    expect(buildAccountRequest({ ...form, groups: [], proxy: null, quota_limit: 0, key: 'replacement' }, stored, null, t).update)
      .toEqual({ group_ids: [], proxy_id: 0, credentials: { ...stored.credentials, api_key: 'replacement' }, extra: { retained: true } })
  })
  it('removes fixed schedules and saves notification changes without touching usage', () => {
    const a = { ...stored, extra: { quota_weekly_limit: 12, quota_weekly_reset_mode: 'fixed', quota_weekly_reset_hour: 3,
      quota_weekly_reset_day: 4, quota_reset_timezone: 'UTC', quota_weekly_used: 2 } }
    const form = initialForm(a)
    form.quota.weekly = { ...form.quota.weekly, fixed: false, notify: true, percentage: true, threshold: 30 }
    expect(buildAccountRequest(form, a, null, t).update?.extra).toEqual({ quota_weekly_used: 2, quota_weekly_limit: 12,
      quota_notify_weekly_enabled: true, quota_notify_weekly_threshold_type: 'percentage', quota_notify_weekly_threshold: 30 })
  })
  it.each(['oauth','setup-token'] as const)('creates %s after authorization', type => {
    const form = { ...initialForm(null), type, name: 'new' }
    expect(() => buildAccountRequest(form, null, null, t)).toThrow()
    const token = { type, credentials: { access_token: 'mock' }, extra: { org_uuid: 'org' } }
    expect(buildAccountRequest(form, null, token, t).create).toMatchObject({ ...token, name: 'new' })
  })
  it('extracts service account identity and rejects incomplete JSON', () => {
    const form = { ...initialForm(null), platform: 'gemini', type: 'service_account' as const, name: 'vertex', json: '{}' }
    expect(() => buildAccountRequest(form, null, null, t)).toThrow('vertexSaJsonMissingFields')
    form.json = JSON.stringify({ project_id: 'prj', client_email: 'example', private_key: 'mock' })
    expect(buildAccountRequest(form, null, null, t).create?.credentials).toMatchObject({ project_id: 'prj', location: 'global', service_account_json: form.json })
  })
  it('supports Bedrock signing and Vertex API keys on their respective platforms', () => {
    expect(typesFor('openai')).not.toContain('service_account')
    expect(typesFor('gemini')).toContain('service_account')
    const base = { ...initialForm(null), name: 'example' }
    expect(buildAccountRequest({ ...base, type: 'bedrock', authMode: 'sigv4', accessId: 'id', secret: 'mock' }, null, null, t).create?.credentials)
      .toMatchObject({ aws_access_key_id: 'id', aws_secret_access_key: 'mock', aws_region: 'us-east-1' })
    expect(buildAccountRequest({ ...base, platform: 'gemini', type: 'service_account', authMode: 'apikey', key: 'mock' }, null, null, t).create?.credentials)
      .toMatchObject({ auth_mode: 'apikey', api_key: 'mock', tier_id: 'vertex' })
  })
})

describe('single-account operational settings', () => {
  it('clears expiry and load factor using the API sentinels, preserves zero billing and sends only changes', () => {
    const a = { ...stored, expires_at: 1893456789, auto_pause_on_expired: true, load_factor: 6, rate_multiplier: 2 }
    const form = initialForm(a)
    expect(buildAccountRequest(form,a,null,t).update).toEqual({})
    expect(buildAccountRequest({...form, expires:'', autoPause:false, loadFactor:null, rate:0},a,null,t).update)
      .toEqual({ expires_at:0, auto_pause_on_expired:false, load_factor:0, rate_multiplier:0 })
  })
  it('updates image tiers without discarding unrelated extra, and removes the restriction when all tiers return', () => {
    const a = { ...stored, extra: { retained:true, openai_image_size_tiers:['1K'] } }
    expect(buildAccountRequest({...initialForm(a),tiers:['1K','2K']},a,null,t).update?.extra).toEqual({retained:true,openai_image_size_tiers:['1K','2K']})
    expect(buildAccountRequest({...initialForm(a),tiers:['1K','2K','4K']},a,null,t).update?.extra).toEqual({retained:true})
  })
  it('saves header overrides and whitelist alongside existing aliases; rejects conflicting model and header rows', () => {
    const form = {...initialForm(stored), whitelist:['exact'], headerEnabled:true, headerRows:[{key:1,name:'X-Client',value:'abc'}]}
    expect(buildAccountRequest(form,stored,null,t).update?.credentials).toEqual({...stored.credentials,model_mapping:{exact:'exact',old:'new'},header_override_enabled:true,header_overrides:{'x-client':'abc'}})
    expect(() => buildAccountRequest({...form,whitelist:['old']},stored,null,t)).toThrow()
    expect(() => buildAccountRequest({...form,headerRows:[...form.headerRows, {...form.headerRows[0],key:2}]},stored,null,t)).toThrow()
  })
  it('keeps billing sync managed by the probe, and preserves unrelated fields when enabling overages', () => {
    const f = {...initialForm(stored), probe:true,syncRate:true,rate:3}
    expect(buildAccountRequest(f,stored,null,t).update).toEqual({upstream_billing_probe_enabled:true,upstream_billing_rate_sync_enabled:true})
    const a = {...stored,platform:'antigravity'}
    expect(buildAccountRequest({...initialForm(a),overages:true},a,null,t).update).toEqual({extra:{...stored.extra,allow_overages:true}})
  })
  it('persists primary and alternate protocols for OpenCode Go without replacing custom endpoints', () => {
    const a = {...stored,platform:'opencode_go',credentials:{account_mode:'go',api_protocol:'adaptive',api_base_urls:{chat_completions:'https://custom.example'},base_url:'https://custom.example'}}
    const f = initialForm(a)
    expect(buildAccountRequest({...f,rules:[{pattern:'model-*',protocol:'anthropic',extraProtocols:['chat_completions']}]},a,null,t).update?.credentials).toEqual({...a.credentials,protocol_rules:[{pattern:'model-*',protocol:'anthropic',protocols:['anthropic','chat_completions']}]})
  })
})
