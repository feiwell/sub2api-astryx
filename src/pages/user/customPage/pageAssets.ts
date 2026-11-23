import type { CustomMenuItem } from '@/types'
import { buildApiUrl } from '~/lib/api/url'

/** Slug of the markdown page behind a menu item; '' when the item embeds a web page instead. */
export function markdownSlugOf(item: CustomMenuItem): string {
  if (item.page_slug) return item.page_slug
  if (item.url?.startsWith('md:')) return item.url.slice(3)
  return ''
}

export function pageUrl(slug: string): string {
  return buildApiUrl(`/pages/${encodeURIComponent(slug)}`)
}

function pathSegments(path: string): string[] {
  return path.split('/').filter((part) => part && part !== '.')
}

/**
 * True for an image path written relative to the page. The backend serves those from the
 * page's own folder, so anything with a scheme, a leading slash or a ".." step is left alone.
 */
export function isRelativePageAsset(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('/')) return false
  const [path] = trimmed.split(/([?#].*)/, 2)
  return pathSegments(path).every((part) => part !== '..' && !part.includes('\\'))
}

export function pageImageUrl(slug: string, src: string): string {
  const [path, suffix = ''] = src.trim().split(/([?#].*)/, 2)
  const encoded = pathSegments(path).map(encodeURIComponent).join('/')
  return buildApiUrl(`/pages/${encodeURIComponent(slug)}/images/${encoded}${suffix}`)
}
