import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { formatDateTime } from '@/utils/format'
import { resolveUpstreamPayload } from '@/views/admin/ops/utils/errorDetailResponse'
import { useI18n } from '~/i18n'
import { opsAPI, type OpsErrorDetail } from '~/lib/api/admin/ops'
import {
  displayModel,
  hasModelMapping,
  isUpstreamError,
  meaningfulPayload,
  readablePayload,
  requestTypeName,
  statusColor,
  type OpsErrorKind,
} from './errorLog'
import { errorMessage } from './errors'

const PAYLOAD_HEIGHT = 360
const PREVIEW_HEIGHT = 240
const NO_VALUE = '—'

const PAYLOAD_KEYS = ['client', 'upstream_message', 'upstream_detail', 'upstream_events'] as const

/** The payloads worth reading, each once: the same text often comes back under several fields. */
function payloadSections(detail: OpsErrorDetail) {
  const values = [detail.error_body, detail.upstream_error_message, detail.upstream_error_detail, detail.upstream_errors]
  return PAYLOAD_KEYS.map((key, index) => ({ key, value: meaningfulPayload(values[index]) })).filter(
    (section, index, all) => section.value && all.findIndex((other) => other.value === section.value) === index,
  )
}

/** What an upstream attempt answered: its recorded payload, else the body the gateway kept. */
const responsePreview = (attempt: OpsErrorDetail): string =>
  resolveUpstreamPayload(attempt) || String(attempt.error_body || '').trim()

/** A payload as a code block. Only JSON is named as its language: a plain message is no code. */
function PayloadBlock({ payload, maxHeight }: { payload: string; maxHeight: number }) {
  const { code, isJson } = readablePayload(payload)
  return (
    <CodeBlock
      code={code}
      language={isJson ? 'json' : 'plaintext'}
      hasLanguageLabel={isJson}
      isWrapped
      maxHeight={maxHeight}
      width="100%"
      size="sm"
    />
  )
}

function StatusToken({ code }: { code: number | null | undefined }) {
  return code == null ? <Text>{NO_VALUE}</Text> : <Token size="sm" color={statusColor(code)} label={String(code)} />
}

