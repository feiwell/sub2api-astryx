import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useI18n } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { AuditLog } from '~/lib/api/admin/audit'
import {
  NO_VALUE,
  auditErrorMessage,
  authMethodLabel,
  formatAuditTime,
  isSuccessStatus,
  readBody,
  statusColor,
} from './auditText'

const BLOCK_MAX_HEIGHT = 'min(40vh, 22rem)'

/** A long text as stored, wrapped, scrolling inside its own box. */
function TextBlock({ title, text, isJson }: { title: string; text: string; isJson: boolean }) {
  return (
    <VStack gap={2}>
      <Text type="label">{title}</Text>
      <CodeBlock
        code={text}
        language={isJson ? 'json' : 'plaintext'}
        hasLanguageLabel={false}
        isWrapped
        maxHeight={BLOCK_MAX_HEIGHT}
        width="100%"
        size="sm"
      />
    </VStack>
  )
}

/**
 * One operation in full. The list leaves the request body out, so the entry is fetched again here;
 * the server has already redacted what the body held in secrets.
 */
export function AuditLogDetailDialog({ logId, onClose }: { logId: number; onClose: () => void }) {
  const { t, locale } = useI18n()
  const [log, setLog] = useState<AuditLog | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    setLog(null)
    adminAPI.audit
      .get(logId)
      .then((answer) => {
        if (!isStale) setLog(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[audit-log] failed to load an entry', error)
        setFailure(auditErrorMessage(error, 'admin.audit.loadFailed'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [logId])

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const renderLog = (current: AuditLog) => {
    const body = current.request_body ? readBody(current.request_body) : null
    const hasExtra = !!current.extra && Object.keys(current.extra).length > 0
    const result = isSuccessStatus(current.status_code)
      ? t('admin.audit.filters.resultSuccess')
      : t('admin.audit.filters.resultFailure')
    return (
      <VStack gap={5}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Token size="sm" color={statusColor(current.status_code)} label={`${current.status_code} ${result}`} />
            <Text type="code" weight="semibold" wordBreak="break-all">
              {current.action}
            </Text>
          </HStack>
          <Text type="code" color="secondary" wordBreak="break-all">
            {`${current.method} ${current.path}`}
          </Text>
        </VStack>

        <MetadataList columns="multi">
          <MetadataListItem label={t('admin.audit.columns.time')}>
            <Text hasTabularNumbers>{formatAuditTime(current.created_at, locale)}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.audit.detail.latency')}>
            <Text hasTabularNumbers>{`${current.latency_ms} ms`}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.audit.columns.actor')}>
            <Text wordBreak="break-all">{current.actor_email || NO_VALUE}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.audit.detail.actorRole')}>
            <Text>{current.actor_role || NO_VALUE}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('admin.audit.filters.authMethod')}>
            <Text>{authMethodLabel(current.auth_method) || NO_VALUE}</Text>
          </MetadataListItem>
          {current.credential_masked && (
            <MetadataListItem label={t('admin.audit.detail.credential')}>
              <Text type="code" wordBreak="break-all">
                {current.credential_masked}
              </Text>
            </MetadataListItem>
          )}
          <MetadataListItem label={t('admin.audit.columns.clientIp')}>
            <Text type="code" wordBreak="break-all">
              {current.client_ip || NO_VALUE}
            </Text>
          </MetadataListItem>
          {current.request_id && (
            <MetadataListItem label={t('admin.audit.detail.requestId')}>
              <Text type="code" wordBreak="break-all">
                {current.request_id}
              </Text>
            </MetadataListItem>
          )}
        </MetadataList>

        {/* A user agent is a long line: it gets the whole width rather than half of it. */}
        <MetadataList columns="single" label={{ position: 'top' }}>
          <MetadataListItem label={t('admin.audit.detail.userAgent')}>
            <Text wordBreak="break-word">{current.user_agent || NO_VALUE}</Text>
          </MetadataListItem>
        </MetadataList>

        {body && <TextBlock title={t('admin.audit.detail.requestBody')} text={body.text} isJson={body.isJson} />}
        {hasExtra && (
          <TextBlock title={t('admin.audit.detail.extra')} text={JSON.stringify(current.extra, null, 2)} isJson />
        )}
      </VStack>
    )
  }

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={760} maxHeight="90dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.audit.detail.title')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            {isLoading ? (
              <Center padding={10}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : log ? (
              renderLog(log)
            ) : (
              <Banner
                status="error"
                title={t('admin.audit.loadFailed')}
                description={failure && failure !== t('admin.audit.loadFailed') ? failure : undefined}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('common.close')} variant="secondary" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
