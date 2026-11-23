import { useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Switch } from '@astryxdesign/core/Switch'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { PromptAuditEndpointDraft, PromptProbeResult } from '@/features/prompt-audit/types'
import { createDefaultEndpoint } from '@/features/prompt-audit/viewModel'
import { useI18n } from '~/i18n'
import { AuditEndpointDialog } from './AuditEndpointDialog'
import { hasCredential, isCredentialInvalid, statusLabel } from './configText'
import { NO_VALUE } from './eventText'
import { useElementWidth } from './useElementWidth'

/** A node with its place in the pool: the order is the order the guard tries them in. */
type Row = { index: number; endpoint: PromptAuditEndpointDraft }

/** The node in the editor; `index` is null for one that is being added. */
type Editing = { index: number | null; endpoint: PromptAuditEndpointDraft }

/**
 * The narrowest list area that still holds the table. At their narrowest the columns add up to
 * 930px, and the table reaches 12px into the card's padding on either side. Anything narrower
 * lists each node as a block instead.
 */
const TABLE_MIN_AREA = 906

const limits = (endpoint: PromptAuditEndpointDraft) => [`${endpoint.timeout_ms} ms`, `${endpoint.input_limit} chars`]

/** Whether the node will call its guard with a key. The key itself is never shown. */
function Credential({ endpoint }: { endpoint: PromptAuditEndpointDraft }) {
  const { t } = useI18n()
  const [tone, text] = isCredentialInvalid(endpoint)
    ? (['error', t('admin.promptAudit.pool.invalid')] as const)
    : hasCredential(endpoint)
      ? (['success', t('admin.promptAudit.pool.configured')] as const)
      : (['neutral', t('admin.promptAudit.pool.missing')] as const)
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={tone} label={text} />
      <Text type="supporting">{text}</Text>
    </HStack>
  )
}

/** What the connection test of a node is doing, or what the last one found. */
function ProbeLine({ isProbing, result }: { isProbing: boolean; result: PromptProbeResult | undefined }) {
  const { t } = useI18n()
  if (isProbing) {
    return (
      <Text type="supporting" color="secondary">
        {t('admin.promptAudit.pool.probeProgress')}
      </Text>
    )
  }
  if (!result) return null
  const status = statusLabel(result.status)
  const summary = t('admin.promptAudit.pool.probeResult', {
    status,
    http: result.http_status || NO_VALUE,
    latency: result.latency_ms,
  })
  return (
    <HStack gap={1.5} vAlign="center">
      <StatusDot variant={result.ok ? 'success' : 'error'} label={status} />
      <Text type="supporting" maxLines={2} hasTruncateTooltip wordBreak="break-word">
        {[summary, result.message].filter(Boolean).join(' · ')}
      </Text>
    </HStack>
  )
}

/**
 * The guard nodes of the draft: which ones are in the pool, and the ways to add, edit, test and
 * remove one. Everything but the connection test changes the draft only.
 */
