import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Selector } from '@astryxdesign/core'
import { TextArea } from '@astryxdesign/core/TextArea'
import { FileInput } from '@astryxdesign/core/FileInput'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Banner } from '@astryxdesign/core/Banner'
import { Thumbnail } from '@astryxdesign/core/Thumbnail'
import { useLightbox } from '@astryxdesign/core/Lightbox'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import {
  ArrowPathIcon,
  ChatBubbleLeftEllipsisIcon,
  ClipboardDocumentIcon,
  PlayIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import type { Account, ClaudeModel } from '@/types'
import { adminAPI } from '~/lib/api/admin'
import { buildApiUrl } from '~/lib/api/url'
import { ADMIN_UI_REQUEST_HEADER } from '~/lib/api/adminUIRequest'
import { copyToClipboard } from '~/lib/clipboard'
import { useI18n } from '~/i18n'

type TestStatus = 'idle' | 'connecting' | 'success' | 'error'
type OpenAITestMode = 'default' | 'compact'
type GrokTestMode = 'text' | 'image' | 'video' | 'search' | 'tts' | 'stt' | 'realtime'

interface PreviewMedia {
  url: string
  mimeType?: string
}

interface TestEvent {
  type: string
  text?: string
  model?: string
  success?: boolean
  error?: string
  image_url?: string
  audio_url?: string
  video_url?: string
  mime_type?: string
}

const MAX_MEDIA_BYTES = 6 * 1024 * 1024
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.ogg,.webm'
const PRIORITIZED_GEMINI_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.0-flash',
]
// search/tts/stt/realtime call standalone endpoints: no model select, prompt optional.
const STANDALONE_GROK_MODES: GrokTestMode[] = ['search', 'tts', 'stt', 'realtime']

const isGrokImageModel = (id: string) => {
  const modelID = id.toLowerCase()
  return modelID === 'grok-imagine' || modelID === 'grok-imagine-edit' || modelID.startsWith('grok-imagine-image')
}
const isGrokVideoModel = (id: string) => {
  const modelID = id.toLowerCase()
  return modelID.startsWith('grok-imagine-video') || modelID.startsWith('grok-video')
}
const isGrokTextModel = (id: string) => !isGrokImageModel(id) && !isGrokVideoModel(id)

const sortTestModels = (models: ClaudeModel[]) => {
  const priorityMap = new Map(PRIORITIZED_GEMINI_MODELS.map((id, index) => [id, index]))
  return [...models].sort((a, b) => {
    const aPriority = priorityMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bPriority = priorityMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aPriority - bPriority
  })
}

/** Models offered for a Grok test mode; other platforms list every model. */
const modelsForMode = (models: ClaudeModel[], isGrok: boolean, mode: GrokTestMode) => {
  if (!isGrok) return models
  if (mode === 'image') return models.filter((m) => isGrokImageModel(m.id))
  if (mode === 'video') return models.filter((m) => isGrokVideoModel(m.id))
  if (mode === 'text') return models.filter((m) => isGrokTextModel(m.id))
  return []
}

/** Keeps the current model when the mode still offers it, otherwise picks the mode's default. */
const pickDefaultModel = (options: ClaudeModel[], current: string, mode: GrokTestMode) => {
  if (!options.length) return ''
  if (options.some((m) => m.id === current)) return current
  if (mode === 'text') {
    const preferred = options.find((m) => m.id.includes('grok-4.5')) || options.find((m) => m.id === 'grok') || options[0]
    return preferred.id
  }
  return options[0].id
}

const readFileAsDataURL = (file: File, failedMessage: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(failedMessage))
    reader.readAsDataURL(file)
  })

interface AccountTestDialogProps {
  isOpen: boolean
  account: Account | null
  onClose: () => void
}

/**
 * Port of AccountTestModal.vue: runs a live test request against one account
 * and streams the SSE events (status, text, generated media) into a terminal
 * view. OpenAI accounts pick a default/compact mode; Grok accounts pick a
 * text/image/video/search/TTS/STT/realtime mode with optional media uploads.
 */
