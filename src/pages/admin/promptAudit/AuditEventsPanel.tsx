import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional, useTableSelection, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ClipboardDocumentIcon, EyeIcon, MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { PromptAuditEvent, PromptEventFilters } from '@/features/prompt-audit/types'
import { useI18n } from '~/i18n'
import { copyToClipboard } from '~/lib/clipboard'
import { toast } from '~/lib/toast'
import { AuditEventDialog } from './AuditEventDialog'
import { AuditFilterDeleteDialog } from './AuditFilterDeleteDialog'
import { batchDeleteEvents, deleteEvent } from './api'
import {
  NO_VALUE,
  auditErrorMessage,
  categoriesLabel,
  decisionLabel,
  decisionVariant,
  formatAuditDate,
  riskLabel,
} from './eventText'
import { DecisionField, IdField, RiskField, TimeField } from './filterFields'
import type { AuditEvents } from './useAuditEvents'
import { useElementWidth } from './useElementWidth'

// Interfaces carry no index signature, which the table's row type asks for; a mapped copy does.
type Row = Pick<PromptAuditEvent, keyof PromptAuditEvent>
type TextFilter = 'endpoint' | 'request_id' | 'prompt_hash' | 'keyword'

/** Events picked for deletion, waiting for the confirmation. One event deleted from its row goes by its own request. */
interface PendingDelete {
  mode: 'single' | 'batch'
  ids: number[]
}

const route = (event: Row) =>
  `${event.snapshot.model} · ${event.snapshot.protocol} · ${event.snapshot.stage || 'http'}`

/**
 * The narrowest list area that still holds the table. At their narrowest the columns add up to
 * 1046px (the three flexible ones keep their proportions), and the table reaches 12px into the
 * card's padding on either side. Anything narrower lists each event as a block instead.
 */
const TABLE_MIN_AREA = 1022

/** Who sent the prompt, each name with a button that copies it: one under the other, or side by side. */
function IdentityLines({ event, isInline = false }: { event: Row; isInline?: boolean }) {
  const { t } = useI18n()
  const lines = [
    { label: t('admin.promptAudit.events.user'), value: event.snapshot.username },
    { label: t('admin.promptAudit.events.email'), value: event.snapshot.user_email },
    { label: t('admin.promptAudit.events.apiKey'), value: event.snapshot.api_key_name },
  ]
  const items = lines.map(({ label, value }) => (
    <HStack key={label} gap={1.5} vAlign="center">
      <Text type="supporting" color="secondary" textWrap="nowrap">
        {label}
      </Text>
      <Text type="supporting" maxLines={1} hasTruncateTooltip wordBreak="break-all">
        {value || NO_VALUE}
      </Text>
      {value && (
        <IconButton
          label={`${t('common.copy')} ${label}`}
          tooltip={t('common.copy')}
          variant="ghost"
          size="sm"
          icon={<Icon icon={ClipboardDocumentIcon} />}
          onClick={() => void copyToClipboard(value)}
        />
      )}
    </HStack>
  ))
  return isInline ? (
    <HStack gap={4} vAlign="center" wrap="wrap">
      {items}
    </HStack>
  ) : (
    <VStack gap={0}>{items}</VStack>
  )
}

function ResultBadge({ event }: { event: Row }) {
  return (
    <Badge
      variant={decisionVariant(event.decision)}
      label={`${decisionLabel(event.decision)} · ${riskLabel(event.risk_level)}`}
    />
  )
}

/**
 * The audit events: filters, the list with its ticks and pages, and the ways to look into an event
 * or delete some. The list itself lives in the page, see useAuditEvents.
 */
