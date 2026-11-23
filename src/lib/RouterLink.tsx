import type { AnchorHTMLAttributes, Ref } from 'react'
import { Link } from 'react-router'

const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

/**
 * Adapter that lets Astryx's `href`-based links (SideNavItem, Link, Button
 * with href…) navigate through react-router without a full page load.
 */
export function RouterLink({
  href = '',
  ref,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> }) {
  if (!href || EXTERNAL.test(href) || rest.target === '_blank' || rest.download !== undefined) {
    return <a ref={ref} href={href} {...rest} />
  }
  return <Link ref={ref} to={href} {...rest} />
}