/** One error in full: who it hit, what was answered, and the upstream attempts behind a request error. */
export function OpsErrorDetailDialog({
  errorId,
  errorKind,
  onBack,
  onClose,
}: {
  errorId: number
  /** Which list the id belongs to. Only a request error has upstream attempts behind it. */
  errorKind: OpsErrorKind
  /** Back to the list the error was opened from. */
  onBack: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [detail, setDetail] = useState<OpsErrorDetail | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What the server said about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<OpsErrorDetail[]>([])
  const [areAttemptsLoading, setAttemptsLoading] = useState(false)
  const [haveAttemptsFailed, setAttemptsFailed] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())
  const hasAttempts = errorKind === 'request'

  useEffect(() => {
    let isStale = false
    const load = errorKind === 'upstream' ? opsAPI.getUpstreamErrorDetail : opsAPI.getRequestErrorDetail
    setLoading(true)
    setFailure(null)
    setDetail(null)
    setExpanded(new Set())
    load(errorId)
      .then((answer) => {
        if (!isStale) setDetail(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load error detail', error)
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [errorId, errorKind])

  useEffect(() => {
    setAttempts([])
    setAttemptsFailed(false)
    if (!hasAttempts) return
    let isStale = false
    setAttemptsLoading(true)
    opsAPI
      .listRequestErrorUpstreamErrors(errorId, { page: 1, page_size: 100, view: 'all' }, { include_detail: true })
      .then((answer) => {
        if (!isStale) setAttempts(answer.items || [])
      })
      .catch((error) => {
        if (isStale) return
        console.error('[ops] failed to load correlated upstream errors', error)
        setAttemptsFailed(true)
      })
      .finally(() => {
        if (!isStale) setAttemptsLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [errorId, hasAttempts])

  const toggle = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const renderDetail = (current: OpsErrorDetail) => {
    const isUpstream = isUpstreamError(current)
    const rootCause =
      [current.upstream_error_message, current.upstream_error_detail, current.message, current.error_body]
        .map(meaningfulPayload)
        .find(Boolean) ?? ''
    const sections = payloadSections(current)
    const requestType = requestTypeName(current.request_type) ?? 'Unknown'
    const idOr = (name: string, id: number | null | undefined) => name || (id != null ? String(id) : NO_VALUE)

    return (
      <VStack gap={5}>
        <MetadataList columns="multi">
          <MetadataListItem label={t('admin.ops.errorDetail.requestId')}>
            <Text type="code" wordBreak="break-all">
              {current.request_id || current.client_request_id || NO_VALUE}
            </Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.time')}>
            <Text>{formatDateTime(current.created_at)}</Text>
          </MetadataListItem>
          {/* An upstream error is told by the account that got it, any other by the user it hit. */}
          <MetadataListItem label={t(isUpstream ? 'admin.ops.errorDetail.account' : 'admin.ops.errorDetail.user')}>
            <Text wordBreak="break-all">
              {isUpstream
                ? idOr(current.account_name, current.account_id)
                : idOr(current.user_email, current.user_id)}
            </Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.platform')}>
            <Text>{current.platform || NO_VALUE}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.group')}>
            <Text>{idOr(current.group_name, current.group_id)}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.model')}>
            <Text type="code" wordBreak="break-all">
              {hasModelMapping(current)
                ? `${current.requested_model} → ${current.upstream_model}`
                : displayModel(current) || NO_VALUE}
            </Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.inboundEndpoint')}>
            <Text type="code" wordBreak="break-all">
              {current.inbound_endpoint || NO_VALUE}
            </Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.upstreamEndpoint')}>
            <Text type="code" wordBreak="break-all">
              {current.upstream_endpoint || NO_VALUE}
            </Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.status')}>
            <StatusToken code={current.status_code} />
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.upstreamStatus')}>
            <StatusToken code={current.upstream_status_code} />
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.requestType')}>
            <Text>{t(`admin.ops.errorDetail.requestType${requestType}`)}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.ops.errorDetail.message')}>
            <Text maxLines={3} wordBreak="break-word">
              {rootCause || NO_VALUE}
            </Text>
          </MetadataListItem>
          {current.api_key_prefix ? (
            <MetadataListItem label={t('admin.ops.errorDetail.apiKeyPrefix')}>
              <Text type="code">{current.api_key_prefix}</Text>
            </MetadataListItem>
          ) : null}
        </MetadataList>

        {rootCause && <Banner status="warning" title={t('admin.ops.errorDetail.rootCause')} description={rootCause} />}

        <Card variant="muted" padding={4}>
          <VStack gap={3}>
            <Heading level={4}>{t('admin.ops.errorDetail.diagnosticPayloads')}</Heading>
            {sections.length === 0 ? (
              <Text type="supporting" color="secondary">
                {t('common.noData')}
              </Text>
            ) : (
              sections.map((section) => (
                <VStack key={section.key} gap={1.5}>
                  <Text type="label">{t(`admin.ops.errorDetail.payloads.${section.key}`)}</Text>
                  <PayloadBlock payload={section.value} maxHeight={PAYLOAD_HEIGHT} />
                </VStack>
              ))
            )}
          </VStack>
        </Card>

        {hasAttempts && (
          <Card variant="muted" padding={4}>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center">
                <Heading level={4}>{t('admin.ops.errorDetails.upstreamErrors')}</Heading>
                {areAttemptsLoading && <Spinner size="sm" />}
              </HStack>
              {haveAttemptsFailed ? (
                <Banner status="error" title={t('admin.ops.failedToLoadData')} />
              ) : (
                !areAttemptsLoading &&
                attempts.length === 0 && (
                  <Text type="supporting" color="secondary">
                    {t('common.noData')}
                  </Text>
                )
              )}
              {attempts.map((attempt, index) => {
                const preview = responsePreview(attempt)
                const isExpanded = expanded.has(attempt.id)
                return (
                  <Card key={attempt.id} padding={4}>
                    <VStack gap={2}>
                      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                        <HStack gap={2} vAlign="center">
                          <Text weight="semibold">#{index + 1}</Text>
                          {attempt.type && <Text type="code">{attempt.type}</Text>}
                        </HStack>
                        <Button
                          label={t(
                            isExpanded
                              ? 'admin.ops.errorDetail.responsePreview.collapse'
                              : 'admin.ops.errorDetail.responsePreview.expand',
                          )}
                          tooltip={preview ? undefined : t('common.noData')}
                          variant="ghost"
                          size="sm"
                          icon={<Icon icon={isExpanded ? ChevronDownIcon : ChevronRightIcon} />}
                          isDisabled={!preview}
                          onClick={() => toggle(attempt.id)}
                        />
                      </HStack>
                      <MetadataList columns={2}>
                        <MetadataListItem label={t('admin.ops.errorDetail.upstreamEvent.status')}>
                          <StatusToken code={attempt.status_code} />
                        </MetadataListItem>
                        <MetadataListItem label={t('admin.ops.errorDetail.upstreamEvent.requestId')}>
                          <Text type="code" wordBreak="break-all">
                            {attempt.request_id || attempt.client_request_id || NO_VALUE}
                          </Text>
                        </MetadataListItem>
                      </MetadataList>
                      {attempt.message && <Text wordBreak="break-word">{attempt.message}</Text>}
                      {isExpanded && <PayloadBlock payload={preview} maxHeight={PREVIEW_HEIGHT} />}
                    </VStack>
                  </Card>
                )
              })}
            </VStack>
          </Card>
        )}
      </VStack>
    )
  }

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={1040} maxHeight="90dvh" purpose="info">
      <Layout
        header={
          <DialogHeader
            title={t('admin.ops.errorDetail.titleWithId', { id: String(errorId) })}
            onOpenChange={reportOpen}
          />
        }
        content={
          <LayoutContent>
            {isLoading ? (
              <Center padding={10}>
                <Spinner label={t('admin.ops.errorDetail.loading')} />
              </Center>
            ) : detail ? (
              renderDetail(detail)
            ) : (
              <Banner
                status="error"
                title={t('admin.ops.failedToLoadErrorDetail')}
                description={failure || undefined}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="between">
              <Button
                label={t('admin.ops.errorDetail.backToList')}
                variant="secondary"
                icon={<Icon icon={ArrowLeftIcon} />}
                onClick={onBack}
              />
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