export function AccountTestDialog({ isOpen, account, onClose }: AccountTestDialogProps) {
  const { t } = useI18n()
  const [status, setStatus] = useState<TestStatus>('idle')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [availableModels, setAvailableModels] = useState<ClaudeModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [testPrompt, setTestPrompt] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<PreviewMedia[]>([])
  const [generatedAudios, setGeneratedAudios] = useState<PreviewMedia[]>([])
  const [generatedVideos, setGeneratedVideos] = useState<PreviewMedia[]>([])
  const [testMode, setTestMode] = useState<OpenAITestMode>('default')
  const [grokTestMode, setGrokTestMode] = useState<GrokTestMode>('text')
  const [uploadImageFile, setUploadImageFile] = useState<File | null>(null)
  const [uploadImageDataURL, setUploadImageDataURL] = useState('')
  const [uploadAudioFile, setUploadAudioFile] = useState<File | null>(null)
  const [uploadAudioDataURL, setUploadAudioDataURL] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const terminalRef = useRef<HTMLPreElement>(null)
  const openRequestRef = useRef(0)

  const isOpenAIAccount = account?.platform === 'openai'
  const isGrokAccount = account?.platform === 'grok'
  const isConnecting = status === 'connecting'

  const openAITestModeOptions = useMemo(
    () => [
      { value: 'default', label: t('admin.accounts.openai.testModeDefault') },
      { value: 'compact', label: t('admin.accounts.openai.testModeCompact') },
    ],
    [t],
  )
  const grokTestModeOptions = useMemo(
    () => [
      { value: 'text', label: t('admin.accounts.grok.testModeText') },
      { value: 'image', label: t('admin.accounts.grok.testModeImage') },
      { value: 'video', label: t('admin.accounts.grok.testModeVideo') },
      { value: 'search', label: t('admin.accounts.grok.testModeSearch') },
      { value: 'tts', label: t('admin.accounts.grok.testModeTTS') },
      { value: 'stt', label: t('admin.accounts.grok.testModeSTT') },
      { value: 'realtime', label: t('admin.accounts.grok.testModeRealtime') },
    ],
    [t],
  )

  const modelID = selectedModelId.toLowerCase()
  const supportsGeminiImageTest =
    modelID.startsWith('gemini-') &&
    modelID.includes('-image') &&
    (account?.platform === 'gemini' || account?.platform === 'antigravity')
  const supportsOpenAIImageTest = modelID.startsWith('gpt-image-') && isOpenAIAccount
  const supportsGrokImageTest = isGrokAccount && grokTestMode === 'image'
  const supportsImageTest = supportsGeminiImageTest || supportsOpenAIImageTest || supportsGrokImageTest

  // Model select only when the mode needs a model.
  const showModelSelect = !isGrokAccount || grokTestMode === 'text' || grokTestMode === 'image' || grokTestMode === 'video'
  const modelOptionsForMode = useMemo(
    () => modelsForMode(availableModels, isGrokAccount, grokTestMode),
    [availableModels, isGrokAccount, grokTestMode],
  )
  const supportsPromptInput = isGrokAccount
    ? grokTestMode === 'image' || grokTestMode === 'video' || grokTestMode === 'search' || grokTestMode === 'tts'
    : supportsImageTest
  const supportsImageUpload = isGrokAccount && (grokTestMode === 'image' || grokTestMode === 'video')
  const supportsAudioUpload = isGrokAccount && grokTestMode === 'stt'

  const imageUploadLabel =
    grokTestMode === 'video' ? t('admin.accounts.grok.videoFirstFrameLabel') : t('admin.accounts.grok.imageUploadLabel')
  const imageUploadHint =
    grokTestMode === 'video' ? t('admin.accounts.grok.videoFirstFrameHint') : t('admin.accounts.grok.imageUploadHint')

  const promptInputLabel = (() => {
    if (grokTestMode === 'video') return t('admin.accounts.videoPromptLabel')
    if (supportsImageTest || grokTestMode === 'image') return t('admin.accounts.imagePromptLabel')
    if (grokTestMode === 'search') return t('admin.accounts.grok.searchQueryLabel')
    if (grokTestMode === 'tts') return t('admin.accounts.grok.ttsTextLabel')
    return t('admin.accounts.imagePromptLabel')
  })()
  const promptInputPlaceholder = (() => {
    if (grokTestMode === 'video') return t('admin.accounts.videoPromptPlaceholder')
    if (grokTestMode === 'image' || supportsImageTest) return t('admin.accounts.imagePromptPlaceholder')
    if (grokTestMode === 'search') return t('admin.accounts.grok.searchQueryPlaceholder')
    if (grokTestMode === 'tts') return t('admin.accounts.grok.ttsTextPlaceholder')
    return ''
  })()
  const promptInputHint = (() => {
    if (grokTestMode === 'video') return t('admin.accounts.videoTestHint')
    if (grokTestMode === 'image' || supportsImageTest) return t('admin.accounts.imageTestHint')
    if (grokTestMode === 'search') return t('admin.accounts.grok.searchTestHint')
    if (grokTestMode === 'tts') return t('admin.accounts.grok.ttsTestHint')
    if (grokTestMode === 'stt') return t('admin.accounts.grok.sttTestHint')
    if (grokTestMode === 'realtime') return t('admin.accounts.grok.realtimeTestHint')
    return ''
  })()

  const testModeSummary = (() => {
    if (isGrokAccount) {
      switch (grokTestMode) {
        case 'video':
          return t('admin.accounts.videoTestMode')
        case 'image':
          return t('admin.accounts.imageTestMode')
        case 'search':
          return t('admin.accounts.grok.searchTestMode')
        case 'tts':
          return t('admin.accounts.grok.ttsTestMode')
        case 'stt':
          return t('admin.accounts.grok.sttTestMode')
        case 'realtime':
          return t('admin.accounts.grok.realtimeTestMode')
        default:
          return t('admin.accounts.grok.textTestMode')
      }
    }
    if (supportsImageTest) return t('admin.accounts.imageTestMode')
    return t('admin.accounts.testPrompt')
  })()

  const canStartTest =
    !isConnecting && ((isGrokAccount && STANDALONE_GROK_MODES.includes(grokTestMode)) || Boolean(selectedModelId))

  // Default prompt for the Grok modes that take one; empty for the rest.
  const defaultGrokPrompt = useCallback(
    (mode: GrokTestMode) => {
      if (mode === 'video') return t('admin.accounts.videoPromptDefault')
      if (mode === 'image') return t('admin.accounts.imagePromptDefault')
      if (mode === 'search') return t('admin.accounts.grok.searchQueryDefault')
      if (mode === 'tts') return t('admin.accounts.grok.ttsTextDefault')
      return ''
    },
    [t],
  )

  const abortStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const resetState = useCallback(() => {
    setStatus('idle')
    setOutputLines([])
    setStreamingContent('')
    setErrorMessage('')
    setGeneratedImages([])
    setGeneratedAudios([])
    setGeneratedVideos([])
  }, [])

  const clearMediaUploads = useCallback(() => {
    setUploadImageFile(null)
    setUploadImageDataURL('')
    setUploadAudioFile(null)
    setUploadAudioDataURL('')
  }, [])

  // Reset the form and load the account's models each time the dialog opens.
  useEffect(() => {
    if (!isOpen || !account) {
      abortStream()
      return
    }
    const requestId = ++openRequestRef.current
    const grok = account.platform === 'grok'
    setTestPrompt('')
    setTestMode('default')
    setGrokTestMode('text')
    clearMediaUploads()
    resetState()
    setAvailableModels([])
    setSelectedModelId('')
    setLoadingModels(true)
    void (async () => {
      try {
        const models = await adminAPI.accounts.getAvailableModels(account.id)
        if (requestId !== openRequestRef.current) return
        const sorted =
          account.platform === 'gemini' || account.platform === 'antigravity' ? sortTestModels(models) : models
        let selected = ''
        if (sorted.length > 0) {
          // Gemini takes the first (prioritised) model; others prefer Sonnet.
          selected =
            account.platform === 'gemini'
              ? sorted[0].id
              : sorted.find((m) => m.id.includes('sonnet'))?.id || sorted[0].id
        }
        if (grok) selected = pickDefaultModel(modelsForMode(sorted, true, 'text'), selected, 'text')
        setAvailableModels(sorted)
        setSelectedModelId(selected)
      } catch (error) {
        if (requestId !== openRequestRef.current) return
        console.error('Failed to load available models:', error)
        setAvailableModels([])
        setSelectedModelId('')
      } finally {
        if (requestId === openRequestRef.current) setLoadingModels(false)
      }
    })()
  }, [isOpen, account, abortStream, clearMediaUploads, resetState])

  // Stop any running stream when the dialog unmounts.
  useEffect(() => abortStream, [abortStream])

  // Keep the newest output in view while it streams in.
  useEffect(() => {
    const pre = terminalRef.current
    if (!pre) return
    for (const el of Array.from(pre.children)) {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight
    }
  }, [outputLines, streamingContent, status])

  const handleGrokModeChange = (value: string) => {
    const mode = value as GrokTestMode
    setGrokTestMode(mode)
    clearMediaUploads()
    setSelectedModelId((current) => pickDefaultModel(modelsForMode(availableModels, true, mode), current, mode))
    setTestPrompt(defaultGrokPrompt(mode))
  }

  const failWith = (message: string) => {
    setErrorMessage(message)
    setStatus('error')
  }

  const handleImageFile = async (files: File | File[] | null) => {
    const file = Array.isArray(files) ? (files[0] ?? null) : files
    if (!file) {
      setUploadImageFile(null)
      setUploadImageDataURL('')
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setUploadImageFile(null)
      failWith(t('admin.accounts.grok.mediaTooLarge'))
      return
    }
    try {
      setUploadImageDataURL(await readFileAsDataURL(file, t('admin.accounts.grok.fileReadFailed')))
      setUploadImageFile(file)
    } catch {
      setUploadImageFile(null)
      setUploadImageDataURL('')
      failWith(t('admin.accounts.grok.fileReadFailed'))
    }
  }

  const handleAudioFile = async (files: File | File[] | null) => {
    const file = Array.isArray(files) ? (files[0] ?? null) : files
    if (!file) {
      setUploadAudioFile(null)
      setUploadAudioDataURL('')
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setUploadAudioFile(null)
      failWith(t('admin.accounts.grok.mediaTooLarge'))
      return
    }
    try {
      setUploadAudioDataURL(await readFileAsDataURL(file, t('admin.accounts.grok.fileReadFailed')))
      setUploadAudioFile(file)
    } catch {
      setUploadAudioFile(null)
      setUploadAudioDataURL('')
      failWith(t('admin.accounts.grok.fileReadFailed'))
    }
  }

  const handleClose = () => {
    abortStream()
    onClose()
  }

  const startTest = async () => {
    if (!account || !canStartTest) return

    resetState()
    setStatus('connecting')
    const lines: string[] = [
      t('admin.accounts.startingTestForAccount', { name: account.name }),
      t('admin.accounts.testAccountTypeLabel', { type: account.type }),
    ]
    if (isGrokAccount) {
      const modeLabel = grokTestModeOptions.find((o) => o.value === grokTestMode)?.label || grokTestMode
      lines.push(t('admin.accounts.grok.selectedTestMode', { mode: modeLabel }))
    }
    lines.push('')
    setOutputLines(lines)

    // The request line announced once the stream starts depends on the chosen mode.
    const sendingLine = (() => {
      if (isGrokAccount) {
        switch (grokTestMode) {
          case 'video':
            return t('admin.accounts.sendingVideoRequest')
          case 'image':
            return t('admin.accounts.sendingImageRequest')
          case 'search':
            return t('admin.accounts.grok.sendingSearchRequest')
          case 'tts':
            return t('admin.accounts.grok.sendingTTSRequest')
          case 'stt':
            return t('admin.accounts.grok.sendingSTTRequest')
          case 'realtime':
            return t('admin.accounts.grok.sendingRealtimeRequest')
          default:
            return t('admin.accounts.sendingTestMessage')
        }
      }
      return supportsImageTest ? t('admin.accounts.sendingImageRequest') : t('admin.accounts.sendingTestMessage')
    })()

    abortStream()
    const controller = new AbortController()
    abortRef.current = controller

    // This run's streamed text and media counts; state was cleared by resetState above.
    let streamed = ''
    let imageCount = 0
    let audioCount = 0
    let videoCount = 0
    const addLine = (text: string) => setOutputLines((prev) => [...prev, text])
    // Moves the streamed text into the output once the response ends.
    const flushStreaming = () => {
      if (streamed) addLine(streamed)
      streamed = ''
      setStreamingContent('')
    }

    const handleEvent = (event: TestEvent) => {
      switch (event.type) {
        case 'test_start':
          addLine(t('admin.accounts.connectedToApi'))
          if (event.model) addLine(t('admin.accounts.usingModel', { model: event.model }))
          addLine(sendingLine)
          addLine('')
          addLine(t('admin.accounts.response'))
          break
        case 'content':
          if (event.text) {
            streamed += event.text
            setStreamingContent(streamed)
          }
          break
        case 'image':
          if (event.image_url) {
            const media = { url: event.image_url, mimeType: event.mime_type }
            setGeneratedImages((prev) => [...prev, media])
            addLine(t('admin.accounts.imageReceived', { count: ++imageCount }))
          }
          break
        case 'audio':
          if (event.audio_url) {
            const media = { url: event.audio_url, mimeType: event.mime_type }
            setGeneratedAudios((prev) => [...prev, media])
            addLine(t('admin.accounts.audioReceived', { count: ++audioCount }))
          }
          break
        case 'video':
          if (event.video_url) {
            const media = { url: event.video_url, mimeType: event.mime_type }
            setGeneratedVideos((prev) => [...prev, media])
            addLine(t('admin.accounts.videoReceived', { count: ++videoCount }))
          }
          break
        case 'status':
          if (event.text) addLine(event.text)
          break
        case 'test_complete':
          flushStreaming()
          if (event.success) {
            setStatus('success')
          } else {
            failWith(event.error || t('admin.accounts.testFailed'))
          }
          break
        case 'error':
          failWith(event.error || t('common.unknownError'))
          flushStreaming()
          break
      }
    }

    try {
      const requestBody: {
        model_id: string
        prompt: string
        mode?: string
        image_data_url?: string
        audio_data_url?: string
      } = {
        model_id: showModelSelect ? selectedModelId : '',
        prompt: supportsPromptInput ? testPrompt.trim() : '',
      }
      if (isOpenAIAccount) requestBody.mode = testMode
      if (isGrokAccount) {
        // Always send the explicit Grok mode; standalone modes ignore the model.
        requestBody.mode = grokTestMode
        if (STANDALONE_GROK_MODES.includes(grokTestMode)) requestBody.model_id = ''
        if (uploadImageDataURL && (grokTestMode === 'image' || grokTestMode === 'video')) {
          requestBody.image_data_url = uploadImageDataURL
        }
        if (uploadAudioDataURL && grokTestMode === 'stt') requestBody.audio_data_url = uploadAudioDataURL
      }

      // EventSource cannot POST, so the SSE stream is read from fetch.
      const response = await fetch(buildApiUrl(`/admin/accounts/${account.id}/test`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
          [ADMIN_UI_REQUEST_HEADER]: '1',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error(t('admin.accounts.grok.noResponseBody'))

      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n')
        buffer = chunks.pop() || ''
        for (const line of chunks) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          try {
            handleEvent(JSON.parse(jsonStr) as TestEvent)
          } catch (e) {
            console.error('Failed to parse SSE event:', e)
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('idle')
        return
      }
      const msg = error instanceof Error ? error.message : t('common.unknownError')
      failWith(msg)
      addLine(t('admin.accounts.errorPrefix', { message: msg }))
    }
  }

  const copyOutput = () => void copyToClipboard(outputLines.join('\n'), t('admin.accounts.outputCopied'))

  // Terminal text: the state line, the output so far, then the text still streaming in.
  const terminalText = [
    ...(status === 'idle' ? [t('admin.accounts.readyToTest')] : []),
    ...(status === 'connecting' ? [t('admin.accounts.connectingToApi')] : []),
    ...outputLines,
    ...(streamingContent ? [`${streamingContent}_`] : []),
  ].join('\n')

  const lightbox = useLightbox({
    media: generatedImages.map((image) => ({ src: image.url, alt: t('admin.accounts.imageLightboxAlt') })),
    hasZoom: true,
  })

  const startLabel = isConnecting
    ? t('admin.accounts.testing')
    : status === 'idle'
      ? t('admin.accounts.startTest')
      : t('admin.accounts.retry')

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={640} purpose="form">
      <Layout
        header={
          <DialogHeader title={t('admin.accounts.testAccountConnection')} onOpenChange={(open) => !open && handleClose()} />
        }
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              {account && (
                <Card variant="muted" padding={3}>
                  <HStack gap={3} vAlign="center" hAlign="between">
                    <HStack gap={3} vAlign="center">
                      <Icon icon={PlayIcon} color="accent" />
                      <VStack gap={1}>
                        <Text weight="semibold">{account.name}</Text>
                        <HStack gap={2} vAlign="center">
                          <Badge label={account.type} variant="neutral" />
                          <Text type="supporting">{t('admin.accounts.account')}</Text>
                        </HStack>
                      </VStack>
                    </HStack>
                    <Badge label={account.status} variant={account.status === 'active' ? 'success' : 'neutral'} />
                  </HStack>
                </Card>
              )}

              {isGrokAccount && (
                <Selector
                  label={t('admin.accounts.grok.testMode')}
                  description={t('admin.accounts.grok.testModeHint')}
                  value={grokTestMode}
                  onChange={handleGrokModeChange}
                  options={grokTestModeOptions}
                  isDisabled={isConnecting}
                />
              )}

              {showModelSelect && (
                <Selector
                  label={t('admin.accounts.selectTestModel')}
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  options={modelOptionsForMode.map((m) => ({ value: m.id, label: m.display_name || m.id }))}
                  placeholder={loadingModels ? `${t('common.loading')}...` : t('admin.accounts.selectTestModel')}
                  isLoading={loadingModels}
                  isDisabled={loadingModels || isConnecting}
                />
              )}

              {isOpenAIAccount && (
                <Selector
                  label={t('admin.accounts.openai.testMode')}
                  value={testMode}
                  onChange={(value) => setTestMode(value === 'compact' ? 'compact' : 'default')}
                  options={openAITestModeOptions}
                  isDisabled={isConnecting}
                />
              )}

              {supportsPromptInput ? (
                <TextArea
                  label={promptInputLabel}
                  placeholder={promptInputPlaceholder}
                  description={promptInputHint || undefined}
                  value={testPrompt}
                  onChange={setTestPrompt}
                  isDisabled={isConnecting}
                  rows={3}
                />
              ) : (
                isGrokAccount &&
                promptInputHint && <Text type="supporting">{promptInputHint}</Text>
              )}

              {/* Optional media uploads for real generation / transcription */}
              {supportsImageUpload && (
                <VStack gap={2} hAlign="stretch">
                  <FileInput
                    label={imageUploadLabel}
                    description={imageUploadHint}
                    placeholder={t('admin.accounts.grok.chooseImageFile')}
                    accept={IMAGE_ACCEPT}
                    value={uploadImageFile}
                    onChange={(files) => void handleImageFile(files)}
                    isDisabled={isConnecting}
                  />
                  {uploadImageDataURL && (
                    <Thumbnail
                      src={uploadImageDataURL}
                      alt={t('admin.accounts.grok.uploadPreviewAlt')}
                      label={uploadImageFile?.name}
                    />
                  )}
                </VStack>
              )}

              {supportsAudioUpload && (
                <FileInput
                  label={t('admin.accounts.grok.audioUploadLabel')}
                  description={t('admin.accounts.grok.audioUploadHint')}
                  placeholder={t('admin.accounts.grok.chooseAudioFile')}
                  accept={AUDIO_ACCEPT}
                  value={uploadAudioFile}
                  onChange={(files) => void handleAudioFile(files)}
                  isDisabled={isConnecting}
                />
              )}

              {/* Terminal output */}
              <CodeBlock
                ref={terminalRef}
                code={terminalText}
                language="plaintext"
                size="sm"
                width="100%"
                maxHeight={240}
                isWrapped
                hasCopyButton={false}
                endContent={
                  outputLines.length > 0 ? (
                    <IconButton
                      icon={<Icon icon={ClipboardDocumentIcon} />}
                      label={t('admin.accounts.copyOutput')}
                      tooltip={t('admin.accounts.copyOutput')}
                      variant="ghost"
                      size="sm"
                      onClick={copyOutput}
                    />
                  ) : undefined
                }
              />
              {status === 'success' && <Banner status="success" title={t('admin.accounts.testCompleted')} />}
              {status === 'error' && <Banner status="error" title={errorMessage} />}

              {generatedImages.length > 0 && (
                <VStack gap={2} hAlign="stretch">
                  <Text type="label">{t('admin.accounts.imagePreview')}</Text>
                  <HStack gap={3} wrap="wrap" hAlign="center">
                    {generatedImages.map((image, index) => (
                      <VStack key={`${image.url}-${index}`} gap={1} hAlign="center">
                        <Thumbnail
                          src={image.url}
                          alt={t('admin.accounts.imagePreviewAlt', { index: index + 1 })}
                          onClick={() => lightbox.open(index)}
                        />
                        <Text type="supporting">{image.mimeType || 'image/*'}</Text>
                      </VStack>
                    ))}
                  </HStack>
                  {lightbox.element}
                </VStack>
              )}

              {generatedAudios.length > 0 && (
                <VStack gap={2} hAlign="stretch">
                  <Text type="label">{t('admin.accounts.audioPreview')}</Text>
                  {generatedAudios.map((audio, index) => (
                    <Card key={`audio-${index}`} padding={3}>
                      <VStack gap={1} hAlign="stretch">
                        <audio src={audio.url} controls aria-label={t('admin.accounts.audioPreview')} />
                        <Text type="supporting">{audio.mimeType || 'audio/*'}</Text>
                      </VStack>
                    </Card>
                  ))}
                </VStack>
              )}

              {generatedVideos.length > 0 && (
                <VStack gap={2} hAlign="stretch">
                  <Text type="label">{t('admin.accounts.videoPreview')}</Text>
                  {generatedVideos.map((video, index) => (
                    <Card key={`video-${index}`} padding={3}>
                      <VStack gap={1} hAlign="stretch">
                        <video src={video.url} controls aria-label={t('admin.accounts.videoPreview')} />
                        <Text type="supporting">{video.mimeType || 'video/*'}</Text>
                      </VStack>
                    </Card>
                  ))}
                </VStack>
              )}

              {/* Test info */}
              <HStack gap={3} vAlign="center" hAlign="between">
                <HStack gap={1} vAlign="center">
                  <Icon icon={Squares2X2Icon} size="sm" color="secondary" />
                  <Text type="supporting">{t('admin.accounts.testModel')}</Text>
                </HStack>
                <HStack gap={1} vAlign="center">
                  <Icon icon={ChatBubbleLeftEllipsisIcon} size="sm" color="secondary" />
                  <Text type="supporting">{testModeSummary}</Text>
                </HStack>
              </HStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={handleClose} />
              <Button
                label={startLabel}
                variant="primary"
                icon={<Icon icon={status === 'idle' ? PlayIcon : ArrowPathIcon} />}
                isLoading={isConnecting}
                isDisabled={!canStartTest}
                onClick={() => void startTest()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
