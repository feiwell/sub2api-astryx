import { useEffect, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Grid } from '@astryxdesign/core/Grid'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import type { PromptAuditEvent } from '@/features/prompt-audit/types'
import { useI18n } from '~/i18n'
import { getEvent } from './api'
import {
  NO_VALUE,
  actionLabel,
  auditErrorMessage,
  categoriesLabel,
  categoryLabel,
  decisionLabel,
  displayPrompt,
  evidenceLabel,
  guardReturn,
  issueAction,
  issueCategory,
  issueDescription,
  issueSeverity,
  issueTitle,
} from './eventText'

const TABS = ['summary', 'risks', 'technical'] as const
type DetailTab = (typeof TABS)[number]

// The panel keeps one height, so the dialog does not jump when the tab changes.
const PANEL_MIN_HEIGHT = 'min(62vh, 36rem)'
const BLOCK_MAX_HEIGHT = 'min(46vh, 26rem)'

/** A long text as written, wrapped, scrolling inside its own box. */
function TextBlock({ text, isJson = false }: { text: string; isJson?: boolean }) {
  return (
    <CodeBlock
      code={text}
      language={isJson ? 'json' : 'plaintext'}
      hasLanguageLabel={false}
      isWrapped
      maxHeight={BLOCK_MAX_HEIGHT}
      width="100%"
      size="sm"
    />
  )
}

