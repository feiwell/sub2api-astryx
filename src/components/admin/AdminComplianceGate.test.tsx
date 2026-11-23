import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockAdminUser, mockUser } from '~/test/mocks'
import { useAuthStore } from '~/stores/auth'
import { AdminComplianceGate } from './AdminComplianceGate'

const api = vi.hoisted(() => ({ getStatus: vi.fn(), accept: vi.fn() }))
vi.mock('@/api/admin/compliance', () => ({ default: api, adminComplianceAPI: api }))
vi.mock('~/i18n', () => {
  const t = (key: string) => key
  return { useI18n: () => ({ t, locale: 'en' }), getLocale: () => 'en' }
})
vi.mock('~/components/common/PublicPageFrame', () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }))
const required = { required: true, version: 'v2026.06.10', ack_phrase_en: 'fixture phrase', document_url_en: 'https://example.test/document' }
function start() {
  render(<MemoryRouter><AdminComplianceGate>protected content</AdminComplianceGate></MemoryRouter>)
}

describe('administrator compliance at the console boundary', () => {
  beforeEach(() => {
    api.getStatus.mockReset()
    api.accept.mockReset()
    useAuthStore.setState({ user: mockAdminUser, token: 'fixture' })
  })
  it('mounts the console only after an explicit matching submission and server recheck', async () => {
    api.getStatus.mockResolvedValueOnce(required).mockResolvedValueOnce({ required: false })
    api.accept.mockResolvedValue({ required: false })
    start()
    const input = await screen.findByRole('textbox')
    const submit = screen.getByRole('button', { name: 'adminCompliance.accept' })
    expect(screen.getByRole('article')).toHaveTextContent('Deployment and Operation Compliance Commitment')
    expect(screen.queryByText('protected content')).toBeNull()
    fireEvent.change(input, { target: { value: 'wrong' } })
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    fireEvent.submit(input.closest('form')!)
    expect(api.accept).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'fixture phrase' } })
    expect(api.accept).not.toHaveBeenCalled()
    fireEvent.click(submit)
    expect(await screen.findByText('protected content')).toBeVisible()
    expect(api.accept).toHaveBeenCalledTimes(1)
    expect(api.accept).toHaveBeenCalledWith({ phrase: 'fixture phrase', language: 'en' })
  })
  it('relocks on a 423 notification and keeps the form on a rejected submit', async () => {
    api.getStatus.mockResolvedValueOnce({ required: false }).mockResolvedValueOnce(required)
    api.accept.mockRejectedValue({ message: 'version changed' })
    start()
    expect(await screen.findByText('protected content')).toBeVisible()
    act(() => { window.dispatchEvent(new Event('admin-compliance-required')) })
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'fixture phrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'adminCompliance.accept' }))
    expect(await screen.findByText('version changed')).toBeVisible()
    expect(screen.queryByText('protected content')).toBeNull()
  })
  it('offers a retry on a transient lookup failure', async () => {
    api.getStatus.mockRejectedValueOnce({ message: 'offline' }).mockResolvedValueOnce({ required: false })
    start()
    fireEvent.click(await screen.findByRole('button', { name: 'common.refresh' }))
    expect(await screen.findByText('protected content')).toBeVisible()
  })
  it('supports older backends but cannot reopen a console that reports a lock', async () => {
    api.getStatus.mockRejectedValue({ status: 404, message: 'missing endpoint' })
    start()
    expect(await screen.findByText('protected content')).toBeVisible()
    act(() => { window.dispatchEvent(new Event('admin-compliance-required')) })
    expect(await screen.findByText('missing endpoint')).toBeVisible()
    expect(screen.queryByText('protected content')).toBeNull()
  })
  it('does not send admin requests for ordinary users', async () => {
    useAuthStore.setState({ user: mockUser })
    start()
    await waitFor(() => expect(screen.getByText('protected content')).toBeVisible())
    expect(api.getStatus).not.toHaveBeenCalled()
  })
})
