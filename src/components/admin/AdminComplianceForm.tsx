import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { adminComplianceAPI, type AdminComplianceStatus } from '@/api/admin/compliance'
import { extractApiErrorMessage } from '@/utils/apiError'
import { sanitizeUrl } from '@/utils/url'
import { PublicPageFrame } from '~/components/common/PublicPageFrame'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import zhDocument from '~/legal/admin-compliance.zh.md?raw'
import enDocument from '~/legal/admin-compliance.en.md?raw'

export default function AdminComplianceForm({ status, onAccepted, onLogout }: {
  status: AdminComplianceStatus
  onAccepted: () => void
  onLogout: () => Promise<void>
}) {
  const { t, locale } = useI18n()
  const siteName = useAppStore((s) => s.siteName)
  useEffect(() => { document.title = `${t('adminCompliance.title')} - ${siteName}` }, [t, locale, siteName])
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const expected = locale === 'zh' ? status.ack_phrase_zh : status.ack_phrase_en
  const source = sanitizeUrl(locale === 'zh' ? status.document_url_zh : status.document_url_en)
  const markdown = locale === 'zh' ? zhDocument : enDocument
  const localVersion = /^(?:版本：|Version:\s*)(\S+)\s*$/m.exec(markdown)?.[1]
  const body = useMemo(() => DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string), [markdown])
  const matches = Boolean(expected && phrase.trim() === expected)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || !matches) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const next = await adminComplianceAPI.accept({ phrase: phrase.trim(), language: locale })
      if (next.required !== false) throw new Error(t('adminCompliance.acceptFailed'))
      onAccepted()
    } catch (cause) {
      setError(extractApiErrorMessage(cause, t('adminCompliance.acceptFailed')))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <PublicPageFrame hasFooterLinks={false}>
      <Center axis="horizontal" padding={4}>
        <VStack gap={4} padding={4} width="100%" style={{ maxWidth: '52rem' }} hAlign="stretch">
          <Heading level={1}>{t('adminCompliance.title')}</Heading>
          <Banner status="warning" title={t('adminCompliance.blockingNotice')} description={t('adminCompliance.riskNotice')} collapsible={false} />
          <HStack gap={3} wrap="wrap">
            <Text weight="semibold">{t('adminCompliance.version')} · {status.version}</Text>
            {source && <Link href={source} isExternalLink>{t('adminCompliance.openDocument')}</Link>}
          </HStack>
          {localVersion === status.version && <article tabIndex={0} aria-label={t('legal.adminCompliance')} className="compliance-document" dangerouslySetInnerHTML={{ __html: body }} />}
          <form onSubmit={submit}>
            <VStack gap={3} hAlign="stretch">
              <TextInput label={t('adminCompliance.inputLabel')} description={expected} placeholder={t('adminCompliance.inputPlaceholder')}
                autoComplete="off" value={phrase} onChange={setPhrase} isDisabled={busy} />
              <Text type="supporting" color="secondary">{t('adminCompliance.legalNote')}</Text>
              {error && <Banner status="error" title={error} />}
              <HStack gap={2} wrap="wrap">
                <Button type="submit" label={t('adminCompliance.accept')} variant="primary" isDisabled={!matches || busy} />
                <Button type="button" label={t('adminCompliance.logout')} variant="secondary" isDisabled={busy} onClick={() => void onLogout()} />
              </HStack>
            </VStack>
          </form>
        </VStack>
      </Center>
    </PublicPageFrame>
  )
}
