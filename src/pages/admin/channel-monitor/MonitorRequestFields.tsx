import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useI18n } from '~/i18n'
import type { APIMode, BodyOverrideMode, Provider } from '~/lib/api/admin/channelMonitor'
import {
  bodyPlaceholder,
  invalidHeaderName,
  prettyBody,
  requestProblems,
  withBlankHeaderRow,
  withBodyMode,
  withHeaderRow,
  withoutHeaderRow,
  type BodyProblem,
  type RequestDraft,
} from './monitorRequest'

const BODY_MODES: readonly BodyOverrideMode[] = ['off', 'merge', 'replace']

const HEADER_NAME_WIDTH = 208

/**
 * The custom part of a check request: headers sent on top of the usual ones, and a body merged into the usual
 * one or sent in its place. Port of components/admin/monitor/MonitorAdvancedRequestConfig.vue.
 */
export function MonitorRequestFields({
  draft,
  onChange,
  provider,
  apiMode,
  showProblems,
  isDisabled = false,
}: {
  draft: RequestDraft
  onChange: (draft: RequestDraft) => void
  /** The provider and the kind of request the example of a body is written for. */
  provider: Provider
  apiMode: APIMode
  /** Point out a body that cannot be sent even though its field was never left: saving was tried. */
  showProblems: boolean
  isDisabled?: boolean
}) {
  const { t } = useI18n()
  // A body is read once its field is left, not while it is typed: half a body is no mistake yet.
  const [wasBodyLeft, setBodyLeft] = useState(false)

  const problems = requestProblems(draft)
  const bodyProblem = showProblems || wasBodyLeft ? problems.body : undefined
  const isOnlyBlankRow = draft.headers.length === 1 && !draft.headers[0].name && !draft.headers[0].value

  const bodyModeLabels: Record<BodyOverrideMode, string> = {
    off: t('admin.channelMonitor.advanced.bodyModeOff'),
    merge: t('admin.channelMonitor.advanced.bodyModeMerge'),
    replace: t('admin.channelMonitor.advanced.bodyModeReplace'),
  }
  const bodyModeHints: Record<BodyOverrideMode, string> = {
    off: t('admin.channelMonitor.advanced.bodyModeHintOff'),
    merge: t('admin.channelMonitor.advanced.bodyModeHintMerge'),
    replace: t('admin.channelMonitor.advanced.bodyModeHintReplace'),
  }

  const bodyProblemText = (problem: BodyProblem) =>
    problem.kind === 'notObject'
      ? t('admin.channelMonitor.advanced.bodyJsonObjectError')
      : `${t('admin.channelMonitor.advanced.bodyJsonError')}: ${problem.detail}`

  const pickBodyMode = (value: string) => {
    const mode = BODY_MODES.find((known) => known === value)
    if (!mode) return
    if (mode === 'off') setBodyLeft(false)
    onChange(withBodyMode(draft, mode))
  }

  const formatBody = () => {
    const pretty = prettyBody(draft.bodyText)
    // Text that is not JSON cannot be laid out; what is wrong with it is said instead.
    if (pretty === null) setBodyLeft(true)
    else onChange({ ...draft, bodyText: pretty })
  }

  return (
    <VStack gap={4} hAlign="stretch">
      <VStack gap={2} hAlign="stretch">
        <Text type="label">{t('admin.channelMonitor.advanced.headers')}</Text>
        {draft.headers.map((row, index) => (
          <HStack key={index} gap={2} vAlign="center">
            <TextInput
              label={t('admin.channelMonitor.advanced.headerNamePlaceholder')}
              isLabelHidden
              width={HEADER_NAME_WIDTH}
              placeholder={t('admin.channelMonitor.advanced.headerNamePlaceholder')}
              hasSpellCheck={false}
              autoComplete="off"
              value={row.name}
              onChange={(name) => onChange(withHeaderRow(draft, index, { name }))}
              status={invalidHeaderName([row]) === null ? undefined : { type: 'error' }}
              isDisabled={isDisabled}
            />
            <StackItem size="fill">
              <TextInput
                label={t('admin.channelMonitor.advanced.headerValuePlaceholder')}
                isLabelHidden
                width="100%"
                placeholder={t('admin.channelMonitor.advanced.headerValuePlaceholder')}
                hasSpellCheck={false}
                autoComplete="off"
                value={row.value}
                onChange={(value) => onChange(withHeaderRow(draft, index, { value }))}
                isDisabled={isDisabled}
              />
            </StackItem>
            <IconButton
              label={t('common.delete')}
              tooltip={t('common.delete')}
              variant="ghost"
              size="sm"
              icon={<Icon icon={XMarkIcon} />}
              // The last row is emptied rather than taken away; an empty one has nothing to take.
              isDisabled={isDisabled || isOnlyBlankRow}
              onClick={() => onChange(withoutHeaderRow(draft, index))}
            />
          </HStack>
        ))}
        <HStack>
          <Button
            label={t('admin.channelMonitor.advanced.headerAddRow')}
            variant="secondary"
            size="sm"
            icon={<Icon icon={PlusIcon} />}
            isDisabled={isDisabled}
            onClick={() => onChange(withBlankHeaderRow(draft))}
          />
        </HStack>
        {problems.headerName ? (
          <FieldStatus
            type="error"
            variant="detached"
            message={t('admin.channelMonitor.advanced.headerNameInvalid', { name: problems.headerName })}
          />
        ) : (
          <Text type="supporting">{t('admin.channelMonitor.advanced.headersHint')}</Text>
        )}
      </VStack>

      <RadioList
        label={t('admin.channelMonitor.advanced.bodyMode')}
        description={bodyModeHints[draft.bodyMode]}
        orientation="horizontal"
        value={draft.bodyMode}
        onChange={pickBodyMode}
        isDisabled={isDisabled}
      >
        {BODY_MODES.map((mode) => (
          <RadioListItem key={mode} value={mode} label={bodyModeLabels[mode]} />
        ))}
      </RadioList>

      {draft.bodyMode !== 'off' && (
        <VStack gap={2} hAlign="stretch">
          <TextArea
            label={t('admin.channelMonitor.advanced.bodyJson')}
            description={t('admin.channelMonitor.advanced.bodyJsonHint')}
            rows={10}
            hasSpellCheck={false}
            placeholder={bodyPlaceholder(provider, apiMode, draft.bodyMode)}
            value={draft.bodyText}
            onChange={(bodyText) => onChange({ ...draft, bodyText })}
            onBlur={() => setBodyLeft(true)}
            status={bodyProblem ? { type: 'error', message: bodyProblemText(bodyProblem) } : undefined}
            isDisabled={isDisabled}
          />
          <HStack hAlign="end">
            <Button
              label={t('admin.channelMonitor.advanced.bodyJsonFormat')}
              variant="secondary"
              size="sm"
              isDisabled={isDisabled || !draft.bodyText.trim()}
              onClick={formatBody}
            />
          </HStack>
        </VStack>
      )}
    </VStack>
  )
}
