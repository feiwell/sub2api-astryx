import { createMarkdownPlugin } from '@astryxdesign/core/Markdown/plugins'
import { isRelativePageAsset, pageImageUrl } from './pageAssets'

interface TreeNode {
  readonly type: string
  readonly url?: string
  readonly children?: ReadonlyArray<TreeNode>
}

/** Copies only the branches that hold a rewritten image, so untouched nodes keep their identity. */
function withPageImages<T extends TreeNode>(node: T, slug: string): T {
  if (node.type === 'image') {
    const url = node.url ?? ''
    return isRelativePageAsset(url) ? { ...node, url: pageImageUrl(slug, url) } : node
  }
  if (!node.children) return node
  let hasChange = false
  const children = node.children.map((child) => {
    const next = withPageImages(child, slug)
    if (next !== child) hasChange = true
    return next
  })
  return hasChange ? { ...node, children } : node
}

/**
 * Markdown plugin that points the page's relative image paths at the backend folder of that
 * page. Working on the parsed tree leaves image syntax quoted inside code blocks alone.
 */
export function createPageImages(slug: string) {
  return createMarkdownPlugin({
    name: 'page-images',
    apiVersion: 1,
    transform: (root) => withPageImages(root, slug),
  })
}
