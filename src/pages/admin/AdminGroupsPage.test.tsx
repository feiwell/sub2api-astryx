import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { setLocale, t } from '~/i18n'
import { useAuthStore } from '~/stores/auth'
import { AdminGroupsPage } from './AdminGroupsPage'

const api = vi.hoisted(() => ({ list: vi.fn(), duplicate: vi.fn(), delete: vi.fn() }))
vi.mock('~/lib/api/admin', () => ({ adminAPI: { groups: api } }))

function renderGroups() {
  return render(
    <Theme theme={neutralTheme} mode="light">
      <LayerProvider><AdminGroupsPage /></LayerProvider>
    </Theme>,
  )
}

beforeAll(() => setLocale('en'))
beforeEach(() => {
  useAuthStore.setState({ runMode: 'standard' })
  api.list.mockResolvedValue({ items: [
    { id: 41, name: 'Atlas', platform: 'openai', status: 'active', rate_multiplier: 1 },
    { id: 42, name: 'Relay', platform: 'composite', status: 'active', rate_multiplier: 1 },
  ] })
  api.duplicate.mockResolvedValue({ name: 'Relay copy' })
})

describe('group row actions', () => {
  it('keeps Edit and More visible and offers routes only on composite groups', async () => {
    const user = userEvent.setup()
    renderGroups()
    const row = await screen.findByRole('row', { name: /Atlas/ })
    expect(within(row).getAllByRole('button')).toHaveLength(2)
    expect(within(row).getByRole('button', { name: t('common.edit') })).toBeVisible()
    await user.click(within(row).getByRole('button', { name: /More.*Atlas/ }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: t('admin.groups.rateMultipliers') })).toBeVisible()
    expect(within(menu).getByRole('menuitem', { name: t('admin.groups.rpmOverrides') })).toBeVisible()
    expect(within(menu).queryByRole('menuitem', { name: t('admin.groups.compositeRoutes.action') })).toBeNull()
    expect(within(menu).getAllByRole('menuitem').at(-1)).toHaveTextContent(t('common.delete'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /More.*Relay/ }))
    expect(await screen.findByRole('menuitem', { name: t('admin.groups.compositeRoutes.action') })).toBeVisible()
    await user.click(screen.getByRole('menuitem', { name: t('admin.groups.duplicate') }))
    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith(42))
  })

  it('keeps the delete confirmation in simple mode without exposing advanced actions', async () => {
    useAuthStore.setState({ runMode: 'simple' })
    const user = userEvent.setup()
    renderGroups()
    await user.click(await screen.findByRole('button', { name: /More.*Relay/ }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    await user.click(within(menu).getByRole('menuitem', { name: t('common.delete') }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Relay/)).toBeVisible()
    expect(api.delete).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: t('common.cancel') }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.delete).not.toHaveBeenCalled()
  })
})
