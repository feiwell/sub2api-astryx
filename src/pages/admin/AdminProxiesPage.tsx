import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { InputGroup } from '@astryxdesign/core/InputGroup'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Code } from '@astryxdesign/core/Code'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { TabList, Tab } from '@astryxdesign/core/TabList'
import {
  Table,
  TableSelectionToolbar,
  proportional,
  pixel,
  useTablePagination,
  useTableSelection,
  useTableSortable,
  type TableColumn,
} from '@astryxdesign/core/Table'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Grid } from '@astryxdesign/core/Grid'
import { Center } from '@astryxdesign/core/Center'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  DocumentDuplicateIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ServerIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type {
  AdminDataImportResult,
  Proxy,
  ProxyAccountSummary,
  ProxyProtocol,
  ProxyQualityCheckResult,
  UpdateProxyRequest,
} from '@/types'
import { formatDateTime } from '@/utils/format'
import { proxyExpiryBadgeClass, proxyExpiryLabelKey } from '@/utils/proxyExpiry'
import { getPersistedPageSize, setPersistedPageSize } from '@/composables/usePersistedPageSize'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'
import { adminAPI } from '~/lib/api/admin'
import { copyToClipboard } from '~/lib/clipboard'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

interface ProxyRow extends Proxy, Record<string, unknown> {
  __id: string
}

type ProxyStatusFilter = '' | 'active' | 'inactive' | 'expired'
type FallbackMode = 'none' | 'proxy' | 'direct'
type SortDirection = 'ascending' | 'descending'

interface ProxyFormState {
  name: string
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  password: string
  status: 'active' | 'inactive'
  expires_at: string
  fallback_mode: FallbackMode
  backup_proxy_id: number | null
  expiry_warn_days: number
}

interface ParsedProxy {
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  password: string
}

interface BatchParseResult {
  total: number
  valid: number
  invalid: number
  duplicate: number
  proxies: ParsedProxy[]
}

interface LatencyResult {
  success: boolean
  latency_ms?: number
  message?: string
  ip_address?: string
  country?: string
  country_code?: string
  region?: string
  city?: string
}

const EMPTY_FORM: ProxyFormState = {
  name: '',
  protocol: 'http',
  host: '',
  port: 8080,
  username: '',
  password: '',
  status: 'active',
  expires_at: '',
  fallback_mode: 'none',
  backup_proxy_id: null,
  expiry_warn_days: 7,
}

const EMPTY_PARSE_RESULT: BatchParseResult = { total: 0, valid: 0, invalid: 0, duplicate: 0, proxies: [] }

const ERROR_LIST_MAX_HEIGHT = 'calc(var(--spacing-12) * 4)'

// Expiry "days" ⇄ calendar date: days count from a base date (today when
// creating, the proxy's creation day when editing); expires_at stays canonical.
const EXPIRY_PRESETS = [7, 30, 90, 180]

const toLocalDateStr = (dt: Date): string => {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const baseDateOrToday = (baseDateStr: string): Date => {
  const base = baseDateStr ? new Date(`${baseDateStr}T00:00:00`) : new Date()
  base.setHours(0, 0, 0, 0)
  return base
}

// base + N days → local YYYY-MM-DD; N ≤ 0 or empty → '' (never expires)
const addDaysToBase = (baseDateStr: string, n: number | null): string => {
  const days = Number(n)
  if (!days || days <= 0) return ''
  const dt = baseDateOrToday(baseDateStr)
  dt.setDate(dt.getDate() + days)
  return toLocalDateStr(dt)
}

const daysFromBase = (baseDateStr: string, targetDateStr: string): number | null => {
  if (!targetDateStr) return null
  const target = new Date(`${targetDateStr}T00:00:00`)
  return Math.round((target.getTime() - baseDateOrToday(baseDateStr).getTime()) / 86400000)
}

const dateToUnix = (date: string): number | null =>
  date ? Math.floor(new Date(date).getTime() / 1000) : null

// protocol://user:pass@host:port or protocol://host:port. Host may be a domain,
// IPv4, or bracketed IPv6 ([2001:db8::1]).
const parseProxyUrl = (line: string): ParsedProxy | null => {
  const trimmed = line.trim()
  if (!trimmed) return null
  const regex = /^(https?|socks5h?):\/\/(?:([^:@[\]]+):([^@[\]]+)@)?(\[[0-9a-f:.]+\]|[^:[\]]+):(\d+)$/i
  const match = trimmed.match(regex)
  if (!match) return null
  const [, protocol, username, password, rawHost, port] = match
  const portNum = parseInt(port, 10)
  if (portNum < 1 || portNum > 65535) return null
  // Strip brackets from IPv6 literals; the backend re-brackets via net.JoinHostPort.
  const host = rawHost.replace(/^\[|\]$/g, '').trim()
  return {
    protocol: protocol.toLowerCase() as ProxyProtocol,
    host,
    port: portNum,
    username: username?.trim() || '',
    password: password?.trim() || '',
  }
}

const parseBatchInput = (input: string): BatchParseResult => {
  const lines = input.split('\n').filter((l) => l.trim())
  const seen = new Set<string>()
  const proxies: ParsedProxy[] = []
  let invalid = 0
  let duplicate = 0
  for (const line of lines) {
    const parsed = parseProxyUrl(line)
    if (!parsed) {
      invalid++
      continue
    }
    const key = `${parsed.host}:${parsed.port}:${parsed.username}:${parsed.password}`
    if (seen.has(key)) {
      duplicate++
      continue
    }
    seen.add(key)
    proxies.push(parsed)
  }
  return { total: lines.length, valid: proxies.length, invalid, duplicate, proxies }
}

const buildAuthPart = (row: Proxy): string => {
  const user = row.username ? encodeURIComponent(row.username) : ''
  const pass = row.password ? encodeURIComponent(row.password) : ''
  if (user && pass) return `${user}:${pass}@`
  if (user) return `${user}@`
  if (pass) return `:${pass}@`
  return ''
}

const buildProxyUrl = (row: Proxy): string => `${row.protocol}://${buildAuthPart(row)}${row.host}:${row.port}`

const getCopyFormats = (row: Proxy): string[] => {
  const fullUrl = buildProxyUrl(row)
  const formats = [fullUrl]
  if (row.username || row.password) formats.push(fullUrl.replace(/^[^:]+:\/\//, ''))
  formats.push(`${row.host}:${row.port}`)
  return formats
}

const formatExportTimestamp = () => {
  const now = new Date()
  const pad2 = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
}

const readFileAsText = async (sourceFile: File): Promise<string> => {
  if (typeof sourceFile.text === 'function') return sourceFile.text()
  if (typeof sourceFile.arrayBuffer === 'function') {
    return new TextDecoder().decode(await sourceFile.arrayBuffer())
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsText(sourceFile)
  })
}

const errorDetail = (error: unknown): string | undefined => {
  const e = error as { response?: { data?: { detail?: string } }; message?: string }
  return e?.response?.data?.detail
}

const isAbortError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { name?: string; code?: string }
  return maybeError.name === 'AbortError' || maybeError.code === 'ERR_CANCELED'
}

const summarizeQualityStatus = (result: ProxyQualityCheckResult): Proxy['quality_status'] => {
  if (result.challenge_count > 0) return 'challenge'
  if (result.failed_count > 0) return 'failed'
  if (result.warn_count > 0) return 'warn'
  return 'healthy'
}

const expiryVariant = (row: Proxy): 'error' | 'warning' | 'neutral' => {
  const cls = proxyExpiryBadgeClass(row.expires_at, row.status)
  if (cls.includes('badge-danger')) return 'error'
  if (cls.includes('badge-warning')) return 'warning'
  return 'neutral'
}

const QUALITY_TARGET_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  grok: 'Grok',
  kimi: 'Kimi',
  zhipu: 'Zhipu GLM',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
}

