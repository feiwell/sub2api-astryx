import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAppShellMobile } from '@astryxdesign/core/AppShell'
import { RouterLink } from '~/lib/RouterLink'
import { isPageCodeReady, preloadPageCode } from '~/router/pageCode'

/*
 * Turning the page. Following a side nav link swaps the page inside a view transition, so the page
 * showing can leave while the next one arrives; the motion itself is in styles.css ("Page turn").
 * Pages turn only where the side nav is docked beside them and the browser has view transitions.
 * Elsewhere the links work like any other link.
 */

const HAS_VIEW_TRANSITIONS = typeof document !== 'undefined' && 'startViewTransition' in document

/** Whether following a side nav link turns the page here. For use inside the app shell. */
export function useTurnsPages(): boolean {
  const { isMobile } = useAppShellMobile()
  return HAS_VIEW_TRANSITIONS && !isMobile
}

/** Turns to the page at a path. Provided by the layout that calls `usePageTurn`. */
export const PageTurnContext = createContext<(href: string) => void>(() => {})

/**
 * For the layout that holds the side nav and the pages. `turnTo` goes to the page at a path by
 * turning the page. `pathname` is the page the side nav marks as showing: the one being turned to
 * while its code is still on the way, so a press shows at once.
 */
export function usePageTurn(): { turnTo: (href: string) => void; pathname: string } {
  const navigate = useNavigate()
  const location = useLocation()
  const [awaited, setAwaited] = useState<{ href: string; fromKey: string } | null>(null)
  let awaitedHref = awaited?.href
  if (awaited && awaited.fromKey !== location.key) {
    awaitedHref = undefined
    setAwaited(null)
  }

  const shown = useRef(location)
  useLayoutEffect(() => {
    shown.current = location
  }, [location])
  const latestTurn = useRef(0)
  useEffect(
    () => () => {
      latestTurn.current = -1
    },
    [],
  )

  const turnTo = useCallback(
    (href: string) => {
      const from = shown.current
      const turn = ++latestTurn.current
      if (href === from.pathname) {
        void navigate(href)
        return
      }
      if (isPageCodeReady(href)) {
        void navigate(href, { viewTransition: true })
        return
      }
      // Turning now would bring in a spinner. Fetch the code of the page first, and turn once it is here,
      // unless the user has gone somewhere else meanwhile.
      setAwaited({ href, fromKey: from.key })
      void preloadPageCode(href).then(() => {
        if (turn === latestTurn.current && shown.current.key === from.key) void navigate(href, { viewTransition: true })
      })
    },
    [navigate],
  )

  return { turnTo, pathname: awaitedHref ?? location.pathname }
}

/** For controls in the side nav that are not links: go to `href`, turning the page where pages turn. */
export function useTurnTo(): (href: string) => void {
  const turnTo = use(PageTurnContext)
  const navigate = useNavigate()
  const turnsPages = useTurnsPages()
  return turnsPages ? turnTo : (href) => void navigate(href)
}

const isPlainPress = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

type PageTurnLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement>; to?: unknown }

/**
 * The link of a side nav item (pass it as `as`). Pressing it turns the page. The code of its page
 * is fetched as soon as the pointer or the focus reaches it, so that it is usually here by the press.
 */
export function PageTurnLink({ href = '', to: _to, onClick, onPointerEnter, onFocus, ...rest }: PageTurnLinkProps) {
  const turnTo = use(PageTurnContext)
  const turnsPages = useTurnsPages()
  if (!href.startsWith('/') || rest.target === '_blank' || rest.download !== undefined) {
    return <RouterLink href={href} onClick={onClick} onPointerEnter={onPointerEnter} onFocus={onFocus} {...rest} />
  }
  return (
    <Link
      {...rest}
      to={href}
      onPointerEnter={(event) => {
        onPointerEnter?.(event)
        void preloadPageCode(href)
      }}
      onFocus={(event) => {
        onFocus?.(event)
        void preloadPageCode(href)
      }}
      onClick={(event) => {
        onClick?.(event)
        if (!turnsPages || event.defaultPrevented || !isPlainPress(event)) return
        event.preventDefault()
        turnTo(href)
      }}
    />
  )
}

/**
 * Where the pages show, with the veil that passes over them while a page turns. The stage is named
 * one of two sides and flips on every change of page: the page leaving and the page arriving are
 * then captured under different names, and each animates from its own place instead of being
 * morphed into the other.
 *
 * The stage also says where the page arriving comes from. `placeOf` tells where the page at a path
 * sits in the side nav, counted from the top, or -1 for a page the side nav does not list. A page
 * that sits higher than the one leaving comes from above; any other comes from below.
 */
export function PageStage({ children, placeOf }: { children: ReactNode; placeOf?: (pathname: string) => number }) {
  const { key, pathname } = useLocation()
  const turnsPages = useTurnsPages()
  const [turn, setTurn] = useState<{ key: string; pathname: string; side: 'a' | 'b'; from: 'below' | 'above' }>({
    key,
    pathname,
    side: 'a',
    from: 'below',
  })
  let { side, from } = turn
  if (turn.key !== key) {
    side = side === 'a' ? 'b' : 'a'
    const place = placeOf?.(pathname) ?? -1
    const placeLeft = placeOf?.(turn.pathname) ?? -1
    from = place >= 0 && place < placeLeft ? 'above' : 'below'
    setTurn({ key, pathname, side, from })
  }
  return (
    <>
      <div className="page-stage" data-page-turn={turnsPages ? side : undefined} data-page-turn-from={turnsPages ? from : undefined}>
        {children}
      </div>
      {turnsPages && (
        <div className="page-veil-anchor" aria-hidden="true">
          <div className="page-veil" />
        </div>
      )}
    </>
  )
}
