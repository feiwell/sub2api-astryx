import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Code } from '@astryxdesign/core/Code'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '~/components/auth/StepUp'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type {
  BackupDownloadPart,
  BackupMonthlyArchiveConfig,
  BackupRecord,
  BackupS3Config,
  BackupScheduleConfig,
  ImageStorageConfig,
} from '~/lib/api/admin/backup'
import { toast } from '~/lib/toast'

type Translate = ReturnType<typeof useI18n>['t']
type ScheduleForm = Omit<BackupScheduleConfig, 'monthly_archive'>
type PollTimer = { current: ReturnType<typeof setInterval> | null }

interface BackupRow extends Record<string, unknown> {
  id: string
  record: BackupRecord
  size: string
  parts: string
  expires: string
  trigger: string
  started: string
}

const R2_ENDPOINT = 'https://<account_id>.r2.cloudflarestorage.com'
const DEFAULT_CRON = '0 2 * * *'
const MONTH_END = 'last'
const POLL_INTERVAL_MS = 2000
const MAX_POLL_COUNT = 900
const FIELD_COLUMNS = { minWidth: 280, max: 2 }

const DEFAULT_S3: BackupS3Config = {
  endpoint: '',
  region: 'auto',
  bucket: '',
  access_key_id: '',
  secret_access_key: '',
  prefix: 'backups/',
  force_path_style: false,
}

// Shares the S3 client with backups, so the default is to reuse the credentials
// configured for backups and only differ by prefix.
const DEFAULT_IMAGE_STORAGE: ImageStorageConfig = {
  enabled: false,
  reuse_backup_s3: true,
  bucket: '',
  prefix: 'images/',
  public_base_url: '',
  presign_expiry_hours: 24,
  max_download_bytes: 33554432,
  endpoint: '',
  region: 'auto',
  access_key_id: '',
  secret_access_key: '',
  force_path_style: false,
}

const DEFAULT_SCHEDULE: ScheduleForm = {
  enabled: false,
  cron_expr: DEFAULT_CRON,
  retain_days: 14,
  retain_count: 10,
}

const DEFAULT_ARCHIVE: BackupMonthlyArchiveConfig = {
  enabled: false,
  days: [1],
  include_month_end: false,
  retain_count: 0,
}

const STATUS_DOT: Record<BackupRecord['status'], 'success' | 'accent' | 'error' | 'neutral'> = {
  completed: 'success',
  running: 'accent',
  failed: 'error',
  pending: 'neutral',
}

function cloneArchive(config: BackupMonthlyArchiveConfig): BackupMonthlyArchiveConfig {
  return { ...config, days: [...config.days] }
}

function stopPoll(timer: PollTimer) {
  if (timer.current) {
    clearInterval(timer.current)
    timer.current = null
  }
}

// The API client flattens HTTP errors to a plain { status } object without a response field.
function errorStatus(error: unknown): number | undefined {
  const e = error as { status?: number; response?: { status?: number } } | null
  return e?.status ?? e?.response?.status
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function archiveDateLabels(archive: BackupMonthlyArchiveConfig, t: Translate): string[] {
  return [
    ...[...archive.days].sort((a, b) => a - b).map((day) => t('admin.backup.archive.day', { day })),
    ...(archive.include_month_end ? [t('admin.backup.archive.monthEnd')] : []),
  ]
}

// A retain count of zero is the wire representation of permanent retention.
function archiveRetentionLabel(retainCount: number, t: Translate): string {
  return retainCount === 0
    ? t('admin.backup.archive.forever')
    : t('admin.backup.archive.retainLatest', { count: retainCount })
}

function scheduleValidationError(
  schedule: ScheduleForm,
  archive: BackupMonthlyArchiveConfig,
  t: Translate,
): string {
  const counts = [schedule.retain_days, schedule.retain_count]
  if (archive.enabled) counts.push(archive.retain_count)
  if (!counts.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return t('admin.backup.archive.invalidRetention')
  }
  if (archive.enabled && !archive.days.length && !archive.include_month_end) {
    return t('admin.backup.archive.selectDates')
  }
  return ''
}

function retentionPreview(schedule: ScheduleForm, archive: BackupMonthlyArchiveConfig, t: Translate): string {
  const { retain_days: days, retain_count: count } = schedule
  const ordinary =
    days > 0 && count > 0
      ? t('admin.backup.schedule.previewBoth', { days, count })
      : days > 0
        ? t('admin.backup.schedule.previewDays', { days })
        : count > 0
          ? t('admin.backup.schedule.previewCount', { count })
          : t('admin.backup.schedule.previewUnlimited')
  if (!archive.enabled) return ordinary
  const dates = archiveDateLabels(archive, t).join(', ')
  const retention = archiveRetentionLabel(archive.retain_count, t)
  return `${ordinary} ${t('admin.backup.archive.preview', { dates, retention })}`
}

function RegionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: ReactNode
  actions?: ReactNode
}) {
  return (
    <HStack gap={4} vAlign="start" wrap="wrap">
      <StackItem size="fill">
        <VStack gap={1}>
          <Heading level={2}>{title}</Heading>
          <Text type="supporting">{description}</Text>
        </VStack>
      </StackItem>
      {actions}
    </HStack>
  )
}

