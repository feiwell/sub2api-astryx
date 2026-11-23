import { useEffect, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Grid } from '@astryxdesign/core/Grid'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useI18n } from '~/i18n'
import { opsAPI } from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import { errorMessage } from './errors'
import {
  DEFAULT_RUNTIME_LOG_SETTINGS,
  KEEP_FOREVER,
  MAX_RETENTION_DAYS,
  RETENTION_PRESETS,
  isRetentionValid,
  runtimeLogSettings,
  type RuntimeLogSettings,
} from './systemLogs'

type Level = RuntimeLogSettings['level']
type StacktraceLevel = RuntimeLogSettings['stacktrace_level']
type Action = 'save' | 'reset'

const LEVELS: Level[] = ['debug', 'info', 'warn', 'error']
const STACKTRACE_LEVELS: StacktraceLevel[] = ['none', 'error', 'fatal']
const CUSTOM = 'custom'

// The levels are the names the server's configuration uses: they are shown as they are.
const named = (names: readonly string[]) => names.map((name) => ({ value: name, label: name }))

/** How many days logs are kept: the usual lengths by name, any other as a number. */
function RetentionField({
  label,
  hint,
  value,
  hasForever = false,
  onChange,
}: {
  label: string
  hint: string
  value: number
  /** Offers "keep for good" beside the lengths in days. */
  hasForever?: boolean
  onChange: (days: number) => void
}) {
  const { t } = useI18n()
  // "Custom" stays chosen while its number happens to be one of the usual lengths.
  const [isCustom, setCustom] = useState(false)
  const isListed = RETENTION_PRESETS.includes(value) || (hasForever && value === KEEP_FOREVER)
  const selection = isCustom || !isListed ? CUSTOM : String(value)
  const customLabel = t('admin.ops.systemLogs.retentionDaysCustom')

  return (
    <VStack gap={2}>
      <Selector
        label={label}
        width="100%"
        value={selection}
        onChange={(next) => {
          if (next == null) return
          setCustom(next === CUSTOM)
          if (next !== CUSTOM) onChange(Number(next))
        }}
        options={[
          ...(hasForever
            ? [{ value: String(KEEP_FOREVER), label: t('admin.ops.systemLogs.retentionForever') }]
            : []),
          ...RETENTION_PRESETS.map((days) => ({
            value: String(days),
            label: t('admin.ops.systemLogs.retentionDaysOption', { days }),
          })),
          { value: CUSTOM, label: customLabel },
        ]}
      />
      {selection === CUSTOM && (
        <NumberInput
          label={`${label}: ${customLabel}`}
          isLabelHidden
          width="100%"
          value={value}
          min={1}
          max={MAX_RETENTION_DAYS}
          step={1}
          isIntegerOnly
          onChange={onChange}
        />
      )}
      <Text type="supporting" color="secondary">
        {hint}
      </Text>
    </VStack>
  )
}

