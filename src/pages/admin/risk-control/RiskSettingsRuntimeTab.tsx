import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TrashIcon } from '@heroicons/react/24/outline'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { toast } from '~/lib/toast'
import { SETTING_RANGES } from './riskForm'
import { formatCount } from './riskFormat'
import { FIELD_COLUMNS, SettingNumber, SettingToggle, SettingsHeading } from './RiskSettingsParts'
import type { RiskControl } from './useRiskControl'
import type { RiskSettings } from './useRiskSettings'

// A flagged input is told by its SHA-256, written as 64 hex digits.
const INPUT_HASH = /^[a-fA-F0-9]{64}$/

/**
 * The stored hashes of inputs the audit flagged. Deleting one, or all, is done at once: it is not
 * part of the draft and does not wait for the save.
 */
function FlaggedHashes({ control }: { control: RiskControl }) {
  const { t, locale } = useI18n()
  const [hash, setHash] = useState('')
  const [isBusy, setBusy] = useState(false)
  const [isConfirmingClear, setConfirmingClear] = useState(false)
  const count = control.status?.flagged_hash_count ?? 0

  const deleteOne = async () => {
    if (!INPUT_HASH.test(hash) || isBusy) return
    setBusy(true)
    try {
      const result = await adminAPI.riskControl.deleteFlaggedHash(hash)
      setHash('')
      await control.syncStatus()
      toast.success(
        result.deleted ? t('admin.riskControl.flaggedHashDeleted') : t('admin.riskControl.flaggedHashNotFound'),
      )
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.riskControl.flaggedHashDeleteFailed')))
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    if (isBusy) return
    setBusy(true)
    try {
      const result = await adminAPI.riskControl.clearFlaggedHashes()
      await control.syncStatus()
      setConfirmingClear(false)
      toast.success(t('admin.riskControl.flaggedHashesCleared', { count: result.deleted }))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('admin.riskControl.flaggedHashesClearFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <VStack gap={3}>
      <SettingsHeading
        level={5}
        title={t('admin.riskControl.flaggedHashCount', { count: formatCount(count, locale) })}
        hint={t('admin.riskControl.flaggedHashHint')}
        actions={
          <Button
            variant="destructive"
            icon={<Icon icon={TrashIcon} />}
            label={t('admin.riskControl.clearFlaggedHashes')}
            isDisabled={isBusy || count === 0}
            onClick={() => setConfirmingClear(true)}
          />
        }
      />
      <HStack gap={2} vAlign="end" wrap="wrap">
        <StackItem size="fill">
          <TextInput
            label={t('admin.riskControl.flaggedHashPlaceholder')}
            isLabelHidden
            width="100%"
            value={hash}
            onChange={(value) => setHash(value.trim())}
            placeholder={t('admin.riskControl.flaggedHashPlaceholder')}
            hasSpellCheck={false}
          />
        </StackItem>
        <Button
          icon={<Icon icon={TrashIcon} />}
          label={t('admin.riskControl.deleteFlaggedHash')}
          isLoading={isBusy && !isConfirmingClear}
          isDisabled={!INPUT_HASH.test(hash)}
          onClick={() => void deleteOne()}
        />
      </HStack>

      <AlertDialog
        isOpen={isConfirmingClear}
        onOpenChange={(open) => {
          // A clearing on its way is not abandoned by closing: its outcome still has to be told.
          if (!open && !isBusy) setConfirmingClear(false)
        }}
        title={t('admin.riskControl.clearFlaggedHashes')}
        description={t('admin.riskControl.clearFlaggedHashesConfirm')}
        actionLabel={t('admin.riskControl.clearFlaggedHashes')}
        cancelLabel={t('common.cancel')}
        isActionLoading={isBusy}
        onAction={() => void clearAll()}
      />
    </VStack>
  )
}

/** How much the audit workers may take on, what they record, and the hashes that block repeats. */
export function RiskSettingsRuntimeTab({ settings, control }: { settings: RiskSettings; control: RiskControl }) {
  const { t } = useI18n()
  const { draft } = settings

  return (
    <VStack gap={4}>
      <Grid columns={FIELD_COLUMNS} gap={4}>
        <SettingNumber
          settings={settings}
          field="worker_count"
          label={t('admin.riskControl.workerCount')}
          value={draft.worker_count}
          {...SETTING_RANGES.worker_count}
          onChange={(worker_count) => settings.edit({ worker_count })}
        />
        <SettingNumber
          settings={settings}
          field="queue_size"
          label={t('admin.riskControl.queueSize')}
          value={draft.queue_size}
          {...SETTING_RANGES.queue_size}
          onChange={(queue_size) => settings.edit({ queue_size })}
        />
      </Grid>
      <SettingToggle
        label={t('admin.riskControl.recordNonHits')}
        hint={t('admin.riskControl.recordNonHitsHint')}
        value={draft.record_non_hits}
        onChange={(record_non_hits) => settings.edit({ record_non_hits })}
      />
      {/* The switch and the hashes it compares against, together: the hashes only block while it is on. */}
      <Card variant="muted" padding={4}>
        <VStack gap={4}>
          <SettingToggle
            label={t('admin.riskControl.preHashCheck')}
            hint={t('admin.riskControl.preHashCheckHint')}
            value={draft.pre_hash_check_enabled}
            onChange={(pre_hash_check_enabled) => settings.edit({ pre_hash_check_enabled })}
          />
          <Divider />
          <FlaggedHashes control={control} />
        </VStack>
      </Card>
    </VStack>
  )
}
