import { useEffect, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatDateTime } from '@/views/admin/ops/utils/opsFormatters'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import { opsAPI, type AlertRule } from '~/lib/api/admin/ops'
import { toast } from '~/lib/toast'
import { OpsAlertRuleDialog, type AlertRuleGroupOption } from './OpsAlertRuleDialog'
import { alertSeverityVariant } from './alertEvents'
import { alertMetric, alertRuleComparison, sortAlertRules } from './alertRules'
import { errorMessage } from './errors'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<AlertRule, keyof AlertRule>

/** The rules that raise alerts: listed newest first, with their form and a confirmed delete. */
export function OpsAlertRulesDialog({
  onDeleted,
  onClose,
}: {
  /** A rule is gone. The confirmation says its alerts go with it, so what the page lists of them may be out of date. */
  onDeleted: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  // Five columns need some 700 pixels; a narrower dialog lists each rule on a few lines instead.
  const isWide = useMediaQuery('(min-width: 768px)', true)
  const [rules, setRules] = useState<Row[]>([])
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [groups, setGroups] = useState<AlertRuleGroupOption[]>([])
  // The form is open while this is set; its rule is null for a new one.
  const [editor, setEditor] = useState<{ rule: AlertRule | null } | null>(null)
  // The rule a delete was asked for. It stays set while the question closes, so its name does not vanish first.
  const [doomed, setDoomed] = useState<AlertRule | null>(null)
  const [isConfirming, setConfirming] = useState(false)
  const [isDeleting, setDeleting] = useState(false)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    opsAPI
      .listAlertRules()
      .then((answer) => {
        if (!isStale) setRules(sortAlertRules(answer || []))
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load alert rules', error)
        setRules([])
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [reloadTick])

  // The form offers the groups by name. Without them it still opens, and shows a rule's group by its id.
  useEffect(() => {
    let isStale = false
    adminAPI.groups
      .getAll()
      .then((list) => {
        if (!isStale) setGroups(list.map((group) => ({ id: group.id, name: group.name })))
      })
      .catch((error) => console.error('[ops] failed to load groups', error))
    return () => {
      isStale = true
    }
  }, [])

  const reload = () => setReloadTick((tick) => tick + 1)

  const askDelete = (rule: AlertRule) => {
    setDoomed(rule)
    setConfirming(true)
  }

  const remove = () => {
    const id = doomed?.id
    if (!id || isDeleting) return
    setDeleting(true)
    opsAPI
      .deleteAlertRule(id)
      .then(() => {
        toast.success(t('admin.ops.alertRules.deleteSuccess'))
        reload()
        onDeleted()
      })
      .catch((error) => {
        console.error('[ops] failed to delete alert rule', error)
        toast.error(errorMessage(error) || t('admin.ops.alertRules.deleteFailed'))
      })
      .finally(() => {
        setDeleting(false)
        setConfirming(false)
      })
  }

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const labels = {
    edit: t('common.edit'),
    delete: t('common.delete'),
    refresh: t('common.refresh'),
  }

  const nameLine = (row: Row) => (
    <HStack gap={1.5} vAlign="center" wrap="wrap">
      <Text type="supporting" weight="medium" wordBreak="break-word">
        {row.name}
      </Text>
      {row.id != null && <Text type="code">#{row.id}</Text>}
    </HStack>
  )
  // The metric by its name where this page knows it, by its id otherwise.
  const condition = (row: Row) => {
    const metric = alertMetric(row.metric_type)
    return (
      <HStack gap={1.5} vAlign="center" wrap="wrap">
        <Text type="supporting">
          {metric ? t(`admin.ops.alertRules.metrics.${metric.name}`) : row.metric_type}
        </Text>
        <Text type="code">{alertRuleComparison(row)}</Text>
      </HStack>
    )
  }
  const severityBadge = (row: Row) => <Badge variant={alertSeverityVariant(row.severity)} label={row.severity} />
  const enabledBadge = (row: Row) => (
    <Badge
      variant={row.enabled ? 'success' : 'neutral'}
      label={row.enabled ? t('common.enabled') : t('common.disabled')}
    />
  )
  const updatedAt = (row: Row) =>
    row.updated_at && (
      <Text type="supporting" color="secondary" hasTabularNumbers>
        {formatDateTime(row.updated_at)}
      </Text>
    )
  const actions = (row: Row) => (
    <HStack gap={1} hAlign="end">
      <IconButton
        label={labels.edit}
        tooltip={labels.edit}
        variant="ghost"
        size="sm"
        icon={<Icon icon={PencilSquareIcon} />}
        onClick={() => setEditor({ rule: row })}
      />
      <IconButton
        label={labels.delete}
        tooltip={labels.delete}
        variant="ghost"
        size="sm"
        icon={<Icon icon={TrashIcon} />}
        onClick={() => askDelete(row)}
      />
    </HStack>
  )

  const columns: TableColumn<Row>[] = [
    {
      key: 'name',
      header: t('admin.ops.alertRules.table.name'),
      width: proportional(2, { minWidth: 220 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          {nameLine(row)}
          {row.description && (
            <Text type="supporting" color="secondary" maxLines={2}>
              {row.description}
            </Text>
          )}
          {updatedAt(row)}
        </VStack>
      ),
    },
    {
      key: 'metric',
      header: t('admin.ops.alertRules.table.metric'),
      width: proportional(1.4, { minWidth: 190 }),
      renderCell: condition,
    },
    {
      key: 'severity',
      header: t('admin.ops.alertRules.table.severity'),
      width: pixel(80),
      renderCell: severityBadge,
    },
    {
      key: 'enabled',
      header: t('admin.ops.alertRules.table.enabled'),
      width: pixel(96),
      renderCell: enabledBadge,
    },
    {
      key: 'actions',
      header: t('admin.ops.alertRules.table.actions'),
      width: pixel(96),
      renderCell: actions,
    },
  ]

  return (
    <>
      <Dialog isOpen onOpenChange={reportOpen} width={960} maxHeight="90dvh" purpose="info">
        <Layout
          header={<DialogHeader title={t('admin.ops.alertRules.title')} onOpenChange={reportOpen} />}
          content={
            <LayoutContent>
              <VStack gap={3}>
                <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                  <HStack gap={2} vAlign="center">
                    <Text type="supporting" color="secondary">
                      {t('admin.ops.alertRules.description')}
                    </Text>
                    {isLoading && rules.length > 0 && <Spinner size="sm" />}
                  </HStack>
                  <HStack gap={2} vAlign="center">
                    <Button
                      label={t('admin.ops.alertRules.create')}
                      variant="primary"
                      size="sm"
                      icon={<Icon icon={PlusIcon} />}
                      onClick={() => setEditor({ rule: null })}
                    />
                    <IconButton
                      label={labels.refresh}
                      tooltip={labels.refresh}
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={ArrowPathIcon} />}
                      isDisabled={isLoading}
                      onClick={reload}
                    />
                  </HStack>
                </HStack>

                {failure != null && (
                  <Banner
                    status="error"
                    title={t('admin.ops.alertRules.loadFailed')}
                    description={failure || undefined}
                  />
                )}

                {rules.length === 0 ? (
                  // A failed load leaves only its banner.
                  (isLoading || failure == null) && (
                    <Center padding={8}>
                      {isLoading ? (
                        <Spinner label={t('admin.ops.alertRules.loading')} />
                      ) : (
                        <EmptyState isCompact headingLevel={5} title={t('admin.ops.alertRules.empty')} />
                      )}
                    </Center>
                  )
                ) : isWide ? (
                  <Table<Row>
                    data={rules}
                    columns={columns}
                    idKey={(row) => row.id ?? row.name}
                    density="compact"
                    dividers="rows"
                    hasHover
                    verticalAlign="top"
                  />
                ) : (
                  <VStack gap={3}>
                    {rules.map((row, index) => (
                      <VStack key={row.id ?? row.name} gap={1.5}>
                        {index > 0 && <Divider />}
                        <HStack gap={2} hAlign="between" vAlign="start">
                          {nameLine(row)}
                          {actions(row)}
                        </HStack>
                        {row.description && (
                          <Text type="supporting" color="secondary" maxLines={2}>
                            {row.description}
                          </Text>
                        )}
                        {condition(row)}
                        <HStack gap={1.5} vAlign="center" wrap="wrap">
                          {severityBadge(row)}
                          {enabledBadge(row)}
                          {updatedAt(row)}
                        </HStack>
                      </VStack>
                    ))}
                  </VStack>
                )}
              </VStack>
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

      {editor && (
        <OpsAlertRuleDialog
          rule={editor.rule}
          groups={groups}
          onSaved={() => {
            setEditor(null)
            toast.success(t('admin.ops.alertRules.saveSuccess'))
            reload()
          }}
          onClose={() => setEditor(null)}
        />
      )}

      <AlertDialog
        isOpen={isConfirming}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setConfirming(false)
        }}
        title={t('admin.ops.alertRules.deleteConfirmTitle')}
        // The question names the rule: the list behind it holds several.
        description={
          doomed
            ? `"${doomed.name}" (#${doomed.id}) — ${t('admin.ops.alertRules.deleteConfirmMessage')}`
            : t('admin.ops.alertRules.deleteConfirmMessage')
        }
        actionLabel={labels.delete}
        cancelLabel={t('common.cancel')}
        isActionLoading={isDeleting}
        onAction={remove}
      />
    </>
  )
}