// Catalog key for each account type value (linked-accounts dialog)
const ACCOUNT_TYPE_KEYS: Record<string, string> = {
  oauth: 'admin.accounts.types.oauth',
  apikey: 'admin.accounts.apiKey',
  api_key: 'admin.accounts.apiKey',
  'setup-token': 'admin.accounts.setupToken',
  upstream: 'admin.accounts.types.upstream',
}

/* ------------------------------------------------------------------------- */
/* Shared proxy form fields (standard create and edit)                       */
/* ------------------------------------------------------------------------- */

interface ProxyFormFieldsProps {
  form: ProxyFormState
  onChange: (patch: Partial<ProxyFormState>) => void
  /** Base date (YYYY-MM-DD) the expiry days count from; '' = today */
  baseDate: string
  isEdit: boolean
  backupOptions: { value: string; label: string }[]
  onPasswordEdited?: () => void
}

function ProxyFormFields({ form, onChange, baseDate, isEdit, backupOptions, onPasswordEdited }: ProxyFormFieldsProps) {
  const { t } = useI18n()
  const [passwordVisible, setPasswordVisible] = useState(false)
  const expiresDays = daysFromBase(baseDate, form.expires_at)

  const protocolOptions = useMemo(
    () => [
      { value: 'http', label: t('admin.proxies.protocols.http') },
      { value: 'https', label: t('admin.proxies.protocols.https') },
      { value: 'socks5', label: t('admin.proxies.protocols.socks5') },
      { value: 'socks5h', label: t('admin.proxies.protocols.socks5h') },
    ],
    [t],
  )

  return (
    <VStack gap={4} hAlign="stretch">
      <TextInput
        label={t('admin.proxies.name')}
        value={form.name}
        onChange={(name) => onChange({ name })}
        placeholder={isEdit ? undefined : t('admin.proxies.enterProxyName')}
        isRequired
      />
      <Selector
        label={t('admin.proxies.protocol')}
        value={form.protocol}
        onChange={(protocol) => onChange({ protocol: protocol as ProxyProtocol })}
        options={protocolOptions}
      />
      <Grid columns={2} gap={4}>
        <TextInput
          label={t('admin.proxies.host')}
          value={form.host}
          onChange={(host) => onChange({ host })}
          placeholder={isEdit ? undefined : t('admin.proxies.form.hostPlaceholder')}
          isRequired
        />
        <NumberInput
          label={t('admin.proxies.port')}
          value={form.port}
          onChange={(port) => onChange({ port })}
          min={1}
          max={65535}
          isIntegerOnly
          placeholder={isEdit ? undefined : t('admin.proxies.form.portPlaceholder')}
          isRequired
        />
      </Grid>
      <TextInput
        label={t('admin.proxies.username')}
        value={form.username}
        onChange={(username) => onChange({ username })}
        placeholder={isEdit ? undefined : t('admin.proxies.optionalAuth')}
        autoComplete="off"
      />
      <InputGroup label={t('admin.proxies.password')}>
        <TextInput
          label={t('admin.proxies.password')}
          isLabelHidden
          type={passwordVisible ? 'text' : 'password'}
          value={form.password}
          onChange={(password) => {
            onChange({ password })
            onPasswordEdited?.()
          }}
          placeholder={isEdit ? t('admin.proxies.leaveEmptyToKeep') : t('admin.proxies.optionalAuth')}
          autoComplete="new-password"
        />
        <Button
          label={passwordVisible ? t('astryx.proxiesAdmin.hidePassword') : t('astryx.proxiesAdmin.showPassword')}
          isIconOnly
          icon={<Icon icon={passwordVisible ? EyeSlashIcon : EyeIcon} />}
          onClick={() => setPasswordVisible((v) => !v)}
        />
      </InputGroup>
      {isEdit && (
        <Selector
          label={t('admin.proxies.status')}
          value={form.status}
          onChange={(status) => onChange({ status: status as 'active' | 'inactive' })}
          options={[
            { value: 'active', label: t('admin.accounts.status.active') },
            { value: 'inactive', label: t('admin.accounts.status.inactive') },
          ]}
        />
      )}
      <VStack gap={2} hAlign="stretch">
        <Text type="label">{t('admin.proxies.expiresAt')}</Text>
        <HStack gap={2} wrap="wrap">
          {EXPIRY_PRESETS.map((d) => (
            <Button
              key={d}
              size="sm"
              label={t('admin.proxies.nDays', { days: d })}
              variant={form.expires_at === addDaysToBase(baseDate, d) ? 'primary' : 'secondary'}
              onClick={() => onChange({ expires_at: addDaysToBase(baseDate, d) })}
            />
          ))}
        </HStack>
        <NumberInput
          label={t('admin.proxies.expiryDaysPlaceholder')}
          isLabelHidden
          value={expiresDays}
          onChange={(days) => onChange({ expires_at: addDaysToBase(baseDate, days) })}
          min={0}
          isIntegerOnly
          hasClear
          placeholder={t('admin.proxies.expiryDaysPlaceholder')}
        />
        <DateInput
          label={t('admin.proxies.expiresAt')}
          isLabelHidden
          value={(form.expires_at || undefined) as ISODateString | undefined}
          onChange={(value) => onChange({ expires_at: value ?? '' })}
          max="9999-12-31"
          format="system_date"
          hasClear
        />
      </VStack>
      <Selector
        label={t('admin.proxies.fallbackMode')}
        value={form.fallback_mode}
        onChange={(mode) => onChange({ fallback_mode: mode as FallbackMode })}
        options={[
          { value: 'none', label: t('admin.proxies.fallbackNone') },
          { value: 'proxy', label: t('admin.proxies.fallbackProxy') },
          { value: 'direct', label: t('admin.proxies.fallbackDirect') },
        ]}
      />
      {form.fallback_mode === 'proxy' && (
        <Selector
          label={t('admin.proxies.backupProxy')}
          value={form.backup_proxy_id == null ? '' : String(form.backup_proxy_id)}
          onChange={(id) => onChange({ backup_proxy_id: id ? Number(id) : null })}
          options={backupOptions}
          hasSearch
        />
      )}
    </VStack>
  )
}

/* ------------------------------------------------------------------------- */
/* Create dialog: Standard / Quick (batch) add                               */
/* ------------------------------------------------------------------------- */

interface CreateProxyDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  backupOptions: { value: string; label: string }[]
}

