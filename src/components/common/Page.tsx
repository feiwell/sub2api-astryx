import type { ReactNode } from 'react'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'

/**
 * Standard page frame for the user console: a header with title, optional
 * description and actions, over a padded scrollable content area.
 */
export function Page({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={6}>
          <HStack gap={4} vAlign="center" justify="between" wrap="wrap" width="100%">
            <VStack gap={1}>
              <Heading level={1}>{title}</Heading>
              {description && (
                <Text type="body" color="secondary">
                  {description}
                </Text>
              )}
            </VStack>
            {actions && (
              <HStack gap={2} vAlign="center" wrap="wrap">
                {actions}
              </HStack>
            )}
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6} isScrollable>
          <div className="app-page">{children}</div>
        </LayoutContent>
      }
    />
  )
}