export function AuditEndpointPool({
  endpoints,
  probeResults,
  probingIds,
  problem,
  onAdd,
  onReplace,
  onToggle,
  onRemove,
  onProbe,
}: {
  endpoints: PromptAuditEndpointDraft[]
  /** By node id: what the last connection test found. */
  probeResults: Record<string, PromptProbeResult>
  probingIds: ReadonlySet<string>
  /** Why the draft cannot be saved with the pool as it is. */
  problem?: string
  onAdd: (endpoint: PromptAuditEndpointDraft) => void
  onReplace: (index: number, endpoint: PromptAuditEndpointDraft) => void
  onToggle: (index: number, isEnabled: boolean) => void
  onRemove: (index: number) => void
  onProbe: (endpoint: PromptAuditEndpointDraft) => void
}) {
  const { t } = useI18n()
  // The room the list really has decides, not the window: the sidebar can be folded away.
  const [listArea, listWidth] = useElementWidth()
  const isWide = listWidth == null || listWidth >= TABLE_MIN_AREA
  const [editing, setEditing] = useState<Editing | null>(null)
  const [removingIndex, setRemovingIndex] = useState<number | null>(null)

  const rows: Row[] = endpoints.map((endpoint, index) => ({ index, endpoint }))
  const removing = removingIndex != null ? endpoints[removingIndex] : undefined

  const toggle = ({ index, endpoint }: Row) => (
    <Switch
      size="sm"
      label={t('admin.promptAudit.pool.toggleNode', { name: endpoint.name })}
      isLabelHidden
      value={endpoint.enabled}
      onChange={(checked) => onToggle(index, checked)}
    />
  )

  const actions = ({ index, endpoint }: Row) => {
    const isProbing = probingIds.has(endpoint.id)
    return (
      <HStack gap={0.5} vAlign="center">
        <Button
          label={isProbing ? t('admin.promptAudit.pool.probing') : t('admin.promptAudit.pool.probe')}
          variant="secondary"
          size="sm"
          isLoading={isProbing}
          onClick={() => onProbe(endpoint)}
        />
        <IconButton
          label={t('common.edit')}
          tooltip={t('common.edit')}
          variant="ghost"
          size="sm"
          icon={<Icon icon={PencilSquareIcon} />}
          onClick={() => setEditing({ index, endpoint })}
        />
        <IconButton
          label={t('common.delete')}
          tooltip={t('common.delete')}
          variant="ghost"
          size="sm"
          icon={<Icon icon={TrashIcon} />}
          onClick={() => setRemovingIndex(index)}
        />
      </HStack>
    )
  }

  const probeLine = ({ endpoint }: Row) => (
    <ProbeLine isProbing={probingIds.has(endpoint.id)} result={probeResults[endpoint.id]} />
  )

  const columns: TableColumn<Row>[] = [
    {
      key: 'node',
      header: t('admin.promptAudit.pool.node'),
      width: proportional(1.4, { minWidth: 220 }),
      renderCell: (row) => (
        <HStack gap={3} vAlign="center">
          {toggle(row)}
          <VStack gap={0.5}>
            <Text weight="medium" wordBreak="break-word">
              {row.endpoint.name}
            </Text>
            <Text type="supporting" color="secondary" wordBreak="break-all">
              {row.endpoint.base_url}
            </Text>
          </VStack>
        </HStack>
      ),
    },
    {
      key: 'model',
      header: t('admin.promptAudit.pool.model'),
      width: proportional(1, { minWidth: 150 }),
      renderCell: ({ endpoint }) => (
        <Text type="supporting" wordBreak="break-all">
          {endpoint.model || NO_VALUE}
        </Text>
      ),
    },
    {
      key: 'limits',
      header: t('admin.promptAudit.pool.limits'),
      width: pixel(140),
      renderCell: ({ endpoint }) => (
        <VStack gap={0.5}>
          {limits(endpoint).map((limit) => (
            <Text key={limit} type="supporting" hasTabularNumbers>
              {limit}
            </Text>
          ))}
        </VStack>
      ),
    },
    {
      key: 'credential',
      header: t('admin.promptAudit.pool.credential'),
      width: proportional(1.6, { minWidth: 240 }),
      renderCell: (row) => (
        <VStack gap={1}>
          <Credential endpoint={row.endpoint} />
          {probeLine(row)}
        </VStack>
      ),
    },
    {
      key: 'actions',
      header: t('admin.promptAudit.common.actions'),
      width: pixel(180),
      align: 'end',
      renderCell: actions,
    },
  ]

  return (
    <>
      <Card>
        <VStack gap={4}>
          <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
            <VStack gap={0.5}>
              <Heading level={4}>{t('admin.promptAudit.pool.title')}</Heading>
              <Text type="supporting" color="secondary">
                {t('admin.promptAudit.pool.description')}
              </Text>
            </VStack>
            <Button
              label={t('admin.promptAudit.pool.add')}
              variant="secondary"
              icon={<Icon icon={PlusIcon} />}
              onClick={() => setEditing({ index: null, endpoint: createDefaultEndpoint(endpoints.length + 1) })}
            />
          </HStack>

          {problem && <Banner status="warning" title={problem} />}

          <VStack ref={listArea} gap={3}>
            {rows.length === 0 ? (
              <Center padding={6}>
                <EmptyState isCompact headingLevel={5} title={t('admin.promptAudit.pool.empty')} />
              </Center>
            ) : isWide ? (
              <Table<Row>
                data={rows}
                columns={columns}
                idKey={(row) => row.index}
                density="compact"
                dividers="rows"
                verticalAlign="top"
                hasHover
              />
            ) : (
              rows.map((row) => (
                <VStack key={row.index} gap={2}>
                  <Divider />
                  <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                    <HStack gap={3} vAlign="center">
                      {toggle(row)}
                      <Text weight="medium" wordBreak="break-word">
                        {row.endpoint.name}
                      </Text>
                    </HStack>
                    {actions(row)}
                  </HStack>
                  <VStack gap={0.5}>
                    <Text type="supporting" color="secondary" wordBreak="break-all">
                      {row.endpoint.base_url}
                    </Text>
                    <Text type="supporting" wordBreak="break-all">
                      {[row.endpoint.model, ...limits(row.endpoint)].filter(Boolean).join(' · ')}
                    </Text>
                  </VStack>
                  <Credential endpoint={row.endpoint} />
                  {probeLine(row)}
                </VStack>
              ))
            )}
          </VStack>
        </VStack>
      </Card>

      {editing && (
        <AuditEndpointDialog
          endpoint={editing.endpoint}
          isNew={editing.index == null}
          onClose={() => setEditing(null)}
          onSave={(endpoint) => {
            if (editing.index == null) onAdd(endpoint)
            else onReplace(editing.index, endpoint)
            setEditing(null)
          }}
        />
      )}

      {removing && removingIndex != null && (
        <AlertDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setRemovingIndex(null)
          }}
          title={t('common.delete')}
          description={t('admin.promptAudit.pool.deleteConfirm', { name: removing.name })}
          actionLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onAction={() => {
            onRemove(removingIndex)
            setRemovingIndex(null)
          }}
        />
      )}
    </>
  )
}