/** The log settings the server applies at once, without a restart: level, sampling, and how long logs are kept. */
export function OpsLogConfigPanel({
  onReset,
}: {
  /** The server went back to its startup settings; the figures of its log writer may have moved with them. */
  onReset: () => void
}) {
  const { t } = useI18n()
  const [settings, setSettings] = useState<RuntimeLogSettings>(DEFAULT_RUNTIME_LOG_SETTINGS)
  const [isLoading, setLoading] = useState(true)
  // Until the server's settings are known the form holds placeholders: saving them would overwrite the real ones.
  const [isLoaded, setLoaded] = useState(false)
  const [hasLoadFailed, setLoadFailed] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [isConfirmingReset, setConfirmingReset] = useState(false)
  // Counts the resets. The retention fields start over after each one: a "custom" chosen before
  // would otherwise stay chosen over the server's own length.
  const [resetCount, setResetCount] = useState(0)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    opsAPI
      .getRuntimeLogConfig()
      .then((config) => {
        if (isStale) return
        setSettings(runtimeLogSettings(config))
        setLoaded(true)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load runtime log config', error)
        setLoadFailed(true)
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [])

  const change = (patch: Partial<RuntimeLogSettings>) => setSettings((current) => ({ ...current, ...patch }))

  const save = () => {
    if (!isLoaded || isLoading || action) return
    if (!isRetentionValid(settings)) {
      toast.error(t('admin.ops.systemLogs.retentionDaysInvalid'))
      return
    }
    setAction('save')
    opsAPI
      .updateRuntimeLogConfig({ ...settings })
      .then((saved) => {
        setSettings(runtimeLogSettings(saved))
        toast.success(t('admin.ops.systemLogs.runtimeConfigActive'))
      })
      .catch((error) => {
        console.error('[ops] failed to save runtime log config', error)
        toast.error(errorMessage(error) || t('admin.ops.systemLogs.runtimeConfigSaveFailed'))
      })
      .finally(() => setAction(null))
  }

  const reset = () => {
    if (action) return
    setAction('reset')
    opsAPI
      .resetRuntimeLogConfig()
      .then((saved) => {
        setSettings(runtimeLogSettings(saved))
        // The answer holds the server's settings: the form is as good as loaded.
        setLoaded(true)
        setLoadFailed(false)
        setResetCount((count) => count + 1)
        toast.success(t('admin.ops.systemLogs.runtimeConfigReset'))
        onReset()
      })
      .catch((error) => {
        console.error('[ops] failed to reset runtime log config', error)
        toast.error(errorMessage(error) || t('admin.ops.systemLogs.runtimeConfigResetFailed'))
      })
      .finally(() => {
        setAction(null)
        setConfirmingReset(false)
      })
  }

  return (
    <VStack gap={4}>
      {isLoading && (
        <HStack gap={2} vAlign="center">
          <Spinner size="sm" />
          <Text type="supporting" color="secondary">
            {t('common.loading')}
          </Text>
        </HStack>
      )}
      {hasLoadFailed && <Banner status="error" title={t('admin.ops.systemLogs.runtimeConfigLoadFailed')} />}

      <Grid columns={{ minWidth: 200, max: 4 }} gap={3}>
        <Selector
          label={t('admin.ops.systemLogs.level')}
          width="100%"
          value={settings.level}
          onChange={(value) => change({ level: value as Level })}
          options={named(LEVELS)}
        />
        <Selector
          label={t('admin.ops.systemLogs.stacktraceThreshold')}
          width="100%"
          value={settings.stacktrace_level}
          onChange={(value) => change({ stacktrace_level: value as StacktraceLevel })}
          options={named(STACKTRACE_LEVELS)}
        />
        <NumberInput
          label={t('admin.ops.systemLogs.samplingInitial')}
          width="100%"
          value={settings.sampling_initial}
          min={1}
          step={1}
          isIntegerOnly
          onChange={(value) => change({ sampling_initial: value })}
        />
        <NumberInput
          label={t('admin.ops.systemLogs.samplingThereafter')}
          width="100%"
          value={settings.sampling_thereafter}
          min={1}
          step={1}
          isIntegerOnly
          onChange={(value) => change({ sampling_thereafter: value })}
        />
      </Grid>

      <Grid columns={{ minWidth: 260, max: 2 }} gap={3}>
        <RetentionField
          key={`ops-${resetCount}`}
          label={t('admin.ops.systemLogs.retentionDays')}
          hint={t('admin.ops.systemLogs.retentionDaysHint')}
          value={settings.retention_days}
          onChange={(days) => change({ retention_days: days })}
        />
        <RetentionField
          key={`requests-${resetCount}`}
          label={t('admin.ops.systemLogs.requestRetentionDays')}
          hint={t('admin.ops.systemLogs.requestRetentionDaysHint')}
          value={settings.request_retention_days}
          hasForever
          onChange={(days) => change({ request_retention_days: days })}
        />
      </Grid>

      <VStack gap={2}>
        <CheckboxInput
          label={t('admin.ops.systemLogs.caller')}
          value={settings.caller}
          onChange={(checked) => change({ caller: checked })}
        />
        <CheckboxInput
          label={t('admin.ops.systemLogs.sampling')}
          value={settings.enable_sampling}
          onChange={(checked) => change({ enable_sampling: checked })}
        />
        <CheckboxInput
          label={t('admin.ops.systemLogs.persistAccessLogs')}
          description={t('admin.ops.systemLogs.persistAccessLogsHint')}
          value={settings.persist_access_logs}
          onChange={(checked) => change({ persist_access_logs: checked })}
        />
      </VStack>

      <HStack gap={2} wrap="wrap">
        <Button
          label={t('admin.ops.systemLogs.saveAndApply')}
          variant="primary"
          isLoading={action === 'save'}
          isDisabled={isLoading || !isLoaded || action === 'reset'}
          onClick={save}
        />
        <Button
          label={t('admin.ops.systemLogs.resetDefaults')}
          variant="secondary"
          isDisabled={action != null}
          onClick={() => setConfirmingReset(true)}
        />
      </HStack>

      <AlertDialog
        isOpen={isConfirmingReset}
        onOpenChange={(open) => {
          if (!open && action !== 'reset') setConfirmingReset(false)
        }}
        title={t('admin.ops.systemLogs.resetDefaults')}
        description={t('admin.ops.systemLogs.resetRuntimeConfigConfirm')}
        actionLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        actionVariant="primary"
        isActionLoading={action === 'reset'}
        onAction={reset}
      />
    </VStack>
  )
}