function CreateProxyDialog({ isOpen, onClose, onCreated, backupOptions }: CreateProxyDialogProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'standard' | 'batch'>('standard')
  const [form, setForm] = useState<ProxyFormState>(EMPTY_FORM)
  const [batchInput, setBatchInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const batchResult = useMemo(() => (batchInput ? parseBatchInput(batchInput) : EMPTY_PARSE_RESULT), [batchInput])

  useEffect(() => {
    if (!isOpen) return
    setMode('standard')
    setForm(EMPTY_FORM)
    setBatchInput('')
  }, [isOpen])

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error(t('admin.proxies.nameRequired'))
      return
    }
    if (!form.host.trim()) {
      toast.error(t('admin.proxies.hostRequired'))
      return
    }
    if (!form.port || form.port < 1 || form.port > 65535) {
      toast.error(t('admin.proxies.portInvalid'))
      return
    }
    setSubmitting(true)
    try {
      await adminAPI.proxies.create({
        name: form.name.trim(),
        protocol: form.protocol,
        host: form.host.trim(),
        port: form.port,
        username: form.username.trim() || null,
        password: form.password.trim() || null,
        expires_at: dateToUnix(form.expires_at),
        fallback_mode: form.fallback_mode,
        backup_proxy_id: form.fallback_mode === 'proxy' ? form.backup_proxy_id : null,
        expiry_warn_days: form.expiry_warn_days,
      })
      toast.success(t('admin.proxies.proxyCreated'))
      onClose()
      onCreated()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.failedToCreate'))
      console.error('Error creating proxy:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleBatchCreate = async () => {
    if (batchResult.valid === 0) return
    setSubmitting(true)
    try {
      const result = await adminAPI.proxies.batchCreate(batchResult.proxies)
      const created = result.created || 0
      const skipped = result.skipped || 0
      if (created > 0) {
        toast.success(t('admin.proxies.batchImportSuccess', { created, skipped }))
      } else {
        toast.info(t('admin.proxies.batchImportAllSkipped', { skipped }))
      }
      onClose()
      onCreated()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.failedToImport'))
      console.error('Error batch creating proxies:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={560} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.proxies.createProxy')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <TabList value={mode} onChange={(value) => setMode(value as 'standard' | 'batch')}>
                  <Tab value="standard" label={t('admin.proxies.standardAdd')} icon={<Icon icon={PlusIcon} />} />
                  <Tab value="batch" label={t('admin.proxies.batchAdd')} icon={<Icon icon={DocumentDuplicateIcon} />} />
                </TabList>
              </HStack>
              {mode === 'standard' ? (
                <ProxyFormFields
                  form={form}
                  onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                  baseDate=""
                  isEdit={false}
                  backupOptions={backupOptions}
                />
              ) : (
                <VStack gap={4} hAlign="stretch">
                  <TextArea
                    label={t('admin.proxies.batchInput')}
                    value={batchInput}
                    onChange={setBatchInput}
                    rows={10}
                    placeholder={t('admin.proxies.batchInputPlaceholder')}
                    description={t('admin.proxies.batchInputHint')}
                    hasSpellCheck={false}
                  />
                  {batchResult.total > 0 && (
                    <Card variant="muted" padding={3}>
                      <HStack gap={4} wrap="wrap" vAlign="center">
                        <HStack gap={1.5} vAlign="center">
                          <Icon icon={CheckCircleIcon} size="sm" color="accent" />
                          <Text>{t('admin.proxies.parsedCount', { count: batchResult.valid })}</Text>
                        </HStack>
                        {batchResult.invalid > 0 && (
                          <HStack gap={1.5} vAlign="center">
                            <Icon icon={ExclamationCircleIcon} size="sm" color="warning" />
                            <Text>{t('admin.proxies.invalidCount', { count: batchResult.invalid })}</Text>
                          </HStack>
                        )}
                        {batchResult.duplicate > 0 && (
                          <HStack gap={1.5} vAlign="center">
                            <Icon icon={DocumentDuplicateIcon} size="sm" color="secondary" />
                            <Text color="secondary">
                              {t('admin.proxies.duplicateCount', { count: batchResult.duplicate })}
                            </Text>
                          </HStack>
                        )}
                      </HStack>
                    </Card>
                  )}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={submitting} onClick={handleClose} />
              {mode === 'standard' ? (
                <Button
                  label={submitting ? t('admin.proxies.creating') : t('common.create')}
                  variant="primary"
                  isLoading={submitting}
                  onClick={() => void handleCreate()}
                />
              ) : (
                <Button
                  label={
                    submitting
                      ? t('admin.proxies.importing')
                      : t('admin.proxies.importProxies', { count: batchResult.valid })
                  }
                  variant="primary"
                  isLoading={submitting}
                  isDisabled={batchResult.valid === 0}
                  onClick={() => void handleBatchCreate()}
                />
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Edit dialog                                                               */
/* ------------------------------------------------------------------------- */

interface EditProxyDialogProps {
  proxy: Proxy | null
  onClose: () => void
  onUpdated: () => void
  backupOptions: { value: string; label: string }[]
}

function EditProxyDialog({ proxy, onClose, onUpdated, backupOptions }: EditProxyDialogProps) {
  const { t } = useI18n()
  const [form, setForm] = useState<ProxyFormState>(EMPTY_FORM)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!proxy) return
    setForm({
      name: proxy.name,
      protocol: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username || '',
      password: proxy.password || '',
      status: proxy.status === 'expired' ? 'inactive' : proxy.status,
      expires_at: proxy.expires_at ? proxy.expires_at.slice(0, 10) : '',
      fallback_mode: proxy.fallback_mode || 'none',
      backup_proxy_id: proxy.backup_proxy_id ?? null,
      expiry_warn_days: proxy.expiry_warn_days ?? 7,
    })
    setPasswordDirty(false)
  }, [proxy])

  // Expiry days count from the proxy's creation date when editing
  const baseDate = proxy?.created_at ? proxy.created_at.slice(0, 10) : ''
  const editBackupOptions = useMemo(
    () => backupOptions.filter((option) => option.value !== String(proxy?.id)),
    [backupOptions, proxy?.id],
  )

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleUpdate = async () => {
    if (!proxy) return
    if (!form.name.trim()) {
      toast.error(t('admin.proxies.nameRequired'))
      return
    }
    if (!form.host.trim()) {
      toast.error(t('admin.proxies.hostRequired'))
      return
    }
    if (!form.port || form.port < 1 || form.port > 65535) {
      toast.error(t('admin.proxies.portInvalid'))
      return
    }
    setSubmitting(true)
    try {
      const updateData: UpdateProxyRequest = {
        name: form.name.trim(),
        protocol: form.protocol,
        host: form.host.trim(),
        port: form.port,
        username: form.username.trim(),
        status: form.status,
        expires_at: dateToUnix(form.expires_at),
        fallback_mode: form.fallback_mode,
        backup_proxy_id: form.fallback_mode === 'proxy' ? form.backup_proxy_id : null,
        expiry_warn_days: form.expiry_warn_days,
      }
      // Only send the password when the field was actually edited
      if (passwordDirty) updateData.password = form.password.trim()
      await adminAPI.proxies.update(proxy.id, updateData)
      toast.success(t('admin.proxies.proxyUpdated'))
      onClose()
      onUpdated()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.failedToUpdate'))
      console.error('Error updating proxy:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog isOpen={proxy !== null} onOpenChange={(open) => !open && handleClose()} width={560} purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.proxies.editProxy')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            {proxy && (
              <ProxyFormFields
                key={proxy.id}
                form={form}
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                baseDate={baseDate}
                isEdit
                backupOptions={editBackupOptions}
                onPasswordEdited={() => setPasswordDirty(true)}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={submitting} onClick={handleClose} />
              <Button
                label={submitting ? t('admin.proxies.updating') : t('common.update')}
                variant="primary"
                isLoading={submitting}
                onClick={() => void handleUpdate()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Quality report dialog                                                     */
/* ------------------------------------------------------------------------- */

interface QualityItemRow extends Record<string, unknown> {
  __id: string
  target: string
  status: string
  http_status?: number
  latency_ms?: number
  message?: string
  cf_ray?: string
}

function QualityReportDialog({
  proxy,
  report,
  onClose,
}: {
  proxy: Proxy | null
  report: ProxyQualityCheckResult | null
  onClose: () => void
}) {
  const { t } = useI18n()

  const statusVariant = (status: string): 'success' | 'warning' | 'error' =>
    status === 'pass' ? 'success' : status === 'warn' ? 'warning' : 'error'
  const statusLabel = (status: string) => {
    if (status === 'pass') return t('admin.proxies.qualityStatusPass')
    if (status === 'warn') return t('admin.proxies.qualityStatusWarn')
    if (status === 'challenge') return t('admin.proxies.qualityStatusChallenge')
    return t('admin.proxies.qualityStatusFail')
  }
  const targetLabel = (target: string) =>
    target === 'base_connectivity' ? t('admin.proxies.qualityTargetBase') : QUALITY_TARGET_LABELS[target] || target

  const rows = useMemo<QualityItemRow[]>(
    () => (report?.items || []).map((item) => ({ ...item, __id: item.target })),
    [report],
  )

  const columns = useMemo<TableColumn<QualityItemRow>[]>(
    () => [
      { key: 'target', header: t('admin.proxies.qualityTableTarget'), width: proportional(1), renderCell: (row) => <Text>{targetLabel(row.target)}</Text> },
      {
        key: 'status',
        header: t('admin.proxies.qualityTableStatus'),
        width: pixel(110),
        renderCell: (row) => <Badge variant={statusVariant(row.status)} label={statusLabel(row.status)} />,
      },
      { key: 'http_status', header: 'HTTP', width: pixel(70), renderCell: (row) => <Text color="secondary">{row.http_status ?? '-'}</Text> },
      {
        key: 'latency_ms',
        header: t('admin.proxies.qualityTableLatency'),
        width: pixel(90),
        renderCell: (row) => (
          <Text color="secondary" hasTabularNumbers>
            {typeof row.latency_ms === 'number' ? `${row.latency_ms}ms` : '-'}
          </Text>
        ),
      },
      {
        key: 'message',
        header: t('admin.proxies.qualityTableMessage'),
        width: proportional(2),
        renderCell: (row) => (
          <VStack gap={0.5}>
            <Text color="secondary">{row.message || '-'}</Text>
            {row.cf_ray && <Text type="supporting">(cf-ray: {row.cf_ray})</Text>}
          </VStack>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <Dialog isOpen={report !== null} onOpenChange={(open) => !open && onClose()} width={720}>
      <Layout
        header={<DialogHeader title={t('admin.proxies.qualityReportTitle')} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            {report && (
              <VStack gap={4} hAlign="stretch">
                <Card variant="muted" padding={4}>
                  <VStack gap={3} hAlign="stretch">
                    <HStack gap={4} vAlign="center" hAlign="between">
                      <VStack gap={1}>
                        <Text type="supporting">{proxy?.name || '-'}</Text>
                        <Text>{report.summary}</Text>
                      </VStack>
                      <VStack gap={0.5} hAlign="end">
                        <Text type="display-3" hasTabularNumbers>
                          {report.score}
                        </Text>
                        <Text type="supporting">{t('admin.proxies.qualityGrade', { grade: report.grade })}</Text>
                      </VStack>
                    </HStack>
                    <MetadataList columns={2}>
                      <MetadataListItem label={t('admin.proxies.qualityExitIP')}>
                        <Text>{report.exit_ip || '-'}</Text>
                      </MetadataListItem>
                      <MetadataListItem label={t('admin.proxies.qualityCountry')}>
                        <Text>{report.country || '-'}</Text>
                      </MetadataListItem>
                      <MetadataListItem label={t('admin.proxies.qualityBaseLatency')}>
                        <Text>{typeof report.base_latency_ms === 'number' ? `${report.base_latency_ms}ms` : '-'}</Text>
                      </MetadataListItem>
                      <MetadataListItem label={t('admin.proxies.qualityCheckedAt')}>
                        <Text>{new Date(report.checked_at * 1000).toLocaleString()}</Text>
                      </MetadataListItem>
                    </MetadataList>
                  </VStack>
                </Card>
                <Table columns={columns} data={rows} idKey="__id" density="compact" />
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Linked accounts dialog                                                    */
/* ------------------------------------------------------------------------- */

interface AccountSummaryRow extends ProxyAccountSummary, Record<string, unknown> {
  __id: string
}

function ProxyAccountsDialog({ proxy, onClose }: { proxy: Proxy | null; onClose: () => void }) {
  const { t } = useI18n()
  const [accounts, setAccounts] = useState<ProxyAccountSummary[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!proxy) return
    let cancelled = false
    setAccounts([])
    setLoading(true)
    adminAPI.proxies
      .getProxyAccounts(proxy.id)
      .then((list) => {
        if (!cancelled) setAccounts(list || [])
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(errorDetail(error) || t('admin.proxies.accountsFailed'))
        console.error('Error loading proxy accounts:', error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [proxy, t])

  const platformLabel = (platform: string) => {
    const key = `admin.accounts.platforms.${platform}`
    const label = t(key)
    return label === key ? platform : label
  }

  const rows = useMemo<AccountSummaryRow[]>(() => accounts.map((a) => ({ ...a, __id: String(a.id) })), [accounts])
  const columns = useMemo<TableColumn<AccountSummaryRow>[]>(
    () => [
      {
        key: 'name',
        header: t('admin.proxies.accountName'),
        width: proportional(2),
        renderCell: (row) => <Text weight="medium">{row.name}</Text>,
      },
      {
        key: 'platform',
        header: t('admin.accounts.columns.platformType'),
        width: proportional(1.5),
        renderCell: (row) => (
          <HStack gap={1} wrap="wrap">
            <Badge variant="info" label={platformLabel(row.platform)} />
            <Badge label={ACCOUNT_TYPE_KEYS[row.type] ? t(ACCOUNT_TYPE_KEYS[row.type]) : row.type} />
          </HStack>
        ),
      },
      {
        key: 'notes',
        header: t('admin.proxies.accountNotes'),
        width: proportional(2),
        renderCell: (row) => <Text color="secondary">{row.notes || '-'}</Text>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  return (
    <Dialog isOpen={proxy !== null} onOpenChange={(open) => !open && onClose()} width={640}>
      <Layout
        header={
          <DialogHeader
            title={t('admin.proxies.accountsTitle', { name: proxy?.name || '' })}
            subtitle={proxy?.name}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {loading ? (
              <Center minHeight={160}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : rows.length === 0 ? (
              <EmptyState isCompact title={t('admin.proxies.accountsEmpty')} />
            ) : (
              <Table columns={columns} data={rows} idKey="__id" density="compact" />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Import dialog (port of components/admin/proxy/ImportDataModal.vue)        */
/* ------------------------------------------------------------------------- */

function ImportProxyDataDialog({
  isOpen,
  onClose,
  onImported,
}: {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}) {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [hasImportedData, setHasImportedData] = useState(false)
  const [result, setResult] = useState<AdminDataImportResult | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setFile(null)
    setHasImportedData(false)
    setResult(null)
  }, [isOpen])

  const errorItems = result?.errors || []

  const handleClose = () => {
    if (importing) return
    if (hasImportedData) {
      setHasImportedData(false)
      onImported()
    }
    onClose()
  }

  const handleImport = async () => {
    if (!file) {
      toast.error(t('admin.proxies.dataImportSelectFile'))
      return
    }
    setImporting(true)
    try {
      const dataPayload = JSON.parse(await readFileAsText(file))
      const res = await adminAPI.proxies.importData({ data: dataPayload })
      setResult(res)
      const msgParams: Record<string, unknown> = {
        proxy_created: res.proxy_created,
        proxy_reused: res.proxy_reused,
        proxy_failed: res.proxy_failed,
      }
      if (res.proxy_failed > 0) {
        setHasImportedData((prev) => prev || res.proxy_created > 0 || res.proxy_reused > 0)
        toast.error(t('admin.proxies.dataImportCompletedWithErrors', msgParams))
      } else {
        setHasImportedData(false)
        toast.success(t('admin.proxies.dataImportSuccess', msgParams))
        onImported()
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error(t('admin.proxies.dataImportParseFailed'))
      } else {
        toast.error((error as { message?: string })?.message || t('admin.proxies.dataImportFailed'))
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && handleClose()} width={560}>
      <Layout
        header={<DialogHeader title={t('admin.proxies.dataImportTitle')} onOpenChange={(open) => !open && handleClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4} hAlign="stretch">
              <Text color="secondary">{t('admin.proxies.dataImportHint')}</Text>
              <Banner status="warning" title={t('admin.proxies.dataImportWarning')} />
              <FileInput
                label={t('admin.proxies.dataImportFile')}
                description="JSON (.json)"
                placeholder={t('admin.proxies.dataImportSelectFile')}
                accept="application/json,.json"
                value={file}
                onChange={(next) => setFile(Array.isArray(next) ? next[0] ?? null : next)}
                isDisabled={importing}
              />
              {result && (
                <Card padding={4}>
                  <VStack gap={2} hAlign="stretch">
                    <Text weight="medium">{t('admin.proxies.dataImportResult')}</Text>
                    <Text>{t('admin.proxies.dataImportResultSummary', { ...result })}</Text>
                    {errorItems.length > 0 && (
                      <Banner status="error" title={t('admin.proxies.dataImportErrors')} collapsible={false}>
                        <CodeBlock
                          code={errorItems
                            .map((item) => `${item.kind} ${item.name || item.proxy_key || '-'} — ${item.message}`)
                            .join('\n')}
                          isWrapped
                          hasCopyButton={false}
                          maxHeight={ERROR_LIST_MAX_HEIGHT}
                          width="100%"
                          size="sm"
                          container="section"
                        />
                      </Banner>
                    )}
                  </VStack>
                </Card>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" isDisabled={importing} onClick={handleClose} />
              <Button
                label={importing ? t('admin.proxies.dataImporting') : t('admin.proxies.dataImportButton')}
                variant="primary"
                isLoading={importing}
                onClick={() => void handleImport()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------------- */
/* Page                                                                      */
/* ------------------------------------------------------------------------- */

export function AdminProxiesPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [total, setTotal] = useState(0)

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [protocolFilter, setProtocolFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProxyStatusFilter>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => getPersistedPageSize())
  const [sort, setSort] = useState<Array<{ sortKey: string; direction: SortDirection }>>([
    { sortKey: 'id', direction: 'descending' },
  ])

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Set<number>>(new Set())
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set())
  const [qualityCheckingIds, setQualityCheckingIds] = useState<Set<number>>(new Set())
  const [batchTesting, setBatchTesting] = useState(false)
  const [batchQualityChecking, setBatchQualityChecking] = useState(false)

  const [backupProxies, setBackupProxies] = useState<Proxy[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null)
  const [deletingProxy, setDeletingProxy] = useState<Proxy | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [accountsProxy, setAccountsProxy] = useState<Proxy | null>(null)
  const [qualityReportProxy, setQualityReportProxy] = useState<Proxy | null>(null)
  const [qualityReport, setQualityReport] = useState<ProxyQualityCheckResult | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const pageSizeOptions = useMemo(() => getConfiguredTablePageSizeOptions(), [])

  // Debounce the search box like the Vue view (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const sortBy = sort[0]?.sortKey || 'id'
  const sortOrder: 'asc' | 'desc' = sort[0]?.direction === 'ascending' ? 'asc' : 'desc'

  const queryFilters = useMemo(
    () => ({
      protocol: protocolFilter || undefined,
      status: (statusFilter || undefined) as 'active' | 'inactive' | 'expired' | undefined,
      search: searchQuery || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    [protocolFilter, statusFilter, searchQuery, sortBy, sortOrder],
  )

  const loadProxies = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const response = await adminAPI.proxies.list(page, pageSize, queryFilters, { signal: controller.signal })
      if (controller.signal.aborted || abortRef.current !== controller) return
      setProxies(response.items)
      setTotal(response.total)
    } catch (error) {
      if (isAbortError(error)) return
      toast.error(t('admin.proxies.failedToLoad'))
      console.error('Error loading proxies:', error)
    } finally {
      if (abortRef.current === controller) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }, [page, pageSize, queryFilters, t])

  useEffect(() => {
    void loadProxies()
  }, [loadProxies])

  useEffect(() => () => abortRef.current?.abort(), [])

  const loadBackupProxies = useCallback(async () => {
    try {
      setBackupProxies(await adminAPI.proxies.getAllWithCount())
    } catch (error) {
      console.error('Error loading backup proxies:', error)
    }
  }, [])

  useEffect(() => {
    void loadBackupProxies()
  }, [loadBackupProxies])

  const backupOptions = useMemo(
    () => backupProxies.map((p) => ({ value: String(p.id), label: `${p.name} (${p.host}:${p.port})` })),
    [backupProxies],
  )

  const refreshAll = useCallback(() => {
    void loadProxies()
    void loadBackupProxies()
  }, [loadProxies, loadBackupProxies])

  const addToSet = (setter: typeof setTestingIds, id: number) => setter((prev) => new Set(prev).add(id))
  const removeFromSet = (setter: typeof setTestingIds, id: number) =>
    setter((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const applyLatencyResult = useCallback((proxyId: number, result: LatencyResult) => {
    setProxies((prev) =>
      prev.map((proxy) => {
        if (proxy.id !== proxyId) return proxy
        return result.success
          ? {
              ...proxy,
              latency_status: 'success',
              latency_ms: result.latency_ms,
              ip_address: result.ip_address,
              country: result.country,
              country_code: result.country_code,
              region: result.region,
              city: result.city,
              latency_message: result.message,
            }
          : {
              ...proxy,
              latency_status: 'failed',
              latency_ms: undefined,
              ip_address: undefined,
              country: undefined,
              country_code: undefined,
              region: undefined,
              city: undefined,
              latency_message: result.message,
            }
      }),
    )
  }, [])

  const applyQualityResult = useCallback(
    (proxyId: number, result: ProxyQualityCheckResult) => {
      const baseStep = result.items.find((item) => item.target === 'base_connectivity')
      if (baseStep && baseStep.status === 'pass') {
        applyLatencyResult(proxyId, {
          success: true,
          latency_ms: result.base_latency_ms,
          message: result.summary,
          ip_address: result.exit_ip,
          country: result.country,
          country_code: result.country_code,
        })
      }
      setProxies((prev) =>
        prev.map((proxy) =>
          proxy.id === proxyId
            ? {
                ...proxy,
                quality_status: summarizeQualityStatus(result),
                quality_score: result.score,
                quality_grade: result.grade,
                quality_summary: result.summary,
                quality_checked: result.checked_at,
              }
            : proxy,
        ),
      )
    },
    [applyLatencyResult],
  )

  const runProxyTest = useCallback(
    async (proxyId: number, notify: boolean) => {
      addToSet(setTestingIds, proxyId)
      try {
        const result = await adminAPI.proxies.testProxy(proxyId)
        applyLatencyResult(proxyId, result)
        if (notify) {
          if (result.success) {
            toast.success(
              result.latency_ms
                ? t('admin.proxies.proxyWorkingWithLatency', { latency: result.latency_ms })
                : t('admin.proxies.proxyWorking'),
            )
          } else {
            toast.error(result.message || t('admin.proxies.proxyTestFailed'))
          }
        }
        return result
      } catch (error) {
        const message = errorDetail(error) || t('admin.proxies.failedToTest')
        applyLatencyResult(proxyId, { success: false, message })
        if (notify) toast.error(message)
        console.error('Error testing proxy:', error)
        return null
      } finally {
        removeFromSet(setTestingIds, proxyId)
      }
    },
    [applyLatencyResult, t],
  )

  const handleQualityCheck = useCallback(
    async (proxy: Proxy) => {
      addToSet(setQualityCheckingIds, proxy.id)
      try {
        const result = await adminAPI.proxies.checkProxyQuality(proxy.id)
        setQualityReportProxy(proxy)
        setQualityReport(result)
        applyQualityResult(proxy.id, result)
        toast.success(t('admin.proxies.qualityCheckDone', { score: result.score, grade: result.grade }))
      } catch (error) {
        toast.error(errorDetail(error) || t('admin.proxies.qualityCheckFailed'))
        console.error('Error checking proxy quality:', error)
      } finally {
        removeFromSet(setQualityCheckingIds, proxy.id)
      }
    },
    [applyQualityResult, t],
  )

  // Every proxy matching the current filters, page by page (batch actions without a selection)
  const fetchAllProxiesForBatch = useCallback(async (): Promise<Proxy[]> => {
    const result: Proxy[] = []
    let current = 1
    let totalPages = 1
    while (current <= totalPages) {
      const response = await adminAPI.proxies.list(current, 200, queryFilters)
      result.push(...response.items)
      totalPages = response.pages || 1
      current++
    }
    return result
  }, [queryFilters])

  const resolveBatchIds = useCallback(async () => {
    if (selectedIds.size > 0) return Array.from(selectedIds)
    return (await fetchAllProxiesForBatch()).map((proxy) => proxy.id)
  }, [selectedIds, fetchAllProxiesForBatch])

  const handleBatchTest = async () => {
    if (batchTesting) return
    setBatchTesting(true)
    try {
      const ids = await resolveBatchIds()
      if (ids.length === 0) {
        toast.info(t('admin.proxies.batchTestEmpty'))
        return
      }
      let index = 0
      const worker = async () => {
        while (index < ids.length) {
          const current = ids[index]
          index++
          await runProxyTest(current, false)
        }
      }
      await Promise.all(Array.from({ length: Math.min(5, ids.length) }, () => worker()))
      toast.success(t('admin.proxies.batchTestDone', { count: ids.length }))
      void loadProxies()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.batchTestFailed'))
      console.error('Error batch testing proxies:', error)
    } finally {
      setBatchTesting(false)
    }
  }

  const handleBatchQualityCheck = async () => {
    if (batchQualityChecking) return
    setBatchQualityChecking(true)
    try {
      const ids = await resolveBatchIds()
      if (ids.length === 0) {
        toast.info(t('admin.proxies.batchQualityEmpty'))
        return
      }
      const summary = { healthy: 0, warn: 0, challenge: 0, failed: 0 }
      let index = 0
      const worker = async () => {
        while (index < ids.length) {
          const current = ids[index]
          index++
          addToSet(setQualityCheckingIds, current)
          try {
            const result = await adminAPI.proxies.checkProxyQuality(current)
            applyQualityResult(current, result)
            if (result.challenge_count > 0) summary.challenge++
            else if (result.failed_count > 0) summary.failed++
            else if (result.warn_count > 0) summary.warn++
            else summary.healthy++
          } catch {
            summary.failed++
          } finally {
            removeFromSet(setQualityCheckingIds, current)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()))
      toast.success(t('admin.proxies.batchQualityDone', { count: ids.length, ...summary }))
      void loadProxies()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.batchQualityFailed'))
      console.error('Error batch checking quality:', error)
    } finally {
      setBatchQualityChecking(false)
    }
  }

  const handleExportData = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const dataPayload = await adminAPI.proxies.exportData(
        selectedIds.size > 0 ? { ids: Array.from(selectedIds) } : { filters: queryFilters },
      )
      const blob = new Blob([JSON.stringify(dataPayload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `sub2api-proxy-${formatExportTimestamp()}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(t('admin.proxies.dataExported'))
    } catch (error) {
      toast.error((error as { message?: string })?.message || t('admin.proxies.dataExportFailed'))
    } finally {
      setExporting(false)
      setShowExport(false)
    }
  }

  const handleDelete = useCallback(
    (proxy: Proxy) => {
      if ((proxy.account_count || 0) > 0) {
        toast.error(t('admin.proxies.deleteBlockedInUse'))
        return
      }
      setDeletingProxy(proxy)
    },
    [t],
  )

  const confirmDelete = async () => {
    if (!deletingProxy) return
    setDeleting(true)
    try {
      await adminAPI.proxies.delete(deletingProxy.id)
      toast.success(t('admin.proxies.proxyDeleted'))
      const deletedId = deletingProxy.id
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletedId)
        return next
      })
      setDeletingProxy(null)
      refreshAll()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.failedToDelete'))
      console.error('Error deleting proxy:', error)
    } finally {
      setDeleting(false)
    }
  }

  const confirmBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      setShowBatchDelete(false)
      return
    }
    setBatchDeleting(true)
    try {
      const result = await adminAPI.proxies.batchDelete(ids)
      const deleted = result.deleted_ids?.length || 0
      const skipped = result.skipped?.length || 0
      if (deleted > 0) {
        toast.success(t('admin.proxies.batchDeleteDone', { deleted, skipped }))
      } else if (skipped > 0) {
        toast.info(t('admin.proxies.batchDeleteSkipped', { skipped }))
      }
      setSelectedIds(new Set())
      setShowBatchDelete(false)
      refreshAll()
    } catch (error) {
      toast.error(errorDetail(error) || t('admin.proxies.batchDeleteFailed'))
      console.error('Error batch deleting proxies:', error)
    } finally {
      setBatchDeleting(false)
    }
  }

  const togglePasswordVisible = useCallback((id: number) => {
    setVisiblePasswordIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const rows = useMemo<ProxyRow[]>(() => proxies.map((p) => ({ ...p, __id: String(p.id) })), [proxies])
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id))

  const selectionPlugin = useTableSelection<ProxyRow>({
    getIsItemSelected: (row) => selectedIds.has(row.id),
    onSelectItem: ({ item, isSelected }) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (isSelected) next.add(item.id)
        else next.delete(item.id)
        return next
      }),
    onSelectAll: ({ isAllSelected }) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const row of rows) {
          if (isAllSelected) next.add(row.id)
          else next.delete(row.id)
        }
        return next
      }),
    getIsAllSelected: () => allVisibleSelected,
    getIsIndeterminate: () => !allVisibleSelected && rows.some((row) => selectedIds.has(row.id)),
    getRowLabel: (row) => row.name,
  })

  const sortPlugin = useTableSortable<ProxyRow>({
    sort,
    onSortChange: (next) => {
      setSort(next.length > 0 ? next : [{ sortKey: 'id', direction: 'descending' }])
      setPage(1)
    },
  })

  const paginationPlugin = useTablePagination<ProxyRow>({
    page,
    onPageChange: setPage,
    totalItems: total,
    pageSize,
    onPageSizeChange: (size) => {
      setPageSize(size)
      setPage(1)
      setPersistedPageSize(size)
    },
    pageSizeOptions,
  })

  const qualityOverallVariant = (status?: string): 'success' | 'warning' | 'error' =>
    status === 'healthy' ? 'success' : status === 'warn' ? 'warning' : 'error'
  const qualityOverallLabel = useCallback(
    (status?: string) => {
      if (status === 'healthy') return t('admin.proxies.qualityStatusHealthy')
      if (status === 'warn') return t('admin.proxies.qualityStatusWarn')
      if (status === 'challenge') return t('admin.proxies.qualityStatusChallenge')
      return t('admin.proxies.qualityStatusFail')
    },
    [t],
  )

  const columns = useMemo<TableColumn<ProxyRow>[]>(
    () => [
      {
        key: 'name',
        header: t('admin.proxies.columns.name'),
        width: proportional(1.5, { minWidth: 120 }),
        sortable: true,
        renderCell: (row) => <Text weight="medium">{row.name}</Text>,
      },
      {
        key: 'protocol',
        header: t('admin.proxies.columns.protocol'),
        width: pixel(100),
        sortable: true,
        renderCell: (row) =>
          row.protocol ? (
            <Badge variant={row.protocol.startsWith('socks5') ? 'info' : 'neutral'} label={row.protocol.toUpperCase()} />
          ) : (
            <Text color="secondary">-</Text>
          ),
      },
      {
        key: 'address',
        header: t('admin.proxies.columns.address'),
        width: proportional(2, { minWidth: 200 }),
        renderCell: (row) => (
          <HStack gap={1} vAlign="center">
            <Code>
              {row.host}:{row.port}
            </Code>
            <IconButton
              label={t('admin.proxies.copyProxyUrl')}
              tooltip={t('admin.proxies.copyProxyUrl')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={ClipboardDocumentIcon} />}
              onClick={() => void copyToClipboard(buildProxyUrl(row), t('admin.proxies.urlCopied'))}
            />
            <MoreMenu
              label={t('astryx.proxiesAdmin.copyFormats')}
              size="sm"
              items={getCopyFormats(row).map((value) => ({
                label: value,
                onClick: () => void copyToClipboard(value, t('admin.proxies.urlCopied')),
              }))}
            />
          </HStack>
        ),
      },
      {
        key: 'auth',
        header: t('admin.proxies.columns.auth'),
        width: proportional(1.2, { minWidth: 120 }),
        renderCell: (row) =>
          row.username || row.password ? (
            <HStack gap={1} vAlign="center">
              <VStack gap={0.5}>
                {row.username && <Text type="supporting" color="primary">{row.username}</Text>}
                {row.password && (
                  <Text type="code" color="secondary">
                    {visiblePasswordIds.has(row.id) ? row.password : '••••••'}
                  </Text>
                )}
              </VStack>
              {row.password && (
                <IconButton
                  label={visiblePasswordIds.has(row.id) ? t('astryx.proxiesAdmin.hidePassword') : t('astryx.proxiesAdmin.showPassword')}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon={visiblePasswordIds.has(row.id) ? EyeSlashIcon : EyeIcon} />}
                  onClick={() => togglePasswordVisible(row.id)}
                />
              )}
            </HStack>
          ) : (
            <Text color="secondary">-</Text>
          ),
      },
      {
        key: 'location',
        header: t('admin.proxies.columns.location'),
        width: proportional(1, { minWidth: 110 }),
        renderCell: (row) => {
          const location = [row.country, row.city].filter(Boolean).join(' · ')
          return (
            <HStack gap={1.5} vAlign="center">
              {row.country_code && <Text type="code">{row.country_code.toUpperCase()}</Text>}
              <Text color={location ? 'primary' : 'secondary'}>{location || '-'}</Text>
            </HStack>
          )
        },
      },
      {
        key: 'account_count',
        header: t('admin.proxies.columns.accounts'),
        width: pixel(110),
        sortable: true,
        renderCell: (row) =>
          (row.account_count || 0) > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              label={t('admin.groups.accountsCount', { count: row.account_count || 0 })}
              onClick={() => setAccountsProxy(row)}
            />
          ) : (
            <Text type="supporting">{t('admin.groups.accountsCount', { count: 0 })}</Text>
          ),
      },
      {
        key: 'latency',
        header: t('admin.proxies.columns.latency'),
        width: proportional(1.2, { minWidth: 140 }),
        renderCell: (row) => (
          <VStack gap={1} hAlign="start">
            {row.latency_status === 'failed' ? (
              <Badge variant="error" label={t('admin.proxies.latencyFailed')} />
            ) : typeof row.latency_ms === 'number' ? (
              <Badge variant={row.latency_ms < 200 ? 'success' : 'warning'} label={`${row.latency_ms}ms`} />
            ) : (
              <Text color="secondary">-</Text>
            )}
            {typeof row.quality_checked === 'number' && (
              <HStack gap={1} vAlign="center" wrap="wrap">
                <Text type="supporting">
                  {t('admin.proxies.qualityInline', { grade: row.quality_grade || '-', score: row.quality_score ?? '-' })}
                </Text>
                <Badge variant={qualityOverallVariant(row.quality_status)} label={qualityOverallLabel(row.quality_status)} />
              </HStack>
            )}
          </VStack>
        ),
      },
      {
        key: 'expiry',
        header: t('admin.proxies.columns.expiry'),
        width: proportional(1, { minWidth: 130 }),
        sortable: true,
        renderCell: (row) => {
          if (!row.expires_at) return <Text color="secondary">{t('admin.proxies.neverExpires')}</Text>
          const { key, params } = proxyExpiryLabelKey(row.expires_at, row.status)
          const variant = expiryVariant(row)
          const label = params ? t(key, params) : t(key)
          return (
            <VStack gap={0.5} hAlign="start">
              <Text type="supporting" color="primary">{formatDateTime(row.expires_at)}</Text>
              {variant === 'neutral' ? <Text type="supporting">{label}</Text> : <Badge variant={variant} label={label} />}
            </VStack>
          )
        },
      },
      {
        key: 'created_at',
        header: t('admin.proxies.columns.createdAt'),
        width: pixel(160),
        sortable: true,
        renderCell: (row) => <Text type="supporting">{formatDateTime(row.created_at)}</Text>,
      },
      {
        key: 'status',
        header: t('admin.proxies.columns.status'),
        width: pixel(100),
        sortable: true,
        renderCell: (row) => (
          <Badge variant={row.status === 'active' ? 'success' : 'error'} label={t(`admin.accounts.status.${row.status}`)} />
        ),
      },
      {
        key: 'actions',
        header: t('admin.proxies.columns.actions'),
        width: pixel(176),
        renderCell: (row) => (
          <HStack gap={1}>
            <IconButton
              label={t('admin.proxies.testConnection')}
              tooltip={t('admin.proxies.testConnection')}
              variant="ghost"
              icon={<Icon icon={CheckCircleIcon} />}
              isLoading={testingIds.has(row.id)}
              onClick={() => void runProxyTest(row.id, true)}
            />
            <IconButton
              label={t('admin.proxies.qualityCheck')}
              tooltip={t('admin.proxies.qualityCheck')}
              variant="ghost"
              icon={<Icon icon={ShieldCheckIcon} />}
              isLoading={qualityCheckingIds.has(row.id)}
              onClick={() => void handleQualityCheck(row)}
            />
            <IconButton
              label={t('common.edit')}
              tooltip={t('common.edit')}
              variant="ghost"
              icon={<Icon icon={PencilIcon} />}
              onClick={() => setEditingProxy(row)}
            />
            <IconButton
              label={t('common.delete')}
              tooltip={t('common.delete')}
              variant="ghost"
              icon={<Icon icon={TrashIcon} />}
              onClick={() => handleDelete(row)}
            />
          </HStack>
        ),
      },
    ],
    [
      t,
      visiblePasswordIds,
      testingIds,
      qualityCheckingIds,
      togglePasswordVisible,
      qualityOverallLabel,
      runProxyTest,
      handleQualityCheck,
      handleDelete,
    ],
  )

  const protocolOptions = [
    { value: '', label: t('admin.proxies.allProtocols') },
    { value: 'http', label: 'HTTP' },
    { value: 'https', label: 'HTTPS' },
    { value: 'socks5', label: 'SOCKS5' },
    { value: 'socks5h', label: 'SOCKS5H' },
  ]
  const statusOptions = [
    { value: '', label: t('admin.proxies.allStatus') },
    { value: 'active', label: t('admin.accounts.status.active') },
    { value: 'inactive', label: t('admin.accounts.status.inactive') },
    { value: 'expired', label: t('admin.proxies.expired') },
  ]

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>
            <Card padding={4}>
              <VStack gap={3}>
                <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={3}>
                  <TextInput
                    label={t('common.search')}
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder={t('admin.proxies.searchProxies')}
                    hasClear
                  />
                  <Selector
                    label={t('admin.proxies.filters.protocol')}
                    value={protocolFilter}
                    onChange={(value) => {
                      setProtocolFilter(value)
                      setPage(1)
                    }}
                    options={protocolOptions}
                  />
                  <Selector
                    label={t('admin.proxies.filters.status')}
                    value={statusFilter}
                    onChange={(value) => {
                      setStatusFilter(value as ProxyStatusFilter)
                      setPage(1)
                    }}
                    options={statusOptions}
                  />
                </Grid>
                <HStack gap={2} wrap="wrap" hAlign="end">
                  <IconButton
                    label={t('common.refresh')}
                    tooltip={t('common.refresh')}
                    icon={<Icon icon={ArrowPathIcon} />}
                    onClick={refreshAll}
                    isLoading={loading}
                  />
                  <Button
                    label={t('admin.proxies.testConnection')}
                    icon={<Icon icon={PlayIcon} />}
                    onClick={() => void handleBatchTest()}
                    isLoading={batchTesting}
                    isDisabled={loading}
                  />
                  <Button
                    label={t('admin.proxies.batchQualityCheck')}
                    icon={<Icon icon={ShieldCheckIcon} />}
                    onClick={() => void handleBatchQualityCheck()}
                    isLoading={batchQualityChecking}
                    isDisabled={loading}
                  />
                  <Button
                    label={t('admin.proxies.batchDeleteAction')}
                    variant="destructive"
                    icon={<Icon icon={TrashIcon} />}
                    onClick={() => setShowBatchDelete(true)}
                    isDisabled={selectedIds.size === 0}
                  />
                  <Button
                    label={t('admin.proxies.dataImport')}
                    icon={<Icon icon={ArrowUpTrayIcon} />}
                    onClick={() => setShowImport(true)}
                  />
                  <Button
                    label={selectedIds.size > 0 ? t('admin.proxies.dataExportSelected') : t('admin.proxies.dataExport')}
                    icon={<Icon icon={ArrowDownTrayIcon} />}
                    onClick={() => setShowExport(true)}
                  />
                  <Button
                    label={t('admin.proxies.createProxy')}
                    variant="primary"
                    icon={<Icon icon={PlusIcon} />}
                    onClick={() => setShowCreate(true)}
                  />
                </HStack>
              </VStack>
            </Card>

            <TableSelectionToolbar
              selection={{
                selectedKeys: new Set(Array.from(selectedIds, String)),
                selectedCount: selectedIds.size,
                hasSelection: selectedIds.size > 0,
                clearSelection: () => setSelectedIds(new Set()),
              }}
              renderSelectionLabel={(count) => t('astryx.proxiesAdmin.selectedCount', { count })}
              clearLabel={t('astryx.proxiesAdmin.clearSelection')}
            />

            <Card padding={0}>
              {loading && rows.length === 0 ? (
                <Center minHeight={400}>
                  <Spinner />
                </Center>
              ) : rows.length === 0 ? (
                <Center minHeight={400}>
                  <EmptyState
                    icon={<Icon icon={ServerIcon} />}
                    title={t('admin.proxies.noProxiesYet')}
                    description={t('admin.proxies.createFirstProxy')}
                    actions={
                      <Button
                        label={t('admin.proxies.createProxy')}
                        variant="primary"
                        icon={<Icon icon={PlusIcon} />}
                        onClick={() => setShowCreate(true)}
                      />
                    }
                  />
                </Center>
              ) : (
                <Table
                  columns={columns}
                  data={rows}
                  idKey="__id"
                  density="compact"
                  dividers="rows"
                  hasHover
                  plugins={{ selection: selectionPlugin, sort: sortPlugin, pagination: paginationPlugin }}
                />
              )}
            </Card>
          </VStack>

          <CreateProxyDialog
            isOpen={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={refreshAll}
            backupOptions={backupOptions}
          />
          <EditProxyDialog
            proxy={editingProxy}
            onClose={() => setEditingProxy(null)}
            onUpdated={refreshAll}
            backupOptions={backupOptions}
          />
          <QualityReportDialog
            proxy={qualityReportProxy}
            report={qualityReport}
            onClose={() => {
              setQualityReport(null)
              setQualityReportProxy(null)
            }}
          />
          <ProxyAccountsDialog proxy={accountsProxy} onClose={() => setAccountsProxy(null)} />
          <ImportProxyDataDialog
            isOpen={showImport}
            onClose={() => setShowImport(false)}
            onImported={() => {
              setShowImport(false)
              refreshAll()
            }}
          />
          <Dialog isOpen={showExport} onOpenChange={(open) => !open && setShowExport(false)} width={440}>
            <Layout
              header={
                <DialogHeader title={t('admin.proxies.dataExport')} onOpenChange={(open) => !open && setShowExport(false)} />
              }
              content={
                <LayoutContent>
                  <Text color="secondary">{t('admin.proxies.dataExportConfirmMessage')}</Text>
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <HStack gap={3} hAlign="end">
                    <Button label={t('common.cancel')} variant="secondary" onClick={() => setShowExport(false)} />
                    <Button
                      label={t('admin.proxies.dataExportConfirm')}
                      variant="primary"
                      isLoading={exporting}
                      onClick={() => void handleExportData()}
                    />
                  </HStack>
                </LayoutFooter>
              }
            />
          </Dialog>
          <AlertDialog
            isOpen={deletingProxy !== null}
            onOpenChange={(open) => !open && setDeletingProxy(null)}
            title={t('admin.proxies.deleteProxy')}
            description={t('admin.proxies.deleteConfirm', { name: deletingProxy?.name || '' })}
            actionLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            isActionLoading={deleting}
            onAction={() => void confirmDelete()}
          />
          <AlertDialog
            isOpen={showBatchDelete}
            onOpenChange={(open) => !open && setShowBatchDelete(false)}
            title={t('admin.proxies.batchDelete')}
            description={t('admin.proxies.batchDeleteConfirm', { count: selectedIds.size })}
            actionLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            isActionLoading={batchDeleting}
            onAction={() => void confirmBatchDelete()}
          />
        </LayoutContent>
      }
    />
  )
}
