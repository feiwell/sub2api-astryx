import type { ReactNode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '~/stores/app'
import { useAuthStore } from '~/stores/auth'
import type { AuthResponse } from '@/types'
import { mockToast, mockUser } from '~/test/mocks'
import { LoginPage } from './LoginPage'

const { getPublicSettings } = vi.hoisted(() => ({ getPublicSettings: vi.fn() }))
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getPublicSettings,
  isWeChatWebOAuthEnabled: () => false,
}))
vi.mock('~/i18n', async () => ({ useI18n: (await import('~/test/mocks')).mockUseI18n }))
vi.mock('~/lib/toast', async () => ({ toast: (await import('~/test/mocks')).mockToast }))
vi.mock('~/layouts/AuthLayout', () => ({
  AuthLayout: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => <>{children}{footer}</>,
}))

const login = vi.fn<ReturnType<typeof useAuthStore.getState>['login']>()
const formPassword = crypto.randomUUID()
const signedIn: AuthResponse = { access_token: crypto.randomUUID(), token_type: 'Bearer', user: mockUser }
const settings = { site_name: 'Sub2API', registration_enabled: true }

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillLogin(email = 'reader@example.test', password: string = formPassword) {
  const user = userEvent.setup()
  const submit = screen.getByRole('button', { name: 'auth.signIn' })
  await waitFor(() => expect(submit).not.toHaveAttribute('aria-disabled', 'true'))
  await user.type(screen.getByRole('textbox', { name: 'auth.emailLabel' }), email)
  await user.type(screen.getByLabelText('auth.passwordLabel'), password)
  return { user, submit }
}

describe('LoginPage', () => {
  beforeEach(() => {
    getPublicSettings.mockResolvedValue(settings)
    login.mockReset()
    useAuthStore.setState({ login })
  })

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true)
    useAppStore.setState(useAppStore.getInitialState(), true)
    delete window.__APP_CONFIG__
  })

  it('renders the email and password inputs and enables sign-in after settings load', async () => {
    renderLogin()
    expect(screen.getByRole('textbox', { name: 'auth.emailLabel' })).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('auth.passwordLabel')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'auth.signIn' })).toHaveAttribute('aria-disabled', 'true')
    expect(await screen.findByRole('link', { name: 'auth.signUp' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('button', { name: 'auth.signIn' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it.each([
    ['invalid email', 'reader', formPassword, 'auth.invalidEmail'],
    ['short password', 'reader@example.test', 'abc', 'auth.passwordMinLength'],
  ])('shows a validation error for %s before sending credentials', async (_case, email, password, message) => {
    renderLogin()
    const { user, submit } = await fillLogin(email, password)
    await user.click(submit)
    expect(await screen.findByText(message, { selector: '[data-type="error"]' })).toBeVisible()
    expect(mockToast.error).toHaveBeenCalledWith(message)
    expect(login).not.toHaveBeenCalled()
  })

  it('shows enabled OAuth providers as named buttons', async () => {
    getPublicSettings.mockResolvedValue({ ...settings, github_oauth_enabled: true, google_oauth_enabled: true })
    renderLogin()
    for (const name of ['GitHub', 'Google']) {
      const button = await screen.findByRole('button', { name })
      expect(button).toBeVisible()
      expect(button.querySelector('svg')).toBeNull()
    }
  })

  it('sends the credentials, confirms success and navigates to the dashboard', async () => {
    login.mockResolvedValue(signedIn)
    renderLogin()
    const { user, submit } = await fillLogin()
    await user.click(submit)
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ email: 'reader@example.test', password: formPassword }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect(mockToast.success).toHaveBeenCalledWith('auth.loginSuccess')
  })

  it('shows the server error and keeps the form available for retry', async () => {
    login.mockRejectedValue({ status: 401, message: 'Invalid credentials' })
    renderLogin()
    const { user, submit } = await fillLogin()
    await user.click(submit)
    expect(await screen.findByText('Invalid credentials')).toBeVisible()
    expect(mockToast.error).toHaveBeenCalledWith('Invalid credentials')
    expect(submit).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('applies the public settings returned on mount', async () => {
    renderLogin()
    await waitFor(() => expect(useAppStore.getState().publicSettings).toEqual(settings))
    expect(getPublicSettings).toHaveBeenCalledTimes(1)
  })

  it('prevents a second submission while login is pending', async () => {
    let finish!: (result: AuthResponse) => void
    login.mockReturnValue(new Promise<AuthResponse>((resolve) => { finish = resolve }))
    renderLogin()
    const { user, submit } = await fillLogin()
    await user.click(submit)
    expect(submit).toHaveAttribute('aria-busy', 'true')
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await user.click(submit)
    expect(login).toHaveBeenCalledTimes(1)
    await act(async () => finish(signedIn))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })
})
