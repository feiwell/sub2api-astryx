import { useEffect, useRef, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid } from '@astryxdesign/core/Grid'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { PromptDeletePreview, PromptEventFilters } from '@/features/prompt-audit/types'
import {
  DELETE_RANGE_PRESETS,
  cloneData,
  hasExplicitDeleteRange,
  resolveDeleteRangeFilters,
  type DeleteRangePreset,
} from '@/features/prompt-audit/viewModel'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { deleteEventsByFilter, previewDelete } from './api'
import { auditErrorMessage, formatAuditDate } from './eventText'
import { DecisionField, IdField, RiskField, TimeField } from './filterFields'

/** What the server counted, and the exact filters it counted for: the delete must repeat them. */
interface Preview {
  result: PromptDeletePreview
  filters: PromptEventFilters
}

/**
 * Deletes every event matching a time range and a few conditions. The server counts first and
 * hands out a token; the delete carries that token, so it removes what was counted and nothing newer.
 */
export function AuditFilterDeleteDialog({
  initialFilters,
  onClose,
  onDeleted,
}: {
  /** What the list's filter fields hold: the dialog starts from them, shown or not. */
  initialFilters: PromptEventFilters
  onClose: () => void
  onDeleted: () => void
}) {
  const { t, locale } = useI18n()
  // Only a range typed into the list is taken over; otherwise seven days, never "everything".
  const [preset, setPreset] = useState<DeleteRangePreset>(() =>
    hasExplicitDeleteRange(initialFilters) ? 'custom' : '7d',
  )
  const [criteria, setCriteria] = useState<PromptEventFilters>(() => cloneData(initialFilters))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [isPreviewing, setPreviewing] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  // Counts the changes to the criteria: a preview asked for before the last change is thrown away.
  const criteriaVersion = useRef(0)
  const isOpen = useRef(true)
  useEffect(() => {
    isOpen.current = true
    return () => {
      isOpen.current = false
    }
  }, [])

  const isRangeValid = preset !== 'custom' || hasExplicitDeleteRange(criteria)
  const hasNoMatches = preview != null && preview.result.matched_count === 0
  const isBusy = isPreviewing || isDeleting
  const isConfirmDisabled = !isRangeValid || isBusy || hasNoMatches
  const disabledReason = isBusy
    ? ''
    : !isRangeValid
      ? t('admin.promptAudit.events.filterDeleteConfirmInvalidRange')
      : hasNoMatches
        ? t('admin.promptAudit.events.filterDeleteConfirmNoMatches')
        : ''

  // Any change makes the count stale: the server would refuse its token for other filters.
  const invalidate = () => {
    criteriaVersion.current += 1
    setPreview(null)
  }
  const edit = (patch: Partial<PromptEventFilters>) => {
    setCriteria((current) => ({ ...current, ...patch }))
    invalidate()
  }
  const choosePreset = (next: string) => {
    setPreset(next as DeleteRangePreset)
    invalidate()
  }

  const requestPreview = () => {
    if (!isRangeValid || isBusy) return
    const filters = resolveDeleteRangeFilters(criteria, preset)
    const version = criteriaVersion.current
    setPreviewing(true)
    previewDelete(filters)
      .then((result) => {
        if (isOpen.current && version === criteriaVersion.current) setPreview({ result, filters })
      })
      .catch((error) => {
        if (!isOpen.current) return
        console.error('[prompt-audit] failed to preview the delete by filter', error)
        setPreview(null)
        toast.error(auditErrorMessage(error, 'admin.promptAudit.errors.previewDelete'))
      })
      .finally(() => {
        if (isOpen.current) setPreviewing(false)
      })
  }

  const confirm = async () => {
    if (isConfirmDisabled) return
    setDeleting(true)
    try {
      let target = preview
      // No count on screen (never asked, or dropped by a change): get the token now and delete in one go.
      if (!target) {
        const filters = resolveDeleteRangeFilters(criteria, preset)
        target = { result: await previewDelete(filters), filters }
      }
      const answer = await deleteEventsByFilter(target.filters, target.result)
      toast.success(t('admin.promptAudit.messages.deleted', { count: answer.deleted_events }))
      onDeleted()
    } catch (error) {
      console.error('[prompt-audit] failed to delete by filter', error)
      if (isOpen.current) setPreview(null)
      toast.error(auditErrorMessage(error, 'admin.promptAudit.errors.deleteConfirmation'))
    } finally {
      if (isOpen.current) setDeleting(false)
    }
  }

  // A delete on its way cannot be called back: the dialog stays until the server answered.
  const reportOpen = (open: boolean) => {
    if (!open && !isDeleting) onClose()
  }

  const rangeStatus = isRangeValid
    ? undefined
    : ({ type: 'error', message: t('admin.promptAudit.events.customRangeInvalid') } as const)

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={720} maxHeight="90dvh" purpose="form">
      <Layout
        header={<DialogHeader title={t('admin.promptAudit.events.filterDeleteDialogTitle')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            <VStack gap={5}>
              <Text type="supporting" color="secondary">
                {t('admin.promptAudit.events.filterDeleteDialogDesc')}
              </Text>

              <VStack gap={3}>
                <RadioList
                  label={t('admin.promptAudit.events.filterTimeRange')}
                  description={t('admin.promptAudit.events.filterTimeRangeHint')}
                  orientation="horizontal"
                  value={preset}
                  onChange={choosePreset}
                >
                  {DELETE_RANGE_PRESETS.map((option) => (
                    <RadioListItem
                      key={option.id}
                      value={option.id}
                      label={t(`admin.promptAudit.events.timePresets.${option.id}`)}
                    />
                  ))}
                </RadioList>
                {preset === 'custom' && (
                  // The two fields do not limit each other: a range the wrong way round is told in this
                  // dialog's own words below, where a limit would answer in the date field's.
                  <Grid columns={{ minWidth: 240 }} gap={3}>
                    <TimeField
                      label={t('admin.promptAudit.events.startAt')}
                      value={criteria.start_at}
                      status={rangeStatus && { type: 'error' }}
                      onChange={(value) => edit({ start_at: value })}
                    />
                    <TimeField
                      label={t('admin.promptAudit.events.endAt')}
                      value={criteria.end_at}
                      status={rangeStatus}
                      onChange={(value) => edit({ end_at: value })}
                    />
                  </Grid>
                )}
              </VStack>

              <Grid columns={{ minWidth: 240 }} gap={3}>
                <DecisionField value={criteria.decision} onChange={(value) => edit({ decision: value })} />
                <RiskField value={criteria.risk_level} onChange={(value) => edit({ risk_level: value })} />
              </Grid>

              <Collapsible
                trigger={<Text weight="medium">{t('admin.promptAudit.events.moreConditions')}</Text>}
                defaultIsOpen={false}
              >
                <Grid columns={{ minWidth: 240 }} gap={3}>
                  <TextInput
                    label={t('admin.promptAudit.events.endpoint')}
                    width="100%"
                    value={criteria.endpoint}
                    onChange={(value) => edit({ endpoint: value })}
                  />
                  <TextInput
                    label={t('admin.promptAudit.events.keyword')}
                    width="100%"
                    value={criteria.keyword}
                    onChange={(value) => edit({ keyword: value })}
                  />
                  <IdField
                    label={t('admin.promptAudit.events.groupId')}
                    value={criteria.group_id}
                    onChange={(value) => edit({ group_id: value })}
                  />
                  <IdField
                    label={t('admin.promptAudit.events.userId')}
                    value={criteria.user_id}
                    onChange={(value) => edit({ user_id: value })}
                  />
                </Grid>
              </Collapsible>

              {preview ? (
                <Card variant="muted" padding={4}>
                  <VStack gap={3}>
                    <Text weight="semibold">
                      {t('admin.promptAudit.events.filterDeleteCount', { count: preview.result.matched_count })}
                    </Text>
                    <MetadataList columns="single">
                      <MetadataListItem label={t('admin.promptAudit.events.snapshotMax')}>
                        <Text hasTabularNumbers>{preview.result.snapshot_max_id}</Text>
                      </MetadataListItem>
                      <MetadataListItem label="Filter SHA-256">
                        <Text type="code" wordBreak="break-all">
                          {preview.result.filter_hash}
                        </Text>
                      </MetadataListItem>
                      <MetadataListItem label={t('admin.promptAudit.events.expiresAt')}>
                        <Text>{formatAuditDate(preview.result.expires_at, locale, 'medium')}</Text>
                      </MetadataListItem>
                    </MetadataList>
                    <Banner status="warning" title={t('admin.promptAudit.events.filterDeleteWarning')} />
                  </VStack>
                </Card>
              ) : (
                // It says the delete can be confirmed right away, which an invalid range does not allow.
                isRangeValid && (
                  <Text type="supporting" color="secondary">
                    {t('admin.promptAudit.events.filterDeleteNeedPreview')}
                  </Text>
                )
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign={disabledReason ? 'between' : 'end'} vAlign="center" wrap="wrap">
              {disabledReason && (
                <Text type="supporting" color="secondary">
                  {disabledReason}
                </Text>
              )}
              <HStack gap={2} wrap="wrap">
                <Button label={t('common.cancel')} variant="secondary" isDisabled={isDeleting} onClick={onClose} />
                <Button
                  label={
                    isPreviewing
                      ? t('admin.promptAudit.events.filterDeletePreviewing')
                      : t('admin.promptAudit.events.filterDeletePreviewAction')
                  }
                  variant="secondary"
                  isDisabled={!isRangeValid || isBusy}
                  onClick={requestPreview}
                />
                <Button
                  label={isDeleting ? t('common.submitting') : t('admin.promptAudit.events.confirmFilterDelete')}
                  variant="destructive"
                  isDisabled={isConfirmDisabled}
                  onClick={() => void confirm()}
                />
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
