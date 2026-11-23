import { useEffect, useRef, useState } from 'react'
import { fetchCodexModelsManifest } from '@/api/codex'
import { parseCodexCatalogModels, type CodexCatalogModel } from '@/utils/codexCatalogConfig'
import type { CodexCatalog } from './types'

/** A catalog larger than this cannot be loaded from the gateway address and has to be a local file. */
const REMOTE_CATALOG_MAX_BYTES = 1024 * 1024

const CATALOG_FILE_NAME = 'codex-models.json'

interface Manifest {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The address and key it was asked with: a catalog fetched for another key must not be offered. */
  source: string
  content: string
  modelCount: number
  isOversized: boolean
  models: CodexCatalogModel[]
}

const NO_MANIFEST: Manifest = {
  status: 'idle',
  source: '',
  content: '',
  modelCount: 0,
  isOversized: false,
  models: [],
}

export interface CodexCatalogControl {
  /** What the generated Codex files depend on. */
  catalog: CodexCatalog
  status: Manifest['status']
  modelCount: number
  /** Too large for the gateway address, so only the local file can be used. */
  isOversized: boolean
  selectMode: (mode: CodexCatalog['mode']) => void
  load: () => void
  download: () => void
  discard: () => void
}

/**
 * The Codex model catalog of one key: where Codex should read it from, and the copy fetched in the
 * dialog, which decides the model written into the config and can be saved as the local file.
 */
export function useCodexCatalog(baseUrl: string, apiKey: string): CodexCatalogControl {
  const [mode, setMode] = useState<CodexCatalog['mode']>('remote')
  const [manifest, setManifest] = useState<Manifest>(NO_MANIFEST)
  const request = useRef<AbortController | null>(null)
  const source = `${baseUrl}|${apiKey}`
  const current = manifest.source === source ? manifest : NO_MANIFEST

  // The request to cancel is whichever is running when the dialog closes, so the ref is read then.
  useEffect(
    () => () => {
      request.current?.abort()
      request.current = null
    },
    [],
  )

  const load = async () => {
    if (!apiKey) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setManifest({ ...NO_MANIFEST, status: 'loading', source })
    try {
      const result = await fetchCodexModelsManifest(baseUrl, apiKey, controller.signal)
      if (request.current !== controller) return
      const isOversized = result.responseBytes > REMOTE_CATALOG_MAX_BYTES
      if (isOversized) setMode('file')
      setManifest({
        status: 'ready',
        source,
        content: result.content,
        modelCount: result.modelCount,
        isOversized,
        models: parseCodexCatalogModels(result.content),
      })
    } catch {
      // A cancelled request was replaced or dropped on purpose; only the current one has failed.
      if (request.current === controller) setManifest({ ...NO_MANIFEST, status: 'error', source })
    } finally {
      if (request.current === controller) request.current = null
    }
  }

  const download = () => {
    if (!current.content) return
    const url = URL.createObjectURL(new Blob([current.content], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = CATALOG_FILE_NAME
    link.click()
    URL.revokeObjectURL(url)
  }

  const discard = () => {
    request.current?.abort()
    request.current = null
    setManifest(NO_MANIFEST)
  }

  return {
    catalog: { mode, models: current.models },
    status: current.status,
    modelCount: current.modelCount,
    isOversized: current.isOversized,
    selectMode: setMode,
    load,
    download,
    discard,
  }
}
