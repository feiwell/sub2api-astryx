import type { ReactNode } from 'react'
import { Center } from '@astryxdesign/core/Center'
import { VStack } from '@astryxdesign/core/Stack'

/** Centered single-column frame for standalone pages outside the app shell (payment, MCP consent). */
export function CenteredFrame({ children, isFullScreen = true }: { children: ReactNode; isFullScreen?: boolean }) {
  return (
    <Center axis="both" padding={6} style={{ minHeight: isFullScreen ? '100vh' : '100%' }}>
      <VStack gap={6} hAlign="stretch" width="100%" style={{ maxWidth: 480 }}>
        {children}
      </VStack>
    </Center>
  )
}