export function AuditEventsPanel({
  list,
  hasPassNotice,
  onOpenConfig,
}: {
  list: AuditEvents
  /** Auditing is on but safe requests are not stored: say so, or the list looks incomplete. */
  hasPassNotice: boolean
  onOpenConfig: () => void
}) {
  const { t, locale } = useI18n()
  // The room the list really has decides, not the window: the sidebar can be folded away.
  const [listArea, listWidth] = useElementWidth()
  const isWide = listWidth == null || listWidth >= TABLE_MIN_AREA
  const [detailId, setDetailId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [isFilterDeleteOpen, setFilterDeleteOpen] = useState(false)

  const { draft, items, selectedIds } = list
  const rows: Row[] = items
  const selectedCount = selectedIds.size
  const isAllSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id))
  const isSomeSelected = !isAllSelected && rows.some((row) => selectedIds.has(row.id))

  const confirmDelete = () => {
    if (isDeleting || !pendingDelete) return
    const { mode, ids } = pendingDelete
    setDeleting(true)
    const request = mode === 'single' ? deleteEvent(ids[0]) : batchDeleteEvents(ids)
    request
      .then((answer) => {
        toast.success(t('admin.promptAudit.messages.deleted', { count: answer.deleted_events }))
        list.reload()
      })
      .catch((error) => {
        console.error('[prompt-audit] failed to delete events', error)
        toast.error(auditErrorMessage(error, 'admin.promptAudit.errors.delete'))
      })
      .finally(() => {
        setDeleting(false)
        setPendingDelete(null)
      })
  }

  const time = (row: Row) => formatAuditDate(row.created_at, locale, 'short')
  const selectLabel = (row: Row) => t('admin.promptAudit.events.selectEvent', { id: row.id })

  const actions = (row: Row) => (
    <HStack gap={0.5}>
      <IconButton
        label={t('common.view')}
        tooltip={t('common.view')}
        variant="ghost"
        size="sm"
        icon={<Icon icon={EyeIcon} />}
        onClick={() => setDetailId(row.id)}
      />
      <IconButton
        label={t('common.delete')}
        tooltip={t('common.delete')}
        variant="ghost"
        size="sm"
        icon={<Icon icon={TrashIcon} />}
        onClick={() => setPendingDelete({ mode: 'single', ids: [row.id] })}
      />
    </HStack>
  )

  const selection = useTableSelection<Row>({
    getIsItemSelected: (row) => selectedIds.has(row.id),
    onSelectItem: ({ item, isSelected }) => list.select(item.id, isSelected),
    onSelectAll: ({ isAllSelected: isSelected }) => list.selectAll(isSelected),
    getIsAllSelected: () => isAllSelected,
    getIsIndeterminate: () => isSomeSelected,
    getRowLabel: selectLabel,
  })

  const columns: TableColumn<Row>[] = [
    {
      key: 'created_at',
      header: t('admin.promptAudit.events.time'),
      width: pixel(112),
      renderCell: (row) => (
        <Text type="supporting" hasTabularNumbers>
          {time(row)}
        </Text>
      ),
    },
    {
      key: 'identity',
      header: t('admin.promptAudit.events.identity'),
      width: proportional(1.3, { minWidth: 200 }),
      renderCell: (row) => <IdentityLines event={row} />,
    },
    {
      key: 'group',
      header: t('admin.promptAudit.events.group'),
      width: pixel(100),
      renderCell: (row) => <Text type="supporting">{row.snapshot.group_name || NO_VALUE}</Text>,
    },
    {
      key: 'route',
      header: t('admin.promptAudit.events.route'),
      width: proportional(1, { minWidth: 150 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text type="supporting" weight="medium" wordBreak="break-all">
            {row.snapshot.endpoint}
          </Text>
          <Text type="supporting" color="secondary" wordBreak="break-all">
            {route(row)}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'result',
      header: t('admin.promptAudit.events.result'),
      width: pixel(140),
      renderCell: (row) => (
        <VStack gap={1} hAlign="start">
          <ResultBadge event={row} />
          <Text type="supporting" color="secondary" maxLines={2} hasTruncateTooltip>
            {categoriesLabel(row.categories)}
          </Text>
        </VStack>
      ),
    },
    {
      key: 'preview',
      header: t('admin.promptAudit.events.preview'),
      width: proportional(1.4, { minWidth: 180 }),
      renderCell: (row) => (
        <Text type="supporting" maxLines={2} wordBreak="break-word">
          {row.snapshot.redacted_preview || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: t('admin.promptAudit.common.actions'),
      width: pixel(88),
      align: 'end',
      renderCell: actions,
    },
  ]

  const textField = (field: TextFilter, label: string) => (
    <TextInput
      label={label}
      width="100%"
      value={draft[field]}
      onChange={(value) => list.edit({ [field]: value } as Partial<PromptEventFilters>)}
      onEnter={list.search}
    />
  )

  return (
    <VStack gap={4}>
      {hasPassNotice && (
        <Banner
          status="warning"
          title={t('admin.promptAudit.events.passEventsDisabled')}
          endContent={
            <Button
              label={t('admin.promptAudit.events.openConfiguration')}
              variant="secondary"
              size="sm"
              onClick={onOpenConfig}
            />
          }
        />
      )}

      <Card>
        <VStack gap={4}>
          <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
            <VStack gap={0.5}>
              <HStack gap={2} vAlign="center">
                <Heading level={4}>{t('admin.promptAudit.events.title')}</Heading>
                {list.isLoading && rows.length > 0 && <Spinner size="sm" />}
              </HStack>
              <Text type="supporting" color="secondary">
                {t('admin.promptAudit.events.description')}
              </Text>
            </VStack>
            <HStack gap={2} wrap="wrap">
              <Button
                label={t('admin.promptAudit.events.deleteSelected', { count: selectedCount })}
                variant="secondary"
                isDisabled={selectedCount === 0}
                onClick={() => setPendingDelete({ mode: 'batch', ids: [...selectedIds] })}
              />
              <Button
                label={t('admin.promptAudit.events.deleteByFilter')}
                variant="destructive"
                icon={<Icon icon={TrashIcon} />}
                onClick={() => setFilterDeleteOpen(true)}
              />
            </HStack>
          </HStack>

          <Grid columns={{ minWidth: 190 }} gap={3}>
            <DecisionField value={draft.decision} onChange={(value) => list.edit({ decision: value })} />
            <RiskField value={draft.risk_level} onChange={(value) => list.edit({ risk_level: value })} />
            {textField('endpoint', t('admin.promptAudit.events.endpoint'))}
            <IdField
              label={t('admin.promptAudit.events.groupId')}
              value={draft.group_id}
              onChange={(value) => list.edit({ group_id: value })}
              onEnter={list.search}
            />
            <IdField
              label={t('admin.promptAudit.events.userId')}
              value={draft.user_id}
              onChange={(value) => list.edit({ user_id: value })}
              onEnter={list.search}
            />
            <IdField
              label={t('admin.promptAudit.events.apiKeyId')}
              value={draft.api_key_id}
              onChange={(value) => list.edit({ api_key_id: value })}
              onEnter={list.search}
            />
            {textField('request_id', t('admin.promptAudit.events.requestId'))}
            {textField('prompt_hash', t('admin.promptAudit.events.promptHash'))}
            {textField('keyword', t('admin.promptAudit.events.keyword'))}
          </Grid>
          {/* A date-and-time field is two boxes: in a cell as narrow as the ones above they stack. */}
          <Grid columns={{ minWidth: 300, max: 2 }} gap={3}>
            <TimeField
              label={t('admin.promptAudit.events.startAt')}
              value={draft.start_at}
              max={draft.end_at}
              onChange={(value) => list.edit({ start_at: value })}
            />
            <TimeField
              label={t('admin.promptAudit.events.endAt')}
              value={draft.end_at}
              min={draft.start_at}
              onChange={(value) => list.edit({ end_at: value })}
            />
          </Grid>

          <HStack gap={2}>
            <Button
              label={t('common.search')}
              variant="primary"
              icon={<Icon icon={MagnifyingGlassIcon} />}
              onClick={list.search}
            />
            <Button label={t('common.reset')} variant="secondary" onClick={list.reset} />
          </HStack>

          {list.failure != null && (
            <Banner
              status="error"
              title={t('admin.promptAudit.errors.loadEvents')}
              description={list.failure !== t('admin.promptAudit.errors.loadEvents') ? list.failure : undefined}
            />
          )}

          <VStack ref={listArea} gap={4}>
            {rows.length === 0 ? (
              // A failed first load leaves only its banner.
              (list.isLoading || list.failure == null) && (
                <Center padding={8}>
                  {list.isLoading ? (
                    <Spinner label={t('common.loading')} />
                  ) : (
                    <EmptyState isCompact headingLevel={5} title={t('admin.promptAudit.events.empty')} />
                  )}
                </Center>
              )
            ) : isWide ? (
              <Table<Row>
                data={rows}
                columns={columns}
                idKey={(row) => row.id}
                density="compact"
                dividers="rows"
                verticalAlign="top"
                hasHover
                plugins={{ selection }}
              />
            ) : (
              <VStack gap={3}>
                <CheckboxInput
                  label={t('admin.promptAudit.events.selectAll')}
                  value={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                  onChange={(checked) => list.selectAll(checked)}
                />
                {rows.map((row) => (
                  <VStack key={row.id} gap={2}>
                    <Divider />
                    <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <CheckboxInput
                          label={selectLabel(row)}
                          isLabelHidden
                          value={selectedIds.has(row.id)}
                          onChange={(checked) => list.select(row.id, checked)}
                        />
                        <ResultBadge event={row} />
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {time(row)}
                        </Text>
                      </HStack>
                      {actions(row)}
                    </HStack>
                    <VStack gap={0.5}>
                      <Text type="supporting" weight="medium" wordBreak="break-all">
                        {row.snapshot.endpoint}
                      </Text>
                      <Text type="supporting" color="secondary" wordBreak="break-all">
                        {[route(row), row.snapshot.group_name, categoriesLabel(row.categories)]
                          .filter((part) => part && part !== NO_VALUE)
                          .join(' · ')}
                      </Text>
                    </VStack>
                    <IdentityLines event={row} isInline />
                    <Text type="supporting" maxLines={2} wordBreak="break-word">
                      {row.snapshot.redacted_preview || NO_VALUE}
                    </Text>
                  </VStack>
                ))}
              </VStack>
            )}

            {list.total > 0 && (
              <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {`${t('common.total')}: ${list.total} ${t('pagination.results')}`}
                </Text>
                <Pagination
                  page={list.page}
                  onChange={list.setPage}
                  totalItems={list.total}
                  pageSize={list.pageSize}
                  pageSizeOptions={list.pageSizeOptions}
                  onPageSizeChange={list.changePageSize}
                  variant="input"
                  size="sm"
                />
              </HStack>
            )}
          </VStack>
        </VStack>
      </Card>

      {detailId != null && <AuditEventDialog eventId={detailId} onClose={() => setDetailId(null)} />}

      {isFilterDeleteOpen && (
        <AuditFilterDeleteDialog
          initialFilters={draft}
          onClose={() => setFilterDeleteOpen(false)}
          onDeleted={() => {
            setFilterDeleteOpen(false)
            list.reload()
          }}
        />
      )}

      {pendingDelete && (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !isDeleting) setPendingDelete(null)
          }}
          title={t('admin.promptAudit.events.deleteConfirmTitle')}
          description={t('admin.promptAudit.events.deleteConfirmMessage', { count: pendingDelete.ids.length })}
          actionLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          isActionLoading={isDeleting}
          onAction={confirmDelete}
        />
      )}
    </VStack>
  )
}