/** One audit event in full: who sent what, what the guard found in it, and how it was scanned. */
export function AuditEventDialog({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const { t } = useI18n()
  const [event, setEvent] = useState<PromptAuditEvent | null>(null)
  const [isLoading, setLoading] = useState(true)
  // What to tell about a failed load; null while nothing failed.
  const [failure, setFailure] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('summary')

  useEffect(() => {
    let isStale = false
    setLoading(true)
    setFailure(null)
    setEvent(null)
    setTab('summary')
    getEvent(eventId)
      .then((answer) => {
        if (!isStale) setEvent(answer)
      })
      .catch((error) => {
        if (isStale) return
        console.error('[prompt-audit] failed to load event detail', error)
        setFailure(auditErrorMessage(error, 'admin.promptAudit.errors.loadDetail'))
      })
      .finally(() => {
        if (!isStale) setLoading(false)
      })
    return () => {
      isStale = true
    }
  }, [eventId])

  const reportOpen = (open: boolean) => {
    if (!open) onClose()
  }

  const promptTitle = <Text type="label">{t('admin.promptAudit.events.promptFull')}</Text>

  const renderSummary = (current: PromptAuditEvent) => (
    <Grid columns={{ minWidth: 320, max: 2 }} gap={5}>
      <VStack gap={2}>
        {promptTitle}
        <TextBlock text={displayPrompt(current)} />
      </VStack>
      <MetadataList columns="single">
        <MetadataListItem label={t('admin.promptAudit.events.decision')}>
          <Text weight="medium">{`${decisionLabel(current.decision)} · ${actionLabel(current.action)}`}</Text>
        </MetadataListItem>
        <MetadataListItem label={t('admin.promptAudit.events.user')}>
          <Text wordBreak="break-all">{current.snapshot.username || NO_VALUE}</Text>
        </MetadataListItem>
        <MetadataListItem label={t('admin.promptAudit.events.email')}>
          <Text wordBreak="break-all">{current.snapshot.user_email || NO_VALUE}</Text>
        </MetadataListItem>
        <MetadataListItem label={t('admin.promptAudit.events.apiKey')}>
          <Text wordBreak="break-all">{current.snapshot.api_key_name || NO_VALUE}</Text>
        </MetadataListItem>
        <MetadataListItem label={t('admin.promptAudit.events.group')}>
          <Text>{current.snapshot.group_name || NO_VALUE}</Text>
        </MetadataListItem>
        <MetadataListItem label={t('admin.promptAudit.events.model')}>
          <Text wordBreak="break-all">{current.snapshot.model || NO_VALUE}</Text>
        </MetadataListItem>
        <MetadataListItem label={t('admin.promptAudit.events.categories')}>
          <Text>{categoriesLabel(current.categories)}</Text>
        </MetadataListItem>
      </MetadataList>
    </Grid>
  )

  const renderRisks = (current: PromptAuditEvent) => {
    const issues = current.issue_summaries || []
    return (
      <VStack gap={5}>
        <Grid columns={{ minWidth: 320, max: 2 }} gap={4}>
          <VStack gap={2}>
            <VStack gap={1}>
              {promptTitle}
              <Text type="supporting" color="secondary">
                {t('admin.promptAudit.events.promptFullHint')}
              </Text>
            </VStack>
            <TextBlock text={displayPrompt(current)} />
          </VStack>
          <VStack gap={2}>
            <VStack gap={1}>
              <Text type="label">{t('admin.promptAudit.events.guardReturn')}</Text>
              <Text type="supporting" color="secondary">
                {t('admin.promptAudit.events.guardReturnHint')}
              </Text>
            </VStack>
            <TextBlock text={guardReturn(current)} isJson />
          </VStack>
        </Grid>

        <VStack gap={3}>
          <Text type="label">{t('admin.promptAudit.events.riskSummaries')}</Text>
          {issues.length === 0 && (
            <Center padding={6}>
              <Text type="supporting" color="secondary">
                {t('admin.promptAudit.events.noRisks')}
              </Text>
            </Center>
          )}
          {issues.map((issue, index) => (
            // Two findings of one scanner can share a code: the position keeps the keys apart.
            <Card key={`${issue.scanner_id}-${issue.code}-${index}`} variant="muted" padding={4}>
              <VStack gap={2}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Text weight="semibold">{issueTitle(issue)}</Text>
                  <Badge variant="error" label={`${issueSeverity(issue)} · ${issueAction(issue)}`} />
                </HStack>
                <Text type="supporting" color="secondary">
                  {issueDescription(issue)}
                </Text>
                <MetadataList columns="multi">
                  <MetadataListItem label={t('admin.promptAudit.events.categories')}>
                    <Text>{categoryLabel(issueCategory(issue))}</Text>
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.promptAudit.events.score')}>
                    <Text hasTabularNumbers>{issue.score}</Text>
                  </MetadataListItem>
                  <MetadataListItem label={t('admin.promptAudit.events.evidence')}>
                    <Text wordBreak="break-word">{issue.evidence ? evidenceLabel(issue.evidence) : NO_VALUE}</Text>
                  </MetadataListItem>
                </MetadataList>
              </VStack>
            </Card>
          ))}
        </VStack>
      </VStack>
    )
  }

  const renderTechnical = (current: PromptAuditEvent) => (
    <MetadataList columns="single">
      <MetadataListItem label={t('admin.promptAudit.events.requestId')}>
        <Text type="code" wordBreak="break-all">
          {current.snapshot.request_id || NO_VALUE}
        </Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.promptHash')}>
        <Text type="code" wordBreak="break-all">
          {current.snapshot.prompt_hash || NO_VALUE}
        </Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.scanner')}>
        <Text>{`${current.scanner_backend} · ${current.scanner_version}`}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.policy')}>
        <Text>{`${current.policy_id} · v${current.policy_version}`}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.guardEndpoint')}>
        <Text>{current.guard_endpoint_id || NO_VALUE}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.config')}>
        <Text>{`v${current.config_version}`}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.chunks')}>
        <Text hasTabularNumbers>{current.chunk_total}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.latency')}>
        <Text hasTabularNumbers>{`${current.latency_ms} ms`}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.stage')}>
        <Text>{current.snapshot.stage || 'http'}</Text>
      </MetadataListItem>
      <MetadataListItem label={t('admin.promptAudit.events.technical.protocol')}>
        <Text wordBreak="break-all">{`${current.snapshot.protocol} · ${current.snapshot.endpoint}`}</Text>
      </MetadataListItem>
    </MetadataList>
  )

  return (
    <Dialog isOpen onOpenChange={reportOpen} width={1040} maxHeight="90dvh" purpose="info">
      <Layout
        header={<DialogHeader title={t('admin.promptAudit.events.detailTitle')} onOpenChange={reportOpen} />}
        content={
          <LayoutContent>
            {isLoading ? (
              <Center padding={10}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : event ? (
              <VStack gap={4}>
                <TabList value={tab} onChange={(next) => setTab(next as DetailTab)} hasDivider>
                  {TABS.map((name) => (
                    <Tab key={name} value={name} label={t(`admin.promptAudit.events.tabs.${name}`)} />
                  ))}
                </TabList>
                <VStack minHeight={PANEL_MIN_HEIGHT}>
                  {tab === 'summary' && renderSummary(event)}
                  {tab === 'risks' && renderRisks(event)}
                  {tab === 'technical' && renderTechnical(event)}
                </VStack>
              </VStack>
            ) : (
              <Banner
                status="error"
                title={t('admin.promptAudit.errors.loadDetail')}
                description={failure && failure !== t('admin.promptAudit.errors.loadDetail') ? failure : undefined}
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
