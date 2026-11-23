import { useParams } from 'react-router'
import { LayoutContent } from '@astryxdesign/core/Layout'
import { useI18n } from '~/i18n'
import { EmbeddedPageView } from './customPage/EmbeddedPageView'
import { MarkdownPageView } from './customPage/MarkdownPageView'
import { PageEmptyState, PageFrame, PageLoadFailed, PageSpinner } from './customPage/PageFrame'
import { markdownSlugOf } from './customPage/pageAssets'
import { useCustomMenuItem } from './customPage/useCustomMenuItem'

/**
 * A page an admin added to the menu: either a markdown document kept on the server or a web
 * page shown in a frame.
 */
export function CustomPagePage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const lookup = useCustomMenuItem(id)

  if (lookup.status !== 'found') {
    return (
      <PageFrame
        title={t('customPage.title')}
        content={
          <LayoutContent padding={6}>
            {lookup.status === 'loading' && <PageSpinner />}
            {lookup.status === 'missing' && (
              <PageEmptyState title={t('customPage.notFoundTitle')} description={t('customPage.notFoundDesc')} />
            )}
            {lookup.status === 'failed' && <PageLoadFailed onRetry={lookup.retry} />}
          </LayoutContent>
        }
      />
    )
  }

  const { item } = lookup
  const slug = markdownSlugOf(item)
  // Keyed by page so the scroll position and outline of one document never carry over to the next.
  if (slug) return <MarkdownPageView key={slug} title={item.label} slug={slug} />
  return <EmbeddedPageView item={item} />
}
