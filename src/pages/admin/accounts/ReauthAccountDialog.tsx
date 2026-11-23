import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import type { Account } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { copyToClipboard } from '~/lib/clipboard'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import {
  buildAntigravityCredentials,
  buildClaudeExtra,
  buildGeminiCredentials,
  buildGrokCredentials,
  buildGrokExtra,
  buildOpenAICredentials,
  buildOpenAIExtra,
  firstLine,
  oauthKey,
  parseCallbackInput,
  reAuthPlatformOf,
  type AddMethod,
  type AuthInputMethod,
  type GeminiOAuthType,
  type OpenAITokenInfo,
  type ReAuthPlatform,
} from './reauthOAuth'

interface ReauthAccountDialogProps {
  isOpen: boolean
  account: Account | null
  onClose: () => void
  /** Called with the re-authorized account so the list can be refreshed. */
  onReauthorized: (account: Account) => void
}

/**
 * Port of components/admin/account/ReAuthAccountModal.vue: re-runs the OAuth
 * flow for one existing account and applies the new credentials in place.
 * Claude also supports setup-token and sessionKey (cookie) auth; OpenAI,
 * Antigravity and Grok accept a refresh token; Grok also accepts an SSO cookie.
 */
export function ReauthAccountDialog({ isOpen, account, onClose, onReauthorized }: ReauthAccountDialogProps) {
  const { t, te } = useI18n()
  const platform: ReAuthPlatform = reAuthPlatformOf(account?.platform ?? '')
  const isAnthropic = platform === 'anthropic'
  const isOpenAI = platform === 'openai'
  const isGemini = platform === 'gemini'
  const isAntigravity = platform === 'antigravity'
  const isGrok = platform === 'grok'

  const [addMethod, setAddMethod] = useState<AddMethod>('oauth')
  const [inputMethod, setInputMethod] = useState<AuthInputMethod>('manual')
  const [geminiOAuthType, setGeminiOAuthType] = useState<GeminiOAuthType>('code_assist')
  const [authUrl, setAuthUrl] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [oauthState, setOauthState] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const [refreshTokenInput, setRefreshTokenInput] = useState('')
  const [ssoInput, setSsoInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const credentials = useMemo(() => (account?.credentials ?? {}) as Record<string, unknown>, [account])

  // Grok defaults to the refresh token tab when one may still be usable
  const grokHasRefreshToken =
    (typeof credentials.refresh_token === 'string' && credentials.refresh_token.trim() !== '') ||
    account?.credentials_status?.has_refresh_token === true

  // Fresh state every time the dialog opens, seeded from the current account
  useEffect(() => {
    if (!isOpen || !account) {
      setAuthUrl('')
      setSessionId('')
      setOauthState('')
      setAuthCode('')
      setProjectId('')
      setSessionKey('')
      setRefreshTokenInput('')
      setSsoInput('')
      setError('')
      setLoading(false)
      return
    }
    setAddMethod(account.type === 'setup-token' ? 'setup-token' : 'oauth')
    setGeminiOAuthType(
      credentials.oauth_type === 'google_one'
        ? 'google_one'
        : credentials.oauth_type === 'ai_studio'
          ? 'ai_studio'
          : 'code_assist',
    )
    setInputMethod(reAuthPlatformOf(account.platform) === 'grok' && !grokHasRefreshToken ? 'sso_cookie' : 'manual')
  }, [isOpen, account, credentials, grokHasRefreshToken])

  const inputMethodOptions = useMemo(() => {
    const options: { value: AuthInputMethod; label: string }[] = [
      { value: 'manual', label: t('admin.accounts.oauth.manualAuth') },
    ]
    if (isAnthropic) options.push({ value: 'cookie', label: t('admin.accounts.oauth.cookieAutoAuth') })
    if (isOpenAI) options.push({ value: 'refresh_token', label: t('admin.accounts.oauth.openai.refreshTokenAuth') })
    if (isAntigravity) {
      options.push({ value: 'refresh_token', label: t('admin.accounts.oauth.antigravity.refreshTokenAuth') })
    }
    if (isGrok) {
      options.push({ value: 'refresh_token', label: t('admin.accounts.oauth.grok.refreshTokenAuth') })
      options.push({ value: 'sso_cookie', label: t('admin.accounts.oauth.grok.ssoCookieAuth') })
    }
    return options
  }, [isAnthropic, isOpenAI, isAntigravity, isGrok, t])

  const platformLabel = isOpenAI
    ? t('admin.accounts.openaiAccount')
    : isGemini
      ? t('admin.accounts.geminiAccount')
      : isAntigravity
        ? t('admin.accounts.antigravityAccount')
        : isGrok
          ? t('admin.accounts.grokAccount')
          : t('admin.accounts.claudeCodeAccount')

  const fail = useCallback(
    (err: unknown, fallbackKey: string) => {
      // The Claude block has no per-error keys for every step, so fall back to authFailed
      const key = te(fallbackKey) ? fallbackKey : 'admin.accounts.oauth.authFailed'
      const message = extractApiErrorMessage(err, t(key))
      setError(message)
      toast.error(message)
    },
    [t, te],
  )

  /** Applies new OAuth credentials and reports the updated account. */
  const applyCredentials = useCallback(
    async (payload: {
      type: 'oauth' | 'setup-token'
      credentials: Record<string, unknown>
      extra?: Record<string, unknown>
    }) => {
      if (!account) return
      const updated = await adminAPI.accounts.applyOAuthCredentials(account.id, payload)
      toast.success(t('admin.accounts.reAuthorizedSuccess'))
      onReauthorized(updated)
      onClose()
    },
    [account, onClose, onReauthorized, t],
  )

  const handleGenerateUrl = async () => {
    if (!account) return
    setLoading(true)
    setError('')
    setAuthUrl('')
    setSessionId('')
    setOauthState('')
    try {
      const proxyId = account.proxy_id ?? undefined
      if (isOpenAI) {
        const response = await adminAPI.accounts.generateAuthUrl('/admin/openai/generate-auth-url', {
          ...(proxyId ? { proxy_id: proxyId } : {}),
        })
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
        try {
          setOauthState(new URL(response.auth_url).searchParams.get('state') || '')
        } catch {
          setOauthState('')
        }
      } else if (isGemini) {
        const response = await adminAPI.gemini.generateAuthUrl({
          ...(proxyId ? { proxy_id: proxyId } : {}),
          ...(geminiOAuthType === 'code_assist' && projectId.trim() ? { project_id: projectId.trim() } : {}),
          oauth_type: geminiOAuthType,
          ...(typeof credentials.tier_id === 'string' ? { tier_id: credentials.tier_id } : {}),
        })
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
        setOauthState(response.state)
      } else if (isAntigravity) {
        const response = await adminAPI.antigravity.generateAuthUrl({ ...(proxyId ? { proxy_id: proxyId } : {}) })
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
        setOauthState(response.state)
      } else if (isGrok) {
        const response = await adminAPI.grok.generateAuthUrl({ ...(proxyId ? { proxy_id: proxyId } : {}) })
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
        setOauthState(response.state)
      } else {
        const endpoint =
          addMethod === 'oauth' ? '/admin/accounts/generate-auth-url' : '/admin/accounts/generate-setup-token-url'
        const response = await adminAPI.accounts.generateAuthUrl(endpoint, {
          ...(proxyId ? { proxy_id: proxyId } : {}),
        })
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
      }
    } catch (err) {
      fail(err, oauthKey(platform, 'failedToGenerateUrl'))
    } finally {
      setLoading(false)
    }
  }

  /** Accepts a pasted callback URL, a query string or a bare code. */
  const parsedCode = useMemo(() => {
    const parsed = parseCallbackInput(authCode)
    return { code: parsed?.code?.trim() || authCode.trim(), state: parsed?.state?.trim() || '' }
  }, [authCode])

  const handleExchangeCode = async () => {
    if (!account || !parsedCode.code) return
    const proxyId = account.proxy_id ?? undefined
    setLoading(true)
    setError('')
    try {
      if (isOpenAI) {
        const stateToUse = parsedCode.state || oauthState
        if (!sessionId || !stateToUse) {
          fail(null, 'admin.accounts.oauth.authFailed')
          return
        }
        const tokenInfo = (await adminAPI.accounts.exchangeCode('/admin/openai/exchange-code', {
          session_id: sessionId,
          code: parsedCode.code,
          state: stateToUse,
          ...(proxyId ? { proxy_id: proxyId } : {}),
        })) as OpenAITokenInfo
        await applyCredentials({
          type: 'oauth',
          credentials: buildOpenAICredentials(tokenInfo),
          extra: buildOpenAIExtra(tokenInfo),
        })
      } else if (isGemini) {
        const stateToUse = parsedCode.state || oauthState
        if (!sessionId || !stateToUse) {
          fail(null, 'admin.accounts.oauth.gemini.missingExchangeParams')
          return
        }
        const tokenInfo = await adminAPI.gemini.exchangeCode({
          session_id: sessionId,
          state: stateToUse,
          code: parsedCode.code,
          ...(proxyId ? { proxy_id: proxyId } : {}),
          oauth_type: geminiOAuthType,
          ...(typeof credentials.tier_id === 'string' ? { tier_id: credentials.tier_id } : {}),
        })
        // Gemini keeps the two-step shape of the Vue flow: update, then clear the error state
        await adminAPI.accounts.update(account.id, { type: 'oauth', credentials: buildGeminiCredentials(tokenInfo) })
        const updated = await adminAPI.accounts.clearError(account.id)
        toast.success(t('admin.accounts.reAuthorizedSuccess'))
        onReauthorized(updated)
        onClose()
      } else if (isAntigravity) {
        const stateToUse = parsedCode.state || oauthState
        if (!sessionId || !stateToUse) {
          fail(null, 'admin.accounts.oauth.antigravity.missingExchangeParams')
          return
        }
        const tokenInfo = await adminAPI.antigravity.exchangeCode({
          session_id: sessionId,
          state: stateToUse,
          code: parsedCode.code,
          ...(proxyId ? { proxy_id: proxyId } : {}),
        })
        await adminAPI.accounts.update(account.id, {
          type: 'oauth',
          credentials: buildAntigravityCredentials(tokenInfo),
        })
        const updated = await adminAPI.accounts.clearError(account.id)
        toast.success(t('admin.accounts.reAuthorizedSuccess'))
        onReauthorized(updated)
        onClose()
      } else if (isGrok) {
        const stateToUse = parsedCode.state || oauthState
        if (!sessionId || !stateToUse) {
          fail(null, 'admin.accounts.oauth.grok.missingExchangeParams')
          return
        }
        const tokenInfo = await adminAPI.grok.exchangeCode({
          session_id: sessionId,
          state: stateToUse,
          code: parsedCode.code,
          ...(proxyId ? { proxy_id: proxyId } : {}),
        })
        await applyCredentials({
          type: 'oauth',
          credentials: buildGrokCredentials(tokenInfo),
          extra: buildGrokExtra(tokenInfo),
        })
      } else {
        if (!sessionId) return
        const endpoint =
          addMethod === 'oauth' ? '/admin/accounts/exchange-code' : '/admin/accounts/exchange-setup-token-code'
        const tokenInfo = await adminAPI.accounts.exchangeCode(endpoint, {
          session_id: sessionId,
          code: parsedCode.code,
          ...(proxyId ? { proxy_id: proxyId } : {}),
        })
        await applyCredentials({
          type: addMethod,
          credentials: tokenInfo,
          extra: buildClaudeExtra(tokenInfo),
        })
      }
    } catch (err) {
      fail(err, oauthKey(platform, 'failedToExchangeCode'))
    } finally {
      setLoading(false)
    }
  }

  /** Claude sessionKey (cookie) auth; one key only, since this updates one account. */
  const handleCookieAuth = async () => {
    if (!account) return
    const key = firstLine(sessionKey)
    if (!key) {
      fail(null, 'admin.accounts.oauth.pleaseEnterSessionKey')
      return
    }
    const proxyId = account.proxy_id ?? undefined
    setLoading(true)
    setError('')
    try {
      const endpoint =
        addMethod === 'oauth' ? '/admin/accounts/cookie-auth' : '/admin/accounts/setup-token-cookie-auth'
      const tokenInfo = await adminAPI.accounts.exchangeCode(endpoint, {
        session_id: '',
        code: key,
        ...(proxyId ? { proxy_id: proxyId } : {}),
      })
      await applyCredentials({ type: addMethod, credentials: tokenInfo, extra: buildClaudeExtra(tokenInfo) })
    } catch (err) {
      fail(err, 'admin.accounts.oauth.cookieAuthFailed')
    } finally {
      setLoading(false)
    }
  }

  const handleValidateRefreshToken = async () => {
    if (!account) return
    const refreshToken = firstLine(refreshTokenInput)
    if (!refreshToken) {
      fail(null, oauthKey(platform, 'pleaseEnterRefreshToken'))
      return
    }
    const proxyId = account.proxy_id ?? null
    setLoading(true)
    setError('')
    try {
      if (isOpenAI) {
        const tokenInfo = (await adminAPI.accounts.refreshOpenAIToken(
          refreshToken,
          proxyId,
          '/admin/openai/refresh-token',
        )) as OpenAITokenInfo
        await applyCredentials({
          type: 'oauth',
          credentials: buildOpenAICredentials(tokenInfo),
          extra: buildOpenAIExtra(tokenInfo),
        })
      } else if (isAntigravity) {
        const tokenInfo = await adminAPI.antigravity.refreshAntigravityToken(refreshToken, proxyId)
        await applyCredentials({
          type: 'oauth',
          credentials: buildAntigravityCredentials(tokenInfo, refreshToken),
        })
      } else if (isGrok) {
        const tokenInfo = await adminAPI.grok.refreshGrokToken(refreshToken, proxyId)
        await applyCredentials({
          type: 'oauth',
          credentials: buildGrokCredentials(tokenInfo),
          extra: buildGrokExtra(tokenInfo),
        })
      }
    } catch (err) {
      fail(err, oauthKey(platform, 'failedToValidateRT'))
    } finally {
      setLoading(false)
    }
  }

  /** Grok SSO cookie → Build OAuth credentials (the raw cookie is never stored). */
  const handleGrokImportSSO = async () => {
    if (!account) return
    const ssoToken = firstLine(ssoInput)
    if (!ssoToken) {
      fail(null, 'admin.accounts.oauth.grok.pleaseEnterSSOToken')
      return
    }
    setLoading(true)
    setError('')
    try {
      const tokenInfo = await adminAPI.grok.validateSSOToken(ssoToken, account.proxy_id ?? null)
      await applyCredentials({
        type: 'oauth',
        credentials: buildGrokCredentials(tokenInfo),
        extra: buildGrokExtra(tokenInfo),
      })
    } catch (err) {
      fail(err, 'admin.accounts.oauth.grok.failedToValidateSSO')
    } finally {
      setLoading(false)
    }
  }

  const canExchangeCode = !!parsedCode.code && !!sessionId && !loading

  const geminiTypeLabel =
    geminiOAuthType === 'google_one'
      ? 'Google One'
      : geminiOAuthType === 'code_assist'
        ? t('admin.accounts.gemini.oauthType.builtInTitle')
        : t('admin.accounts.gemini.oauthType.customTitle')

  const renderManualFlow = () => (
    <VStack gap={4} hAlign="stretch">
      <Text color="secondary">{t(oauthKey(platform, 'followSteps'))}</Text>
      {(isOpenAI || isAntigravity || isGrok) && (
        <Banner status="warning" title={t(oauthKey(platform, 'importantNotice'))} collapsible={false} />
      )}
      {isAnthropic && <Banner status="info" title={t('admin.accounts.oauth.proxyWarning')} collapsible={false} />}

      {isGemini && geminiOAuthType === 'code_assist' && (
        <TextInput
          label={t('admin.accounts.oauth.gemini.projectIdLabel')}
          description={t('admin.accounts.oauth.gemini.projectIdHint')}
          placeholder={t('admin.accounts.oauth.gemini.projectIdPlaceholder')}
          value={projectId}
          onChange={setProjectId}
        />
      )}

      <VStack gap={2} hAlign="stretch">
        <Text weight="medium">{t(oauthKey(platform, 'step1GenerateUrl'))}</Text>
        <HStack gap={2} wrap="wrap">
          <Button
            label={
              loading && !authUrl
                ? t('admin.accounts.oauth.generating')
                : authUrl
                  ? t('admin.accounts.oauth.regenerate')
                  : t(oauthKey(platform, 'generateAuthUrl'))
            }
            variant={authUrl ? 'secondary' : 'primary'}
            isLoading={loading && !authUrl}
            onClick={() => void handleGenerateUrl()}
          />
        </HStack>
      </VStack>

      {authUrl && (
        <VStack gap={2} hAlign="stretch">
          <Text weight="medium">{t(oauthKey(platform, 'step2OpenUrl'))}</Text>
          <Text type="supporting" color="secondary">
            {t(oauthKey(platform, 'openUrlDesc'))}
          </Text>
          <Card variant="muted" padding={3}>
            <VStack gap={2} hAlign="stretch">
              <Text type="code" maxLines={3}>
                {authUrl}
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  label={t('common.copy')}
                  variant="secondary"
                  size="sm"
                  icon={<Icon icon={ClipboardDocumentIcon} size="sm" />}
                  onClick={() => void copyToClipboard(authUrl)}
                />
                <Button
                  label={t('common.view')}
                  variant="secondary"
                  size="sm"
                  icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />}
                  href={authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}

      <VStack gap={2} hAlign="stretch">
        <Text weight="medium">{t(oauthKey(platform, 'step3EnterCode'))}</Text>
        <Text type="supporting" color="secondary">
          {t(oauthKey(platform, 'authCodeDesc'))}
        </Text>
        {isGemini && (
          <Banner
            status="info"
            title={t('admin.accounts.oauth.gemini.stateWarningTitle')}
            description={t('admin.accounts.oauth.gemini.stateWarningDesc')}
            collapsible={false}
          />
        )}
        <TextArea
          label={t(oauthKey(platform, 'authCode'))}
          placeholder={t(oauthKey(platform, 'authCodePlaceholder'))}
          value={authCode}
          onChange={setAuthCode}
          rows={3}
        />
        <Text type="supporting" color="secondary">
          {t(oauthKey(platform, 'authCodeHint'))}
        </Text>
      </VStack>
    </VStack>
  )

  const renderCookieFlow = () => (
    <VStack gap={4} hAlign="stretch">
      <Text color="secondary">{t('admin.accounts.oauth.cookieAutoAuthDesc')}</Text>
      <TextArea
        label={t('admin.accounts.oauth.sessionKey')}
        placeholder={t('admin.accounts.oauth.sessionKeyPlaceholderSingle')}
        value={sessionKey}
        onChange={setSessionKey}
        rows={2}
      />
      <Text type="supporting" color="secondary">
        {t('admin.accounts.oauth.sessionKeyFormat')}
      </Text>
      <Card variant="muted" padding={3}>
        <VStack gap={1} hAlign="stretch">
          <Text weight="medium">{t('admin.accounts.oauth.howToGetSessionKey')}</Text>
          {(['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const).map((step) => (
            <Text key={step} type="supporting" color="secondary">
              {t(`admin.accounts.oauth.${step}`)}
            </Text>
          ))}
        </VStack>
      </Card>
      <HStack gap={2} hAlign="end">
        <Button
          label={loading ? t('admin.accounts.oauth.authorizing') : t('admin.accounts.oauth.startAutoAuth')}
          variant="primary"
          isLoading={loading}
          isDisabled={!sessionKey.trim()}
          onClick={() => void handleCookieAuth()}
        />
      </HStack>
    </VStack>
  )

  const renderRefreshTokenFlow = () => (
    <VStack gap={4} hAlign="stretch">
      <Text color="secondary">{t(oauthKey(platform, 'refreshTokenDesc'))}</Text>
      <TextArea
        label={t(oauthKey(platform, 'refreshTokenAuth'))}
        placeholder={t(oauthKey(platform, 'refreshTokenPlaceholder'))}
        value={refreshTokenInput}
        onChange={setRefreshTokenInput}
        rows={3}
      />
      <HStack gap={2} hAlign="end">
        <Button
          label={loading ? t(oauthKey(platform, 'validating')) : t(oauthKey(platform, 'validateAndCreate'))}
          variant="primary"
          isLoading={loading}
          isDisabled={!refreshTokenInput.trim()}
          onClick={() => void handleValidateRefreshToken()}
        />
      </HStack>
    </VStack>
  )

  const renderSsoFlow = () => (
    <VStack gap={4} hAlign="stretch">
      <Text color="secondary">{t('admin.accounts.oauth.grok.ssoCookieDesc')}</Text>
      <TextArea
        label={t('admin.accounts.oauth.grok.ssoCookieLabel')}
        placeholder={t('admin.accounts.oauth.grok.ssoCookiePlaceholder')}
        value={ssoInput}
        onChange={setSsoInput}
        rows={3}
      />
      <Text type="supporting" color="secondary">
        {t('admin.accounts.oauth.grok.ssoCookieHint')}
      </Text>
      <HStack gap={2} hAlign="end">
        <Button
          label={loading ? t('admin.accounts.oauth.grok.convertingSSO') : t('admin.accounts.oauth.grok.convertSSOAndCreate')}
          variant="primary"
          isLoading={loading}
          isDisabled={!ssoInput.trim()}
          onClick={() => void handleGrokImportSSO()}
        />
      </HStack>
    </VStack>
  )

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={640} purpose="form">
      <Layout
        header={
          <DialogHeader
            title={t('admin.accounts.reAuthorizeAccount')}
            subtitle={account ? `${account.name} · ${platformLabel}` : undefined}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            {account && (
              <VStack gap={4} hAlign="stretch">
                {error && <Banner status="error" title={error} collapsible={false} />}

                {isAnthropic && (
                  <RadioList
                    label={t('admin.accounts.oauth.authMethod')}
                    orientation="horizontal"
                    value={addMethod}
                    onChange={(value) => setAddMethod(value === 'setup-token' ? 'setup-token' : 'oauth')}
                  >
                    <RadioListItem value="oauth" label={t('admin.accounts.types.oauth')} />
                    <RadioListItem value="setup-token" label={t('admin.accounts.setupTokenLongLived')} />
                  </RadioList>
                )}

                {isGemini && (
                  <Card variant="muted" padding={3}>
                    <HStack gap={3} vAlign="center">
                      <StackItem size="fill">
                        <VStack gap={0.5}>
                          <Text type="supporting" color="secondary">
                            {t('admin.accounts.oauth.gemini.oauthTypeLabel')}
                          </Text>
                          <Text weight="medium">{geminiTypeLabel}</Text>
                        </VStack>
                      </StackItem>
                      <Badge label={geminiOAuthType} variant="info" />
                    </HStack>
                  </Card>
                )}

                {inputMethodOptions.length > 1 && (
                  <SegmentedControl
                    label={t('admin.accounts.inputMethod')}
                    value={inputMethod}
                    onChange={(value) => setInputMethod(value as AuthInputMethod)}
                    size="sm"
                  >
                    {inputMethodOptions.map((option) => (
                      <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
                    ))}
                  </SegmentedControl>
                )}

                {inputMethod === 'cookie'
                  ? renderCookieFlow()
                  : inputMethod === 'refresh_token'
                    ? renderRefreshTokenFlow()
                    : inputMethod === 'sso_cookie'
                      ? renderSsoFlow()
                      : renderManualFlow()}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={3} hAlign="end">
              <Button label={t('common.cancel')} variant="secondary" onClick={onClose} />
              {inputMethod === 'manual' && (
                <Button
                  label={loading ? t('admin.accounts.oauth.verifying') : t('admin.accounts.oauth.completeAuth')}
                  variant="primary"
                  isLoading={loading}
                  isDisabled={!canExchangeCode}
                  onClick={() => void handleExchangeCode()}
                />
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
