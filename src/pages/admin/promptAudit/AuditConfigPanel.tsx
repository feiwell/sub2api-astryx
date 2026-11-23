import { useState } from 'react'
import { VStack } from '@astryxdesign/core/Stack'
import type { PromptAuditDraft } from '@/features/prompt-audit/types'
import { useI18n } from '~/i18n'
import { AuditEndpointPool } from './AuditEndpointPool'
import { AuditPolicyCard } from './AuditPolicyCard'
import { AuditRuntimeOverview } from './AuditRuntimeOverview'
import { AuditSaveBar } from './AuditSaveBar'
import { configProblems, type PolicyNumberErrors } from './configText'
import type { AuditConfig } from './useAuditConfig'
import { useElementWidth } from './useElementWidth'

/**
 * The narrowest tab that keeps the save bar in view. Narrower, the bar's options and buttons
 * stack so high that a bar held at the bottom would cover much of what it is there to save.
 */
const STICKY_BAR_MIN_AREA = 640

/**
 * The configuration tab: how the service runs now, then the draft (the guard nodes, the policy)
 * and the bar that saves it. The draft itself lives in the page, see useAuditConfig.
 */
export function AuditConfigPanel({ config, draft }: { config: AuditConfig; draft: PromptAuditDraft }) {
  const { t } = useI18n()
  const [area, width] = useElementWidth()
  // Text a number field refused never reached the draft: a save now would not save what the field shows.
  const [numberErrors, setNumberErrors] = useState<PolicyNumberErrors>({})
  const problems = configProblems(draft)
  // The bar tells the first thing in the way of a save; each card tells its own.
  const savingProblem =
    problems[0]?.message ??
    (Object.values(numberErrors).some(Boolean) ? t('admin.settings.features.affiliate.fixNumbers') : undefined)

  return (
    <VStack ref={area} gap={4}>
      <AuditRuntimeOverview reloadKey={config.savedTick} />
      <AuditEndpointPool
        endpoints={draft.endpoints}
        probeResults={config.probeResults}
        probingIds={config.probingIds}
        problem={problems.find((problem) => problem.field === 'endpoints')?.message}
        onAdd={config.addEndpoint}
        onReplace={config.replaceEndpoint}
        onToggle={config.toggleEndpoint}
        onRemove={config.removeEndpoint}
        onProbe={config.probe}
      />
      <AuditPolicyCard
        draft={draft}
        revision={config.draftRevision}
        problems={problems}
        numberErrors={numberErrors}
        onChange={config.change}
        onNumberError={(field, error) => setNumberErrors((current) => ({ ...current, [field]: error ?? undefined }))}
      />
      <AuditSaveBar
        config={config}
        draft={draft}
        problem={savingProblem}
        isSticky={width == null || width >= STICKY_BAR_MIN_AREA}
      />
    </VStack>
  )
}
