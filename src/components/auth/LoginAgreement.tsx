import { useCallback, useState } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Banner } from '@astryxdesign/core/Banner'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { LoginAgreementDocument, PublicSettings } from '@/types'
import { useI18n } from '~/i18n'

const STORAGE_KEY = 'sub2api_login_agreement_consent'

function hasAccepted(revision: string): boolean {
  if (!revision) return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return !!raw && (JSON.parse(raw) as { revision?: string }).revision === revision
  } catch {
    return false
  }
}

export interface LoginAgreementState {
  enabled: boolean
  mode: 'modal' | 'checkbox'
  documents: LoginAgreementDocument[]
  updatedAt: string
  accepted: boolean
  isModalOpen: boolean
  /** True while the user must still accept before signing in. */
  gateActive: boolean
  apply: (settings: PublicSettings | null) => void
  accept: () => void
  reject: () => void
  openModal: () => void
  /** Fail-open when public settings could not be loaded (mirrors the Vue page). */
  disable: () => void
}

/** Port of the login-agreement logic shared by LoginView.vue and RegisterView.vue. */
export function useLoginAgreement(): LoginAgreementState {
  const [enabled, setEnabled] = useState(false)
  const [mode, setMode] = useState<'modal' | 'checkbox'>('modal')
  const [documents, setDocuments] = useState<LoginAgreementDocument[]>([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [revision, setRevision] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [isModalOpen, setModalOpen] = useState(false)

  const apply = useCallback((settings: PublicSettings | null) => {
    const raw = settings?.login_agreement_documents
    const docs = Array.isArray(raw) ? raw.filter((doc) => doc.title?.trim()) : []
    const isEnabled = settings?.login_agreement_enabled === true && docs.length > 0
    const nextMode = settings?.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal'
    const updated = settings?.login_agreement_updated_at || ''
    const rev =
      settings?.login_agreement_revision || `${updated}:${docs.map((doc) => `${doc.id}:${doc.title}`).join('|')}`
    const isAccepted = !isEnabled || hasAccepted(rev)
    setEnabled(isEnabled)
    setMode(nextMode)
    setDocuments(docs)
    setUpdatedAt(updated)
    setRevision(rev)
    setAccepted(isAccepted)
    setModalOpen(isEnabled && !isAccepted && nextMode !== 'checkbox')
  }, [])

  return {
    enabled,
    mode,
    documents,
    updatedAt,
    accepted,
    isModalOpen,
    gateActive: enabled && !accepted,
    apply,
    accept: () => {
      if (revision) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ revision, accepted_at: new Date().toISOString() }))
      }
      setAccepted(true)
      setModalOpen(false)
    },
    reject: () => {
      localStorage.removeItem(STORAGE_KEY)
      setAccepted(false)
      setModalOpen(false)
    },
    openModal: () => setModalOpen(true),
    disable: () => {
      setEnabled(false)
      setAccepted(true)
    },
  }
}

function documentHref(doc: LoginAgreementDocument): string {
  return `/legal/${encodeURIComponent(doc.id || doc.title)}`
}

/** Checkbox row, "please accept" notice, and the terms dialog. */
export function LoginAgreementPrompt({
  agreement,
  onRejected,
}: {
  agreement: LoginAgreementState
  onRejected: () => void
}) {
  const { t, locale } = useI18n()
  if (!agreement.enabled) return null

  const docLinks = agreement.documents.map((doc, index) => (
    <span key={doc.id || doc.title}>
      <Link href={documentHref(doc)} target="_blank" type="supporting">
        {doc.title}
      </Link>
      {index < agreement.documents.length - 1 && t('legal.loginAgreementPrompt.documentSeparator')}
    </span>
  ))

  const date = agreement.updatedAt
    ? new Date(agreement.updatedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')
    : t('legal.loginAgreementPrompt.recently')

  const rejectAndWarn = () => {
    agreement.reject()
    onRejected()
  }

  return (
    <>
      {agreement.mode === 'checkbox' ? (
        <HStack gap={2} vAlign="start">
          <CheckboxInput
            label={t('legal.loginAgreementPrompt.checkboxPrefix')}
            isLabelHidden
            value={agreement.accepted}
            onChange={(checked) => (checked ? agreement.accept() : rejectAndWarn())}
          />
          <Text type="supporting" color="secondary">
            {t('legal.loginAgreementPrompt.checkboxPrefix')} {docLinks}
          </Text>
        </HStack>
      ) : (
        !agreement.accepted && (
          <Banner
            status="warning"
            title={t('legal.loginAgreementPrompt.noticeTitle')}
            description={t('legal.loginAgreementPrompt.noticeDescription')}
            endContent={
              <Button
                label={t('legal.loginAgreementPrompt.viewTerms')}
                size="sm"
                variant="secondary"
                onClick={agreement.openModal}
              />
            }
          />
        )
      )}
      <Dialog isOpen={agreement.isModalOpen} onOpenChange={(open) => !open && rejectAndWarn()} width={520}>
        <DialogHeader title={t('legal.loginAgreementPrompt.dialogTitle')} />
        <VStack gap={4} hAlign="stretch">
          <Text type="body" color="secondary">
            {t('legal.loginAgreementPrompt.dialogDescription', { date })}
          </Text>
          <VStack gap={2}>
            <Text type="label" weight="semibold">
              {t('legal.loginAgreementPrompt.relatedDocuments')}
            </Text>
            {agreement.documents.map((doc) => (
              <Link key={doc.id || doc.title} href={documentHref(doc)} target="_blank">
                {doc.title}
              </Link>
            ))}
          </VStack>
          <HStack gap={2} justify="end">
            <Button label={t('legal.loginAgreementPrompt.reject')} variant="secondary" onClick={rejectAndWarn} />
            <Button label={t('legal.loginAgreementPrompt.accept')} variant="primary" onClick={agreement.accept} />
          </HStack>
        </VStack>
      </Dialog>
    </>
  )
}
