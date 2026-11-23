import { useEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock, type CodeBlockProps } from '@astryxdesign/core/CodeBlock'
import { powershell } from '@astryxdesign/core/CodeBlock/languages/powershell'
import { toml } from '@astryxdesign/core/CodeBlock/languages/toml'
import { Icon } from '@astryxdesign/core/Icon'
import { VStack } from '@astryxdesign/core/Stack'
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { SetupHint } from './SetupHint'
import type { ConfigFile, ConfigLanguage } from './types'

const COPIED_FEEDBACK_MS = 2000

// The longest files run to hundreds of lines; past this height a block scrolls on its own, so
// what follows it stays within reach.
const BLOCK_MAX_HEIGHT = 360

// Astryx has no grammar for Windows batch commands, so those are shown without colours.
const LANGUAGES: Record<ConfigLanguage, CodeBlockProps['language']> = {
  bash: 'bash',
  cmd: 'plaintext',
  powershell,
  toml,
  json: 'json',
}

/** One file or command set of a guide, with its caution and a copy button. */
export function ConfigFileBlock({ file }: { file: ConfigFile }) {
  const { t } = useI18n()
  const [isCopied, setCopied] = useState(false)
  const feedbackTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), [])

  const copy = async () => {
    if (!(await copyToClipboard(file.content, t('keys.copied')))) return
    setCopied(true)
    window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
  }

  return (
    <VStack gap={1.5}>
      {file.hint && <SetupHint text={file.hint} />}
      <CodeBlock
        code={file.content}
        language={LANGUAGES[file.language]}
        title={file.path}
        hasLanguageLabel={false}
        // The built-in button only works on https pages; the project's helper also covers http.
        hasCopyButton={false}
        endContent={
          <Button
            size="sm"
            variant="ghost"
            label={isCopied ? t('keys.useKeyModal.copied') : t('keys.useKeyModal.copy')}
            icon={<Icon icon={isCopied ? CheckIcon : ClipboardDocumentIcon} />}
            onClick={copy}
          />
        }
        maxHeight={BLOCK_MAX_HEIGHT}
        width="100%"
      />
    </VStack>
  )
}
