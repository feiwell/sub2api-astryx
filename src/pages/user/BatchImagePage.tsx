import { getGatewayBaseURL } from '@/api/url'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import {
  Table,
  TableSelectionToolbar,
  pixel,
  proportional,
  useTableSelection,
  useTableSelectionState,
  type TableColumn,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Heading } from '@astryxdesign/core/Heading'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Token } from '@astryxdesign/core/Token'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Link } from '@astryxdesign/core/Link'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Selector } from '@astryxdesign/core/Selector'
import { FileInput } from '@astryxdesign/core/FileInput'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Popover } from '@astryxdesign/core/Popover'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Thumbnail } from '@astryxdesign/core/Thumbnail'
import { Lightbox } from '@astryxdesign/core/Lightbox'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Center } from '@astryxdesign/core/Center'
import { Card } from '@astryxdesign/core/Card'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  DocumentIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { keysAPI } from '@/api'
import {
  cancelBatchImageJob,
  deleteBatchImageJobRecord,
  downloadBatchImageZip,
  getBatchImageItemContent,
  getBatchImageJob,
  listBatchImageItems,
  listBatchImageJobs,
  listBatchImageModels,
  saveBlob,
  submitBatchImageJob,
  type BatchImageItem,
  type BatchImageJob,
  type BatchImageJobsListOptions,
  type BatchImageReferenceImage,
  type BatchImageStatus,
  type BatchImageSubmitItem,
} from '@/api/batchImage'
import type { ApiKey } from '@/types'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import { Page } from '~/components/common/Page'
import { getLocale, t as translate, useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { toast } from '~/lib/toast'
import { pollWhileVisible } from '~/lib/visiblePolling'
import { useAppStore } from '~/stores/app'
import {
  cleanupPreviewCache,
  createThumbnailBlob,
  getCachedPreviewBlob,
  previewCacheKey,
  previewCacheSupported,
  putCachedPreviewBlob,
} from '~/lib/batchImagePreviewCache'

/**
 * Batch image generation (/batch-image and its /docs/batch-image alias).
 * Port of frontend/src/views/user/BatchImageGuideView.vue: job list across the
 * user's batch-image keys, job detail with lazily loaded previews, job creation
 * with reference images, and the Codex skill instructions.
 */

interface JobRow extends Record<string, unknown> {
  id: string
  task_name: string
  parent_batch_id: string | null
  status: BatchImageStatus
  model: string
  provider: string
  item_count: number
  success_count: number
  fail_count: number
  estimated_cost: number
  hold_amount: number
  actual_cost: number | null
  created_at: number
  downloaded_at?: number | null
  api_key_id: number
  api_key_name: string
  child_count: number
  is_child?: boolean
}

type DetailItem = BatchImageItem & { batch_id: string; source_task_name: string }

interface DetailRow extends Record<string, unknown> {
  key: string
  item: DetailItem
}

interface PromptRow extends Record<string, unknown> {
  localId: string
  custom_id: string
  prompt: string
  output_count: number
  reference_images: BatchImageReferenceImage[]
}

type ReferenceImageDraft = BatchImageReferenceImage & { name: string; size: number }

type JobLike = Pick<
  BatchImageJob,
  'id' | 'parent_batch_id' | 'status' | 'item_count' | 'success_count' | 'fail_count' | 'estimated_cost' | 'hold_amount' | 'actual_cost'
>

type ConfirmState = { kind: 'cancel' } | { kind: 'delete'; job: JobRow } | { kind: 'deleteSelected' }

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'output_deleted'])
const BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM = 4
const BATCH_IMAGE_MAX_OUTPUTS_PER_JOB = 200
const BATCH_IMAGE_SIZE = '1K'
const REFERENCE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const OUTPUT_COUNT_OPTIONS = Array.from({ length: BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM }, (_, index) => index + 1)
const PAGE_SIZE_OPTIONS = [20, 50, 100]
const POLL_INTERVAL_MS = 8000
const OUTPUT_FORMAT_OPTIONS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WebP' },
]
const EMPTY_FILTERS = { taskName: '', apiKeyId: '', status: '', downloaded: '' }
/** Selector value for the "all" option of each filter (an empty value would read as unselected). */
const ALL_FILTER = 'all'

function keyAllowsBatchImage(key: ApiKey) {
  return key.status === 'active' && key.group?.platform === 'gemini' && key.group?.allow_batch_image_generation === true
}

function referenceImageLimitForModel(model: string) {
  const normalized = String(model || '').toLowerCase()
  if (normalized.includes('pro-image')) return 14
  if (normalized.includes('flash-image')) return 3
  return 0
}

