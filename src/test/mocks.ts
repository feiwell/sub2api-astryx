import { vi } from 'vitest'
import type { User } from '@/types'

// Mock i18n
export const mockT = vi.fn((key: string) => key)
export const mockUseI18n = () => ({
  t: mockT,
  te: () => false,
  locale: 'en' as const,
  i18n: {
    language: 'en',
    changeLanguage: vi.fn(),
  },
})

// Mock user
export const mockUser: User = {
  id: 1,
  username: 'testuser',
  email: 'test@example.test',
  role: 'user',
  balance: 100,
  concurrency: 5,
  status: 'active',
  allowed_groups: null,
  balance_notify_enabled: false,
  balance_notify_threshold: null,
  balance_notify_extra_emails: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

// Mock admin user
export const mockAdminUser: User = {
  ...mockUser,
  id: 2,
  username: 'adminuser',
  email: 'admin@example.test',
  role: 'admin',
}

// Mock toast
export const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}
