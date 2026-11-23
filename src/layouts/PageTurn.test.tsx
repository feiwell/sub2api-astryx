import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { AppShellMobileContext } from '@astryxdesign/core/AppShell'
import { PageStage, PageTurnContext, PageTurnLink, usePageTurn, useTurnTo } from './PageTurn'

const { startViewTransition, isPageCodeReady, preloadPageCode } = vi.hoisted(() => {
  // PageTurn looks for view transitions when it is first imported, so the browser has to have them by then.
  const startViewTransition = vi.fn<(update: () => unknown) => unknown>()
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition })
  return {
    startViewTransition,
    isPageCodeReady: vi.fn<(href: string) => boolean>(),
    preloadPageCode: vi.fn<(href: string) => Promise<void>>(),
  }
})

vi.mock('~/router/pageCode', () => ({ isPageCodeReady, preloadPageCode }))

beforeEach(() => {
  // Like the browser: the page is updated a moment after the call, and the transition ends once it has been.
  startViewTransition.mockImplementation((update) => {
    const updated = Promise.resolve().then(update)
    return { updateCallbackDone: updated, ready: updated, finished: updated, skipTransition: () => {} }
  })
  isPageCodeReady.mockReturnValue(true)
  preloadPageCode.mockResolvedValue(undefined)
})

function ProfileButton() {
  const turnTo = useTurnTo()
  return (
    <button type="button" onClick={() => turnTo('/profile')}>
      Profile
    </button>
  )
}

/** The pages of the side nav, from the top. The orders page is linked from it without being one of them. */
const NAV_ORDER = ['/dashboard', '/keys', '/usage', '/profile']

/** A side nav and the pages beside it, wired the way AppLayout wires them. */
function Shell() {
  const { turnTo, pathname } = usePageTurn()
  return (
    <PageTurnContext value={turnTo}>
      <nav>
        <PageTurnLink href="/keys">Keys</PageTurnLink>
        <PageTurnLink href="/usage">Usage</PageTurnLink>
        <ProfileButton />
        <PageTurnLink href="/orders">Orders</PageTurnLink>
      </nav>
      <p>Marked: {pathname}</p>
      <PageStage placeOf={(path) => NAV_ORDER.indexOf(path)}>
        <Outlet />
      </PageStage>
    </PageTurnContext>
  )
}

function renderShell({ at = '/dashboard', isMobile = false } = {}) {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: ['dashboard', 'keys', 'usage', 'profile', 'orders'].map((name) => ({
          path: `/${name}`,
          element: <h1>{name} page</h1>,
        })),
      },
    ],
    { initialEntries: [at] },
  )
  const mobile = {
    isMobile,
    isMobileNavOpen: false,
    toggleMobileNav: () => {},
    openMobileNav: () => {},
    closeMobileNav: () => {},
    isMobileNavEnabled: isMobile,
    hasAutoToggle: true,
  }
  render(
    <AppShellMobileContext value={mobile}>
      <RouterProvider router={router} />
    </AppShellMobileContext>,
  )
  return router
}

/** The code of a page that arrives when the test says so. */
function codeOnTheWay() {
  let arrive!: () => void
  const promise = new Promise<void>((resolve) => (arrive = resolve))
  return { promise, arrive }
}

const stage = () => document.querySelector('.page-stage')