function BackupStatus({ record }: { record: BackupRecord }) {
  const { t } = useI18n()
  const label =
    record.status === 'running' && record.progress
      ? t(`admin.backup.progress.${record.progress}`)
      : t(`admin.backup.status.${record.status}`)
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot
        variant={STATUS_DOT[record.status] ?? 'neutral'}
        label={label}
        isPulsing={record.status === 'running'}
      />
      <Text>{label}</Text>
    </HStack>
  )
}

/** Port of components/admin/BackupArchiveSettings.vue. */
function ArchiveSettings({
  value,
  onChange,
}: {
  value: BackupMonthlyArchiveConfig
  onChange: (next: BackupMonthlyArchiveConfig) => void
}) {
  const { t } = useI18n()
  // The count to go back to when "keep forever" is unchecked again.
  const lastFiniteCount = useRef(12)
  const forever = value.retain_count === 0

  useEffect(() => {
    if (Number.isInteger(value.retain_count) && value.retain_count > 0) {
      lastFiniteCount.current = value.retain_count
    }
  }, [value.retain_count])

  const update = (patch: Partial<BackupMonthlyArchiveConfig>) => onChange({ ...value, ...patch })

  const dateOptions = [
    ...Array.from({ length: 31 }, (_, index) => ({
      value: String(index + 1),
      label: t('admin.backup.archive.day', { day: index + 1 }),
    })),
    { value: MONTH_END, label: t('admin.backup.archive.monthEnd') },
  ]
  const selectedDates = [
    ...[...value.days].sort((a, b) => a - b).map(String),
    ...(value.include_month_end ? [MONTH_END] : []),
  ]

  return (
    <VStack gap={3} hAlign="stretch">
      <HStack gap={4} vAlign="center">
        <StackItem size="fill">
          <Heading level={3}>{t('admin.backup.archive.title')}</Heading>
        </StackItem>
        <CheckboxInput
          label={t('admin.backup.archive.enabled')}
          value={value.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </HStack>
      {value.enabled ? (
        <>
          <Grid columns={FIELD_COLUMNS} gap={4} align="start">
            <MultiSelector
              label={t('admin.backup.archive.dates')}
              description={t('admin.backup.archive.datesHint')}
              placeholder={t('admin.backup.archive.selectDates')}
              options={dateOptions}
              value={selectedDates}
              onChange={(values) =>
                update({
                  days: values
                    .filter((item) => item !== MONTH_END)
                    .map(Number)
                    .sort((a, b) => a - b),
                  include_month_end: values.includes(MONTH_END),
                })
              }
              triggerDisplay="badges"
              maxBadges={3}
              hasSearch
              searchPlaceholder={t('common.searchPlaceholder')}
            />
            <VStack gap={2} hAlign="stretch">
              <NumberInput
                label={t('admin.backup.archive.count')}
                description={t(forever ? 'admin.backup.archive.foreverHint' : 'admin.backup.archive.countHint')}
                units={t('admin.backup.archive.copies')}
                min={1}
                step={1}
                isIntegerOnly
                isDisabled={forever}
                value={forever || !Number.isFinite(value.retain_count) ? null : value.retain_count}
                onChange={(retain_count) => update({ retain_count })}
              />
              <CheckboxInput
                label={t('admin.backup.archive.forever')}
                value={forever}
                onChange={(checked) => update({ retain_count: checked ? 0 : lastFiniteCount.current })}
              />
            </VStack>
          </Grid>
          <VStack gap={1}>
            <Text type="supporting">{t('admin.backup.archive.fallbackHint')}</Text>
            <Text type="supporting">{t('admin.backup.archive.independentHint')}</Text>
          </VStack>
        </>
      ) : (
        <Text type="supporting">{t('admin.backup.archive.disabledHint')}</Text>
      )}
    </VStack>
  )
}

function GuideStep({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <VStack gap={2} hAlign="stretch">
      <Heading level={3}>{`${index}. ${title}`}</Heading>
      {children}
    </VStack>
  )
}

function GuideLines({ lines }: { lines: string[] }) {
  return (
    <List listStyle="decimal" density="compact">
      {lines.map((line) => (
        // A node label wraps; a string label would be cut to one line.
        <ListItem key={line} label={<Text>{line}</Text>} />
      ))}
    </List>
  )
}

function R2GuideDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose()
  }
  const configRows = [
    { field: t('admin.backup.s3.endpoint'), value: R2_ENDPOINT },
    { field: t('admin.backup.s3.region'), value: 'auto' },
    { field: t('admin.backup.s3.bucket'), value: t('admin.backup.r2Guide.step4.bucketValue') },
    { field: t('admin.backup.s3.prefix'), value: 'backups/' },
    { field: 'Access Key ID', value: t('admin.backup.r2Guide.step4.fromStep2') },
    { field: 'Secret Access Key', value: t('admin.backup.r2Guide.step4.fromStep2') },
    { field: t('admin.backup.s3.forcePathStyle'), value: t('admin.backup.r2Guide.step4.unchecked') },
  ]

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={672}>
      <Layout
        header={<DialogHeader title={t('admin.backup.r2Guide.title')} onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={5} hAlign="stretch">
              <Text color="secondary">{t('admin.backup.r2Guide.intro')}</Text>
              <GuideStep index={1} title={t('admin.backup.r2Guide.step1.title')}>
                <GuideLines
                  lines={[
                    t('admin.backup.r2Guide.step1.line1'),
                    t('admin.backup.r2Guide.step1.line2'),
                    t('admin.backup.r2Guide.step1.line3'),
                  ]}
                />
              </GuideStep>
              <GuideStep index={2} title={t('admin.backup.r2Guide.step2.title')}>
                <GuideLines
                  lines={[
                    t('admin.backup.r2Guide.step2.line1'),
                    t('admin.backup.r2Guide.step2.line2'),
                    t('admin.backup.r2Guide.step2.line3'),
                    t('admin.backup.r2Guide.step2.line4'),
                  ]}
                />
                <Banner status="warning" title={t('admin.backup.r2Guide.step2.warning')} />
              </GuideStep>
              <GuideStep index={3} title={t('admin.backup.r2Guide.step3.title')}>
                <Text>{t('admin.backup.r2Guide.step3.desc')}</Text>
                <Code>{`https://<${t('admin.backup.r2Guide.step3.accountId')}>.r2.cloudflarestorage.com`}</Code>
              </GuideStep>
              <GuideStep index={4} title={t('admin.backup.r2Guide.step4.title')}>
                <MetadataList label={{ position: 'start', width: 160 }}>
                  {configRows.map((row) => (
                    <MetadataListItem key={row.field} label={row.field}>
                      <Code>{row.value}</Code>
                    </MetadataListItem>
                  ))}
                </MetadataList>
              </GuideStep>
              <Banner status="info" title={t('admin.backup.r2Guide.freeTier')} />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack hAlign="end">
              <Button label={t('common.close')} variant="primary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

/**
 * Port of views/admin/BackupView.vue: backup S3 target, async image storage, schedule with
 * monthly archive, and the backup records with create / download / restore / delete.
 * Shown by the /admin/backup page and by the backup tab of the settings page.
 */
export function BackupPanel() {
  const { t } = useI18n()
  const stepUp = useStepUp()

  const [s3Form, setS3Form] = useState<BackupS3Config>(DEFAULT_S3)
  const [s3SecretConfigured, setS3SecretConfigured] = useState(false)
  const [savingS3, setSavingS3] = useState(false)
  const [testingS3, setTestingS3] = useState(false)

  const [imageForm, setImageForm] = useState<ImageStorageConfig>(DEFAULT_IMAGE_STORAGE)
  const [imageSecretConfigured, setImageSecretConfigured] = useState(false)
  const [savingImage, setSavingImage] = useState(false)
  const [testingImage, setTestingImage] = useState(false)

  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(DEFAULT_SCHEDULE)
  const [archiveForm, setArchiveForm] = useState<BackupMonthlyArchiveConfig>(DEFAULT_ARCHIVE)
  // Disabling hides the archive parameters, so a save while disabled keeps the
  // persisted parameters and only turns the rule off.
  const [savedArchive, setSavedArchive] = useState<BackupMonthlyArchiveConfig>(DEFAULT_ARCHIVE)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringId, setRestoringId] = useState('')
  const [manualExpireDays, setManualExpireDays] = useState(14)

  const [r2GuideOpen, setR2GuideOpen] = useState(false)
  const [downloadParts, setDownloadParts] = useState<BackupDownloadPart[]>([])
  const [downloadPartsOpen, setDownloadPartsOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)
  const [restorePassword, setRestorePassword] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Mirrors `backups` so polling and the visibility handler read the current list.
  const backupsRef = useRef<BackupRecord[]>([])
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const restorePollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const disposed = useRef(false)

  const showError = useCallback(
    (error: unknown) => {
      toast.error((error as { message?: string } | null)?.message || t('errors.networkError'))
    },
    [t],
  )

  // Shared message when the 2FA gate refuses a sensitive action outright.
  const reportStepUpBlocked = useCallback(
    (error: unknown): boolean => {
      if (!isStepUpBlocked(error)) return false
      toast.error(
        stepUpBlockReason(error) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
          ? t('stepUp.adminApiKeyForbidden')
          : t('stepUp.notEnabled'),
      )
      return true
    },
    [t],
  )

  const applyBackups = useCallback((update: (list: BackupRecord[]) => BackupRecord[]) => {
    backupsRef.current = update(backupsRef.current)
    setBackups(backupsRef.current)
  }, [])

  const updateRecord = useCallback(
    (updated: BackupRecord) => {
      applyBackups((list) => list.map((record) => (record.id === updated.id ? updated : record)))
    },
    [applyBackups],
  )

  const loadS3Config = useCallback(async () => {
    try {
      const cfg = await adminAPI.backup.getS3Config()
      setS3Form({
        endpoint: cfg.endpoint || '',
        region: cfg.region || 'auto',
        bucket: cfg.bucket || '',
        access_key_id: cfg.access_key_id || '',
        secret_access_key: '',
        prefix: cfg.prefix || 'backups/',
        force_path_style: Boolean(cfg.force_path_style),
      })
      setS3SecretConfigured(Boolean(cfg.access_key_id))
    } catch (error) {
      showError(error)
    }
  }, [showError])

  const loadImageStorageConfig = useCallback(async () => {
    try {
      const { config, secret_configured } = await adminAPI.backup.getImageStorageConfig()
      setImageForm({
        ...config,
        prefix: config.prefix || 'images/',
        region: config.region || 'auto',
        secret_access_key: '',
      })
      setImageSecretConfigured(secret_configured)
    } catch (error) {
      showError(error)
    }
  }, [showError])

  const loadSchedule = useCallback(async () => {
    try {
      const cfg = await adminAPI.backup.getSchedule()
      setScheduleForm({
        enabled: cfg.enabled,
        cron_expr: cfg.cron_expr || DEFAULT_CRON,
        retain_days: cfg.retain_days ?? 14,
        retain_count: cfg.retain_count ?? 10,
      })
      const archive: BackupMonthlyArchiveConfig = {
        enabled: cfg.monthly_archive?.enabled ?? false,
        days: cfg.monthly_archive?.days ?? [1],
        include_month_end: cfg.monthly_archive?.include_month_end ?? false,
        retain_count: cfg.monthly_archive?.retain_count ?? 0,
      }
      setArchiveForm(archive)
      setSavedArchive(cloneArchive(archive))
    } catch (error) {
      showError(error)
    }
  }, [showError])

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const result = await adminAPI.backup.listBackups()
      applyBackups(() => result.items || [])
    } catch (error) {
      showError(error)
    } finally {
      setLoadingBackups(false)
    }
  }, [applyBackups, showError])

  const poll = useCallback(
    (
      timer: PollTimer,
      backupId: string,
      onTimeout: () => void,
      isSettled: (record: BackupRecord) => boolean,
      onSettled: (record: BackupRecord) => void,
    ) => {
      if (disposed.current) return
      stopPoll(timer)
      let count = 0
      let busy = false
      timer.current = setInterval(async () => {
        if (busy) return
        if (count++ >= MAX_POLL_COUNT) {
          stopPoll(timer)
          onTimeout()
          return
        }
        busy = true
        try {
          const record = await adminAPI.backup.getBackup(backupId)
          if (disposed.current) return
          updateRecord(record)
          if (isSettled(record)) {
            stopPoll(timer)
            onSettled(record)
            await loadBackups()
          }
        } catch {
          // A failed poll must not end the polling.
        } finally {
          busy = false
        }
      }, POLL_INTERVAL_MS)
    },
    [loadBackups, updateRecord],
  )

  const startPolling = useCallback(
    (backupId: string) => {
      poll(
        pollTimer,
        backupId,
        () => {
          setCreatingBackup(false)
          toast.warning(t('admin.backup.operations.backupRunning'))
        },
        (record) => record.status === 'completed' || record.status === 'failed',
        (record) => {
          setCreatingBackup(false)
          if (record.status === 'completed') {
            toast.success(t('admin.backup.operations.backupCreated'))
          } else {
            toast.error(record.error_message || t('admin.backup.operations.backupFailed'))
          }
        },
      )
    },
    [poll, t],
  )

  const startRestorePolling = useCallback(
    (backupId: string) => {
      poll(
        restorePollTimer,
        backupId,
        () => {
          setRestoringId('')
          toast.warning(t('admin.backup.operations.restoreRunning'))
        },
        (record) => record.restore_status === 'completed' || record.restore_status === 'failed',
        (record) => {
          setRestoringId('')
          if (record.restore_status === 'completed') {
            toast.success(t('admin.backup.actions.restoreSuccess'))
          } else {
            toast.error(record.restore_error || t('admin.backup.operations.restoreFailed'))
          }
        },
      )
    },
    [poll, t],
  )

  // Picks up a backup or restore that is still running on the server.
  const resumePolling = useCallback(() => {
    const running = backupsRef.current.find((record) => record.status === 'running')
    if (running) {
      setCreatingBackup(true)
      startPolling(running.id)
    }
    const restoring = backupsRef.current.find((record) => record.restore_status === 'running')
    if (restoring) {
      setRestoringId(restoring.id)
      startRestorePolling(restoring.id)
    }
  }, [startPolling, startRestorePolling])

  useEffect(() => {
    disposed.current = false
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPoll(pollTimer)
        stopPoll(restorePollTimer)
      } else {
        void loadBackups().then(resumePolling)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void Promise.all([loadS3Config(), loadImageStorageConfig(), loadSchedule(), loadBackups()]).then(
      resumePolling,
    )
    return () => {
      disposed.current = true
      stopPoll(pollTimer)
      stopPoll(restorePollTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadBackups, loadImageStorageConfig, loadS3Config, loadSchedule, resumePolling])

  const patchS3 = (patch: Partial<BackupS3Config>) => setS3Form((form) => ({ ...form, ...patch }))
  const patchImage = (patch: Partial<ImageStorageConfig>) => setImageForm((form) => ({ ...form, ...patch }))
  const patchSchedule = (patch: Partial<ScheduleForm>) => setScheduleForm((form) => ({ ...form, ...patch }))

  const scheduleError = scheduleValidationError(scheduleForm, archiveForm, t)

  const runConnectionTest = async (
    test: () => Promise<{ ok: boolean; message: string }>,
    setTesting: (testing: boolean) => void,
  ) => {
    setTesting(true)
    try {
      const result = await test()
      if (result.ok) {
        toast.success(result.message || t('admin.backup.s3.testSuccess'))
      } else {
        toast.error(result.message || t('admin.backup.s3.testFailed'))
      }
    } catch (error) {
      showError(error)
    } finally {
      setTesting(false)
    }
  }

  const saveS3Config = async () => {
    setSavingS3(true)
    try {
      await stepUp.run(() => adminAPI.backup.updateS3Config(s3Form))
      toast.success(t('admin.backup.s3.saved'))
      await loadS3Config()
    } catch (error) {
      if (!isStepUpCancelled(error)) showError(error)
    } finally {
      setSavingS3(false)
    }
  }

  const saveImageStorageConfig = async () => {
    setSavingImage(true)
    try {
      await stepUp.run(() => adminAPI.backup.updateImageStorageConfig(imageForm))
      toast.success(t('admin.backup.imageStorage.saved'))
      await loadImageStorageConfig()
    } catch (error) {
      if (!isStepUpCancelled(error)) showError(error)
    } finally {
      setSavingImage(false)
    }
  }

  const saveSchedule = async () => {
    if (scheduleError) return
    setSavingSchedule(true)
    try {
      const archive = archiveForm.enabled
        ? cloneArchive(archiveForm)
        : { ...cloneArchive(savedArchive), enabled: false }
      await adminAPI.backup.updateSchedule({ ...scheduleForm, monthly_archive: archive })
      setSavedArchive(cloneArchive(archive))
      toast.success(t('admin.backup.schedule.saved'))
    } catch (error) {
      showError(error)
    } finally {
      setSavingSchedule(false)
    }
  }

  const createBackup = async () => {
    setCreatingBackup(true)
    try {
      const record = await stepUp.run(() => adminAPI.backup.createBackup({ expire_days: manualExpireDays }))
      applyBackups((list) => [record, ...list])
      startPolling(record.id)
    } catch (error) {
      setCreatingBackup(false)
      if (isStepUpCancelled(error) || reportStepUpBlocked(error)) return
      if (errorStatus(error) === 409) {
        toast.warning(t('admin.backup.operations.alreadyInProgress'))
      } else {
        showError(error)
      }
    }
  }

  const downloadBackup = async (id: string) => {
    try {
      const result = await stepUp.run(() => adminAPI.backup.getDownloadURL(id))
      if (result.parts && result.parts.length > 0) {
        setDownloadParts(result.parts)
        setDownloadPartsOpen(true)
        return
      }
      if (!result.url) throw new Error(t('admin.backup.actions.downloadFailed'))
      // The presigned URL carries an attachment disposition, so a same-page anchor navigation
      // starts the download. window.open would be blocked: awaiting the step-up dialog uses up
      // the transient user activation.
      const link = document.createElement('a')
      link.href = result.url
      link.rel = 'noopener'
      link.click()
    } catch (error) {
      if (isStepUpCancelled(error) || reportStepUpBlocked(error)) return
      showError(error)
    }
  }

  const closeRestore = () => {
    setRestoreTarget(null)
    setRestorePassword('')
  }

  const restoreBackup = async () => {
    if (!restoreTarget || !restorePassword) return
    const id = restoreTarget.id
    const password = restorePassword
    // Close first: the step-up prompt must not open on top of this dialog.
    closeRestore()
    setRestoringId(id)
    try {
      const record = await stepUp.run(() => adminAPI.backup.restoreBackup(id, password))
      updateRecord(record)
      startRestorePolling(id)
    } catch (error) {
      setRestoringId('')
      if (isStepUpCancelled(error) || reportStepUpBlocked(error)) return
      if (errorStatus(error) === 409) {
        toast.warning(t('admin.backup.operations.restoreRunning'))
      } else {
        showError(error)
      }
    }
  }

  const removeBackup = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adminAPI.backup.deleteBackup(deleteTarget.id, Boolean(deleteTarget.monthly_archive))
      toast.success(t('admin.backup.actions.deleted'))
      await loadBackups()
    } catch (error) {
      showError(error)
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const rows: BackupRow[] = backups.map((record) => ({
    id: record.id,
    record,
    size: formatSize(record.size_bytes),
    parts: String(record.parts?.length || (record.status === 'running' ? '-' : 1)),
    expires: record.monthly_archive
      ? archiveRetentionLabel(record.monthly_archive.retain_count, t)
      : record.expires_at
        ? formatDate(record.expires_at)
        : t('admin.backup.neverExpire'),
    trigger:
      record.triggered_by === 'scheduled' ? t('admin.backup.trigger.scheduled') : t('admin.backup.trigger.manual'),
    started: formatDate(record.started_at),
  }))

  const columns: TableColumn<BackupRow>[] = [
    {
      key: 'id',
      header: 'ID',
      width: proportional(1.25, { minWidth: 100 }),
      renderCell: (row) => <Code color="secondary">{row.id}</Code>,
    },
    {
      key: 'status',
      header: t('admin.backup.columns.status'),
      width: proportional(1, { minWidth: 80 }),
      renderCell: (row) => <BackupStatus record={row.record} />,
    },
    {
      key: 'file',
      header: t('admin.backup.columns.fileName'),
      width: proportional(2.6, { minWidth: 168 }),
      renderCell: ({ record }) => (
        <VStack gap={0.5} hAlign="start">
          <HStack gap={1.5} vAlign="center" wrap="wrap">
            <Text>{record.file_name}</Text>
            {record.monthly_archive && <Token size="sm" color="blue" label={t('admin.backup.archive.badge')} />}
          </HStack>
          {record.monthly_archive && <Text type="supporting">{record.monthly_archive.dates.join(' / ')}</Text>}
        </VStack>
      ),
    },
    { key: 'size', header: t('admin.backup.columns.size'), width: proportional(1.1, { minWidth: 88 }) },
    { key: 'parts', header: t('admin.backup.columns.parts'), width: proportional(0.75, { minWidth: 60 }) },
    { key: 'expires', header: t('admin.backup.columns.expiresAt'), width: proportional(1.25, { minWidth: 100 }) },
    { key: 'trigger', header: t('admin.backup.columns.triggeredBy'), width: proportional(1, { minWidth: 80 }) },
    { key: 'started', header: t('admin.backup.columns.startedAt'), width: proportional(1.25, { minWidth: 100 }) },
    {
      key: 'actions',
      header: t('admin.backup.columns.actions'),
      width: pixel(196),
      renderCell: ({ record }) => (
        <HStack gap={1} wrap="wrap">
          {record.status === 'completed' && (
            <Button
              size="sm"
              label={t('admin.backup.actions.download')}
              onClick={() => void downloadBackup(record.id)}
            />
          )}
          {record.status === 'completed' && (
            <Button
              size="sm"
              label={t('admin.backup.actions.restore')}
              isLoading={restoringId === record.id}
              onClick={() => setRestoreTarget(record)}
            />
          )}
          {record.status !== 'running' && (
            <Button
              size="sm"
              variant="destructive"
              label={t('common.delete')}
              onClick={() => setDeleteTarget(record)}
            />
          )}
        </HStack>
      ),
    },
  ]

  return (
    <>
      <VStack gap={6} hAlign="stretch">
        <VStack gap={4} hAlign="stretch">
          <RegionHeader
            title={t('admin.backup.s3.title')}
            description={
              <>
                {t('admin.backup.s3.descriptionPrefix')}{' '}
                <Link type="inherit" hasUnderline onClick={() => setR2GuideOpen(true)}>
                  Cloudflare R2
                </Link>
                {t('admin.backup.s3.descriptionSuffix')}
              </>
            }
          />
          <Grid columns={FIELD_COLUMNS} gap={4}>
            <TextInput
              label={t('admin.backup.s3.endpoint')}
              value={s3Form.endpoint}
              onChange={(endpoint) => patchS3({ endpoint })}
              placeholder={R2_ENDPOINT}
            />
            <TextInput
              label={t('admin.backup.s3.region')}
              value={s3Form.region}
              onChange={(region) => patchS3({ region })}
              placeholder="auto"
            />
            <TextInput
              label={t('admin.backup.s3.bucket')}
              value={s3Form.bucket}
              onChange={(bucket) => patchS3({ bucket })}
            />
            <TextInput
              label={t('admin.backup.s3.prefix')}
              value={s3Form.prefix}
              onChange={(prefix) => patchS3({ prefix })}
              placeholder="backups/"
            />
            <TextInput
              label={t('admin.backup.s3.accessKeyId')}
              value={s3Form.access_key_id}
              onChange={(access_key_id) => patchS3({ access_key_id })}
              autoComplete="off"
            />
            <TextInput
              type="password"
              label={t('admin.backup.s3.secretAccessKey')}
              value={s3Form.secret_access_key ?? ''}
              onChange={(secret_access_key) => patchS3({ secret_access_key })}
              placeholder={s3SecretConfigured ? t('admin.backup.s3.secretConfigured') : undefined}
              autoComplete="new-password"
            />
          </Grid>
          <CheckboxInput
            label={t('admin.backup.s3.forcePathStyle')}
            value={s3Form.force_path_style}
            onChange={(force_path_style) => patchS3({ force_path_style })}
          />
          <HStack gap={2} wrap="wrap">
            <Button
              label={t('admin.backup.s3.testConnection')}
              isLoading={testingS3}
              onClick={() => void runConnectionTest(() => adminAPI.backup.testS3Connection(s3Form), setTestingS3)}
            />
            <Button
              label={t('common.save')}
              variant="primary"
              isLoading={savingS3}
              onClick={() => void saveS3Config()}
            />
          </HStack>
        </VStack>
        <Divider />
        <VStack gap={4} hAlign="stretch">
          <RegionHeader
            title={t('admin.backup.imageStorage.title')}
            description={t('admin.backup.imageStorage.description')}
            actions={
              <CheckboxInput
                label={t('admin.backup.imageStorage.enabled')}
                value={imageForm.enabled}
                onChange={(enabled) => patchImage({ enabled })}
              />
            }
          />
          <CheckboxInput
            label={t('admin.backup.imageStorage.reuseBackupS3')}
            value={imageForm.reuse_backup_s3}
            onChange={(reuse_backup_s3) => patchImage({ reuse_backup_s3 })}
          />
          <Grid columns={FIELD_COLUMNS} gap={4}>
            <TextInput
              label={t('admin.backup.imageStorage.bucket')}
              value={imageForm.bucket}
              onChange={(bucket) => patchImage({ bucket })}
              placeholder={imageForm.reuse_backup_s3 ? t('admin.backup.imageStorage.bucketInherited') : undefined}
            />
            <TextInput
              label={t('admin.backup.imageStorage.prefix')}
              value={imageForm.prefix}
              onChange={(prefix) => patchImage({ prefix })}
              placeholder="images/"
            />
            {!imageForm.reuse_backup_s3 && (
              <>
                <TextInput
                  label={t('admin.backup.s3.endpoint')}
                  value={imageForm.endpoint}
                  onChange={(endpoint) => patchImage({ endpoint })}
                  placeholder={R2_ENDPOINT}
                />
                <TextInput
                  label={t('admin.backup.s3.region')}
                  value={imageForm.region}
                  onChange={(region) => patchImage({ region })}
                  placeholder="auto"
                />
                <TextInput
                  label={t('admin.backup.s3.accessKeyId')}
                  value={imageForm.access_key_id}
                  onChange={(access_key_id) => patchImage({ access_key_id })}
                  autoComplete="off"
                />
                <TextInput
                  type="password"
                  label={t('admin.backup.s3.secretAccessKey')}
                  value={imageForm.secret_access_key ?? ''}
                  onChange={(secret_access_key) => patchImage({ secret_access_key })}
                  placeholder={imageSecretConfigured ? t('admin.backup.s3.secretConfigured') : undefined}
                  autoComplete="new-password"
                />
              </>
            )}
          </Grid>
          {!imageForm.reuse_backup_s3 && (
            <CheckboxInput
              label={t('admin.backup.s3.forcePathStyle')}
              value={imageForm.force_path_style}
              onChange={(force_path_style) => patchImage({ force_path_style })}
            />
          )}
          <Grid columns={FIELD_COLUMNS} gap={4}>
            <TextInput
              label={t('admin.backup.imageStorage.publicBaseUrl')}
              value={imageForm.public_base_url}
              onChange={(public_base_url) => patchImage({ public_base_url })}
              placeholder={t('admin.backup.imageStorage.publicBaseUrlPlaceholder')}
            />
            <NumberInput
              label={t('admin.backup.imageStorage.presignExpiryHours')}
              value={imageForm.presign_expiry_hours}
              onChange={(presign_expiry_hours) => patchImage({ presign_expiry_hours })}
              min={1}
              isIntegerOnly
            />
          </Grid>
          <HStack gap={2} wrap="wrap">
            <Button
              label={t('admin.backup.s3.testConnection')}
              isLoading={testingImage}
              onClick={() =>
                void runConnectionTest(() => adminAPI.backup.testImageStorageConnection(imageForm), setTestingImage)
              }
            />
            <Button
              label={t('common.save')}
              variant="primary"
              isLoading={savingImage}
              onClick={() => void saveImageStorageConfig()}
            />
          </HStack>
        </VStack>
        <Divider />
        <VStack gap={5} hAlign="stretch">
          <RegionHeader
            title={t('admin.backup.schedule.title')}
            description={t('admin.backup.schedule.description')}
          />
          <VStack gap={4} hAlign="stretch">
            <CheckboxInput
              label={t('admin.backup.schedule.enabled')}
              value={scheduleForm.enabled}
              onChange={(enabled) => patchSchedule({ enabled })}
            />
            <Grid columns={FIELD_COLUMNS} gap={4}>
              <TextInput
                label={t('admin.backup.schedule.cronExpr')}
                description={t('admin.backup.schedule.cronHint')}
                value={scheduleForm.cron_expr}
                onChange={(cron_expr) => patchSchedule({ cron_expr })}
                placeholder={DEFAULT_CRON}
              />
            </Grid>
          </VStack>
          <VStack gap={3} hAlign="stretch">
            <Heading level={3}>{t('admin.backup.schedule.ordinaryRetention')}</Heading>
            <Grid columns={FIELD_COLUMNS} gap={4}>
              <NumberInput
                label={t('admin.backup.schedule.retainDays')}
                description={t('admin.backup.schedule.retainDaysHint')}
                value={scheduleForm.retain_days}
                onChange={(retain_days) => patchSchedule({ retain_days })}
                min={0}
                step={1}
                isIntegerOnly
              />
              <NumberInput
                label={t('admin.backup.schedule.retainCount')}
                description={t('admin.backup.schedule.retainCountHint')}
                value={scheduleForm.retain_count}
                onChange={(retain_count) => patchSchedule({ retain_count })}
                min={0}
                step={1}
                isIntegerOnly
              />
            </Grid>
            <Text type="supporting">{t('admin.backup.schedule.ordinaryHint')}</Text>
          </VStack>
          <ArchiveSettings value={archiveForm} onChange={setArchiveForm} />
          {scheduleError ? (
            <Banner status="error" title={scheduleError} />
          ) : (
            <Card variant="muted" padding={3}>
              <VStack gap={1}>
                <Text weight="medium">{t('admin.backup.schedule.preview')}</Text>
                <Text>{retentionPreview(scheduleForm, archiveForm, t)}</Text>
              </VStack>
            </Card>
          )}
          <HStack>
            <Button
              label={t('common.save')}
              variant="primary"
              isLoading={savingSchedule}
              isDisabled={Boolean(scheduleError)}
              onClick={() => void saveSchedule()}
            />
          </HStack>
        </VStack>
        <Divider />
        <VStack gap={4} hAlign="stretch">
          <RegionHeader
            title={t('admin.backup.operations.title')}
            description={t('admin.backup.operations.description')}
            actions={
              <HStack gap={2} vAlign="end" wrap="wrap">
                <NumberInput
                  label={t('admin.backup.operations.expireDays')}
                  value={manualExpireDays}
                  onChange={setManualExpireDays}
                  min={0}
                  isIntegerOnly
                  width={120}
                />
                <Button
                  label={
                    creatingBackup ? t('admin.backup.operations.backing') : t('admin.backup.operations.createBackup')
                  }
                  variant="primary"
                  isLoading={creatingBackup}
                  onClick={() => void createBackup()}
                />
                <Button label={t('common.refresh')} isLoading={loadingBackups} onClick={() => void loadBackups()} />
              </HStack>
            }
          />
          <Table<BackupRow>
            data={rows}
            columns={columns}
            idKey="id"
            density="compact"
            verticalAlign="top"
            emptyState={
              <Center padding={8}>
                {loadingBackups ? (
                  <Spinner label={t('common.loading')} />
                ) : (
                  <EmptyState title={t('admin.backup.empty')} isCompact />
                )}
              </Center>
            }
          />
        </VStack>
      </VStack>

      <R2GuideDialog isOpen={r2GuideOpen} onClose={() => setR2GuideOpen(false)} />

      <Dialog isOpen={downloadPartsOpen} onOpenChange={setDownloadPartsOpen} width={512}>
        <Layout
          header={<DialogHeader title={t('admin.backup.actions.downloadParts')} onOpenChange={setDownloadPartsOpen} />}
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <Text color="secondary">{t('admin.backup.actions.downloadPartsHint')}</Text>
                <List hasDividers>
                  {downloadParts.map((part) => (
                    <ListItem
                      key={part.index}
                      label={t('admin.backup.actions.partLabel', { index: part.index })}
                      description={formatSize(part.size_bytes)}
                      endContent={
                        <Button
                          size="sm"
                          label={t('admin.backup.actions.download')}
                          href={part.url}
                          rel="noopener"
                        />
                      }
                    />
                  ))}
                </List>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button label={t('common.close')} variant="primary" onClick={() => setDownloadPartsOpen(false)} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <Dialog
        isOpen={restoreTarget !== null}
        onOpenChange={(open) => !open && closeRestore()}
        purpose="form"
        width={440}
      >
        <Layout
          header={
            <DialogHeader
              title={t('admin.backup.actions.restore')}
              subtitle={restoreTarget?.file_name}
              onOpenChange={(open) => !open && closeRestore()}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <Banner status="warning" title={t('admin.backup.actions.restoreConfirm')} />
                <TextInput
                  type="password"
                  label={t('admin.backup.actions.restorePasswordPrompt')}
                  value={restorePassword}
                  onChange={setRestorePassword}
                  onEnter={() => void restoreBackup()}
                  autoComplete="current-password"
                  hasAutoFocus
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" onClick={closeRestore} />
                <Button
                  label={t('admin.backup.actions.restore')}
                  variant="destructive"
                  isDisabled={!restorePassword}
                  onClick={() => void restoreBackup()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        title={deleteTarget ? `${t('common.delete')} ${deleteTarget.file_name}` : ''}
        description={
          deleteTarget
            ? t(
                deleteTarget.monthly_archive
                  ? 'admin.backup.archive.deleteConfirm'
                  : 'admin.backup.actions.deleteConfirm',
              )
            : ''
        }
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void removeBackup()}
      />

      {stepUp.dialog}
    </>
  )
}

export function AdminBackupPage() {
  const { t } = useI18n()
  return (
    <Page title={t('admin.backup.title')} description={t('admin.backup.description')}>
      <BackupPanel />
    </Page>
  )
}
