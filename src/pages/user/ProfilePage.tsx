import { useEffect, useState, useCallback } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Token } from '@astryxdesign/core/Token'
import { Grid } from '@astryxdesign/core/Grid'
import { List, ListItem } from '@astryxdesign/core/List'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Center } from '@astryxdesign/core/Center'
import {
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  KeyIcon,
  LinkIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'
import { userAPI, totpAPI, passkeyAPI } from '@/api'
import type { PublicSettings, User, TotpStatus } from '@/types'
import type { PasskeyCredentialSummary } from '@/api/passkey'
import { Page } from '~/components/common/Page'
import { BalanceNotifyCard } from '~/components/profile/BalanceNotifyCard'
import {
  IdentityBindingsSection,
  ProfileBasicsCard,
  displayableEmail,
  profileSourceHints,
} from '~/components/profile/ProfileIdentity'
import { TotpDisableDialog, TotpSetupDialog } from '~/components/profile/TotpDialogs'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'

function formatDate(timestamp: string | number): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp)
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function memberSinceLabel(raw: string | undefined): string {
  const value = raw?.trim()
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short' }).format(date)
}

/** Backend error text when present (e.g. a wrong password), else the fallback. */
function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string }).message
  return typeof message === 'string' && message.length > 0 ? message : fallback
}

function ProfileInfoSection({ user, oidcProviderName }: { user: User | null; oidcProviderName: string }) {
  const { t } = useI18n()

  if (!user) return null

  const avatarUrl = user.avatar_url?.trim() || ''
  const displayName = user.username?.trim() || user.email?.trim() || t('profile.user')
  const email = displayableEmail(user)
  const sourceHints = profileSourceHints(user, oidcProviderName)

  return (
    <Card padding={6}>
      <HStack gap={4} vAlign="start">
        <Avatar
          src={avatarUrl}
          name={displayName}
          size={80 as any}
          shape="rounded"
        />
        <VStack gap={3} hAlign="stretch">
          <VStack gap={2}>
            <HStack gap={2} wrap="wrap">
              <Heading level={3}>
                {displayName}
              </Heading>
              <Badge label={user.role === 'admin' ? t('profile.administrator') : t('profile.user')} variant="neutral" />
              <Badge
                label={user.status === 'active' ? t('common.active') : t('common.disabled')}
                variant={user.status === 'active' ? 'success' : 'error'}
              />
            </HStack>
            {email && (
              <Text type="body" color="secondary">
                {email}
              </Text>
            )}
            {sourceHints.length > 0 && (
              <HStack gap={2} wrap="wrap">
                {sourceHints.map((hint) => (
                  <Token key={hint.key} size="sm" icon={<Icon icon={LinkIcon} />} label={hint.text} />
                ))}
              </HStack>
            )}
          </VStack>
          <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
            <VStack gap={0.5}>
              <Text type="label" color="secondary">
                {t('profile.accountBalance')}
              </Text>
              <Text type="body" weight="medium">
                ${(user.balance || 0).toFixed(2)}
              </Text>
            </VStack>
            <VStack gap={0.5}>
              <Text type="label" color="secondary">
                {t('profile.concurrencyLimit')}
              </Text>
              <Text type="body" weight="medium">
                {user.concurrency || 0}
              </Text>
            </VStack>
            <VStack gap={0.5}>
              <Text type="label" color="secondary">
                {t('profile.memberSince')}
              </Text>
              <Text type="body" weight="medium">
                {memberSinceLabel(user.created_at)}
              </Text>
            </VStack>
          </Grid>
        </VStack>
      </HStack>
    </Card>
  )
}

function LinkedSourcesSection({ user, oidcProviderName }: { user: User | null; oidcProviderName: string }) {
  const { t } = useI18n()
  const hints = profileSourceHints(user, oidcProviderName)
  if (hints.length === 0) return null
  return (
    <Card padding={6}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={4}>{t('profile.linkedProfileSources')}</Heading>
          <Text color="secondary">{t('profile.linkedProfileSourcesDescription')}</Text>
        </VStack>
        <List hasDividers>
          {hints.map((hint) => (
            <ListItem key={hint.key} startContent={<Icon icon={LinkIcon} color="tertiary" />} label={hint.text} />
          ))}
        </List>
      </VStack>
    </Card>
  )
}

