import type { ReactNode } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutHeader } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon, LinkIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'

/**
 * Frame shared by every state of a custom page: the title bar of the other console pages over
 * a content region each state supplies itself, because an embedded page fills that region edge
 * to edge while a markdown page scrolls inside it.
 */
export function PageFrame({
  title,
  actions,
  start,
  content,
}: {
  title: string
  actions?: ReactNode
  start?: ReactNode
  content: ReactNode
}) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={6}>
          <HStack gap={4} vAlign="center" justify="between" wrap="wrap" width="100%">
            <Heading level={1}>{title}</Heading>
            {actions}
          </HStack>
        </LayoutHeader>
      }
      start={start}
      content={content}
    />
  )
}

export function PageSpinner() {
  const { t } = useI18n()
  return (
    <Center height="100%">
      <Spinner size="lg" aria-label={t('common.loading')} />
    </Center>
  )
}

/** What the content region shows when there is no page to show. */
export function PageEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Center height="100%">
      <EmptyState headingLevel={2} icon={<Icon icon={LinkIcon} />} title={title} description={description} />
    </Center>
  )
}

/** What the content region shows when reading the page failed; the reader can ask again. */
export function PageLoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <Banner
      status="error"
      title={t('legal.loadFailed')}
      description={t('common.tryAgain')}
      endContent={<Button label={t('common.refresh')} icon={<Icon icon={ArrowPathIcon} />} onClick={onRetry} />}
    />
  )
}
