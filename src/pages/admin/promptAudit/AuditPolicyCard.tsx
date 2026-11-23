import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { MultiSelector, type MultiSelectorOptionData } from '@astryxdesign/core/MultiSelector'
import { NumberInput, type NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { PromptAuditDraft } from '@/features/prompt-audit/types'
import { SCANNER_CATALOG } from '@/features/prompt-audit/viewModel'
import type { AdminGroup } from '@/types'
import { useI18n } from '~/i18n'
import { getAllIncludingInactive } from '~/lib/api/admin/groups'
import { entryErrorStatus, type ConfigProblem, type PolicyNumberErrors, type PolicyNumberField } from './configText'
import { auditErrorMessage, categoryLabel } from './eventText'

// The ranges the server accepts.
const MAX_WORKERS = 32
const MAX_QUEUE = 100000

// In the catalog's order, which is the order the server stores them in: ticking one keeps to it.
const SCANNER_IDS: readonly string[] = SCANNER_CATALOG.map((scanner) => scanner.id)

/** Every group, the switched-off ones too: a configuration may still name one of those. */
function useAuditGroups() {
  // null until the list is here.
  const [groups, setGroups] = useState<AdminGroup[] | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // tick is not sent; it is here so "retry" asks again.
  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    getAllIncludingInactive()
      .then((answer) => {
        if (!isStale) setGroups(answer || [])
      })
      .catch((error) => {
        if (isStale) return
        console.error('[prompt-audit] failed to load groups', error)
        setFailure(auditErrorMessage(error, 'admin.promptAudit.errors.loadGroups'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [tick])

  return { groups, isLoading, failure, retry: () => setTick((value) => value + 1) }
}

/**
 * Which requests are audited and for what: the groups, the risk categories, and how much the
 * workers may take on. Changes the draft only.
 */
export function AuditPolicyCard({
  draft,
  revision,
  problems,
  numberErrors,
  onChange,
  onNumberError,
}: {
  draft: PromptAuditDraft
  /** Changes when the draft is replaced as a whole: the number fields start over from it. */
  revision: number
  /** Why the draft cannot be saved as it is; each is shown at the field that fixes it. */
  problems: ConfigProblem[]
  /** By field: text typed into a number field that the field refused. */
  numberErrors: PolicyNumberErrors
  onChange: (patch: Partial<PromptAuditDraft>) => void
  /** A number field refused what was typed into it, or (null) no longer holds such text. */
  onNumberError: (field: PolicyNumberField, error: NumberInputEntryError | null) => void
}) {
  const { t } = useI18n()
  const groupList = useAuditGroups()
  const problemOf = (field: ConfigProblem['field']) => problems.find((problem) => problem.field === field)?.message
  const groupsProblem = problemOf('groups')
  const scannersProblem = problemOf('scanners')

  const listed = groupList.groups ?? []
  // Ids the draft names that the list does not have: groups deleted since, or a list that did not load.
  const unlisted = draft.group_ids.filter((id) => !listed.some((group) => group.id === id))
  const groupOptions = [
    // Kept as options so they can be unticked.
    ...unlisted.map((id) => ({ value: String(id), label: `#${id}` })),
    ...listed.map((group) => ({
      value: String(group.id),
      // The search goes by the label: the platform is in it so groups can be found by platform too.
      label: `${group.name} · ${group.platform}`,
    })),
  ]
  /** A group's row in the list: under its label, the id and whether the group is switched on. */
  const groupRow = (option: MultiSelectorOptionData) => {
    const group = listed.find((item) => String(item.id) === option.value)
    const label = option.label ?? option.value
    // An id the list does not have is its own label, "#9": there is nothing more to tell of it.
    if (!group) return label
    return (
      <VStack gap={0}>
        <Text>{label}</Text>
        <Text type="supporting" color="secondary">
          {`#${group.id} · ${group.status === 'active' ? t('common.active') : t('common.inactive')}`}
        </Text>
      </VStack>
    )
  }
  // Only a list that did load can tell that a group is gone.
  const goneIds = groupList.groups ? unlisted : []
  const groupsStatus = groupsProblem
    ? { type: 'warning' as const, message: groupsProblem }
    : goneIds.length > 0
      ? { type: 'warning' as const, message: `${t('admin.promptAudit.policy.missingGroups')}: ${goneIds.join(', ')}` }
      : undefined

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={0.5}>
          <Heading level={4}>{t('admin.promptAudit.policy.title')}</Heading>
          <Text type="supporting" color="secondary">
            {t('admin.promptAudit.policy.description')}
          </Text>
        </VStack>

        <Grid columns={{ minWidth: 320, max: 2 }} gap={6}>
          <VStack gap={4}>
            {/* Going back to "all groups" keeps the ticked ones in the draft: a save sends none of them then. */}
            <RadioList
              label={t('admin.promptAudit.policy.scope')}
              orientation="horizontal"
              value={draft.all_groups ? 'all' : 'selected'}
              onChange={(value) => onChange({ all_groups: value === 'all' })}
            >
              <RadioListItem value="all" label={t('admin.promptAudit.policy.allGroups')} />
              <RadioListItem value="selected" label={t('admin.promptAudit.policy.selectedGroups')} />
            </RadioList>

            {!draft.all_groups && (
              <VStack gap={3}>
                {groupList.failure != null && (
                  <Banner
                    status="warning"
                    title={t('admin.promptAudit.errors.loadGroups')}
                    description={
                      groupList.failure !== t('admin.promptAudit.errors.loadGroups') ? groupList.failure : undefined
                    }
                    endContent={
                      <Button
                        label={t('admin.promptAudit.actions.retry')}
                        variant="secondary"
                        size="sm"
                        onClick={groupList.retry}
                      />
                    }
                  />
                )}
                {/* The label would repeat the option ticked right above it. */}
                <MultiSelector
                  label={t('admin.promptAudit.policy.selectedGroups')}
                  isLabelHidden
                  width="100%"
                  options={groupOptions}
                  renderOption={groupRow}
                  value={draft.group_ids.map(String)}
                  onChange={(values) => onChange({ group_ids: values.map(Number).sort((a, b) => a - b) })}
                  triggerDisplay="badges"
                  hasSearch
                  searchPlaceholder={t('admin.promptAudit.policy.searchGroups')}
                  emptyText={t('admin.promptAudit.policy.noGroups')}
                  emptySearchText={t('admin.promptAudit.policy.noGroups')}
                  isLoading={groupList.isLoading}
                  status={groupsStatus}
                />
                <Text type="supporting" color="secondary">
                  {t('admin.promptAudit.policy.selectedCount', { count: draft.group_ids.length })}
                </Text>
              </VStack>
            )}

            {/* Keyed by the draft's revision: text a field refused does not outlive the draft it was typed over. */}
            <Grid key={revision} columns={{ minWidth: 160, max: 2 }} gap={4}>
              <NumberInput
                label={t('admin.promptAudit.policy.workerCount')}
                isIntegerOnly
                isWheelEnabled={false}
                width="100%"
                min={1}
                max={MAX_WORKERS}
                value={draft.worker_count}
                onChange={(worker_count) => onChange({ worker_count })}
                onEntryErrorChange={(error) => onNumberError('worker_count', error)}
                status={entryErrorStatus(numberErrors.worker_count)}
              />
              <NumberInput
                label={t('admin.promptAudit.policy.queueCapacity')}
                isIntegerOnly
                isWheelEnabled={false}
                width="100%"
                min={1}
                max={MAX_QUEUE}
                value={draft.queue_capacity}
                onChange={(queue_capacity) => onChange({ queue_capacity })}
                onEntryErrorChange={(error) => onNumberError('queue_capacity', error)}
                status={entryErrorStatus(numberErrors.queue_capacity)}
              />
            </Grid>

            {/* The one strategy there is: shown, not chosen. */}
            <VStack gap={0.5}>
              <Text type="label">{t('admin.promptAudit.policy.strategy')}</Text>
              <Text type="supporting" color="secondary">
                {`${draft.strategy} · ${t('admin.promptAudit.policy.strategyHint')}`}
              </Text>
            </VStack>
          </VStack>

          <CheckboxList
            label={t('admin.promptAudit.policy.scanners')}
            density="compact"
            value={draft.scanners}
            onChange={(values) => onChange({ scanners: SCANNER_IDS.filter((id) => values.includes(id)) })}
            status={scannersProblem ? { type: 'warning', message: scannersProblem } : undefined}
          >
            {SCANNER_IDS.map((id) => (
              <CheckboxListItem key={id} value={id} label={categoryLabel(id)} />
            ))}
          </CheckboxList>
        </Grid>
      </VStack>
    </Card>
  )
}
