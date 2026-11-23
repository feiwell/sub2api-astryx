import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { VStack } from '@astryxdesign/core/Stack'
import { ArrowPathIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { Page } from '~/components/common/Page'
import { useI18n } from '~/i18n'
import { RiskLogsCard } from './risk-control/RiskLogsCard'
import { RiskSettingsDialog } from './risk-control/RiskSettingsDialog'
import { RiskSummary } from './risk-control/RiskSummary'
import { useRiskControl } from './risk-control/useRiskControl'
import { useRiskLogs } from './risk-control/useRiskLogs'

/** The risk control center: what content moderation is doing, the audit records, and its settings. */
export function AdminRiskControlPage() {
  const { t } = useI18n()
  const control = useRiskControl()
  const logs = useRiskLogs()
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  return (
    <Page
      title={t('admin.riskControl.title')}
      description={t('admin.riskControl.description')}
      actions={
        <>
          <Button
            label={t('admin.riskControl.refreshStatus')}
            variant="secondary"
            icon={<Icon icon={ArrowPathIcon} />}
            onClick={() => (control.config ? void control.refreshStatus() : control.reload())}
            isLoading={control.isRefreshing}
            isDisabled={control.isLoading}
          />
          <Button
            label={t('admin.riskControl.openSettings')}
            variant="primary"
            icon={<Icon icon={Cog6ToothIcon} />}
            // Without the saved config the form would hold defaults, and saving them would overwrite it
            isDisabled={!control.config}
            onClick={() => setSettingsOpen(true)}
          />
        </>
      }
    >
      <VStack gap={6} hAlign="stretch">
        <RiskSummary control={control} logsTotal={logs.total} />

        <RiskLogsCard control={control} list={logs} />
      </VStack>

      {/* Mounted only while open: the dialog edits a draft, and closing it drops the draft. */}
      {isSettingsOpen && control.config && (
        <RiskSettingsDialog
          control={control}
          config={control.config}
          onSaved={logs.reload}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </Page>
  )
}
