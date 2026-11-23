import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { Markdown } from '@astryxdesign/core/Markdown'
import { createMarkdownHeadingLinks } from '@astryxdesign/core/Markdown/plugins'
import { Outline, useOutlineFromMarkdown } from '@astryxdesign/core/Outline'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { ListBulletIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { PageEmptyState, PageFrame, PageLoadFailed, PageSpinner } from './PageFrame'
import { createPageImages } from './pageImages'
import { useMarkdownPage } from './useMarkdownPage'

/** Headings deeper than this stay out of the outline. */
const OUTLINE_DEPTH = 4
const OUTLINE_WIDTH = 240
/** From this window width on the outline takes a column of the page; below it, it slides over the page. */
const DOCKED_OUTLINE_QUERY = '(min-width: 641px)'
/** Windows at most this wide start with the outline closed. */
const OUTLINE_CLOSED_UP_TO = 768

/** The prefix keeps a heading from ever sharing an id with an element of the app itself. */
const headingLinks = createMarkdownHeadingLinks({ headingIdPrefix: 'custom-page' })

function elementFromHash(): HTMLElement | null {
  try {
    const id = decodeURIComponent(window.location.hash.slice(1))
    return id ? document.getElementById(id) : null
  } catch {
    return null
  }
}

/** A markdown page: the document, with an outline of its headings beside it. */
export function MarkdownPageView({ title, slug }: { title: string; slug: string }) {
  const { t } = useI18n()
  const { page, reload } = useMarkdownPage(slug)
  const source = page.status === 'ready' ? page.source : ''
  const plugins = useMemo(() => [createPageImages(slug), headingLinks], [slug])
  const headings = useOutlineFromMarkdown(source, { plugins })
  const outlineItems = useMemo(() => headings.filter((heading) => heading.level <= OUTLINE_DEPTH), [headings])
  const isDocked = useMediaQuery(DOCKED_OUTLINE_QUERY, true)
  const [isOutlineOpen, setOutlineOpen] = useState(() => window.innerWidth > OUTLINE_CLOSED_UP_TO)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasOutline = outlineItems.length > 0
  const outlineLabel = t('customPage.tableOfContents')

  // A link copied from a heading, or left in the address bar by the outline, opens at that heading.
  useEffect(() => {
    if (page.status !== 'ready') return
    const target = elementFromHash()
    if (target && scrollRef.current?.contains(target)) target.scrollIntoView()
  }, [page.status])

  const outline = (
    <Outline
      items={outlineItems}
      label={outlineLabel}
      scrollContainerRef={scrollRef}
      // Over the page the outline hides the document, so picking a heading puts it away.
      onNavigateStart={isDocked ? undefined : () => setOutlineOpen(false)}
    />
  )

  return (
    <>
      <PageFrame
        title={title}
        actions={
          hasOutline && (
            <ToggleButton
              label={outlineLabel}
              icon={<Icon icon={ListBulletIcon} />}
              isPressed={isOutlineOpen}
              onPressedChange={(isPressed) => setOutlineOpen(isPressed)}
            />
          )
        }
        start={
          hasOutline &&
          isDocked &&
          isOutlineOpen && (
            <LayoutPanel hasDivider width={OUTLINE_WIDTH}>
              <VStack gap={2}>
                <Text type="label" color="secondary">
                  {outlineLabel}
                </Text>
                {outline}
              </VStack>
            </LayoutPanel>
          )
        }
        content={
          <LayoutContent ref={scrollRef} padding={6}>
            {page.status === 'loading' && <PageSpinner />}
            {page.status === 'missing' && (
              <PageEmptyState title={t('customPage.notFoundTitle')} description={t('customPage.notFoundDesc')} />
            )}
            {page.status === 'failed' && <PageLoadFailed onRetry={reload} />}
            {page.status === 'ready' && (
              <Markdown plugins={plugins} autolink="gfm" headingLevelStart={2}>
                {page.source}
              </Markdown>
            )}
          </LayoutContent>
        }
      />
      {hasOutline && !isDocked && (
        <Drawer
          isOpen={isOutlineOpen}
          onOpenChange={setOutlineOpen}
          label={outlineLabel}
          side="start"
          width={OUTLINE_WIDTH + 40}
        >
          <Layout
            header={<DrawerHeader title={outlineLabel} onOpenChange={setOutlineOpen} />}
            content={<LayoutContent>{outline}</LayoutContent>}
          />
        </Drawer>
      )}
    </>
  )
}
