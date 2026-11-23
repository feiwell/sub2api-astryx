import { describe, expect, it } from 'vitest'
import {
  buildAuditQuery,
  emptyAuditFilters,
  formatCustomRange,
  isPresetRange,
  toLocalDateTime,
  type AuditFilters,
} from './auditQuery'

const NOW = new Date('2026-11-20T10:00:00.000Z').getTime()
const filters = (patch: Partial<AuditFilters>): AuditFilters => ({ ...emptyAuditFilters(), ...patch })
/** What actually goes on the wire: a parameter that is undefined is not sent. */
const sent = (query: object) => JSON.parse(JSON.stringify(query))

describe('buildAuditQuery', () => {
  it('sends only the page when no filter is set', () => {
    expect(sent(buildAuditQuery(emptyAuditFilters(), 1, 20, NOW))).toEqual({ page: 1, page_size: 20 })
  })

  it('trims the text filters and leaves out the ones that are empty', () => {
    const query = buildAuditQuery(filters({ q: '  users ', actor_email: '   ', action: 'admin.users.update' }), 3, 50, NOW)
    expect(sent(query)).toEqual({ page: 3, page_size: 50, q: 'users', action: 'admin.users.update' })
  })

  it('passes the picked method, auth method and result as they are', () => {
    const query = buildAuditQuery(filters({ method: 'DELETE', auth_method: 'admin_api_key', success: 'false' }), 1, 20, NOW)
    expect(sent(query)).toEqual({ page: 1, page_size: 20, method: 'DELETE', auth_method: 'admin_api_key', success: 'false' })
  })

  it('turns a preset range into a window that starts that long ago and has no end', () => {
    expect(sent(buildAuditQuery(filters({ timeRange: '30m' }), 1, 20, NOW))).toEqual({
      page: 1,
      page_size: 20,
      start_time: '2026-11-20T09:30:00.000Z',
    })
    expect(buildAuditQuery(filters({ timeRange: '30d' }), 1, 20, NOW).start_time).toBe('2026-10-21T10:00:00.000Z')
  })

  it('sends both ends of a custom window as instants', () => {
    const customRange = { start: '2026-11-20T09:30', end: '2026-11-20T10:45' }
    const query = buildAuditQuery(filters({ timeRange: 'custom', customRange }), 1, 20, NOW)
    expect(query.start_time).toBe(new Date(2026, 10, 20, 9, 30).toISOString())
    expect(query.end_time).toBe(new Date(2026, 10, 20, 10, 45).toISOString())
  })

  it('does not read a custom window that is only kept for the next pick', () => {
    const customRange = { start: '2026-11-20T09:30', end: '2026-11-20T10:45' }
    expect(sent(buildAuditQuery(filters({ timeRange: '', customRange }), 1, 20, NOW))).toEqual({ page: 1, page_size: 20 })
    const query = buildAuditQuery(filters({ timeRange: '1h', customRange }), 1, 20, NOW)
    expect(query.start_time).toBe('2026-11-20T09:00:00.000Z')
    expect(query.end_time).toBeUndefined()
  })

  it('leaves out an end of a custom window that is no date', () => {
    const query = buildAuditQuery(filters({ timeRange: 'custom', customRange: { start: 'nonsense', end: '' } }), 1, 20, NOW)
    expect(sent(query)).toEqual({ page: 1, page_size: 20 })
    expect(sent(buildAuditQuery(filters({ timeRange: 'custom' }), 1, 20, NOW))).toEqual({ page: 1, page_size: 20 })
  })
})

describe('time range helpers', () => {
  it('tells the preset ranges from the rest', () => {
    expect(['30m', '1h', '6h', '24h', '7d', '30d'].every(isPresetRange)).toBe(true)
    expect(['', 'custom', '5m', '__all__'].some(isPresetRange)).toBe(false)
  })

  it('writes a moment as a local date-time, padded', () => {
    expect(toLocalDateTime(new Date(2026, 0, 5, 9, 3, 59))).toBe('2026-01-05T09:03')
  })

  it('writes a custom window as month-day and time on both ends', () => {
    expect(formatCustomRange({ start: '2026-11-20T09:30', end: '2026-11-21T10:05' })).toBe('11-20 09:30 ~ 11-21 10:05')
    expect(formatCustomRange({ start: 'nonsense', end: '2026-11-21T10:05' })).toBe('nonsense ~ 11-21 10:05')
  })
})