function uniqueCustomID(raw: string, used: Set<string>, index: number): string {
  const base = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || `img_${String(index + 1).padStart(3, '0')}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

function normalizeOutputCount(value: unknown): number {
  const parsed = Math.floor(Number(value || 1))
  if (!Number.isFinite(parsed)) return 1
  return Math.min(BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM, Math.max(1, parsed))
}

function parsePromptRows(rows: PromptRow[]): BatchImageSubmitItem[] {
  const used = new Set<string>()
  return rows
    .map((row, index) => {
      const customID = uniqueCustomID(row.custom_id || `img_${String(index + 1).padStart(3, '0')}`, used, index)
      const item: BatchImageSubmitItem = { custom_id: customID, prompt: row.prompt.trim() }
      const outputCount = normalizeOutputCount(row.output_count)
      if (outputCount > 1) item.output_count = outputCount
      if (row.reference_images.length) item.reference_images = row.reference_images
      return item
    })
    .filter((item) => item.prompt)
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

function formatDate(timestamp: number) {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleString()
}

function defaultTaskName(timestamp?: number) {
  const date = timestamp ? new Date(timestamp * 1000) : new Date()
  return date.toLocaleString()
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '$0.00'
  return `$${Number(value).toFixed(2)}`
}

function joinEndpointPath(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function toJobRow(job: BatchImageJob, key: ApiKey | null): JobRow {
  return {
    id: job.id,
    task_name: job.task_name || defaultTaskName(job.created_at),
    parent_batch_id: job.parent_batch_id || null,
    status: job.status,
    model: job.model,
    provider: job.provider,
    item_count: job.item_count,
    success_count: job.success_count,
    fail_count: job.fail_count,
    estimated_cost: job.estimated_cost,
    hold_amount: job.hold_amount,
    actual_cost: job.actual_cost,
    created_at: job.created_at,
    downloaded_at: job.downloaded_at,
    api_key_id: key?.id || 0,
    api_key_name: key?.name || '',
    child_count: 0,
  }
}

function applyChildCounts(rows: JobRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.parent_batch_id) continue
    counts.set(row.parent_batch_id, (counts.get(row.parent_batch_id) || 0) + 1)
  }
  return rows.map((row) => ({ ...row, child_count: counts.get(row.id) || 0 }))
}

function groupChildren(rows: JobRow[]) {
  const groups = new Map<string, JobRow[]>()
  for (const job of rows) {
    if (!job.parent_batch_id) continue
    const list = groups.get(job.parent_batch_id) || []
    list.push(job)
    groups.set(job.parent_batch_id, list)
  }
  for (const list of groups.values()) list.sort((a, b) => a.created_at - b.created_at)
  return groups
}

function visibleRows(rows: JobRow[], expanded: Set<string>, children: Map<string, JobRow[]>) {
  const out: JobRow[] = []
  for (const job of rows.filter((item) => !item.parent_batch_id)) {
    out.push(job)
    if (expanded.has(job.id)) {
      out.push(...(children.get(job.id) || []).map((child) => ({ ...child, is_child: true })))
    }
  }
  return out
}

/** Folds retry subtasks into their parent so the parent shows the combined outcome. */
function displayJob<T extends JobLike>(job: T, children: Map<string, JobRow[]>): T {
  if (job.parent_batch_id) return job
  const childJobs = children.get(job.id) || []
  if (!childJobs.length) return job

  const childSuccess = childJobs.reduce((sum, child) => sum + child.success_count, 0)
  const childEstimated = childJobs.reduce((sum, child) => sum + child.estimated_cost, 0)
  const childHold = childJobs.reduce((sum, child) => sum + child.hold_amount, 0)
  const childActual = childJobs.reduce((sum, child) => sum + (child.actual_cost || 0), 0)
  const childActualReady = childJobs.every((child) => child.actual_cost !== null)
  const successCount = Math.min(job.item_count, job.success_count + childSuccess)
  const failCount = Math.max(0, job.item_count - successCount)
  const actualCost = job.actual_cost === null ? (childActualReady ? childActual : null) : job.actual_cost + childActual

  return {
    ...job,
    success_count: successCount,
    fail_count: failCount,
    status: failCount === 0 && TERMINAL_STATUSES.has(job.status) ? 'completed' : job.status,
    estimated_cost: job.estimated_cost + childEstimated,
    hold_amount: job.hold_amount + childHold,
    actual_cost: actualCost,
  }
}

function canCancel(job: Pick<BatchImageJob, 'status'>) {
  return !TERMINAL_STATUSES.has(job.status)
}

function canDownload(job: Pick<BatchImageJob, 'status' | 'success_count'>) {
  return job.status === 'completed' && job.success_count > 0
}

function canDeleteRecord(job: Pick<BatchImageJob, 'status'>) {
  return TERMINAL_STATUSES.has(job.status)
}

function canRetry(job: JobLike, children: Map<string, JobRow[]>) {
  const display = displayJob(job, children)
  return TERMINAL_STATUSES.has(display.status) && display.fail_count > 0
}

function costLabel(job: Pick<BatchImageJob, 'status' | 'hold_amount' | 'actual_cost'>) {
  if (job.actual_cost !== null) return formatMoney(job.actual_cost)
  if (job.status === 'failed' || job.status === 'cancelled') return formatMoney(0)
  return translate('batchImage.detail.holdCost', { amount: formatMoney(job.hold_amount) })
}

function retryCustomID(customID: string) {
  const base = String(customID || 'item').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'item'
  return `${base}_retry_${Date.now().toString(36)}`
}

function retrySourceCustomID(customID: string) {
  return String(customID || '').replace(/(?:_retry_[a-z0-9]+)+$/i, '')
}

function isSuccessfulImageItem(item: Pick<BatchImageItem, 'status' | 'image_count'>) {
  return (item.status === 'succeeded' || item.status === 'success') && item.image_count > 0
}

function itemPreviewKey(item: Pick<DetailItem, 'batch_id' | 'custom_id'>) {
  return previewCacheKey(item.batch_id, item.custom_id, 0)
}

const JOB_STATUS_KEYS: Record<string, string> = {
  queued: 'queued',
  running: 'running',
  indexing: 'processingResults',
  processing_results: 'processingResults',
  settling: 'settling',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  output_deleted: 'outputDeleted',
}

function statusLabel(job: Pick<BatchImageJob, 'status' | 'success_count' | 'fail_count'>) {
  if (job.status === 'completed' && job.fail_count > 0) {
    return translate(job.success_count > 0 ? 'batchImage.status.partialSuccess' : 'batchImage.status.allFailed')
  }
  const key = JOB_STATUS_KEYS[job.status]
  return key ? translate(`batchImage.status.${key}`) : job.status
}

function statusVariant(job: Pick<BatchImageJob, 'status' | 'success_count' | 'fail_count'>) {
  if (job.status === 'completed' && job.fail_count > 0) return job.success_count > 0 ? 'warning' : 'error'
  if (job.status === 'completed') return 'success'
  if (job.status === 'failed' || job.status === 'cancelled') return 'error'
  if (job.status === 'output_deleted') return 'neutral'
  return 'accent'
}

const ITEM_STATUS_KEYS: Record<string, string> = {
  pending: 'pending',
  succeeded: 'succeeded',
  success: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
}

function friendlyItemError(error: BatchImageItem['error']) {
  if (!error) return '-'
  if (error.code === 'EMPTY_IMAGE_OUTPUT') return translate('batchImage.itemResult.emptyImageOutput')
  if (error.code === 'PROVIDER_ITEM_FAILED') return translate('batchImage.itemResult.providerItemFailed')
  return error.message || error.code || '-'
}

// ---------------------------------------------------------------------------
// Error messages (same code → message mapping as the Vue page)
// ---------------------------------------------------------------------------

type BatchImageError = { code?: unknown; message?: unknown; requestId?: unknown; status?: unknown }

const ADMIN_ERROR_CODES: Record<string, string> = {
  BATCH_IMAGE_NO_ACCOUNT_AVAILABLE: 'noCompatibleAccount',
  BATCH_IMAGE_UNSUPPORTED_PROVIDER: 'unsupportedProvider',
  BATCH_IMAGE_VERTEX_GCS_BUCKET_MISSING: 'vertexGcsBucketMissing',
  VERTEX_MANAGED_GCS_BUCKET_MISSING: 'vertexGcsBucketMissing',
  BATCH_IMAGE_PROVIDER_SUBMIT_FAILED: 'providerSubmitFailed',
  BATCH_IMAGE_PROVIDER_MISSING_API_KEY: 'providerSubmitFailed',
  BATCH_IMAGE_PROVIDER_MISSING_SERVICE_ACCOUNT: 'providerSubmitFailed',
  BATCH_IMAGE_PROVIDER_UNSUPPORTED_ACCOUNT: 'providerSubmitFailed',
  BATCH_IMAGE_QUEUE_FAILED: 'queueFailed',
  BATCH_IMAGE_QUEUE_NOT_CONFIGURED: 'queueFailed',
  BATCH_IMAGE_BILLING_HOLD_FAILED: 'billingHoldFailed',
  BATCH_IMAGE_SETTLEMENT_PRICING_MISSING: 'pricingMissing',
  BATCH_IMAGE_RESULT_MISSING: 'resultMissing',
  BATCH_IMAGE_DISABLED: 'disabled',
}

const PLAIN_ERROR_CODES: Record<string, string> = {
  BATCH_IMAGE_GROUP_DISABLED: 'groupDisabled',
  BATCH_IMAGE_INSUFFICIENT_BALANCE: 'insufficientBalance',
  BATCH_IMAGE_INVALID_MODEL: 'invalidModel',
  BATCH_IMAGE_INVALID_ITEMS: 'invalidItems',
  BATCH_IMAGE_DUPLICATE_CUSTOM_ID: 'duplicateCustomId',
  BATCH_IMAGE_PROMPT_TOO_LONG: 'promptTooLong',
  BATCH_IMAGE_INVALID_REFERENCE_IMAGE: 'invalidReferenceImage',
  BATCH_IMAGE_TOO_MANY_REFERENCE_IMAGES: 'tooManyReferenceImages',
  BATCH_IMAGE_REFERENCE_IMAGES_TOO_LARGE: 'referenceImagesTooLarge',
  BATCH_IMAGE_TOO_MANY_OUTPUT_IMAGES: 'tooManyOutputImages',
  BATCH_IMAGE_IDEMPOTENCY_CONFLICT: 'idempotencyConflict',
  BATCH_IMAGE_NOT_READY: 'notReady',
  BATCH_IMAGE_OUTPUT_DELETED: 'outputDeleted',
  BATCH_IMAGE_ITEM_FAILED: 'itemFailed',
  BATCH_IMAGE_ITEM_IMAGE_INDEX_OUT_OF_RANGE: 'itemImageIndexOutOfRange',
  BATCH_IMAGE_DOWNLOAD_LIMITED: 'downloadLimited',
  BATCH_IMAGE_DOWNLOAD_TOO_LARGE: 'downloadTooLarge',
  BATCH_IMAGE_RECORD_DELETE_NOT_READY: 'deleteNotReady',
}

function batchImageText(key: string) {
  return translate(`batchImage.messages.${key}`)
}

function isZhLocale() {
  return getLocale().toLowerCase().startsWith('zh')
}

function batchImageErrorReference(error: BatchImageError) {
  const parts: string[] = []
  const code = String(error?.code || '').trim()
  const requestId = String(error?.requestId || '').trim()
  const status = String(error?.status || '').trim()
  if (code) parts.push(translate('batchImage.messages.errorCodeRef', { code }))
  if (requestId) parts.push(translate('batchImage.messages.requestIdRef', { id: requestId }))
  if (!code && status) parts.push(translate('batchImage.messages.httpStatusRef', { status }))
  return parts.length ? `（${parts.join(isZhLocale() ? '，' : ', ')}）` : ''
}

function batchImageAdminError(base: string, error: BatchImageError) {
  const reference = batchImageErrorReference(error)
  return `${base}${reference ? ` ${reference}` : ''} ${batchImageText('adminReference')}`
}

function batchImageErrorMessage(raw: unknown, fallback: string) {
  const error = (raw || {}) as BatchImageError
  const code = String(error.code || '').trim()
  const message = String(error.message || '').trim()
  if (code === 'API_KEY_REQUIRED' || code === '401') return batchImageText('authRequired')
  if (/no compatible batch image account/i.test(message)) return batchImageAdminError(batchImageText('noCompatibleAccount'), error)
  if (/unsupported batch image provider/i.test(message)) return batchImageAdminError(batchImageText('unsupportedProvider'), error)
  if (ADMIN_ERROR_CODES[code]) return batchImageAdminError(batchImageText(ADMIN_ERROR_CODES[code]), error)
  if (PLAIN_ERROR_CODES[code]) return batchImageText(PLAIN_ERROR_CODES[code])
  if (code === 'INTERNAL_ERROR' || code === '500') return batchImageAdminError(fallback, error)
  if (isZhLocale()) {
    const detail = message ? `${batchImageText('errorReference')}：${message}` : batchImageText('adminReference')
    return `${fallback}。${detail} ${batchImageErrorReference(error)}`
  }
  return message || fallback
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function JobStatus({ job }: { job: Pick<BatchImageJob, 'status' | 'success_count' | 'fail_count'> }) {
  const label = statusLabel(job)
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={statusVariant(job)} label={label} />
      <Text type="supporting" color="primary">
        {label}
      </Text>
    </HStack>
  )
}

function JobCounts({ job }: { job: Pick<BatchImageJob, 'success_count' | 'fail_count' | 'item_count'> }) {
  const { t } = useI18n()
  return (
    <HStack gap={1} vAlign="center">
      <Icon icon={CheckCircleIcon} size="xsm" color="success" />
      <Text hasTabularNumbers>{job.success_count}</Text>
      <Icon icon={XCircleIcon} size="xsm" color={job.fail_count > 0 ? 'error' : 'disabled'} />
      <Text hasTabularNumbers color={job.fail_count > 0 ? 'primary' : 'secondary'}>
        {job.fail_count}
      </Text>
      <Text type="supporting">{t('batchImage.list.totalCount', { n: job.item_count })}</Text>
    </HStack>
  )
}

function PromptCell({ prompt, isMuted }: { prompt: string; isMuted: boolean }) {
  const { t } = useI18n()
  const value = prompt.trim()
  if (!value || value === '-') {
    return <Text color="secondary">-</Text>
  }
  return (
    <Popover
      label={t('batchImage.promptPopover.title')}
      width={440}
      content={
        <VStack gap={2}>
          <HStack gap={3} vAlign="center" hAlign="between">
            <Text type="supporting">{t('batchImage.promptPopover.title')}</Text>
            <Button
              size="sm"
              variant="ghost"
              label={t('common.copy')}
              icon={<Icon icon={ClipboardDocumentIcon} />}
              onClick={() => void copyToClipboard(value, t('batchImage.promptPopover.copied'))}
            />
          </HStack>
          <Text>{value}</Text>
        </VStack>
      }
    >
      <Link onClick={() => undefined} color={isMuted ? 'disabled' : 'primary'} maxLines={1}>
        {value}
      </Link>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BatchImagePage() {
  const { t } = useI18n()
  const apiBaseUrl = useAppStore((s) => s.apiBaseUrl)

  // Keys and jobs
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [batchJobs, setBatchJobs] = useState<JobRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => Math.min(getPersistedPageSize(20), 100))
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [taskNameDraft, setTaskNameDraft] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(new Set())

  // Row actions
  const [downloadingBatchId, setDownloadingBatchId] = useState('')
  const [retryingBatchId, setRetryingBatchId] = useState('')
  const [deletingBatchId, setDeletingBatchId] = useState('')
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  // Detail
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [selectedBatchApiKeyId, setSelectedBatchApiKeyId] = useState(0)
  const [currentJob, setCurrentJob] = useState<BatchImageJob | null>(null)
  const [items, setItems] = useState<DetailItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [polling, setPolling] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [previewLoadingIds, setPreviewLoadingIds] = useState<Set<string>>(new Set())
  const [previewErrorIds, setPreviewErrorIds] = useState<Set<string>>(new Set())
  const [previewImageItem, setPreviewImageItem] = useState<DetailItem | null>(null)

  // Create form
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [formApiKeyId, setFormApiKeyId] = useState(0)
  const [formTaskName, setFormTaskName] = useState('')
  const [formModel, setFormModel] = useState('')
  const [responseMimeType, setResponseMimeType] = useState('image/png')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelLoadError, setModelLoadError] = useState('')
  const [promptRows, setPromptRows] = useState<PromptRow[]>([])
  const [promptDraft, setPromptDraft] = useState('')
  const [customIdDraft, setCustomIdDraft] = useState('')
  const [outputCountDraft, setOutputCountDraft] = useState(1)
  const [referenceImageDrafts, setReferenceImageDrafts] = useState<ReferenceImageDraft[]>([])
  const [submitting, setSubmitting] = useState(false)

  const geminiApiKeys = useMemo(() => apiKeys.filter(keyAllowsBatchImage), [apiKeys])
  const selectedApiKey = useMemo(
    () => geminiApiKeys.find((key) => key.id === formApiKeyId) || null,
    [geminiApiKeys, formApiKeyId],
  )
  const childrenByParent = useMemo(() => groupChildren(batchJobs), [batchJobs])
  const visibleBatchJobs = useMemo(
    () => visibleRows(batchJobs, expandedParentIds, childrenByParent),
    [batchJobs, expandedParentIds, childrenByParent],
  )
  const selectedRows = useMemo(() => batchJobs.filter((job) => selectedJobIds.has(job.id)), [batchJobs, selectedJobIds])
  const selectedDownloadableRows = useMemo(() => selectedRows.filter((job) => canDownload(job)), [selectedRows])
  const referenceLimit = referenceImageLimitForModel(formModel)
  const estimatedOutputCount = promptRows.reduce((sum, row) => sum + normalizeOutputCount(row.output_count), 0)
  const parsedItems = useMemo(() => parsePromptRows(promptRows), [promptRows])
  const currentDisplayJob = currentJob ? displayJob(currentJob, childrenByParent) : null
  const detailRootBatchId = currentJob?.parent_batch_id || selectedBatchId || currentJob?.id || ''

  // Async handlers read the latest render's values through this ref so that
  // polling timers and awaited continuations never act on stale state.
  const latest = useRef({
    geminiApiKeys,
    selectedApiKey,
    batchJobs,
    currentJob,
    selectedBatchId,
    selectedBatchApiKeyId,
    items,
    pageSize,
    expandedParentIds,
    responseMimeType,
  })
  latest.current = {
    geminiApiKeys,
    selectedApiKey,
    batchJobs,
    currentJob,
    selectedBatchId,
    selectedBatchApiKeyId,
    items,
    pageSize,
    expandedParentIds,
    responseMimeType,
  }
  const previewUrlsRef = useRef<Record<string, string>>({})
  const previewErrorIdsRef = useRef<Set<string>>(new Set())
  const jobsRequestSeq = useRef(0)
  const modelRequestSeq = useRef(0)

  const endpointBase = (apiBaseUrl?.trim() || getGatewayBaseURL()).replace(/\/+$/, '')
  const agentInstruction = t('astryx.batchImage.agentInstruction', {
    endpoint: endpointBase,
    modelsUrl: joinEndpointPath(endpointBase, '/v1/images/batches/models'),
    submitUrl: joinEndpointPath(endpointBase, '/v1/images/batches'),
    jobUrl: joinEndpointPath(endpointBase, '/v1/images/batches/{id}'),
    itemsUrl: joinEndpointPath(endpointBase, '/v1/images/batches/{id}/items'),
    downloadUrl: joinEndpointPath(endpointBase, '/v1/images/batches/{id}/download'),
    cancelUrl: joinEndpointPath(endpointBase, '/v1/images/batches/{id}/cancel'),
  })

  // ---- previews -----------------------------------------------------------

  const setPreviewUrl = (previewKey: string, url: string | null) => {
    const next = { ...previewUrlsRef.current }
    if (url) next[previewKey] = url
    else delete next[previewKey]
    previewUrlsRef.current = next
    setPreviewUrls(next)
  }

  const setPreviewErrors = (next: Set<string>) => {
    previewErrorIdsRef.current = next
    setPreviewErrorIds(next)
  }

  const clearItemPreviews = useCallback(() => {
    for (const url of Object.values(previewUrlsRef.current)) {
      if (url) URL.revokeObjectURL(url)
    }
    previewUrlsRef.current = {}
    previewErrorIdsRef.current = new Set()
    setPreviewUrls({})
    setPreviewErrorIds(new Set())
    setPreviewLoadingIds(new Set())
    setPreviewImageItem(null)
  }, [])

  const hydrateCachedItemPreviews = async (detailItems: DetailItem[], rootBatchId: string) => {
    const previewable = detailItems.filter(isSuccessfulImageItem)
    if (!previewable.length || !previewCacheSupported()) return
    await Promise.all(
      previewable.map(async (item) => {
        const previewKey = itemPreviewKey(item)
        if (previewUrlsRef.current[previewKey] || previewErrorIdsRef.current.has(previewKey)) return
        const cached = await getCachedPreviewBlob(previewCacheKey(item.batch_id, item.custom_id, 0)).catch(() => null)
        if (!cached || previewUrlsRef.current[previewKey] || latest.current.selectedBatchId !== rootBatchId) return
        setPreviewUrl(previewKey, URL.createObjectURL(cached))
      }),
    )
  }

  // ---- keys -------------------------------------------------------------

  const resolveKey = (keyId: number): ApiKey | null =>
    (keyId ? latest.current.geminiApiKeys.find((key) => key.id === keyId) : null) || latest.current.selectedApiKey

  const requireApiKey = (): ApiKey | null => {
    const key = latest.current.selectedApiKey
    if (!key) toast.error(batchImageText('selectApiKey'))
    return key
  }

  const apiKeyForJob = (job: JobRow | BatchImageJob): ApiKey | null => {
    if ('api_key_id' in job && job.api_key_id) {
      return latest.current.geminiApiKeys.find((key) => key.id === job.api_key_id) || null
    }
    return latest.current.selectedApiKey
  }

  const loadApiKeys = useCallback(async () => {
    setLoadingKeys(true)
    try {
      const response = await keysAPI.list(1, 100, { status: 'active', sort_by: 'created_at', sort_order: 'desc' })
      const keys = response.items || []
      const allowed = keys.filter(keyAllowsBatchImage)
      setApiKeys(keys)
      setFormApiKeyId((prev) => (allowed.some((key) => key.id === prev) ? prev : allowed[0]?.id || 0))
      setFilters((prev) =>
        prev.apiKeyId && !allowed.some((key) => String(key.id) === prev.apiKeyId) ? { ...prev, apiKeyId: '' } : prev,
      )
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('loadKeysFailed')))
    } finally {
      setLoadingKeys(false)
      setReloadToken((n) => n + 1)
    }
  }, [])

  // Batch-image models depend on the selected key's group.
  const selectedKeyValue = selectedApiKey?.key || ''
  useEffect(() => {
    const requestID = ++modelRequestSeq.current
    setModelLoadError('')
    setAvailableModels([])
    setFormModel('')
    if (!selectedKeyValue) {
      setLoadingModels(false)
      return
    }
    setLoadingModels(true)
    listBatchImageModels(selectedKeyValue)
      .then((result) => {
        if (requestID !== modelRequestSeq.current) return
        const seen = new Set<string>()
        const models = (result.data || [])
          .map((model) => String(model.id || '').trim())
          .filter((model) => {
            if (!model || seen.has(model)) return false
            seen.add(model)
            return true
          })
        setAvailableModels(models)
        setFormModel(models[0] || '')
      })
      .catch((error) => {
        if (requestID !== modelRequestSeq.current) return
        setModelLoadError(batchImageErrorMessage(error, batchImageText('loadModelsFailed')))
      })
      .finally(() => {
        if (requestID === modelRequestSeq.current) setLoadingModels(false)
      })
  }, [selectedKeyValue])

  // Switching models trims reference images to the new model's limit.
  useEffect(() => {
    const limit = referenceImageLimitForModel(formModel)
    setReferenceImageDrafts((prev) => (limit <= 0 ? [] : prev.length > limit ? prev.slice(0, limit) : prev))
  }, [formModel])

  // ---- job list ----------------------------------------------------------

  useEffect(() => {
    const requestID = ++jobsRequestSeq.current
    const filterID = Number(filters.apiKeyId || 0)
    const keys = filterID
      ? latest.current.geminiApiKeys.filter((key) => key.id === filterID)
      : latest.current.geminiApiKeys
    if (!keys.length) {
      setBatchJobs([])
      setHasMore(false)
      return
    }
    const options: BatchImageJobsListOptions = { limit: pageSize, cursor: String((page - 1) * pageSize) }
    if (filters.taskName.trim()) options.taskName = filters.taskName.trim()
    if (filters.status) options.status = filters.status
    if (filters.downloaded) options.downloaded = filters.downloaded
    setLoadingJobs(true)
    Promise.all(
      keys.map(async (key) => {
        const result = await listBatchImageJobs(key.key, options)
        return { hasMore: Boolean(result.has_more), rows: (result.data || []).map((job) => toJobRow(job, key)) }
      }),
    )
      .then((results) => {
        if (requestID !== jobsRequestSeq.current) return
        const rows = applyChildCounts(
          results
            .flatMap((result) => result.rows)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, pageSize),
        )
        setBatchJobs(rows)
        setHasMore(results.some((result) => result.hasMore))
        const visibleIds = new Set(visibleRows(rows, latest.current.expandedParentIds, groupChildren(rows)).map((job) => job.id))
        setSelectedJobIds((prev) => new Set([...prev].filter((id) => visibleIds.has(id))))
      })
      .catch((error) => {
        if (requestID !== jobsRequestSeq.current) return
        toast.error(batchImageErrorMessage(error, batchImageText('loadJobsFailed')))
      })
      .finally(() => {
        if (requestID === jobsRequestSeq.current) setLoadingJobs(false)
      })
  }, [filters, page, pageSize, reloadToken])

  useEffect(() => {
    void useAppStore.getState().fetchPublicSettings()
    void loadApiKeys()
    void cleanupPreviewCache()
    const cleanupTimer = setInterval(() => void cleanupPreviewCache(), 60 * 60 * 1000)
    return () => {
      clearInterval(cleanupTimer)
      for (const url of Object.values(previewUrlsRef.current)) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [loadApiKeys])

  const applyFilters = (next: typeof EMPTY_FILTERS) => {
    setFilters(next)
    setPage(1)
    setSelectedJobIds(new Set())
  }

  const resetFilters = () => {
    setTaskNameDraft('')
    applyFilters(EMPTY_FILTERS)
  }

  const refreshPage = () => {
    void loadApiKeys()
  }

  const handlePageChange = (next: number) => {
    if (next < 1 || next === page) return
    setPage(next)
    setSelectedJobIds(new Set())
  }

  const handlePageSizeChange = (value: number) => {
    const nextSize = Math.min(Math.max(Number(value) || 20, 1), 100)
    setPersistedPageSize(nextSize)
    setPageSize(nextSize)
    setPage(1)
    setSelectedJobIds(new Set())
  }

  const upsertJob = (job: BatchImageJob, key: ApiKey | null) => {
    setBatchJobs((prev) => {
      const next = toJobRow(job, key)
      const index = prev.findIndex((item) => item.id === job.id)
      if (index >= 0) {
        const rows = [...prev]
        rows[index] = { ...next, is_child: rows[index].is_child }
        return applyChildCounts(rows)
      }
      return applyChildCounts([next, ...prev].slice(0, latest.current.pageSize))
    })
  }

  const markJobDownloaded = (batchId: string) => {
    const downloadedAt = Math.floor(Date.now() / 1000)
    setBatchJobs((prev) => prev.map((job) => (job.id === batchId ? { ...job, downloaded_at: job.downloaded_at || downloadedAt } : job)))
    setCurrentJob((prev) => (prev && prev.id === batchId && !prev.downloaded_at ? { ...prev, downloaded_at: downloadedAt } : prev))
  }

  const toggleChildRows = (batchId: string) => {
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  // ---- detail ------------------------------------------------------------

  const closeDetail = () => {
    setCurrentJob(null)
    setSelectedBatchId('')
    setSelectedBatchApiKeyId(0)
    setItems([])
    clearItemPreviews()
  }

  const removeJobFromList = (batchId: string) => {
    setBatchJobs((prev) => prev.filter((job) => job.id !== batchId))
    setSelectedJobIds((prev) => {
      const next = new Set(prev)
      next.delete(batchId)
      return next
    })
    if (latest.current.selectedBatchId === batchId || latest.current.currentJob?.id === batchId) closeDetail()
  }

  const refreshSelected = async (
    batchId = latest.current.selectedBatchId,
    keyId = latest.current.selectedBatchApiKeyId,
  ) => {
    if (!batchId) return
    const key = resolveKey(keyId) || requireApiKey()
    if (!key) return
    setRefreshing(true)
    try {
      const job = await getBatchImageJob(key.key, batchId)
      if (latest.current.selectedBatchId !== batchId) return
      setCurrentJob(job)
      upsertJob(job, key)
      if (TERMINAL_STATUSES.has(job.status)) setPolling(false)
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('refreshFailed')))
    } finally {
      setRefreshing(false)
    }
  }

  const detailJobsForBatch = (batchId: string, key: ApiKey, fallbackJob?: BatchImageJob | null): JobRow[] => {
    const rows = latest.current.batchJobs
    const row = rows.find((job) => job.id === batchId)
    const base = row || (fallbackJob && fallbackJob.id === batchId ? toJobRow(fallbackJob, key) : null)
    if (!base) return []
    if (base.parent_batch_id) return [base]
    return [base, ...(groupChildren(rows).get(base.id) || [])]
  }

  const loadItems = async (
    batchId = latest.current.selectedBatchId,
    keyId = latest.current.selectedBatchApiKeyId,
    fallbackJob: BatchImageJob | null = latest.current.currentJob,
  ) => {
    if (!batchId) return
    const key = resolveKey(keyId) || requireApiKey()
    if (!key) return
    setLoadingItems(true)
    try {
      clearItemPreviews()
      const jobs = detailJobsForBatch(batchId, key, fallbackJob)
      const results = await Promise.all(
        jobs.map(async (job) => {
          const result = await listBatchImageItems(key.key, job.id)
          const name = job.task_name || job.id
          const sourceName =
            job.id === batchId ? t('batchImage.detail.mainTask', { name }) : t('batchImage.detail.childTask', { name })
          return (result.data || []).map((item) => ({ ...item, batch_id: job.id, source_task_name: sourceName }))
        }),
      )
      if (latest.current.selectedBatchId !== batchId) return
      const detailItems = results.flat()
      setItems(detailItems)
      void hydrateCachedItemPreviews(detailItems, batchId)
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('loadItemsFailed')))
    } finally {
      setLoadingItems(false)
    }
  }

  const selectJob = (batchId: string) => {
    const row = latest.current.batchJobs.find((job) => job.id === batchId)
    let keyId = 0
    if (row?.api_key_id && latest.current.geminiApiKeys.some((key) => key.id === row.api_key_id)) {
      keyId = row.api_key_id
      setFormApiKeyId(row.api_key_id)
    }
    setSelectedBatchApiKeyId(keyId)
    setSelectedBatchId(batchId)
    setCurrentJob(null)
    setItems([])
    // The detail fetches below run before this render commits, so publish the
    // selection for their stale-response guards right away.
    latest.current.selectedBatchId = batchId
    void refreshSelected(batchId, keyId)
    void loadItems(batchId, keyId, null)
  }

  const refreshDetail = () => {
    void Promise.all([refreshSelected(), loadItems()])
  }

  // Poll the open job until it reaches a terminal state.
  useEffect(() => {
    if (!polling) return
    return pollWhileVisible(() => {
      const job = latest.current.currentJob
      if (!job || TERMINAL_STATUSES.has(job.status)) {
        setPolling(false)
        return
      }
      void refreshSelected()
    }, POLL_INTERVAL_MS)
    // refreshSelected only reads through `latest`, so the first instance stays valid.
  }, [polling])

  const loadItemPreview = async (item: DetailItem) => {
    const previewKey = itemPreviewKey(item)
    if (
      !item.batch_id ||
      !isSuccessfulImageItem(item) ||
      (previewUrlsRef.current[previewKey] && !previewErrorIdsRef.current.has(previewKey))
    ) {
      return
    }
    const key = resolveKey(latest.current.selectedBatchApiKeyId) || requireApiKey()
    if (!key) return
    const cacheKey = previewCacheKey(item.batch_id, item.custom_id, 0)
    setPreviewLoadingIds((prev) => new Set([...prev, previewKey]))
    try {
      setPreviewErrors(new Set([...previewErrorIdsRef.current].filter((id) => id !== previewKey)))
      const stale = previewUrlsRef.current[previewKey]
      if (stale) {
        URL.revokeObjectURL(stale)
        setPreviewUrl(previewKey, null)
      }
      const cached = await getCachedPreviewBlob(cacheKey)
      if (cached) {
        setPreviewUrl(previewKey, URL.createObjectURL(cached))
        return
      }
      const blob = await getBatchImageItemContent(key.key, item.batch_id, item.custom_id, 0)
      const thumbnail = await createThumbnailBlob(blob).catch(() => blob)
      setPreviewUrl(previewKey, URL.createObjectURL(thumbnail))
      if (thumbnail !== blob || thumbnail.size <= 1024 * 1024) {
        void putCachedPreviewBlob(cacheKey, thumbnail)
      }
    } catch (error) {
      setPreviewErrors(new Set([...previewErrorIdsRef.current, previewKey]))
      toast.error(batchImageErrorMessage(error, batchImageText('loadPreviewFailed')))
    } finally {
      setPreviewLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(previewKey)
        return next
      })
    }
  }

  // Original failures that a retry subtask later produced an image for.
  const recoveredOriginalCustomIds = useMemo(() => {
    const ids = new Set<string>()
    if (!detailRootBatchId) return ids
    for (const item of items) {
      if (!item.batch_id || item.batch_id === detailRootBatchId || !isSuccessfulImageItem(item)) continue
      const sourceCustomID = retrySourceCustomID(item.custom_id)
      if (sourceCustomID) ids.add(sourceCustomID)
    }
    return ids
  }, [items, detailRootBatchId])

  const isRecoveredOriginalFailure = (item: DetailItem) =>
    Boolean(
      detailRootBatchId &&
        item.batch_id === detailRootBatchId &&
        item.status === 'failed' &&
        recoveredOriginalCustomIds.has(item.custom_id),
    )

  // ---- actions -----------------------------------------------------------

  const runCancelSelected = async () => {
    const job = latest.current.currentJob
    if (!job) return
    const key = resolveKey(latest.current.selectedBatchApiKeyId) || requireApiKey()
    if (!key) return
    setCancelling(true)
    try {
      const updated = await cancelBatchImageJob(key.key, job.id)
      setCurrentJob(updated)
      upsertJob(updated, key)
      toast.success(batchImageText('cancelled'))
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('cancelFailed')))
    } finally {
      setCancelling(false)
    }
  }

  const downloadJob = async (job: JobRow | BatchImageJob) => {
    if (downloadingBatchId) return
    if ('api_key_id' in job && job.api_key_id && latest.current.geminiApiKeys.some((key) => key.id === job.api_key_id)) {
      setFormApiKeyId(job.api_key_id)
    }
    const key = apiKeyForJob(job) || requireApiKey()
    if (!key) return
    setDownloadingBatchId(job.id)
    try {
      const blob = await downloadBatchImageZip(key.key, job.id)
      saveBlob(blob, `${job.id}.zip`)
      markJobDownloaded(job.id)
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('downloadFailed')))
    } finally {
      setDownloadingBatchId('')
    }
  }

  const downloadSelectedJobs = async () => {
    if (bulkDownloading || selectedDownloadableRows.length === 0) return
    setBulkDownloading(true)
    try {
      for (const row of selectedDownloadableRows) {
        const key = apiKeyForJob(row)
        if (!key) continue
        setDownloadingBatchId(row.id)
        const blob = await downloadBatchImageZip(key.key, row.id)
        saveBlob(blob, `${row.id}.zip`)
        markJobDownloaded(row.id)
      }
      toast.success(batchImageText('batchDownloadStarted'))
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('downloadFailed')))
    } finally {
      setBulkDownloading(false)
      setDownloadingBatchId('')
    }
  }

  const runDeleteJob = async (job: JobRow) => {
    const key = apiKeyForJob(job)
    if (!key) return
    setDeletingBatchId(job.id)
    try {
      await deleteBatchImageJobRecord(key.key, job.id)
      removeJobFromList(job.id)
      toast.success(batchImageText('deleted'))
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('deleteFailed')))
    } finally {
      setDeletingBatchId('')
    }
  }

  const runDeleteSelectedJobs = async () => {
    const rows = selectedRows.filter((job) => canDeleteRecord(job))
    if (bulkDeleting || rows.length === 0) return
    setBulkDeleting(true)
    try {
      for (const row of rows) {
        const key = apiKeyForJob(row)
        if (!key) continue
        setDeletingBatchId(row.id)
        await deleteBatchImageJobRecord(key.key, row.id)
        removeJobFromList(row.id)
      }
      toast.success(batchImageText('deleted'))
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('deleteFailed')))
    } finally {
      setBulkDeleting(false)
      setDeletingBatchId('')
    }
  }

  const retryFailedJob = async (job: JobRow | BatchImageJob) => {
    if (!canRetry(job, groupChildren(latest.current.batchJobs)) || retryingBatchId) return
    const key = apiKeyForJob(job) || resolveKey(latest.current.selectedBatchApiKeyId) || requireApiKey()
    if (!key) return
    setRetryingBatchId(job.id)
    try {
      const sourceItems =
        latest.current.selectedBatchId === job.id && latest.current.items.length > 0
          ? latest.current.items
          : (await listBatchImageItems(key.key, job.id)).data || []
      const failedItems = sourceItems
        .filter((item) => item.status === 'failed')
        .map((item) => ({ custom_id: retryCustomID(item.custom_id), prompt: String(item.prompt_preview || '').trim() }))
        .filter((item) => item.prompt)
      if (failedItems.length === 0) {
        toast.error(batchImageText('retryMissingPrompts'))
        return
      }
      const retryJob = await submitBatchImageJob(
        key.key,
        {
          model: job.model,
          task_name: `${job.task_name || defaultTaskName()} ${t('batchImage.messages.retryTaskNameSuffix')}`,
          parent_batch_id: job.parent_batch_id || job.id,
          provider: job.provider,
          image_size: BATCH_IMAGE_SIZE,
          response_mime_type: latest.current.responseMimeType,
          items: failedItems,
        },
        `sub2api-ui-retry-${job.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      )
      setCurrentJob(retryJob)
      setSelectedBatchId(retryJob.id)
      setSelectedBatchApiKeyId(key.id)
      setItems([])
      latest.current.selectedBatchId = retryJob.id
      upsertJob(retryJob, key)
      if (retryJob.parent_batch_id) {
        const parentId = retryJob.parent_batch_id
        setExpandedParentIds((prev) => new Set([...prev, parentId]))
      }
      toast.success(batchImageText('retrySubmitted'))
      void loadItems(retryJob.id, key.id, retryJob)
      setPolling(true)
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('retryFailed')))
    } finally {
      setRetryingBatchId('')
    }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    if (confirm.kind === 'cancel') await runCancelSelected()
    else if (confirm.kind === 'delete') await runDeleteJob(confirm.job)
    else await runDeleteSelectedJobs()
    setConfirm(null)
  }

  // ---- create ------------------------------------------------------------

  const resetCreateDraft = () => {
    setFormTaskName('')
    setResponseMimeType('image/png')
    setPromptRows([])
    setPromptDraft('')
    setCustomIdDraft('')
    setOutputCountDraft(1)
    setReferenceImageDrafts([])
  }

  const openCreateModal = () => {
    setShowCreateModal(true)
    if (!apiKeys.length) void loadApiKeys()
  }

  const closeCreateModal = () => {
    if (submitting) return
    setShowCreateModal(false)
    resetCreateDraft()
  }

  /** Moves the prompt draft into the list; returns the resulting rows. */
  const addPromptRow = (): PromptRow[] => {
    const prompt = promptDraft.trim()
    if (!prompt) return promptRows
    const used = new Set(promptRows.map((row) => row.custom_id))
    const customID = uniqueCustomID(
      customIdDraft || `img_${String(promptRows.length + 1).padStart(3, '0')}`,
      used,
      promptRows.length,
    )
    const next = [
      ...promptRows,
      {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        custom_id: customID,
        prompt,
        output_count: normalizeOutputCount(outputCountDraft),
        reference_images: referenceImageDrafts.map(({ name: _name, size: _size, ...ref }) => ref),
      },
    ]
    setPromptRows(next)
    setPromptDraft('')
    setCustomIdDraft('')
    setOutputCountDraft(1)
    setReferenceImageDrafts([])
    return next
  }

  const handleReferenceImageFiles = async (selected: File | File[] | null) => {
    const files = selected ? (Array.isArray(selected) ? selected : [selected]) : []
    if (files.length === 0) return
    if (referenceLimit <= 0) {
      toast.error(t('batchImage.create.modelNoReferenceImages'))
      return
    }
    const slots = Math.max(0, referenceLimit - referenceImageDrafts.length)
    if (slots <= 0) {
      toast.error(t('batchImage.create.refLimitReached', { limit: referenceLimit }))
      return
    }
    const accepted = files.slice(0, slots)
    if (accepted.length < files.length) {
      toast.error(t('batchImage.create.refLimitExceededIgnored', { limit: referenceLimit }))
    }
    const next: ReferenceImageDraft[] = []
    for (const file of accepted) {
      if (!REFERENCE_IMAGE_TYPES.includes(file.type)) {
        toast.error(t('batchImage.create.refFormatUnsupported'))
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('batchImage.create.refFileTooLarge', { name: file.name }))
        continue
      }
      const data = await readFileAsBase64(file)
      next.push({ id: file.name, type: 'reference', mime_type: file.type, data, name: file.name, size: file.size })
    }
    setReferenceImageDrafts((prev) => [...prev, ...next])
  }

  const validateForm = (rows: PromptRow[]): boolean => {
    if (!requireApiKey()) return false
    if (!formModel) {
      toast.error(availableModels.length === 0 ? batchImageText('noModelsForKey') : batchImageText('selectModel'))
      return false
    }
    if (parsePromptRows(rows).length === 0) {
      toast.error(batchImageText('promptRequired'))
      return false
    }
    if (rows.reduce((sum, row) => sum + normalizeOutputCount(row.output_count), 0) > BATCH_IMAGE_MAX_OUTPUTS_PER_JOB) {
      toast.error(batchImageText('tooManyOutputImages'))
      return false
    }
    if (rows.some((row) => row.reference_images.length > referenceLimit)) {
      toast.error(batchImageText('tooManyReferenceImages'))
      return false
    }
    return true
  }

  const submitJob = async () => {
    if (submitting) return
    const rows = promptDraft.trim() ? addPromptRow() : promptRows
    if (!validateForm(rows)) return
    const key = requireApiKey()
    if (!key) return
    setSubmitting(true)
    try {
      const job = await submitBatchImageJob(
        key.key,
        {
          model: formModel,
          task_name: formTaskName.trim() || defaultTaskName(),
          image_size: BATCH_IMAGE_SIZE,
          response_mime_type: responseMimeType,
          items: parsePromptRows(rows),
        },
        `sub2api-ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      )
      setCurrentJob(job)
      setSelectedBatchId(job.id)
      setSelectedBatchApiKeyId(key.id)
      setItems([])
      latest.current.selectedBatchId = job.id
      upsertJob(job, key)
      setShowCreateModal(false)
      resetCreateDraft()
      toast.success(batchImageText('submitted'))
      void loadItems(job.id, key.id, job)
      setPolling(true)
    } catch (error) {
      toast.error(batchImageErrorMessage(error, batchImageText('submitFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  // ---- table -------------------------------------------------------------

  const { selectionConfig, selectionState } = useTableSelectionState<JobRow>({
    data: visibleBatchJobs,
    idKey: 'id',
    selectedKeys: selectedJobIds,
    setSelectedKeys: setSelectedJobIds,
  })
  const selectionPlugin = useTableSelection<JobRow>({
    ...selectionConfig,
    getRowLabel: (row) => row.task_name || row.id,
  })

  const apiKeyFilterOptions = [
    { value: ALL_FILTER, label: t('batchImage.filters.allApiKeys') },
    ...geminiApiKeys.map((key) => ({ value: String(key.id), label: key.name || `API Key #${key.id}` })),
  ]
  const statusFilterOptions = [
    { value: ALL_FILTER, label: t('batchImage.filters.allStatuses') },
    { value: 'queued', label: t('batchImage.status.queued') },
    { value: 'running', label: t('batchImage.status.running') },
    { value: 'processing_results', label: t('batchImage.status.processingResults') },
    { value: 'settling', label: t('batchImage.status.settling') },
    { value: 'completed', label: t('batchImage.status.completed') },
    { value: 'failed', label: t('batchImage.status.failed') },
    { value: 'cancelled', label: t('batchImage.status.cancelled') },
    { value: 'output_deleted', label: t('batchImage.status.outputDeleted') },
  ]
  const downloadFilterOptions = [
    { value: ALL_FILTER, label: t('batchImage.filters.allDownloadStates') },
    { value: 'true', label: t('batchImage.filters.downloaded') },
    { value: 'false', label: t('batchImage.filters.notDownloaded') },
  ]

  const jobColumns: TableColumn<JobRow>[] = [
    {
      key: 'id',
      header: t('batchImage.columns.taskName'),
      width: proportional(2, { minWidth: 220 }),
      renderCell: (row) => {
        const isExpanded = expandedParentIds.has(row.id)
        const hasChildren = row.child_count > 0 && !row.is_child
        return (
          <HStack gap={1} vAlign="center" paddingInlineStart={row.is_child ? 6 : 0}>
            {hasChildren && (
              <IconButton
                size="sm"
                variant="ghost"
                icon={<Icon icon={isExpanded ? ChevronDownIcon : ChevronRightIcon} />}
                label={
                  isExpanded
                    ? t('batchImage.list.collapseChildren')
                    : t('batchImage.list.expandChildren', { n: row.child_count }, row.child_count)
                }
                onClick={() => toggleChildRows(row.id)}
              />
            )}
            <VStack gap={0.5}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Link
                  onClick={() => selectJob(row.id)}
                  color={row.task_name ? 'primary' : 'secondary'}
                  weight="medium"
                  maxLines={1}
                >
                  {row.task_name || defaultTaskName(row.created_at)}
                </Link>
                {hasChildren && <Badge label={t('batchImage.list.childCount', { n: row.child_count }, row.child_count)} />}
                {row.is_child && <Token size="sm" color="yellow" label={t('batchImage.list.childBadge')} />}
              </HStack>
              <Text type="supporting">{formatDate(row.created_at)}</Text>
            </VStack>
          </HStack>
        )
      },
    },
    {
      key: 'model',
      header: t('batchImage.columns.model'),
      width: proportional(1.2, { minWidth: 140 }),
      renderCell: (row) => <Text maxLines={1}>{row.model}</Text>,
    },
    {
      key: 'api_key_name',
      header: t('batchImage.columns.apiKey'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => (
        <Text maxLines={1} color={row.api_key_name ? 'primary' : 'secondary'}>
          {row.api_key_name || t('batchImage.list.keyNotRecorded')}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => <JobStatus job={displayJob(row, childrenByParent)} />,
    },
    {
      key: 'counts',
      header: t('batchImage.columns.result'),
      width: proportional(1, { minWidth: 140 }),
      renderCell: (row) => <JobCounts job={displayJob(row, childrenByParent)} />,
    },
    {
      key: 'cost',
      header: t('batchImage.columns.cost'),
      width: proportional(1, { minWidth: 110 }),
      renderCell: (row) => <Text hasTabularNumbers>{costLabel(displayJob(row, childrenByParent))}</Text>,
    },
    {
      key: 'downloaded',
      header: t('batchImage.columns.downloadStatus'),
      width: proportional(1, { minWidth: 140 }),
      renderCell: (row) => (
        <Text type="supporting" color={row.downloaded_at ? 'primary' : 'secondary'}>
          {row.downloaded_at ? formatDate(row.downloaded_at) : t('batchImage.list.notDownloaded')}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: pixel(140),
      renderCell: (row) => {
        const retryable = canRetry(row, childrenByParent)
        const deletable = canDeleteRecord(row)
        return (
          <HStack gap={1} vAlign="center">
            <IconButton
              size="sm"
              variant="ghost"
              icon={<Icon icon={EyeIcon} />}
              label={t('batchImage.actions.viewDetail')}
              onClick={() => selectJob(row.id)}
            />
            <IconButton
              size="sm"
              variant="ghost"
              icon={<Icon icon={ArrowDownTrayIcon} />}
              label={t('batchImage.actions.downloadZip')}
              isDisabled={!canDownload(row) || Boolean(downloadingBatchId)}
              isLoading={downloadingBatchId === row.id}
              onClick={() => void downloadJob(row)}
            />
            {(retryable || deletable) && (
              <MoreMenu
                size="sm"
                label={t('batchImage.actions.moreActions')}
                items={[
                  ...(retryable
                    ? [
                        {
                          label: t('batchImage.actions.retryFailedItems'),
                          icon: <Icon icon={ArrowPathIcon} />,
                          isDisabled: retryingBatchId === row.id,
                          onClick: () => void retryFailedJob(row),
                        },
                      ]
                    : []),
                  ...(deletable
                    ? [
                        {
                          label: t('batchImage.actions.deleteRecords'),
                          icon: <Icon icon={TrashIcon} />,
                          variant: 'destructive' as const,
                          isDisabled: deletingBatchId === row.id,
                          onClick: () => setConfirm({ kind: 'delete', job: row }),
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </HStack>
        )
      },
    },
  ]

  const detailRows: DetailRow[] = items.map((item) => ({ key: itemPreviewKey(item), item }))

  const itemResult = (item: DetailItem): { label: string; tone: 'success' | 'error' | 'muted' } => {
    if (isRecoveredOriginalFailure(item)) return { label: t('batchImage.itemResult.recoveredByRetry'), tone: 'muted' }
    if (item.error) return { label: friendlyItemError(item.error), tone: 'error' }
    if (item.status === 'succeeded' || item.status === 'success') {
      return {
        label: previewUrls[itemPreviewKey(item)] ? t('batchImage.itemResult.readyPreview') : t('batchImage.itemResult.readyDownload'),
        tone: 'success',
      }
    }
    if (item.status === 'failed') return { label: t('batchImage.itemResult.noUsableImage'), tone: 'error' }
    if (item.status === 'cancelled') return { label: t('batchImage.itemResult.cancelled'), tone: 'error' }
    return { label: t('batchImage.itemResult.waiting'), tone: 'muted' }
  }

  const detailColumns: TableColumn<DetailRow>[] = [
    {
      key: 'custom_id',
      header: t('astryx.batchImage.customIdColumn'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: ({ item }) => (
        <Text type="code" maxLines={1} color={isRecoveredOriginalFailure(item) ? 'disabled' : 'primary'}>
          {item.custom_id}
        </Text>
      ),
    },
    {
      key: 'prompt',
      header: t('astryx.batchImage.promptLabel'),
      width: proportional(2, { minWidth: 200 }),
      renderCell: ({ item }) => <PromptCell prompt={item.prompt_preview || '-'} isMuted={isRecoveredOriginalFailure(item)} />,
    },
    {
      key: 'status',
      header: t('common.status'),
      width: proportional(0.8, { minWidth: 110 }),
      renderCell: ({ item }) => {
        const recovered = isRecoveredOriginalFailure(item)
        const key = ITEM_STATUS_KEYS[item.status]
        const label = recovered
          ? t('batchImage.itemStatus.recovered')
          : key
            ? t(`batchImage.itemStatus.${key}`)
            : item.status
        const variant = recovered
          ? 'neutral'
          : item.status === 'succeeded' || item.status === 'success'
            ? 'success'
            : item.status === 'failed' || item.status === 'cancelled'
              ? 'error'
              : 'accent'
        return (
          <HStack gap={1.5} vAlign="center">
            <StatusDot variant={variant} label={label} />
            <Text type="supporting" color="primary" maxLines={1}>
              {label}
            </Text>
          </HStack>
        )
      },
    },
    {
      key: 'preview',
      header: t('batchImage.detail.preview'),
      width: pixel(96),
      renderCell: ({ item }) => {
        const previewKey = itemPreviewKey(item)
        const url = previewUrls[previewKey]
        const hasError = previewErrorIds.has(previewKey)
        if (url && !hasError) {
          return (
            <Thumbnail
              src={url}
              alt={item.custom_id}
              label={t('batchImage.detail.previewZoom', { id: item.custom_id })}
              onClick={() => setPreviewImageItem(item)}
            />
          )
        }
        if (isSuccessfulImageItem(item)) {
          return (
            <IconButton
              size="sm"
              variant="secondary"
              icon={<Icon icon={EyeIcon} />}
              label={hasError ? t('batchImage.detail.previewReload') : t('batchImage.detail.previewLoad')}
              tooltip={hasError ? t('batchImage.detail.previewReload') : t('batchImage.detail.previewLoad')}
              isLoading={previewLoadingIds.has(previewKey)}
              onClick={() => void loadItemPreview(item)}
            />
          )
        }
        const reason = item.image_count > 0 ? t('batchImage.detail.previewUnavailable') : t('batchImage.detail.noImage')
        return (
          <Tooltip content={reason}>
            <Icon icon={DocumentIcon} color="tertiary" label={reason} />
          </Tooltip>
        )
      },
    },
    {
      key: 'result',
      header: t('batchImage.detail.result'),
      width: proportional(2, { minWidth: 200 }),
      renderCell: ({ item }) => {
        const result = itemResult(item)
        return (
          <HStack gap={1.5} vAlign="center">
            <Icon
              icon={result.tone === 'success' ? CheckCircleIcon : result.tone === 'error' ? XCircleIcon : ClockIcon}
              size="sm"
              color={result.tone === 'success' ? 'success' : result.tone === 'error' ? 'error' : 'tertiary'}
            />
            <Text type="supporting" color={result.tone === 'muted' ? 'secondary' : 'primary'} maxLines={2}>
              {result.label}
            </Text>
          </HStack>
        )
      },
    },
  ]

  const promptColumns: TableColumn<PromptRow>[] = [
    {
      key: 'custom_id',
      header: t('astryx.batchImage.customIdColumn'),
      width: proportional(1, { minWidth: 100 }),
      renderCell: (row) => (
        <Text type="code" maxLines={1}>
          {row.custom_id}
        </Text>
      ),
    },
    {
      key: 'prompt',
      header: t('astryx.batchImage.promptLabel'),
      width: proportional(3, { minWidth: 180 }),
      renderCell: (row) => <Text maxLines={1}>{row.prompt}</Text>,
    },
    {
      key: 'extras',
      header: '',
      width: proportional(1, { minWidth: 120 }),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          {row.output_count > 1 && <Text type="supporting">{t('astryx.batchImage.outputCountShort', { n: row.output_count })}</Text>}
          {row.reference_images.length > 0 && (
            <Text type="supporting">
              {t('batchImage.create.referenceCount', { n: row.reference_images.length }, row.reference_images.length)}
            </Text>
          )}
        </HStack>
      ),
    },
    {
      key: 'remove',
      header: '',
      width: pixel(56),
      renderCell: (row) => (
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Icon icon={TrashIcon} />}
          label={t('common.delete')}
          onClick={() => setPromptRows((prev) => prev.filter((item) => item.localId !== row.localId))}
        />
      ),
    },
  ]

  const keyOptions = geminiApiKeys.map((key) => ({ value: String(key.id), label: `${key.name} · ${key.group?.name || 'Gemini'}` }))
  const showPagination = visibleBatchJobs.length > 0 || page > 1
  const detailOpen = Boolean(selectedBatchId)
  const summaryJob = currentDisplayJob || currentJob
  const previewImageUrl = previewImageItem ? previewUrls[itemPreviewKey(previewImageItem)] || '' : ''

  return (
    <Page title={t('batchImageGuide.title')} description={t('batchImageGuide.description')}>
      <VStack gap={4}>
        <HStack gap={3} vAlign="end" hAlign="between" wrap="wrap">
          <HStack gap={3} vAlign="end" wrap="wrap">
            <TextInput
              label={t('batchImage.filters.searchTaskName')}
              isLabelHidden
              value={taskNameDraft}
              onChange={(value) => {
                setTaskNameDraft(value)
                if (!value && filters.taskName) applyFilters({ ...filters, taskName: '' })
              }}
              onEnter={() => applyFilters({ ...filters, taskName: taskNameDraft })}
              placeholder={t('batchImage.filters.searchTaskName')}
              startIcon={MagnifyingGlassIcon}
              hasClear
              width={260}
            />
            <Selector
              label={t('batchImage.columns.apiKey')}
              isLabelHidden
              options={apiKeyFilterOptions}
              value={filters.apiKeyId || ALL_FILTER}
              onChange={(value) => applyFilters({ ...filters, apiKeyId: value === ALL_FILTER ? '' : value })}
              width={180}
            />
            <Selector
              label={t('common.status')}
              isLabelHidden
              options={statusFilterOptions}
              value={filters.status || ALL_FILTER}
              onChange={(value) => applyFilters({ ...filters, status: value === ALL_FILTER ? '' : value })}
              width={160}
            />
            <Selector
              label={t('batchImage.columns.downloadStatus')}
              isLabelHidden
              options={downloadFilterOptions}
              value={filters.downloaded || ALL_FILTER}
              onChange={(value) => applyFilters({ ...filters, downloaded: value === ALL_FILTER ? '' : value })}
              width={160}
            />
          </HStack>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button label={t('common.reset')} variant="secondary" isDisabled={loadingJobs} onClick={resetFilters} />
            <IconButton
              variant="secondary"
              icon={<Icon icon={ArrowPathIcon} />}
              label={t('common.refresh')}
              isLoading={loadingKeys || loadingJobs}
              onClick={refreshPage}
            />
            <Button
              label={t('batchImage.actions.usageGuide')}
              variant="secondary"
              icon={<Icon icon={BookOpenIcon} />}
              onClick={() => setShowGuideModal(true)}
            />
            <Button
              label={t('batchImage.actions.createJob')}
              variant="primary"
              icon={<Icon icon={PlusIcon} />}
              onClick={openCreateModal}
            />
          </HStack>
        </HStack>

        {selectedJobIds.size > 0 && (
          <TableSelectionToolbar
            selection={selectionState}
            label={t('common.actions')}
            clearLabel={t('common.clear')}
            renderSelectionLabel={(count) => t('batchImage.list.selectedJobs', { count }, count)}
            startContent={
              <>
                <Button
                  label={t('batchImage.actions.downloadSelected')}
                  variant="ghost"
                  icon={<Icon icon={ArrowDownTrayIcon} />}
                  isLoading={bulkDownloading}
                  isDisabled={selectedDownloadableRows.length === 0}
                  onClick={() => void downloadSelectedJobs()}
                />
                <Button
                  label={t('batchImage.actions.deleteRecords')}
                  variant="destructive"
                  icon={<Icon icon={TrashIcon} />}
                  isLoading={bulkDeleting}
                  onClick={() => setConfirm({ kind: 'deleteSelected' })}
                />
              </>
            }
          />
        )}

        {(loadingKeys || loadingJobs) && visibleBatchJobs.length === 0 ? (
          <Center padding={8}>
            <Spinner />
          </Center>
        ) : visibleBatchJobs.length === 0 ? (
          <EmptyState
            icon={<Icon icon={SparklesIcon} size="lg" color="tertiary" />}
            title={t('batchImage.list.empty')}
            description={t('batchImage.list.emptyHint')}
            actions={
              <Button
                label={t('batchImage.actions.createJob')}
                variant="primary"
                icon={<Icon icon={PlusIcon} />}
                onClick={openCreateModal}
              />
            }
          />
        ) : (
          <Table
            data={visibleBatchJobs}
            columns={jobColumns}
            idKey="id"
            plugins={{ selection: selectionPlugin }}
            hasHover
          />
        )}

        {showPagination && (
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={3} vAlign="center" wrap="wrap">
              <Text type="supporting">{t('batchImage.pagination.pageNumber', { page })}</Text>
              <Text type="supporting">{t('batchImage.pagination.pageItems', { count: visibleBatchJobs.length })}</Text>
            </HStack>
            <Pagination
              page={page}
              onChange={handlePageChange}
              hasMore={hasMore}
              variant="none"
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={handlePageSizeChange}
              isDisabled={loadingJobs}
              label={t('pagination.page')}
            />
          </HStack>
        )}
      </VStack>

      {/* Job detail */}
      <Dialog isOpen={detailOpen} onOpenChange={(open) => !open && closeDetail()} width={1100} maxHeight="90dvh">
        <Layout
          header={<DialogHeader title={t('batchImage.detail.title')} onOpenChange={(open) => !open && closeDetail()} />}
          content={
            <LayoutContent isScrollable>
              {!summaryJob ? (
                <Center padding={8}>
                  <Spinner />
                </Center>
              ) : (
                <VStack gap={4}>
                  <Card variant="muted" padding={4}>
                    <MetadataList columns={4} label={{ position: 'top' }}>
                      <MetadataListItem label={t('common.status')}>
                        <JobStatus job={summaryJob} />
                      </MetadataListItem>
                      <MetadataListItem
                        label={
                          (childrenByParent.get(summaryJob.id) || []).length > 0
                            ? t('batchImage.detail.aggregatedResult')
                            : t('batchImage.detail.result')
                        }
                      >
                        <JobCounts job={summaryJob} />
                      </MetadataListItem>
                      <MetadataListItem label={t('batchImage.detail.cost')}>{costLabel(summaryJob)}</MetadataListItem>
                      <MetadataListItem label={t('batchImage.detail.downloadStatus')}>
                        {currentJob?.downloaded_at ? formatDate(currentJob.downloaded_at) : t('batchImage.list.notDownloaded')}
                      </MetadataListItem>
                    </MetadataList>
                  </Card>

                  <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                    <Heading level={4}>{t('batchImage.detail.items')}</Heading>
                    <Button
                      size="sm"
                      variant="secondary"
                      label={t('common.refresh')}
                      icon={<Icon icon={ArrowPathIcon} />}
                      isLoading={refreshing || loadingItems}
                      onClick={refreshDetail}
                    />
                  </HStack>

                  {detailRows.length > 0 ? (
                    <Table data={detailRows} columns={detailColumns} idKey="key" density="compact" />
                  ) : (
                    <EmptyState
                      isCompact
                      icon={loadingItems ? <Spinner /> : <Icon icon={ArrowPathIcon} color="tertiary" />}
                      title={loadingItems ? t('batchImage.detail.loadingItems') : t('batchImage.detail.noItems')}
                      description={loadingItems ? undefined : t('batchImage.detail.noItemsHint')}
                    />
                  )}
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end" wrap="wrap">
                <Button
                  label={t('batchImage.actions.cancelJob')}
                  variant="secondary"
                  isDisabled={!currentJob || !canCancel(currentJob)}
                  isLoading={cancelling}
                  onClick={() => setConfirm({ kind: 'cancel' })}
                />
                {currentJob && currentDisplayJob && canRetry(currentJob, childrenByParent) && (
                  <Button
                    label={t('batchImage.actions.retryFailedItems')}
                    variant="secondary"
                    icon={<Icon icon={ArrowPathIcon} />}
                    isLoading={retryingBatchId === currentJob.id}
                    onClick={() => void retryFailedJob(currentJob)}
                  />
                )}
                <Button
                  label={t('batchImage.actions.downloadZip')}
                  variant="primary"
                  icon={<Icon icon={ArrowDownTrayIcon} />}
                  isDisabled={!currentJob || !canDownload(currentJob) || Boolean(downloadingBatchId && downloadingBatchId !== currentJob?.id)}
                  isLoading={Boolean(currentJob && downloadingBatchId === currentJob.id)}
                  onClick={() => currentJob && void downloadJob(currentJob)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Compressed preview zoom */}
      {previewImageItem && previewImageUrl && (
        <Lightbox
          isOpen
          onOpenChange={(open) => !open && setPreviewImageItem(null)}
          media={{
            src: previewImageUrl,
            alt: previewImageItem.custom_id || t('batchImage.imagePreview.title'),
            caption: t('batchImage.imagePreview.notice'),
          }}
          hasZoom
        />
      )}

      {/* Create job */}
      <Dialog isOpen={showCreateModal} onOpenChange={(open) => !open && closeCreateModal()} purpose="form" width={760} maxHeight="90dvh">
        <Layout
          header={<DialogHeader title={t('batchImage.create.title')} onOpenChange={(open) => !open && closeCreateModal()} />}
          content={
            <LayoutContent isScrollable>
              <VStack gap={5}>
                <Grid columns={{ minWidth: 260, repeat: 'fit' }} gap={4}>
                  <TextInput
                    label={t('batchImage.create.taskName')}
                    value={formTaskName}
                    onChange={(value) => setFormTaskName(value.slice(0, 255))}
                    placeholder={t('batchImage.create.taskNamePlaceholder')}
                  />
                  <Selector
                    label={t('astryx.batchImage.apiKeyLabel')}
                    options={keyOptions}
                    value={formApiKeyId ? String(formApiKeyId) : ''}
                    onChange={(value) => setFormApiKeyId(Number(value) || 0)}
                    placeholder={loadingKeys ? t('batchImage.create.loadingKeys') : t('batchImage.create.selectKeyPlaceholder')}
                    isLoading={loadingKeys}
                    isDisabled={loadingKeys}
                    status={
                      !loadingKeys && geminiApiKeys.length === 0
                        ? { type: 'warning', message: t('batchImage.create.noKeysHint') }
                        : undefined
                    }
                  />
                  <Selector
                    label={t('batchImage.create.model')}
                    options={availableModels.map((model) => ({ value: model, label: model }))}
                    value={formModel}
                    onChange={setFormModel}
                    placeholder={loadingModels ? batchImageText('loadingModels') : batchImageText('noModels')}
                    isLoading={loadingModels}
                    isDisabled={loadingModels || availableModels.length === 0}
                    status={
                      modelLoadError
                        ? { type: 'warning', message: modelLoadError }
                        : selectedApiKey && !loadingModels && availableModels.length === 0
                          ? { type: 'warning', message: batchImageText('noModelsHint') }
                          : undefined
                    }
                  />
                  <TextInput
                    label={t('batchImage.create.imageSize')}
                    value={BATCH_IMAGE_SIZE}
                    isReadOnly
                    description={t('batchImage.create.imageSizeHint')}
                  />
                  <Selector
                    label={t('batchImage.create.outputFormat')}
                    options={OUTPUT_FORMAT_OPTIONS}
                    value={responseMimeType}
                    onChange={setResponseMimeType}
                  />
                  <TextInput
                    label={t('batchImage.create.estimatedOutput')}
                    value={t('batchImage.create.estimatedOutputValue', { images: estimatedOutputCount, prompts: promptRows.length })}
                    isReadOnly
                  />
                </Grid>

                <Card variant="muted" padding={4}>
                  <VStack gap={3}>
                    <HStack gap={3} vAlign="center" hAlign="between">
                      <Text type="label">{t('astryx.batchImage.promptLabel')}</Text>
                      <Text type="supporting">{t('batchImage.create.promptAdded', { count: promptRows.length })}</Text>
                    </HStack>
                    <TextArea
                      label={t('astryx.batchImage.promptLabel')}
                      isLabelHidden
                      value={promptDraft}
                      onChange={setPromptDraft}
                      rows={3}
                      placeholder={t('batchImage.create.promptPlaceholder')}
                    />
                    <HStack gap={2} vAlign="end" wrap="wrap">
                      <TextInput
                        label={t('batchImage.create.customIdPlaceholder')}
                        isLabelHidden
                        value={customIdDraft}
                        onChange={(value) => setCustomIdDraft(value.slice(0, 255))}
                        placeholder={t('batchImage.create.customIdPlaceholder')}
                        width={220}
                      />
                      <Selector
                        label={t('batchImage.create.outputCountPerPrompt')}
                        isLabelHidden
                        options={OUTPUT_COUNT_OPTIONS.map((count) => ({
                          value: String(count),
                          label: t('batchImage.create.outputCountOption', { n: count }, count),
                        }))}
                        value={String(outputCountDraft)}
                        onChange={(value) => setOutputCountDraft(normalizeOutputCount(value))}
                        width={140}
                      />
                      <FileInput
                        label={t('batchImage.create.referenceImage')}
                        isLabelHidden
                        placeholder={t('batchImage.create.referenceImage')}
                        value={null}
                        onChange={(files) => void handleReferenceImageFiles(files)}
                        accept={REFERENCE_IMAGE_TYPES.join(',')}
                        isMultiple
                        isDisabled={referenceImageDrafts.length >= referenceLimit}
                        disabledMessage={
                          referenceLimit <= 0
                            ? t('batchImage.create.modelNoReferenceImages')
                            : t('batchImage.create.refLimitReached', { limit: referenceLimit })
                        }
                        width={200}
                      />
                      <Button
                        label={t('common.add')}
                        variant="secondary"
                        icon={<Icon icon={PlusIcon} />}
                        isDisabled={!promptDraft.trim()}
                        onClick={() => void addPromptRow()}
                      />
                    </HStack>
                    {referenceImageDrafts.length > 0 && (
                      <HStack gap={2} wrap="wrap">
                        {referenceImageDrafts.map((ref, refIndex) => (
                          <Thumbnail
                            key={`${ref.name}-${refIndex}`}
                            src={`data:${ref.mime_type};base64,${ref.data}`}
                            alt={ref.name}
                            label={ref.name}
                            showRemoveOn="always"
                            onRemove={() => setReferenceImageDrafts((prev) => prev.filter((_, index) => index !== refIndex))}
                          />
                        ))}
                      </HStack>
                    )}
                    <Text type="supporting">
                      {t('batchImage.create.limitsHint', {
                        maxPerItem: BATCH_IMAGE_MAX_OUTPUTS_PER_ITEM,
                        maxPerJob: BATCH_IMAGE_MAX_OUTPUTS_PER_JOB,
                        refLimit: referenceLimit,
                      })}
                    </Text>
                  </VStack>
                </Card>

                {promptRows.length > 0 ? (
                  <Table data={promptRows} columns={promptColumns} idKey="localId" density="compact" />
                ) : (
                  <EmptyState isCompact title={t('batchImage.create.noPrompts')} />
                )}

                <Banner status="warning" title={t('batchImage.create.cancelNotice')} />
                {submitting && <Banner status="info" title={t('batchImage.create.submittingNotice')} />}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" isDisabled={submitting} onClick={closeCreateModal} />
                <Button
                  label={submitting ? t('common.submitting') : t('batchImage.actions.submitJob')}
                  variant="primary"
                  isLoading={submitting}
                  isDisabled={
                    loadingModels || (parsedItems.length === 0 && !promptDraft.trim()) || !selectedApiKey || !formModel
                  }
                  onClick={() => void submitJob()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Usage guide */}
      <Dialog isOpen={showGuideModal} onOpenChange={setShowGuideModal} width={760} maxHeight="90dvh">
        <Layout
          header={<DialogHeader title={t('batchImage.guide.title')} onOpenChange={setShowGuideModal} />}
          content={
            <LayoutContent isScrollable>
              <VStack gap={5}>
                <VStack gap={3}>
                  <Heading level={4}>{t('batchImage.guide.uiTitle')}</Heading>
                  <Card variant="muted" padding={4}>
                    <VStack gap={1}>
                      <Text>{t('batchImage.guide.step1')}</Text>
                      <Text>{t('batchImage.guide.step2')}</Text>
                      <Text>{t('batchImage.guide.step3')}</Text>
                      <Text>{t('batchImage.guide.step4')}</Text>
                    </VStack>
                  </Card>
                </VStack>
                <VStack gap={3}>
                  <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                    <Heading level={4}>{t('batchImage.guide.skillTitle')}</Heading>
                    <Text type="supporting">{t('batchImage.guide.skillDesc')}</Text>
                  </HStack>
                  <TextArea
                    label={t('batchImage.guide.skillTitle')}
                    isLabelHidden
                    value={agentInstruction}
                    isReadOnly
                    rows={18}
                    hasSpellCheck={false}
                  />
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('common.close')} variant="secondary" onClick={() => setShowGuideModal(false)} />
                <Button
                  label={t('batchImage.actions.copyInstruction')}
                  variant="primary"
                  icon={<Icon icon={ClipboardDocumentIcon} />}
                  onClick={() => void copyToClipboard(agentInstruction, batchImageText('copiedInstruction'))}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Confirmations (cancel job / delete record / delete selected) */}
      <AlertDialog
        isOpen={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === 'cancel' ? t('batchImage.actions.cancelJob') : t('batchImage.actions.deleteRecords')
        }
        description={
          confirm?.kind === 'cancel'
            ? batchImageText('cancelConfirm')
            : confirm?.kind === 'deleteSelected'
              ? batchImageText('deleteSelectedConfirm')
              : batchImageText('deleteConfirm')
        }
        actionLabel={
          confirm?.kind === 'cancel' ? t('batchImage.actions.cancelJob') : t('batchImage.actions.deleteRecords')
        }
        cancelLabel={t('common.cancel')}
        isActionLoading={cancelling || bulkDeleting || Boolean(deletingBatchId)}
        onAction={() => void handleConfirm()}
      />
    </Page>
  )
}