describe('turning the page from the side nav', () => {
  it('turns to the page of a pressed link inside a view transition', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByRole('link', { name: 'Keys' }))

    expect(await screen.findByRole('heading', { name: 'keys page' })).toBeInTheDocument()
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('names the stage the other side on every change of page, so the two pages are captured apart', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(stage()).toHaveAttribute('data-page-turn', 'a')
    expect(document.querySelector('.page-veil')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Keys' }))
    await screen.findByRole('heading', { name: 'keys page' })
    expect(stage()).toHaveAttribute('data-page-turn', 'b')

    await user.click(screen.getByRole('link', { name: 'Usage' }))
    await screen.findByRole('heading', { name: 'usage page' })
    expect(stage()).toHaveAttribute('data-page-turn', 'a')
  })

  it('turns the page for side nav controls that are not links', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByRole('button', { name: 'Profile' }))

    expect(await screen.findByRole('heading', { name: 'profile page' })).toBeInTheDocument()
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('fetches the code of a page as soon as the pointer or the focus reaches its link', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.hover(screen.getByRole('link', { name: 'Keys' }))
    expect(preloadPageCode).toHaveBeenCalledWith('/keys')

    act(() => screen.getByRole('link', { name: 'Usage' }).focus())
    expect(preloadPageCode).toHaveBeenCalledWith('/usage')
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('waits for the code of a page that is not in memory, and marks the page in the side nav meanwhile', async () => {
    const user = userEvent.setup()
    const code = codeOnTheWay()
    isPageCodeReady.mockImplementation((href) => href !== '/usage')
    preloadPageCode.mockReturnValue(code.promise)
    renderShell()

    await user.click(screen.getByRole('link', { name: 'Usage' }))

    expect(screen.getByText('Marked: /usage')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'dashboard page' })).toBeInTheDocument()
    expect(startViewTransition).not.toHaveBeenCalled()

    await act(async () => code.arrive())

    expect(await screen.findByRole('heading', { name: 'usage page' })).toBeInTheDocument()
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('does not turn to a page the user moved on from while its code was on the way', async () => {
    const user = userEvent.setup()
    const code = codeOnTheWay()
    isPageCodeReady.mockImplementation((href) => href !== '/usage')
    preloadPageCode.mockImplementation((href) => (href === '/usage' ? code.promise : Promise.resolve()))
    renderShell()

    await user.click(screen.getByRole('link', { name: 'Usage' }))
    await user.click(screen.getByRole('link', { name: 'Keys' }))
    expect(await screen.findByRole('heading', { name: 'keys page' })).toBeInTheDocument()
    expect(screen.getByText('Marked: /keys')).toBeInTheDocument()

    await act(async () => code.arrive())

    expect(screen.getByRole('heading', { name: 'keys page' })).toBeInTheDocument()
    expect(startViewTransition).toHaveBeenCalledTimes(1)
  })

  it('does not animate a press on the link of the page already showing', async () => {
    const user = userEvent.setup()
    renderShell({ at: '/keys' })

    await user.click(screen.getByRole('link', { name: 'Keys' }))

    expect(screen.getByRole('heading', { name: 'keys page' })).toBeInTheDocument()
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('leaves a press with a modifier key to the browser', () => {
    renderShell()
    // jsdom cannot follow links: note whether the app took the press, then stop jsdom from trying.
    let tookPress: boolean | undefined
    window.addEventListener(
      'click',
      (event) => {
        tookPress = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )

    fireEvent.click(screen.getByRole('link', { name: 'Keys' }), { ctrlKey: true })

    expect(tookPress).toBe(false)
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'dashboard page' })).toBeInTheDocument()
  })

  it('works like any other link where pages do not turn', async () => {
    const user = userEvent.setup()
    renderShell({ isMobile: true })
    expect(stage()).not.toHaveAttribute('data-page-turn')
    expect(document.querySelector('.page-veil')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Keys' }))
    expect(await screen.findByRole('heading', { name: 'keys page' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Profile' }))
    expect(await screen.findByRole('heading', { name: 'profile page' })).toBeInTheDocument()
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('renders a link that leaves the app as an ordinary link, without fetching anything', async () => {
    const user = userEvent.setup()
    render(
      <PageTurnLink href="https://example.test/docs" target="_blank">
        Docs
      </PageTurnLink>,
    )
    const link = screen.getByRole('link', { name: 'Docs' })

    await user.hover(link)

    expect(link).toHaveAttribute('href', 'https://example.test/docs')
    expect(preloadPageCode).not.toHaveBeenCalled()
  })
})

describe('where the page arriving comes from', () => {
  it('comes from below when it sits lower in the side nav than the page leaving, and from above when higher', async () => {
    const user = userEvent.setup()
    renderShell({ at: '/keys' })

    await user.click(screen.getByRole('link', { name: 'Usage' }))
    await screen.findByRole('heading', { name: 'usage page' })
    expect(stage()).toHaveAttribute('data-page-turn-from', 'below')

    await user.click(screen.getByRole('link', { name: 'Keys' }))
    await screen.findByRole('heading', { name: 'keys page' })
    expect(stage()).toHaveAttribute('data-page-turn-from', 'above')
  })

  it('comes the other way when the user goes back', async () => {
    const user = userEvent.setup()
    const router = renderShell({ at: '/dashboard' })
    await user.click(screen.getByRole('link', { name: 'Usage' }))
    await screen.findByRole('heading', { name: 'usage page' })
    expect(stage()).toHaveAttribute('data-page-turn-from', 'below')

    await act(async () => {
      await router.navigate(-1)
    })

    expect(await screen.findByRole('heading', { name: 'dashboard page' })).toBeInTheDocument()
    expect(stage()).toHaveAttribute('data-page-turn-from', 'above')
  })

  it('comes from below when either page is not one the side nav lists', async () => {
    const user = userEvent.setup()
    renderShell({ at: '/usage' })

    await user.click(screen.getByRole('link', { name: 'Orders' }))
    await screen.findByRole('heading', { name: 'orders page' })
    expect(stage()).toHaveAttribute('data-page-turn-from', 'below')

    await user.click(screen.getByRole('link', { name: 'Keys' }))
    await screen.findByRole('heading', { name: 'keys page' })
    expect(stage()).toHaveAttribute('data-page-turn-from', 'below')
  })

  it('is not said where pages do not turn', async () => {
    const user = userEvent.setup()
    renderShell({ at: '/usage', isMobile: true })

    await user.click(screen.getByRole('link', { name: 'Keys' }))
    await screen.findByRole('heading', { name: 'keys page' })

    expect(stage()).not.toHaveAttribute('data-page-turn-from')
  })
})