function ContactSupportSection({ contactInfo }: { contactInfo: string }) {
  const { t } = useI18n()
  return (
    <Card padding={6} variant="blue">
      <HStack gap={4} vAlign="center">
        <Icon icon={ChatBubbleLeftRightIcon} size="lg" color="accent" />
        <VStack gap={1}>
          <Heading level={4}>{t('common.contactSupport')}</Heading>
          <Text weight="medium">{contactInfo}</Text>
        </VStack>
      </HStack>
    </Card>
  )
}

function PasswordSection() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.new_password !== form.confirm_password) {
      toast.error(t('profile.passwordsNotMatch'))
      return
    }

    if (form.new_password.length < 8) {
      toast.error(t('profile.passwordTooShort'))
      return
    }

    setLoading(true)
    try {
      await userAPI.changePassword(form.old_password, form.new_password)
      setForm({ old_password: '', new_password: '', confirm_password: '' })
      toast.success(t('profile.passwordChangeSuccess'))
    } catch (error: unknown) {
      const message = (error as { message?: string }).message
      toast.error(message || t('profile.passwordChangeFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card padding={6}>
      <VStack gap={4} hAlign="stretch">
        <HStack gap={3} vAlign="start">
          <Icon icon={LockClosedIcon} color="secondary" />
          <VStack gap={1} hAlign="stretch">
            <Heading level={4}>
              {t('profile.changePassword')}
            </Heading>
            <Text type="body" color="secondary">
              {t('profile.passwordHint')}
            </Text>
          </VStack>
        </HStack>

        <form onSubmit={handleSubmit}>
          <VStack gap={3} hAlign="stretch">
            <TextInput
              label={t('profile.currentPassword')}
              type="password"
              value={form.old_password}
              onChange={(v) => setForm((f) => ({ ...f, old_password: v }))}
              autoComplete="current-password"
              isRequired
            />
            <TextInput
              label={t('profile.newPassword')}
              type="password"
              value={form.new_password}
              onChange={(v) => setForm((f) => ({ ...f, new_password: v }))}
              autoComplete="new-password"
              isRequired
            />
            <TextInput
              label={t('profile.confirmNewPassword')}
              type="password"
              value={form.confirm_password}
              onChange={(v) => setForm((f) => ({ ...f, confirm_password: v }))}
              autoComplete="new-password"
              isRequired
            />
            <HStack gap={2} hAlign="end">
              <Button
                type="submit"
                label={loading ? t('profile.changingPassword') : t('profile.changePasswordButton')}
                variant="primary"
                isDisabled={loading}
              />
            </HStack>
          </VStack>
        </form>
      </VStack>
    </Card>
  )
}

function TotpSection() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TotpStatus | null>(null)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showDisableDialog, setShowDisableDialog] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const data = await totpAPI.getStatus()
      setStatus(data)
    } catch (error) {
      console.error('Failed to load TOTP status:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const header = (
    <VStack gap={1} hAlign="stretch">
      <Heading level={4}>
        {t('profile.totp.title')}
      </Heading>
      <Text type="body" color="secondary">
        {t('profile.totp.description')}
      </Text>
    </VStack>
  )

  let body
  if (loading) {
    body = (
      <Center padding={4}>
        <Spinner />
      </Center>
    )
  } else if (status && !status.feature_enabled) {
    body = (
      <HStack gap={3} vAlign="center">
        <Icon icon={ExclamationTriangleIcon} color="tertiary" />
        <VStack gap={0.5}>
          <Text weight="medium">{t('profile.totp.featureDisabled')}</Text>
          <Text type="supporting">{t('profile.totp.featureDisabledHint')}</Text>
        </VStack>
      </HStack>
    )
  } else if (status?.enabled) {
    body = (
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={3} vAlign="center">
          <Icon icon={ShieldCheckIcon} size="lg" color="success" />
          <VStack gap={0.5}>
            <Text weight="medium">{t('profile.totp.enabled')}</Text>
            {status.enabled_at && (
              <Text type="supporting">
                {t('profile.totp.enabledAt')}: {formatDateTime(status.enabled_at)}
              </Text>
            )}
          </VStack>
        </HStack>
        <Button label={t('profile.totp.disable')} variant="destructive" onClick={() => setShowDisableDialog(true)} />
      </HStack>
    )
  } else {
    body = (
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <HStack gap={3} vAlign="center">
          <Icon icon={ShieldCheckIcon} size="lg" color="tertiary" />
          <VStack gap={0.5}>
            <Text weight="medium">{t('profile.totp.notEnabled')}</Text>
            <Text type="supporting">{t('profile.totp.notEnabledHint')}</Text>
          </VStack>
        </HStack>
        <Button label={t('profile.totp.enable')} variant="primary" onClick={() => setShowSetupDialog(true)} />
      </HStack>
    )
  }

  return (
    <Card padding={6}>
      <VStack gap={4} hAlign="stretch">
        {header}
        {body}
      </VStack>
      <TotpSetupDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
        onSuccess={() => {
          setShowSetupDialog(false)
          void loadStatus()
        }}
      />
      <TotpDisableDialog
        isOpen={showDisableDialog}
        onClose={() => setShowDisableDialog(false)}
        onSuccess={() => {
          setShowDisableDialog(false)
          void loadStatus()
        }}
      />
    </Card>
  )
}

