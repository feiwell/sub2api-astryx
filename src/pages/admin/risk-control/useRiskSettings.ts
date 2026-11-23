import { useEffect, useState } from 'react'
import type { NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type {
  ContentModerationAPIKeyStatus,
  ContentModerationConfig,
  ContentModerationTestAuditResult,
} from '~/lib/api/admin/riskControl'
import { toast } from '~/lib/toast'
import {
  ENGINES,
  draftFromConfig,
  selectedEngine,
  withDefaultThresholds,
  withEngine,
  withModelFilterType,
  type EngineDraft,
  type KeysWriteMode,
  type RiskDraft,
} from './riskForm'
import {
  asUnsavedKeyRows,
  hasKeyTestFailed,
  savedKeyRows,
  togglePendingDelete,
  withClearKeys,
  withKeysMode,
  withReportedKeys,
  withTestedSavedKeys,
} from './riskKeys'
import { engineLabel } from './riskModel'
import { parseApiKeys, savePayload, saveProblem, testPayload, type SaveProblem } from './riskPayload'
import type { RiskControl } from './useRiskControl'

/** The pages of the settings, in the order of their tabs. */
export const SETTINGS_TABS = ['basic', 'scope', 'runtime', 'response', 'riskThresholds', 'keywords', 'retention'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

/** Which keys a test tries: the ones typed into the field, or the saved ones. */
export type KeyTestSource = 'typed' | 'saved'

/** A trial run takes one image, of at most 8 MB: the texts of the page promise both. */
export const MAX_TEST_IMAGES = 1
const MAX_TEST_IMAGE_BYTES = 8 * 1024 * 1024

const readAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** Where a draft that cannot be saved is put right. */
const tabOfProblem = (problem: SaveProblem): SettingsTab => (problem.kind === 'modelFilterModels' ? 'scope' : 'basic')

/**
 * The settings dialog's own state. It edits a draft copied from the saved config when the dialog
 * opens; the page keeps showing the saved config until a save succeeds, and closing the dialog
 * drops the draft. The dialog is mounted only while open, so every opening starts from what is saved.
 */
export function useRiskSettings({
  control,
  config,
  onSaved,
  onClose,
}: {
  control: RiskControl
  /** The saved config the draft starts from. */
  config: ContentModerationConfig
  /** A save went through: what the page shows beside the config is out of date. */
  onSaved: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { status, syncStatus, setConfig } = control
  const defaultBlockMessage = t('admin.riskControl.defaultBlockMessage')

  const [draft, setDraft] = useState<RiskDraft>(() => draftFromConfig(config, defaultBlockMessage))
  const [tab, setTab] = useState<SettingsTab>('basic')
  const [isSaving, setSaving] = useState(false)

  // What a trial run is asked with and what it answered. None of it is saved.
  // The test on its way, by the keys it tries; null while none runs.
  const [testing, setTesting] = useState<KeyTestSource | null>(null)
  const isTesting = testing != null
  const [testPrompt, setTestPrompt] = useState('')
  const [testImages, setTestImages] = useState<string[]>([])
  const [testResult, setTestResult] = useState<ContentModerationTestAuditResult | null>(null)
  // Typed keys that were tried: listed beside the saved ones until the engine in view changes.
  const [testedKeys, setTestedKeys] = useState<ContentModerationAPIKeyStatus[]>([])

  // By field: text typed into a number field that the field refused. The draft still holds the
  // number from before, so a save would send something else than what is on screen.
  const [numberErrors, setNumberErrors] = useState<Record<string, NumberInputEntryError>>({})

  // The service reports the keys of the running engine every few seconds, and after each test.
  useEffect(() => {
    setDraft((current) => withReportedKeys(current, status))
  }, [status])

  const engine = selectedEngine(draft)
  const hasTestContent = testPrompt.trim() !== '' || testImages.length > 0

  const edit = (patch: Partial<RiskDraft>) => setDraft((current) => ({ ...current, ...patch }))
  /** Change the engine in view; the other engine keeps what it holds. */
  const changeEngine = (change: (current: EngineDraft) => EngineDraft) =>
    setDraft((current) => withEngine(current, current.engine, change))
  const editEngine = (patch: Partial<EngineDraft>) => changeEngine((current) => ({ ...current, ...patch }))

  /** Put another engine in view. A save makes the engine in view the running one. */
  const selectEngine = (value: string) => {
    const next = ENGINES.find((name) => name === value)
    // A test answers for the engine it was started with, so the engine stays until it is back.
    if (!next || next === draft.engine || isTesting || isSaving) return
    edit({ engine: next })
    setTestedKeys([])
    setTestResult(null)
  }

  const toggleClearKeys = () => {
    const isCleared = !engine.clear_api_key
    changeEngine((current) => withClearKeys(current, isCleared))
    // With every key about to go, the typed ones were dropped from the field as well.
    if (isCleared) setTestedKeys([])
  }

  const reportNumberError = (field: string, error: NumberInputEntryError | null) => {
    setNumberErrors((current) => {
      if (error == null) {
        if (!(field in current)) return current
        const { [field]: _gone, ...rest } = current
        return rest
      }
      return current[field]?.kind === error.kind ? current : { ...current, [field]: error }
    })
  }

  /**
   * Try keys against the engine in view, as the draft has it. `typed` tries the keys in the field;
   * otherwise the saved ones are tried. With a prompt or an image the content is audited as well.
   */
  const testKeys = async (source: KeyTestSource) => {
    if (isTesting) return
    const keys = source === 'typed' ? parseApiKeys(engine.api_keys_text) : []
    if (source === 'typed' && keys.length === 0) {
      toast.error(t('admin.riskControl.apiKeyTestNoInput'))
      return
    }
    const tested = draft.engine
    const hadContent = hasTestContent
    setTesting(source)
    try {
      const result = await adminAPI.riskControl.testAPIKeys(
        testPayload(draft, { keys, prompt: testPrompt, images: testImages }),
      )
      const rows = Array.isArray(result.items) ? result.items : []
      setTestResult(result.audit_result ?? null)
      if (source === 'typed') {
        setTestedKeys(asUnsavedKeyRows(rows))
      } else {
        setDraft((current) => withEngine(current, tested, (saved) => withTestedSavedKeys(saved, rows, hadContent)))
        setTestedKeys([])
        // The service froze or thawed keys by what the test found: the page shows that too.
        await syncStatus()
      }
      if (hasKeyTestFailed(rows)) toast.error(t('admin.riskControl.apiKeyTestFailed'))
      else toast.success(t('admin.riskControl.apiKeyTestDone', { count: rows.length }))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.riskControl.apiKeyTestFailed')))
    } finally {
      setTesting(null)
    }
  }

  /** Add images to the trial run: picked, dropped or pasted. What is not an image is ignored. */
  const addTestImages = async (files: File[]) => {
    let count = testImages.length
    for (const file of files.filter((item) => item.type.startsWith('image/'))) {
      if (count >= MAX_TEST_IMAGES) {
        toast.error(t('admin.riskControl.auditTestImageLimit', { count: MAX_TEST_IMAGES }))
        return
      }
      if (file.size > MAX_TEST_IMAGE_BYTES) {
        toast.error(t('admin.riskControl.auditTestImageTooLarge'))
        continue
      }
      try {
        const image = await readAsDataURL(file)
        count += 1
        // Two additions may read at once; the limit holds for what ends up in the list.
        setTestImages((current) => (current.length >= MAX_TEST_IMAGES ? current : [...current, image]))
      } catch {
        toast.error(t('admin.riskControl.auditTestImageReadFailed'))
      }
    }
  }

  const clearTest = () => {
    setTestPrompt('')
    setTestImages([])
    setTestResult(null)
  }

  const problemText = (problem: SaveProblem): string => {
    if (problem.kind === 'modelFilterModels') return t('admin.riskControl.modelFilterModelsRequired')
    const text = t('admin.riskControl.apiKeysReplaceNoInput')
    // The engine in view needs no name; the other one is out of sight, so it is named.
    return problem.engine === draft.engine ? text : `${engineLabel(problem.engine)}: ${text}`
  }

  const save = async () => {
    if (isSaving) return
    if (Object.keys(numberErrors).length > 0) {
      toast.error(t('admin.settings.features.affiliate.fixNumbers'))
      return
    }
    const problem = saveProblem(draft)
    if (problem) {
      setTab(tabOfProblem(problem))
      toast.error(problemText(problem))
      return
    }
    setSaving(true)
    try {
      setConfig(await adminAPI.riskControl.updateConfig(savePayload(draft, defaultBlockMessage)))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.riskControl.saveFailed')))
      setSaving(false)
      return
    }
    // The dialog is gone from here on; the page takes over.
    onClose()
    toast.success(t('admin.riskControl.saved'))
    onSaved()
    void syncStatus()
  }

  return {
    draft,
    /** The part of the draft that belongs to the engine in view. */
    engine,
    tab,
    setTab,
    edit,
    editEngine,
    selectEngine,
    setModelFilterType: (type: string) => setDraft((current) => withModelFilterType(current, type)),

    /** The keys of the engine in view: the saved ones, then typed ones that were tried. */
    keyRows: [...savedKeyRows(status, draft.engine, engine), ...testedKeys],
    typedKeyCount: parseApiKeys(engine.api_keys_text).length,
    setKeysMode: (mode: KeysWriteMode) => changeEngine((current) => withKeysMode(current, mode)),
    toggleClearKeys,
    toggleKeyDelete: (row: ContentModerationAPIKeyStatus) => changeEngine((current) => togglePendingDelete(current, row)),
    /** Set one category's threshold of the engine in view, as a share of a hundred. */
    setThreshold: (category: string, percent: number) =>
      changeEngine((current) => ({ ...current, thresholds: { ...current.thresholds, [category]: percent } })),
    resetThresholds: () => changeEngine(withDefaultThresholds),

    /** The test on its way, by the keys it tries; null while none runs. */
    testing,
    testKeys,
    testPrompt,
    setTestPrompt,
    testImages,
    addTestImages,
    removeTestImage: (index: number) => setTestImages((current) => current.filter((_, at) => at !== index)),
    testResult,
    hasTestContent,
    clearTest,

    numberErrors,
    reportNumberError,

    isSaving,
    save,
  }
}

export type RiskSettings = ReturnType<typeof useRiskSettings>
