import { useCallback, useEffect, useRef, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { List, ListItem } from '@astryxdesign/core/List'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { mcpAPI, type MCPGrant } from '@/api/mcp'
import { formatDate } from '@/utils/format'
import { Page } from '~/components/common/Page'
import { copyToClipboard } from '~/lib/clipboard'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}

function isActive(grant: MCPGrant): boolean {
  return !grant.revoked_at && !grant.invalidated && new Date(grant.expires_at).getTime() > Date.now()
}

/** React port of views/user/MCPView.vue. */
export function MCPPage() {
  const { t } = useI18n()
  const [endpoint, setEndpoint] = useState('')
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [grants, setGrants] = useState<MCPGrant[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<MCPGrant | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState('')
  const mounted = useRef(true)

  const loadConnection = useCallback(async () => {
    setConnectionLoading(true)
    setConnectionError('')
    setEndpoint('')
    try {
      const result = await mcpAPI.getConnectionConfig()
      if (mounted.current) setEndpoint(result.resource)
    } catch (error) {
      if (mounted.current) setConnectionError(errorMessage(error, t('mcp.connectionLoadFailed')))
    } finally {
      if (mounted.current) setConnectionLoading(false)
    }
  }, [t])

  const loadGrants = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await mcpAPI.listGrants()
      if (mounted.current) setGrants(result)
    } catch (error) {
      if (mounted.current) setLoadError(errorMessage(error, t('mcp.loadFailed')))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [t])

  useEffect(() => {
    mounted.current = true
    void loadConnection()
    void loadGrants()
    return () => {
      mounted.current = false
    }
  }, [loadConnection, loadGrants])

  function grantStatus(grant: MCPGrant): string {
    if (grant.revoked_at) return t('mcp.revoked')
    if (grant.invalidated) return t('mcp.invalidated')
    return isActive(grant) ? t('mcp.active') : t('mcp.expired')
  }

  function closeRevoke() {
    if (revoking) return
    setRevokeTarget(null)
    setRevokeError('')
  }

  async function revokeGrant() {
    if (!revokeTarget || revoking || loading) return
    setRevoking(true)
    setRevokeError('')
    const id = revokeTarget.id
    try {
      await mcpAPI.revokeGrant(id)
      if (!mounted.current) return
      setGrants((list) => list.map((g) => (g.id === id ? { ...g, revoked_at: new Date().toISOString() } : g)))
      setRevokeTarget(null)
      toast.success(t('mcp.revokeSuccess'))
    } catch (error) {
      if (mounted.current) setRevokeError(errorMessage(error, t('mcp.revokeFailed')))
    } finally {
      if (mounted.current) setRevoking(false)
    }
  }

  return (
    <Page title={t('mcp.title')}>
      <VStack gap={6} hAlign="stretch">
        <Card padding={6}>
          <VStack gap={4} hAlign="stretch">
            <VStack gap={1}>
              <Heading level={3}>{t('mcp.connectionTitle')}</Heading>
              <Text color="secondary">{t('mcp.connectionDescription')}</Text>
            </VStack>
            <HStack gap={2} vAlign="end" wrap="wrap">
              <StackItem size="fill">
                <TextInput
                  label={t('mcp.endpoint')}
                  value={endpoint}
                  placeholder={connectionLoading ? t('mcp.connectionLoading') : ''}
                  isReadOnly
                  isLoading={connectionLoading}
                />
              </StackItem>
              <Button
                label={t('mcp.copyEndpoint')}
                variant="secondary"
                isDisabled={!endpoint || connectionLoading}
                onClick={() => void copyToClipboard(endpoint)}
              />
            </HStack>
            {connectionError && (
              <Banner
                status="error"
                title={connectionError}
                endContent={
                  <Button
                    label={t('common.refresh')}
                    variant="secondary"
                    size="sm"
                    isDisabled={connectionLoading}
                    onClick={() => void loadConnection()}
                  />
                }
              />
            )}
            <List listStyle="decimal" density="compact">
              <ListItem label={t('mcp.connectStep1')} />
              <ListItem label={t('mcp.connectStep2')} />
              <ListItem label={t('mcp.connectStep3')} />
            </List>
            <Text type="supporting">{t('mcp.capabilities')}</Text>
          </VStack>
        </Card>

        <Card padding={6}>
          <VStack gap={4} hAlign="stretch">
            <HStack gap={4} vAlign="start" justify="between" wrap="wrap">
              <VStack gap={1}>
                <Heading level={3}>{t('mcp.grantsTitle')}</Heading>
                <Text color="secondary">{t('mcp.grantsDescription')}</Text>
              </VStack>
              <Button
                label={t('common.refresh')}
                variant="secondary"
                isDisabled={loading || revoking}
                onClick={() => void loadGrants()}
              />
            </HStack>
            {loadError ? (
              <Banner status="error" title={loadError} />
            ) : loading ? (
              <Spinner label={t('mcp.loading')} />
            ) : grants.length === 0 ? (
              <EmptyState title={t('mcp.empty')} />
            ) : (
              <List hasDividers>
                {grants.map((grant) => (
                  <ListItem
                    key={grant.id}
                    label={grant.client_name}
                    description={
                      <VStack gap={1}>
                        <HStack gap={2} wrap="wrap">
                          <Token label={grant.scope === 'admin' ? t('mcp.adminScope') : t('mcp.userScope')} />
                          <Token label={grant.read_only ? t('mcp.readOnly') : t('mcp.readWrite')} />
                          <Text type="supporting" color={isActive(grant) ? 'accent' : 'secondary'}>
                            {grantStatus(grant)}
                          </Text>
                        </HStack>
                        <Text type="code">{grant.client_id}</Text>
                        <HStack gap={4} wrap="wrap">
                          <Text type="supporting">{t('mcp.createdAt', { date: formatDate(grant.created_at) })}</Text>
                          <Text type="supporting">{t('mcp.expiresAt', { date: formatDate(grant.expires_at) })}</Text>
                          <Text type="supporting">
                            {grant.last_used_at
                              ? t('mcp.lastUsedAt', { date: formatDate(grant.last_used_at) })
                              : t('mcp.neverUsed')}
                          </Text>
                        </HStack>
                      </VStack>
                    }
                    endContent={
                      !grant.revoked_at && (
                        <Button
                          label={t('mcp.revoke')}
                          variant="destructive"
                          size="sm"
                          onClick={() => setRevokeTarget(grant)}
                        />
                      )
                    }
                  />
                ))}
              </List>
            )}
          </VStack>
        </Card>
      </VStack>

      <Dialog isOpen={!!revokeTarget} purpose={revoking ? 'required' : 'info'} onOpenChange={(open) => !open && closeRevoke()}>
        <DialogHeader title={t('mcp.revokeTitle')} onOpenChange={revoking ? undefined : () => closeRevoke()} />
        <VStack gap={4} hAlign="stretch" padding={4}>
          <Text>{t('mcp.revokeConfirm', { name: revokeTarget?.client_name || '' })}</Text>
          {revokeError && <Banner status="error" title={revokeError} />}
          <HStack gap={2} justify="end">
            <Button label={t('common.cancel')} variant="secondary" isDisabled={revoking} onClick={closeRevoke} />
            <Button
              label={revoking ? t('common.processing') : t('mcp.revoke')}
              variant="destructive"
              isLoading={revoking}
              isDisabled={revoking || loading}
              onClick={() => void revokeGrant()}
            />
          </HStack>
        </VStack>
      </Dialog>
    </Page>
  )
}