function PasskeySection({ enabled }: { enabled: boolean }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState<PasskeyCredentialSummary[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [renameTarget, setRenameTarget] = useState<PasskeyCredentialSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PasskeyCredentialSummary | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const supported = passkeyAPI.isSupported()

  const loadCredentials = useCallback(async () => {
    if (!enabled) {
      setCredentials([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await passkeyAPI.list()
      setCredentials(data)
    } catch (error) {
      // A settings race can still answer PASSKEY_DISABLED; stay quiet then.
      if ((error as { reason?: string }).reason !== 'PASSKEY_DISABLED') {
        toast.error(t('profile.passkey.loadFailed'))
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, t])

  useEffect(() => {
    void loadCredentials()
  }, [loadCredentials])

  const cancelAdd = () => {
    setShowAddForm(false)
    setNewName('')
    setNewPassword('')
  }

  const addPasskey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length === 0) return
    setBusy(true)
    try {
      await passkeyAPI.register(newName.trim(), newPassword)
      toast.success(t('profile.passkey.added'))
      cancelAdd()
      await loadCredentials()
    } catch (error) {
      // The user dismissing the browser prompt is not an error worth reporting.
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
        toast.error(errorMessage(error, t('profile.passkey.addFailed')))
      }
    } finally {
      setBusy(false)
    }
  }

  const openRename = (credential: PasskeyCredentialSummary) => {
    setRenameTarget(credential)
    setRenameValue(credential.name)
  }

  const confirmRename = async () => {
    const credential = renameTarget
    const name = renameValue.trim()
    if (!credential) return
    if (!name || name === credential.name) {
      setRenameTarget(null)
      return
    }
    setBusy(true)
    try {
      await passkeyAPI.rename(credential.id, name)
      setCredentials((prev) => prev.map((item) => (item.id === credential.id ? { ...item, name } : item)))
      toast.success(t('profile.passkey.renamed'))
      setRenameTarget(null)
    } catch {
      toast.error(t('profile.passkey.renameFailed'))
    } finally {
      setBusy(false)
    }
  }

  const openDelete = (credential: PasskeyCredentialSummary) => {
    setDeleteTarget(credential)
    setDeletePassword('')
  }

  const closeDelete = () => {
    setDeleteTarget(null)
    setDeletePassword('')
  }

  const confirmDelete = async () => {
    const credential = deleteTarget
    if (!credential || deletePassword.length === 0) return
    setBusy(true)
    try {
      // Revoking needs the current password so a stolen session cannot silently drop passkeys.
      await passkeyAPI.remove(credential.id, deletePassword)
      setCredentials((prev) => prev.filter((item) => item.id !== credential.id))
      toast.success(t('profile.passkey.deleted'))
      closeDelete()
    } catch (error) {
      // Keep the dialog open (e.g. wrong password) so the user can retry.
      toast.error(errorMessage(error, t('profile.passkey.deleteFailed')))
    } finally {
      setBusy(false)
    }
  }

  if (!enabled) {
    return (
      <Card padding={6}>
        <HStack gap={3}>
          <Icon icon={KeyIcon} color="tertiary" />
          <VStack gap={1} hAlign="stretch">
            <Heading level={4}>
              {t('profile.passkey.title')}
            </Heading>
            <Text type="body" color="secondary">
              {t('profile.passkey.featureDisabled')}
            </Text>
          </VStack>
        </HStack>
      </Card>
    )
  }

  if (!supported) {
    return (
      <Card padding={6}>
        <HStack gap={3}>
          <Icon icon={KeyIcon} color="warning" />
          <VStack gap={1} hAlign="stretch">
            <Heading level={4}>
              {t('profile.passkey.title')}
            </Heading>
            <Text type="body" color="secondary">
              {t('profile.passkey.unsupported')}
            </Text>
          </VStack>
        </HStack>
      </Card>
    )
  }

  return (
    <Card padding={6}>
      <VStack gap={4} hAlign="stretch">
        <HStack gap={3} vAlign="start">
          <Icon icon={KeyIcon} color="secondary" />
          <VStack gap={1} hAlign="stretch">
            <Heading level={4}>
              {t('profile.passkey.title')}
            </Heading>
            <Text type="body" color="secondary">
              {t('profile.passkey.description')}
            </Text>
          </VStack>
          {!showAddForm && (
            <Button
              label={t('profile.passkey.add')}
              variant="primary"
              isDisabled={busy}
              onClick={() => setShowAddForm(true)}
            />
          )}
        </HStack>

        {showAddForm && (
          <Card variant="muted" padding={4}>
            <form onSubmit={(e) => void addPasskey(e)}>
              <VStack gap={3}>
                <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={3}>
                  <TextInput
                    label={t('profile.passkey.name')}
                    value={newName}
                    onChange={(value) => setNewName(value.slice(0, 100))}
                    placeholder={t('profile.passkey.namePlaceholder')}
                    hasAutoFocus
                  />
                  <TextInput
                    label={t('profile.currentPassword')}
                    type="password"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder={t('profile.passkey.passwordPlaceholder')}
                    autoComplete="current-password"
                  />
                </Grid>
                <HStack gap={2} hAlign="end">
                  <Button label={t('common.cancel')} variant="secondary" isDisabled={busy} onClick={cancelAdd} />
                  <Button
                    type="submit"
                    label={busy ? t('common.processing') : t('profile.passkey.continue')}
                    variant="primary"
                    isLoading={busy}
                    isDisabled={newPassword.length === 0}
                  />
                </HStack>
              </VStack>
            </form>
          </Card>
        )}

        {loading ? (
          <Center padding={4}>
            <Spinner />
          </Center>
        ) : credentials.length === 0 ? (
          <Card padding={4} variant="muted">
            <Center>
              <Text type="body" color="secondary">
                {t('profile.passkey.empty')}
              </Text>
            </Center>
          </Card>
        ) : (
          <List hasDividers>
            {credentials.map((credential) => (
              <ListItem
                key={credential.id}
                startContent={<Icon icon={KeyIcon} color="accent" />}
                label={
                  <HStack gap={2} vAlign="center">
                    <Text type="body" weight="medium">
                      {credential.name}
                    </Text>
                    {credential.backup && <Token size="sm" color="green" label={t('profile.passkey.synced')} />}
                  </HStack>
                }
                description={
                  <Text type="supporting" color="secondary">
                    {t('profile.passkey.createdAt', { date: formatDate(credential.created_at) })}
                    {credential.last_used_at &&
                      ` · ${t('profile.passkey.lastUsed', { date: formatDate(credential.last_used_at) })}`}
                  </Text>
                }
                endContent={
                  <HStack gap={1}>
                    <Button
                      size="sm"
                      label={t('common.edit')}
                      variant="secondary"
                      isDisabled={busy}
                      onClick={() => openRename(credential)}
                    />
                    <Button
                      size="sm"
                      label={t('common.delete')}
                      variant="ghost"
                      isDisabled={busy}
                      onClick={() => openDelete(credential)}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>

      <Dialog isOpen={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)} purpose="form" width={440}>
        <Layout
          header={<DialogHeader title={t('common.edit')} onOpenChange={(open) => !open && setRenameTarget(null)} />}
          content={
            <LayoutContent>
              <TextInput
                label={t('profile.passkey.renamePrompt')}
                value={renameValue}
                onChange={(value) => setRenameValue(value.slice(0, 100))}
                onEnter={() => void confirmRename()}
                placeholder={t('profile.passkey.namePlaceholder')}
                hasAutoFocus
              />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" isDisabled={busy} onClick={() => setRenameTarget(null)} />
                <Button
                  label={t('common.save')}
                  variant="primary"
                  isLoading={busy}
                  isDisabled={!renameValue.trim()}
                  onClick={() => void confirmRename()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <Dialog isOpen={deleteTarget !== null} onOpenChange={(open) => !open && closeDelete()} purpose="form" width={440}>
        <Layout
          header={
            <DialogHeader
              title={t('profile.passkey.deleteTitle')}
              subtitle={t('profile.passkey.deleteConfirm', { name: deleteTarget?.name || '' })}
              onOpenChange={(open) => !open && closeDelete()}
            />
          }
          content={
            <LayoutContent>
              <TextInput
                label={t('profile.currentPassword')}
                type="password"
                value={deletePassword}
                onChange={setDeletePassword}
                onEnter={() => void confirmDelete()}
                placeholder={t('profile.passkey.passwordPlaceholder')}
                autoComplete="current-password"
                hasAutoFocus
              />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('common.cancel')} variant="secondary" isDisabled={busy} onClick={closeDelete} />
                <Button
                  label={busy ? t('common.processing') : t('common.delete')}
                  variant="destructive"
                  isLoading={busy}
                  isDisabled={deletePassword.length === 0}
                  onClick={() => void confirmDelete()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </Card>
  )
}

export function ProfilePage() {
  const { t } = useI18n()
  const user = useAuthStore((s) => s.user)
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const [settings, setSettings] = useState<PublicSettings | null>(null)

  useEffect(() => {
    void refreshUser().catch((error) => console.error('Failed to refresh user:', error))

    // Public settings drive the passkey/OAuth/notification feature flags and support contact.
    void useAppStore
      .getState()
      .fetchPublicSettings()
      .then((s) => setSettings(s))
      .catch((error) => console.error('Failed to load settings:', error))
  }, [refreshUser])

  const oidcProviderName = settings?.oidc_oauth_provider_name || 'OIDC'
  const contactInfo = settings?.contact_info?.trim() || ''

  return (
    <Page title={t('profile.title')} description="">
      <Center>
        <VStack gap={4} hAlign="stretch" maxWidth={950}>
          <ProfileInfoSection user={user} oidcProviderName={oidcProviderName} />
          {user && <ProfileBasicsCard user={user} />}
          {user && <IdentityBindingsSection user={user} settings={settings} />}
          <LinkedSourcesSection user={user} oidcProviderName={oidcProviderName} />
          {contactInfo && <ContactSupportSection contactInfo={contactInfo} />}
          <PasswordSection />
          {user && settings?.balance_low_notify_enabled && (
            <BalanceNotifyCard user={user} systemDefaultThreshold={settings.balance_low_notify_threshold ?? 0} />
          )}
          <TotpSection />
          <PasskeySection enabled={settings?.passkey_enabled === true} />
        </VStack>
      </Center>
    </Page>
  )
}
