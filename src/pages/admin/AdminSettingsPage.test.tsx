import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockToast } from '~/test/mocks'
import { AdminSettingsPage } from './AdminSettingsPage'

const { getSettings, updateSettings } = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }))
vi.mock('~/lib/api/admin', () => ({ adminAPI: { settings: { getSettings, updateSettings } } }))
vi.mock('~/i18n', async () => ({ useI18n: (await import('~/test/mocks')).mockUseI18n }))
vi.mock('~/lib/toast', async () => ({ toast: (await import('~/test/mocks')).mockToast }))

// Only the contents of each panel are stubbed. The page owns selection, loading and saving.
vi.mock('./settings/GeneralSettingsTab', () => ({
  GeneralSettingsTab: ({ settings, onSave }: {
    settings: { site_name: string }
    onSave: (updates: { site_name: string }) => Promise<boolean>
  }) => <><p>{settings.site_name}</p><button onClick={() => void onSave({ site_name: 'Updated' })}>Save General</button></>,
}))
vi.mock('./settings/AgreementSettingsTab', () => ({ AgreementSettingsTab: () => <p>agreement panel</p> }))
vi.mock('./settings/FeaturesSettingsTab', () => ({ FeaturesSettingsTab: () => <p>features panel</p> }))
vi.mock('./settings/SecuritySettingsTab', () => ({ SecuritySettingsTab: () => <p>security panel</p> }))
vi.mock('./settings/UsersSettingsTab', () => ({ UsersSettingsTab: () => <p>users panel</p> }))
vi.mock('./settings/GatewaySettingsTab', () => ({ GatewaySettingsTab: () => <p>gateway panel</p> }))
vi.mock('./settings/PaymentSettingsTab', () => ({ PaymentSettingsTab: () => <p>payment panel</p> }))
vi.mock('./settings/EmailSettingsTab', () => ({ EmailSettingsTab: () => <p>email panel</p> }))
vi.mock('./settings/BackupSettingsTab', () => ({ BackupSettingsTab: () => <p>backup panel</p> }))
vi.mock('./settings/UpdateSettingsTab', () => ({ UpdateSettingsTab: () => <p>update panel</p> }))

const otherTabs = ['agreement', 'features', 'security', 'users', 'gateway', 'payment', 'email', 'backup', 'update']

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    getSettings.mockResolvedValue({ site_name: 'Sub2API' })
    updateSettings.mockResolvedValue({ site_name: 'Updated' })
  })

  it('shows the loading indicator while fetching settings', async () => {
    render(<AdminSettingsPage />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(await screen.findByText('Sub2API')).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('opens General with the saved settings and all ten sections available', async () => {
    render(<AdminSettingsPage />)
    const nav = await screen.findByRole('navigation')
    expect(screen.getByRole('heading', { name: 'admin.settings.title' })).toBeVisible()
    expect(within(nav).getAllByRole('button')).toHaveLength(10)
    expect(within(nav).getByRole('button', { name: 'admin.settings.tabs.general' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Sub2API')).toBeVisible()
    expect(getSettings).toHaveBeenCalledTimes(1)
  })

  it.each(otherTabs)('switches from General to the %s panel', async (tab) => {
    const user = userEvent.setup()
    render(<AdminSettingsPage />)
    const tabButton = await screen.findByRole('button', { name: `admin.settings.tabs.${tab}` })
    await user.click(tabButton)
    expect(screen.getByText(`${tab} panel`)).toBeVisible()
    expect(tabButton).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('button', { name: 'Save General' })).not.toBeInTheDocument()
  })

  it('saves a settings patch and displays the server response', async () => {
    const user = userEvent.setup()
    updateSettings.mockResolvedValueOnce({ site_name: 'Server value' })
    render(<AdminSettingsPage />)
    await user.click(await screen.findByRole('button', { name: 'Save General' }))
    expect(updateSettings).toHaveBeenCalledWith({ site_name: 'Updated' })
    expect(await screen.findByText('Server value')).toBeVisible()
    expect(mockToast.success).toHaveBeenCalledWith('admin.settings.saveSuccess')
  })

  it('preserves the loaded settings when saving fails', async () => {
    const user = userEvent.setup()
    updateSettings.mockRejectedValueOnce(new Error('Save failed'))
    render(<AdminSettingsPage />)
    await user.click(await screen.findByRole('button', { name: 'Save General' }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Save failed'))
    expect(screen.getByText('Sub2API')).toBeVisible()
  })

  it('shows the load failure instead of opening a settings panel', async () => {
    getSettings.mockRejectedValueOnce(new Error('Load failed'))
    render(<AdminSettingsPage />)
    expect(await screen.findByText('common.loadFailed')).toBeVisible()
    expect(mockToast.error).toHaveBeenCalledWith('Load failed')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
