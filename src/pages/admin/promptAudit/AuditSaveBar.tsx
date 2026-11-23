import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import type { PromptAuditDraft } from '@/features/prompt-audit/types'
import { useI18n } from '~/i18n'
import type { AuditConfig } from './useAuditConfig'

// Holds the bar at the bottom edge of the page's scrolling area, above what scrolls past under it.
// An inline style, because Astryx has no prop for this and the app does not compile StyleX (xstyle).
const STUCK = { position: 'sticky', bottom: 0, zIndex: 1 } as const

/**
 * The main options of the audit, whether the draft differs from what is saved, and the two ways
 * out of a draft: reset and save. The options are checkboxes because they wait for the save like
 * everything else on the tab.
 */
export function AuditSaveBar({
  config,
  draft,
  problem,
  isSticky,
}: {
  config: AuditConfig
  draft: PromptAuditDraft
  /** Why the draft cannot be saved as it is. */
  problem?: string
  /** Stay in view while the tab scrolls. */
  isSticky: boolean
}) {
  const { t } = useI18n()
  const [isConfirmingBlocking, setConfirmingBlocking] = useState(false)
  const { isDirty, isSaving } = config

  const [tone, status] = problem
    ? (['warning', problem] as const)
    : isDirty
      ? (['accent', t('admin.promptAudit.saveBar.dirty')] as const)
      : (['success', t('admin.promptAudit.saveBar.synced')] as const)

  return (
    <>
      <VStack style={isSticky ? STUCK : undefined}>
        <Card elevation={isSticky ? 'med' : 'none'}>
          <VStack gap={3}>
            {config.hasConflict && (
              // Inside the bar, so it is in view with the button that was just pressed. The draft
              // stays as it is until "refresh" replaces it with what the server has now.
              <Banner
                status="warning"
                title={t('admin.promptAudit.errors.prompt_audit_config_conflict')}
                endContent={
                  <Button
                    label={t('common.refresh')}
                    variant="secondary"
                    size="sm"
                    isLoading={config.isLoading}
                    onClick={config.reload}
                  />
                }
              />
            )}
            <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
              <HStack gap={5} vAlign="center" wrap="wrap">
                <CheckboxInput
                  label={t('admin.promptAudit.saveBar.enabled')}
                  value={draft.enabled}
                  onChange={config.setEnabled}
                />
                {/* Blocking holds requests back until the guard answers: switching it on asks first. */}
                <CheckboxInput
                  label={t('admin.promptAudit.saveBar.blocking')}
                  value={draft.blocking_enabled}
                  isDisabled={!draft.enabled}
                  disabledMessage={t('admin.promptAudit.errors.prompt_guard_requires_audit_enabled')}
                  onChange={(checked) => {
                    if (checked) setConfirmingBlocking(true)
                    else config.change({ blocking_enabled: false })
                  }}
                />
                <CheckboxInput
                  label={t('admin.promptAudit.saveBar.blockingLatestTurnOnly')}
                  value={draft.blocking_latest_turn_only}
                  isDisabled={!draft.enabled || !draft.blocking_enabled}
                  onChange={(checked) => config.change({ blocking_latest_turn_only: checked })}
                />
                <CheckboxInput
                  label={t('admin.promptAudit.saveBar.storePass')}
                  value={draft.store_pass_events}
                  onChange={(checked) => config.change({ store_pass_events: checked })}
                />
              </HStack>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <HStack gap={1.5} vAlign="center">
                  <StatusDot variant={tone} label={status} />
                  <Text type="supporting">{status}</Text>
                </HStack>
                <HStack gap={2}>
                  <Button
                    label={t('common.reset')}
                    variant="secondary"
                    isDisabled={!isDirty || isSaving}
                    onClick={config.reset}
                  />
                  <Button
                    label={t('common.save')}
                    variant="primary"
                    isLoading={isSaving}
                    isDisabled={!isDirty || problem != null || config.isLoading}
                    onClick={config.save}
                  />
                </HStack>
              </HStack>
            </HStack>
          </VStack>
        </Card>
      </VStack>

      {isConfirmingBlocking && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setConfirmingBlocking(false)
          }}
          title={t('admin.promptAudit.blockingConfirm.title')}
          description={t('admin.promptAudit.blockingConfirm.message')}
          actionLabel={t('admin.promptAudit.blockingConfirm.confirm')}
          cancelLabel={t('common.cancel')}
          onAction={() => {
            config.change({ blocking_enabled: true })
            setConfirmingBlocking(false)
          }}
        />
      )}
    </>
  )
}
