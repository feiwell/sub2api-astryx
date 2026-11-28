import { useImperativeHandle, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { PublicSettings } from '@/types'
import type { CaptchaChallengeHandle } from '~/components/captcha/CaptchaChallenge'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { mockUser } from '~/test/mocks'
import { RegisterPage } from './RegisterPage'
import { EmailVerifyPage } from './EmailVerifyPage'

const { getPublicSettings, sendVerifyCode, verifyAction } = vi.hoisted(() => ({
  getPublicSettings: vi.fn(),
  sendVerifyCode: vi.fn(),
  verifyAction: vi.fn(),
}))
vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getPublicSettings,
  sendVerifyCode,
  isWeChatWebOAuthEnabled: () => false,
}))
vi.mock('~/i18n', async () => ({ useI18n: (await import('~/test/mocks')).mockUseI18n }))
vi.mock('~/lib/toast', async () => ({ toast: (await import('~/test/mocks')).mockToast }))
vi.mock('~/layouts/AuthLayout', () => ({
  AuthLayout: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => <>{children}{footer}</>,
}))
vi.mock('~/components/captcha/CaptchaChallenge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/components/captcha/CaptchaChallenge')>()),
  CaptchaChallenge: ({ ref }: { ref: React.Ref<CaptchaChallengeHandle> }) => {
    useImperativeHandle(ref, () => ({ reset: vi.fn(), verifyAction }))
    return null
  },
}))

const register = vi.fn<ReturnType<typeof useAuthStore.getState>['register']>()
const baseSettings = {
  registration_enabled: true,
  email_verify_enabled: true,
  site_name: 'Sub2API',
} as PublicSettings
const credentials = { email: 'reader@example.test', password: 'sample-password' }

