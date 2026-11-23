import { toAppPath } from '@/utils/appPath'
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { useI18n } from '~/i18n'
import { useAppStore } from '~/stores/app'
import type { LoginAgreementDocument } from '@/types'

// Import admin compliance documents
import zhAdminCompliance from '~/legal/admin-compliance.zh.md?raw'
import enAdminCompliance from '~/legal/admin-compliance.en.md?raw'

marked.setOptions({
  breaks: true,
  gfm: true,
})

type LegalDocumentIcon = 'document' | 'shield' | 'globe' | 'cog'

/**
 * LegalDocumentPage - Display legal documents and policies
 * Equivalent to public/LegalDocumentView.vue
 */
export function LegalDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const { t, locale } = useI18n()
  const settings = useAppStore((s) => s.publicSettings)
  const fetchSettings = useAppStore((s) => s.fetchPublicSettings)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const siteName = settings?.site_name || 'Sub2API'
  const siteLogo = settings?.site_logo || toAppPath('/logo.svg')

  const isAdminComplianceDocument = documentId === 'admin-compliance'
  const documents = settings?.login_agreement_documents ?? []

  useEffect(() => {
    ;(async () => {
      setLoadError(false)
      const loadedSettings = await fetchSettings()
      if (!loadedSettings && !isAdminComplianceDocument) {
        setLoadError(true)
      }
      setLoading(false)
    })()
  }, [fetchSettings, isAdminComplianceDocument])

  const currentDocument: LoginAgreementDocument | null = isAdminComplianceDocument
    ? {
        id: 'admin-compliance',
        title: t('adminCompliance.title'),
        content_md: locale === 'zh' ? zhAdminCompliance : enAdminCompliance,
      }
    : documents.find((doc) => doc.id === documentId) ?? null

  const hasContent = Boolean(currentDocument?.content_md?.trim())

  const renderedHtml = hasContent
    ? DOMPurify.sanitize(marked.parse(currentDocument!.content_md!.trim()) as string)
    : ''

  const documentIcon: LegalDocumentIcon = (() => {
    const title = currentDocument?.title || ''
    if (title.includes('政策') || title.includes('隐私')) return 'shield'
    if (title.includes('国家') || title.includes('地区')) return 'globe'
    if (title.includes('特定')) return 'cog'
    return 'document'
  })()

  const updatedAt = isAdminComplianceDocument ? '' : settings?.login_agreement_updated_at || ''
  const documentTypeLabel = isAdminComplianceDocument
    ? t('legal.adminCompliance')
    : t('legal.loginAgreement')

  const currentYear = new Date().getFullYear()

  if (loading) {
    return (
      <Center axis="both" padding={8} style={{ minHeight: '60vh' }}>
        <Spinner />
      </Center>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-dark-950 dark:text-white">
      {/* Header */}
      <header
        className="border-b border-gray-200 bg-white/95 dark:border-dark-800 dark:bg-dark-900/95"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            {settings ? (
              <>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                  <img src={siteLogo} alt="Logo" className="h-full w-full object-contain" />
                </div>
                <Text weight="semibold" className="truncate text-base">
                  {siteName}
                </Text>
              </>
            ) : (
              <>
                <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-dark-700" />
                <div className="h-5 w-28 animate-pulse rounded bg-gray-200 dark:bg-dark-700" />
              </>
            )}
          </Link>
          <Link
            to="/login"
            className="inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700"
          >
            {t('home.login')}
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
        {loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <Heading level={1} className="text-lg font-semibold">
              {t('legal.loadFailed')}
            </Heading>
            <Text className="mt-2 text-sm">{t('legal.retryLater')}</Text>
          </div>
        ) : !currentDocument ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-dark-700 dark:bg-dark-900">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-dark-800 dark:text-dark-300">
                📄
              </div>
              <div>
                <Heading level={1} className="text-lg font-semibold">
                  {t('legal.notFound')}
                </Heading>
                <Text className="mt-2 text-sm leading-6" color="secondary">
                  {t('legal.notFoundDescription')}
                </Text>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Document Header */}
            <div className="mb-8 border-b border-gray-200 pb-6 dark:border-dark-700">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                  {documentIcon === 'shield' && '🛡️'}
                  {documentIcon === 'globe' && '🌍'}
                  {documentIcon === 'cog' && '⚙️'}
                  {documentIcon === 'document' && '📄'}
                </div>
                <div className="min-w-0">
                  <Text
                   
                    weight="medium"
                    className="text-primary-700 dark:text-primary-300"
                  >
                    {documentTypeLabel}
                  </Text>
                  <Heading
                    level={1}
                    className="mt-2 break-words text-2xl font-bold tracking-normal sm:text-3xl"
                  >
                    {currentDocument.title}
                  </Heading>
                  {updatedAt && (
                    <Text color="secondary" className="mt-3">
                      {t('legal.updatedAt', { date: updatedAt })}
                    </Text>
                  )}
                </div>
              </div>
            </div>

            {/* Document Content */}
            {hasContent ? (
              <div
                className="legal-document-content"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-400">
                {t('legal.empty')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className="border-t border-gray-200/50 px-6 py-8 dark:border-dark-800/50"
      >
        <div className="mx-auto max-w-6xl text-center">
          <Text color="secondary">
            &copy; {currentYear} {siteName}
          </Text>
        </div>
      </footer>
    </div>
  )
}
