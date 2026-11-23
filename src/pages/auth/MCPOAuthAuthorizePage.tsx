import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { mcpAPI, type MCPAccessScope, type MCPAuthorization, type MCPConsent } from '@/api/mcp'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '~/components/auth/StepUp'
import { CenteredFrame } from '~/components/common/CenteredFrame'
import { useI18n } from '~/i18n'
import { useAuthStore, selectIsAdmin } from '~/stores/auth'

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}

const REQUIRED = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'resource'] as const
const ALLOWED: string[] = [...REQUIRED, 'scope', 'state']

/** React port of views/auth/MCPOAuthAuthorizeView.vue: MCP OAuth consent screen. */
export function MCPOAuthAuthorizePage() {
  const { t } = useI18n()
  const location = useLocation()
  const [query] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const isAdmin = useAuthStore(selectIsAdmin)
  const stepUp = useStepUp()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [consent, setConsent] = useState<MCPConsent | null>(null)
  const [scope, setScope] = useState<MCPAccessScope>('user')
  const [readOnly, setReadOnly] = useState(true)
  const authorizationRef = useRef<MCPAuthorization | null>(null)
  const generationRef = useRef(0)

  function parseAuthorization(): MCPAuthorization {
    const values: Record<string, string> = {}
    for (const key of new Set(query.keys())) {
      const all = query.getAll(key)
      if (!ALLOWED.includes(key) || all.length !== 1 || all[0].length > 4096) throw new Error(t('mcp.invalidRequest'))
      values[key] = all[0]
    }
    if (
      REQUIRED.some((key) => !values[key]) ||
      values.response_type !== 'code' ||
      values.code_challenge_method !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(values.code_challenge) ||
      (values.scope !== undefined && values.scope !== '' && values.scope !== 'mcp')
    ) {
      throw new Error(t('mcp.invalidRequest'))
    }
    return values as unknown as MCPAuthorization
  }

  function validatePreview(result: MCPConsent, request: MCPAuthorization) {
    if (
      result.client_id !== request.client_id ||
      result.redirect_uri !== request.redirect_uri ||
      result.resource !== request.resource ||
      result.scope !== 'mcp' ||
      typeof result.client_name !== 'string'
    ) {
      throw new Error(t('mcp.invalidRequest'))
    }
    const redirect = new URL(result.redirect_uri)
    if (!['https:', 'http:'].includes(redirect.protocol) || redirect.username || redirect.password || redirect.hash) {
      throw new Error(t('mcp.invalidRequest'))
    }
  }

  useEffect(() => {
    const current = ++generationRef.current
    setLoading(true)
    setSubmitting(false)
    setPreviewError('')
    setSubmitError('')
    setConsent(null)
    authorizationRef.current = null
    setScope('user')
    setReadOnly(true)
    void (async () => {
      try {
        const request = parseAuthorization()
        const result = await mcpAPI.previewAuthorization({ ...request })
        if (current !== generationRef.current) return
        validatePreview(result, request)
        authorizationRef.current = Object.freeze({ ...request })
        setConsent(result)
      } catch (error) {
        if (current === generationRef.current) setPreviewError(errorMessage(error, t('mcp.consentLoadFailed')))
      } finally {
        if (current === generationRef.current) setLoading(false)
      }
    })()
    return () => {
      generationRef.current++
      authorizationRef.current = null
    }
    // Reload whenever the full URL changes, like the Vue route.fullPath watcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search])

  async function decide(approved: boolean) {
    const authorization = authorizationRef.current
    if (loading || submitting || !consent || !authorization) return
    const current = generationRef.current
    const expectedRedirect = new URL(consent.redirect_uri)
    const input = {
      authorization: { ...authorization },
      approved,
      scope: approved && isAdmin ? scope : ('user' as const),
      read_only: approved ? readOnly : true,
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const action = async () => {
        // A changed route or unmounted page must not retry a previous consent.
        if (current !== generationRef.current) throw new Error(t('mcp.invalidRequest'))
        try {
          return await mcpAPI.authorize(input)
        } catch (error) {
          if (current !== generationRef.current) throw new Error(t('mcp.invalidRequest'))
          throw error
        }
      }
      const result = approved && input.scope === 'admin' ? await stepUp.run(action) : await action()
      if (current !== generationRef.current) return
      const destination = new URL(result.redirect_url)
      if (
        destination.origin !== expectedRedirect.origin ||
        destination.pathname !== expectedRedirect.pathname ||
        destination.username ||
        destination.password ||
        destination.hash
      ) {
        throw new Error(t('mcp.invalidRedirect'))
      }
      window.location.assign(result.redirect_url)
    } catch (error) {
      if (current !== generationRef.current) return
      if (!isStepUpCancelled(error)) {
        setSubmitError(
          isStepUpBlocked(error)
            ? stepUpBlockReason(error) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
              ? t('stepUp.adminApiKeyForbidden')
              : t('stepUp.notEnabled')
            : errorMessage(error, t('mcp.consentSubmitFailed')),
        )
      }
      setSubmitting(false)
    }
  }

  return (
    <CenteredFrame>
      <Card padding={8}>
        <VStack gap={6} hAlign="stretch">
          <VStack gap={1}>
            <Heading level={1}>{t('mcp.consentTitle')}</Heading>
            <Text color="secondary">{t('mcp.consentDescription')}</Text>
          </VStack>
          {loading ? (
            <Spinner label={t('mcp.consentLoading')} />
          ) : previewError ? (
            <VStack gap={4} hAlign="start">
              <Banner status="error" title={previewError} description={t('mcp.consentRetryHint')} />
              <Button label={t('mcp.backToConnections')} variant="secondary" href="/settings/mcp" />
            </VStack>
          ) : consent ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void decide(true)
              }}>
              <VStack gap={6} hAlign="stretch">
                <Card padding={4}>
                  <VStack gap={4} hAlign="stretch">
                    <MetadataList label={{ position: 'top' }}>
                      <MetadataListItem label={t('mcp.applicationName')}>
                        <Text type="large" weight="semibold">
                          {consent.client_name}
                        </Text>
                      </MetadataListItem>
                      <MetadataListItem label={t('mcp.clientId')}>
                        <Text type="code">{consent.client_id}</Text>
                      </MetadataListItem>
                      <MetadataListItem label={t('mcp.returnAddress')}>
                        <VStack gap={1}>
                          <Text weight="semibold">{new URL(consent.redirect_uri).origin}</Text>
                          <Text type="code">{consent.redirect_uri}</Text>
                        </VStack>
                      </MetadataListItem>
                      <MetadataListItem label={t('mcp.requestedAccess')}>
                        <VStack gap={1}>
                          <Text>{t('mcp.requestedAccessDescription')}</Text>
                          <Text type="code">{consent.resource}</Text>
                        </VStack>
                      </MetadataListItem>
                    </MetadataList>
                    <Banner status="warning" title={t('mcp.untrustedApplicationHint')} />
                  </VStack>
                </Card>
                {user?.email && <Text color="secondary">{t('mcp.signedInAs', { email: user.email })}</Text>}
                <Selector
                  label={t('mcp.scope')}
                  description={scope === 'admin' ? t('mcp.adminScopeHint') : t('mcp.userScopeHint')}
                  value={scope}
                  isDisabled={submitting}
                  onChange={(v) => setScope(v as MCPAccessScope)}
                  options={[
                    { value: 'user', label: t('mcp.userScope') },
                    ...(isAdmin ? [{ value: 'admin', label: t('mcp.adminScope') }] : []),
                  ]}
                />
                <Selector
                  label={t('mcp.permissions')}
                  description={readOnly ? t('mcp.readOnlyHint') : t('mcp.readWriteHint')}
                  value={readOnly ? 'read' : 'write'}
                  isDisabled={submitting}
                  status={!readOnly ? { type: 'warning' } : undefined}
                  onChange={(v) => setReadOnly(v === 'read')}
                  options={[
                    { value: 'read', label: t('mcp.readOnly') },
                    { value: 'write', label: t('mcp.readWrite') },
                  ]}
                />
                {scope === 'admin' && !readOnly && <Banner status="warning" title={t('mcp.adminWriteHint')} />}
                {submitError && <Banner status="error" title={submitError} />}
                <HStack gap={3} justify="end">
                  <Button label={t('mcp.deny')} variant="secondary" isDisabled={submitting} onClick={() => void decide(false)} />
                  <Button
                    type="submit"
                    label={submitting ? t('common.processing') : t('mcp.approve')}
                    variant="primary"
                    isLoading={submitting}
                    isDisabled={submitting}
                  />
                </HStack>
              </VStack>
            </form>
          ) : null}
        </VStack>
      </Card>
      {stepUp.dialog}
    </CenteredFrame>
  )
}