function renderRegistration(initialEntry = '/register') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/email-verify" element={<EmailVerifyPage />} />
        <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        <Route path="/keys" element={<h1>Keys</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function submitRegistration() {
  const user = userEvent.setup()
  const submit = screen.getByRole('button', { name: 'auth.signUp' })
  await waitFor(() => expect(submit).not.toHaveAttribute('aria-disabled', 'true'))
  await user.type(screen.getByRole('textbox', { name: 'auth.emailLabel' }), credentials.email)
  await user.type(screen.getByLabelText('auth.passwordLabel'), credentials.password)
  await user.type(screen.getByLabelText('auth.confirmPassword'), credentials.password)
  await user.click(submit)
  return user
}

function pending(data = {}) {
  sessionStorage.setItem('pending_register_data', JSON.stringify({ ...credentials, ...data }))
}

function savedRegistration() {
  return JSON.parse(sessionStorage.getItem('pending_register_data')!)
}

describe('email registration', () => {
  beforeEach(() => {
    getPublicSettings.mockResolvedValue(baseSettings)
    sendVerifyCode.mockResolvedValue({ countdown: 60, message: 'sent' })
    register.mockReset().mockResolvedValue(mockUser)
    verifyAction.mockReset().mockResolvedValue({ token: 'fresh-ticket', randstr: 'fresh-randstr' })
    useAuthStore.setState({ register })
    useAppStore.setState({ publicSettings: baseSettings })
  })

  afterEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState(), true)
    useAppStore.setState(useAppStore.getInitialState(), true)
    delete window.__APP_CONFIG__
  })

  it('sends a code before registration and completes signup with verify_code', async () => {
    renderRegistration('/register?redirect=/keys')
    const user = await submitRegistration()
    const code = await screen.findByRole('textbox', { name: 'auth.verificationCode' })
    expect(sendVerifyCode).toHaveBeenCalledWith(expect.objectContaining({ email: credentials.email }))
    expect(register).not.toHaveBeenCalled()
    expect(savedRegistration()).toMatchObject({ ...credentials, countdown: 60, redirectTo: '/keys' })
    expect(screen.getByText(credentials.email)).toBeVisible()
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'auth.verifyAndCreate' }))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ ...credentials, verify_code: '123456' }))
    expect(await screen.findByRole('heading', { name: 'Keys' })).toBeVisible()
    expect(sessionStorage.getItem('pending_register_data')).toBeNull()
  })

  it('registers directly when email verification is disabled', async () => {
    getPublicSettings.mockResolvedValue({ ...baseSettings, email_verify_enabled: false })
    renderRegistration()
    await submitRegistration()
    expect(register).toHaveBeenCalledWith(expect.objectContaining(credentials))
    expect(sendVerifyCode).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  it('keeps the registration form available after sending fails', async () => {
    sendVerifyCode.mockRejectedValue({ message: 'Mail service unavailable' })
    renderRegistration()
    await submitRegistration()
    expect(await screen.findByText('Mail service unavailable')).toBeVisible()
    expect(register).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('pending_register_data')).toBeNull()
  })

  it('restores the server cooldown after refresh without sending another code', () => {
    pending({ code_sent_at: Date.now() - 10_000, countdown: 90 })
    renderRegistration('/email-verify')
    expect(screen.queryByRole('button', { name: 'auth.resendCode' })).not.toBeInTheDocument()
    expect(screen.getByText(/auth.resendCountdown/)).toBeVisible()
    expect(sendVerifyCode).not.toHaveBeenCalled()
  })

  it('retains invitation, promo and affiliate codes after an invalid verification code', async () => {
    pending({ invitation_code: 'invite', promo_code: 'promo', aff_code: 'referral' })
    register.mockRejectedValueOnce({ message: 'Invalid verification code' })
    renderRegistration('/email-verify')
    const user = userEvent.setup()
    const code = screen.getByRole('textbox', { name: 'auth.verificationCode' })
    await user.type(code, '12345')
    expect(screen.getByRole('button', { name: 'auth.verifyAndCreate' })).toHaveAttribute('aria-disabled', 'true')
    await user.type(code, '6')
    await user.click(screen.getByRole('button', { name: 'auth.verifyAndCreate' }))
    expect(await screen.findByText('Invalid verification code', { selector: '[data-type="error"]' })).toBeVisible()
    expect(register).toHaveBeenCalledWith({
      ...credentials, verify_code: '123456', invitation_code: 'invite', promo_code: 'promo', aff_code: 'referral',
    })
    expect(savedRegistration()).toMatchObject(credentials)
    await user.clear(code)
    await user.type(code, '654321')
    await user.click(screen.getByRole('button', { name: 'auth.verifyAndCreate' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  it('opens action captcha on resend and respects the returned cooldown', async () => {
    useAppStore.setState({ publicSettings: { ...baseSettings, tencent_captcha_enabled: true, tencent_captcha_app_id: 'app' } })
    pending()
    sendVerifyCode.mockResolvedValue({ countdown: 120, message: 'sent' })
    renderRegistration('/email-verify')
    const user = userEvent.setup()
    const resend = screen.getByRole('button', { name: 'auth.resendCode' })
    expect(resend).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(resend)
    await waitFor(() => expect(sendVerifyCode).toHaveBeenCalledWith({
      email: credentials.email, turnstile_token: undefined,
      tencent_captcha_ticket: 'fresh-ticket', tencent_captcha_randstr: 'fresh-randstr',
    }))
    expect(savedRegistration()).toMatchObject({ countdown: 120 })
    expect(savedRegistration()).not.toHaveProperty('tencent_captcha_ticket')
    await user.type(screen.getByRole('textbox', { name: 'auth.verificationCode' }), '123456')
    await user.click(screen.getByRole('button', { name: 'auth.verifyAndCreate' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect(verifyAction).toHaveBeenCalledTimes(1)
  })

  it.each([null, '{broken', '{}'])('handles missing or invalid pending data (%s)', (value) => {
    if (value !== null) sessionStorage.setItem('pending_register_data', value)
    renderRegistration('/email-verify')
    expect(screen.getByText('auth.sessionExpired')).toBeVisible()
    expect(register).not.toHaveBeenCalled()
    expect(sendVerifyCode).not.toHaveBeenCalled()
  })
})
