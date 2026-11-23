import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { Token } from '@astryxdesign/core/Token'
import {
  ArrowUturnLeftIcon,
  BeakerIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { formatDateTime } from '@/utils/format'
import { useI18n } from '~/i18n'
import type { ContentModerationAPIKeyStatus } from '~/lib/api/admin/riskControl'
import { RiskAuditTestInput, RiskAuditTestResult } from './RiskAuditTest'
import { MAX_VISIBLE_KEY_ROWS, canTestSavedKeys, isDeletableKey, isPendingDelete } from './riskKeys'
import { apiKeyStatusColor, apiKeyStatusLabelKey, engineLabel } from './riskModel'
import { SettingsHeading, SettingsSection } from './RiskSettingsParts'
import type { RiskSettings } from './useRiskSettings'

// What goes in on one side, what comes of it on the other; one under the other where two do not fit.
const KEY_COLUMNS = { minWidth: 320, max: 2 } as const

/** The keys typed in for the engine in view, and whether they join the saved ones or replace them. */
function KeyEntry({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const { engine } = settings
  const isReplacing = engine.api_keys_mode === 'replace'

  return (
    <VStack gap={3}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <VStack gap={0.5}>
          <Text type="label">{t('admin.riskControl.apiKeysWriteMode')}</Text>
          <Text type="supporting" color="secondary">
            {isReplacing ? t('admin.riskControl.apiKeysModeReplaceHint') : t('admin.riskControl.apiKeysModeAppendHint')}
          </Text>
        </VStack>
        <SegmentedControl
          label={t('admin.riskControl.apiKeysWriteMode')}
          size="sm"
          value={engine.api_keys_mode}
          onChange={(mode) => settings.setKeysMode(mode === 'replace' ? 'replace' : 'append')}
          isDisabled={engine.clear_api_key}
        >
          <SegmentedControlItem value="append" label={t('admin.riskControl.apiKeysModeAppend')} />
          <SegmentedControlItem value="replace" label={t('admin.riskControl.apiKeysModeReplace')} />
        </SegmentedControl>
      </HStack>
      <TextArea
        label={t('admin.riskControl.apiKeys')}
        isLabelHidden
        width="100%"
        rows={7}
        value={engine.api_keys_text}
        onChange={(api_keys_text) => settings.editEngine({ api_keys_text })}
        placeholder={
          isReplacing ? t('admin.riskControl.apiKeysPlaceholderReplace') : t('admin.riskControl.apiKeysPlaceholder')
        }
        isDisabled={engine.clear_api_key}
        hasSpellCheck={false}
        // Keys are secrets: the browser is not to offer what was typed here before.
        autoComplete="off"
      />
      <HStack gap={2} wrap="wrap">
        <Badge label={t('admin.riskControl.inputApiKeyCount', { count: settings.typedKeyCount })} />
        {engine.api_key_configured && (
          <Badge label={t('admin.riskControl.storedApiKeyCount', { count: engine.api_key_count })} />
        )}
        {engine.clear_api_key ? (
          <Badge variant="error" label={t('admin.riskControl.apiKeyWillClear')} />
        ) : (
          engine.pendingDeletes.length > 0 && (
            <Badge
              variant="warning"
              label={t('admin.riskControl.apiKeyPendingDeleteCount', { count: engine.pendingDeletes.length })}
            />
          )
        )}
        {isReplacing && <Badge variant="warning" label={t('admin.riskControl.apiKeysReplaceWarning')} />}
      </HStack>
    </VStack>
  )
}

/** One key: what it is, how its last calls went, and — for a saved one — the way to delete it. */
function KeyRow({ row, settings }: { row: ContentModerationAPIKeyStatus; settings: RiskSettings }) {
  const { t } = useI18n()
  const { engine } = settings
  const isPending = isPendingDelete(row, engine.pendingDeletes)
  // A save that clears or replaces the keys takes every saved one, so there is no single one to pick.
  const canToggleDelete = isDeletableKey(row) && !engine.clear_api_key && engine.api_keys_mode !== 'replace'
  const toggleLabel = isPending ? t('admin.riskControl.undoDeleteApiKey') : t('admin.riskControl.deleteApiKey')

  const time = (value: string) => formatDateTime(value) || '-'
  const facts = [t('admin.riskControl.apiKeyFailureCount', { count: row.failure_count || 0 })]
  if (row.last_latency_ms > 0) facts.push(t('admin.riskControl.apiKeyLatency', { ms: row.last_latency_ms }))
  if (row.last_http_status > 0) facts.push(t('admin.riskControl.apiKeyHTTPStatus', { status: row.last_http_status }))
  if (row.frozen_until) facts.push(t('admin.riskControl.apiKeyFrozenUntil', { time: time(row.frozen_until) }))
  else if (row.last_checked_at) facts.push(t('admin.riskControl.apiKeyLastChecked', { time: time(row.last_checked_at) }))
  else facts.push(t('admin.riskControl.apiKeyNotTested'))

  return (
    <VStack gap={2}>
      <Divider />
      <HStack gap={2} hAlign="between" vAlign="center">
        <VStack gap={0.5}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="code" textWrap="nowrap">
              {row.masked || '-'}
            </Text>
            <Token size="sm" color={apiKeyStatusColor(row.status)} label={t(apiKeyStatusLabelKey(row.status))} />
            {isPending ? (
              <Token size="sm" color="orange" label={t('admin.riskControl.apiKeyPendingDelete')} />
            ) : row.configured ? (
              <Token size="sm" label={t('admin.riskControl.apiKeyConfigured')} />
            ) : (
              <Token size="sm" color="blue" label={t('admin.riskControl.apiKeyTemporary')} />
            )}
          </HStack>
          <Text type="supporting" hasTabularNumbers>
            {facts.join(' · ')}
          </Text>
          {row.last_error && (
            <HStack gap={1.5} vAlign="start">
              <Icon icon={ExclamationTriangleIcon} size="sm" color="warning" />
              <Text type="supporting" color="primary" wordBreak="break-word">
                {row.last_error}
              </Text>
            </HStack>
          )}
        </VStack>
        {canToggleDelete && (
          <IconButton
            size="sm"
            variant="ghost"
            icon={<Icon icon={isPending ? ArrowUturnLeftIcon : TrashIcon} />}
            label={toggleLabel}
            tooltip={toggleLabel}
            onClick={() => settings.toggleKeyDelete(row)}
          />
        )}
      </HStack>
    </VStack>
  )
}

/** The keys of the engine in view with their health; past the first few, the list folds. */
function KeyHealth({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const [isExpanded, setExpanded] = useState(false)
  const rows = settings.keyRows
  const visible = isExpanded ? rows : rows.slice(0, MAX_VISIBLE_KEY_ROWS)

  return (
    <VStack gap={3}>
      <SettingsHeading
        level={5}
        title={`${t('admin.riskControl.apiKeyHealth')} · ${t('admin.riskControl.apiKeyRows', { count: rows.length })}`}
        hint={t('admin.riskControl.apiKeyFreezeRule')}
      />
      {rows.length === 0 ? (
        <EmptyState
          isCompact
          title={t('admin.riskControl.apiKeyHealthEmpty')}
          description={t('admin.riskControl.apiKeyHealthEmptyHint')}
        />
      ) : (
        <VStack gap={2}>
          {visible.map((row, index) => (
            // A typed key has no hash until it is saved; its place in the list tells it apart.
            <KeyRow key={`${row.configured ? 'saved' : 'typed'}-${row.key_hash || index}`} row={row} settings={settings} />
          ))}
          {rows.length > MAX_VISIBLE_KEY_ROWS && (
            <HStack gap={3} hAlign="between" vAlign="center">
              <Text type="supporting">
                {isExpanded
                  ? t('admin.riskControl.apiKeyRowsExpanded', { count: rows.length })
                  : t('admin.riskControl.apiKeyRowsCollapsed', { count: rows.length - visible.length })}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon icon={isExpanded ? ChevronUpIcon : ChevronDownIcon} />}
                label={isExpanded ? t('admin.riskControl.collapseApiKeyRows') : t('admin.riskControl.expandApiKeyRows')}
                onClick={() => setExpanded((expanded) => !expanded)}
              />
            </HStack>
          )}
        </VStack>
      )}
    </VStack>
  )
}

/**
 * The keys of the engine in view: typing new ones, deleting saved ones, trying them, and trying
 * content against the engine. Changes to the keys wait for the save; tests run at once, against
 * the draft, so an engine can be tried before it is made the running one.
 */
export function RiskKeySection({ settings }: { settings: RiskSettings }) {
  const { t } = useI18n()
  const { draft, engine, testing } = settings

  return (
    <SettingsSection
      title={`${engineLabel(draft.engine)} · ${t('admin.riskControl.apiKeys')}`}
      hint={t('admin.riskControl.apiKeysHint', { count: engine.api_key_count })}
      actions={
        <HStack gap={2} wrap="wrap">
          <Button
            icon={<Icon icon={BeakerIcon} />}
            label={t('admin.riskControl.testInputApiKeys')}
            isLoading={testing === 'typed'}
            isDisabled={testing === 'saved' || settings.typedKeyCount === 0 || engine.clear_api_key}
            onClick={() => void settings.testKeys('typed')}
          />
          <Button
            icon={<Icon icon={ShieldCheckIcon} />}
            label={
              settings.hasTestContent
                ? t('admin.riskControl.testContentWithStoredApiKey')
                : t('admin.riskControl.testStoredApiKeys')
            }
            isLoading={testing === 'saved'}
            isDisabled={testing === 'typed' || !canTestSavedKeys(engine)}
            onClick={() => void settings.testKeys('saved')}
          />
          {engine.api_key_configured && (
            <Button
              icon={<Icon icon={engine.clear_api_key ? XMarkIcon : TrashIcon} />}
              label={engine.clear_api_key ? t('admin.riskControl.keepApiKey') : t('admin.riskControl.clearApiKey')}
              onClick={settings.toggleClearKeys}
            />
          )}
        </HStack>
      }
    >
      <Grid columns={KEY_COLUMNS} gap={6}>
        <VStack gap={5}>
          <KeyEntry settings={settings} />
          <RiskAuditTestInput settings={settings} />
        </VStack>
        <VStack gap={5}>
          <KeyHealth settings={settings} />
          {settings.testResult && <RiskAuditTestResult result={settings.testResult} />}
        </VStack>
      </Grid>
    </SettingsSection>
  )
}
