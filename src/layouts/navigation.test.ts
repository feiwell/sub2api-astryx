import { describe, expect, it } from 'vitest'
import { navPlace, type AdminNavEntry } from './navigation'

const Icon = () => null

const entries: AdminNavEntry[] = [
  { path: '/admin/dashboard', label: 'Dashboard' },
  {
    id: 'billing',
    label: 'Billing',
    icon: Icon,
    items: [
      { path: '/admin/orders', label: 'Orders' },
      { path: '/admin/redeem', label: 'Redeem codes' },
    ],
  },
  { path: '/admin/settings', label: 'Settings' },
  { path: '/dashboard', label: 'Dashboard' },
]

describe('navPlace', () => {
  it('counts from the top, through the pages inside groups', () => {
    expect(navPlace(entries, '/admin/dashboard')).toBe(0)
    expect(navPlace(entries, '/admin/redeem')).toBe(2)
    expect(navPlace(entries, '/admin/settings')).toBe(3)
    expect(navPlace(entries, '/dashboard')).toBe(4)
  })

  it('gives a page under an item the place of that item', () => {
    expect(navPlace(entries, '/admin/orders/plans')).toBe(1)
  })

  it('has no place for a page without an item', () => {
    expect(navPlace(entries, '/admin/backup')).toBe(-1)
    expect(navPlace(entries, '/admin/orders-archive')).toBe(-1)
  })
})
