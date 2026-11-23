import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { FileInput } from '@astryxdesign/core/FileInput'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Icon } from '@astryxdesign/core/Icon'
import { Grid } from '@astryxdesign/core/Grid'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { EnvelopeIcon, LinkIcon } from '@heroicons/react/24/outline'
import { userAPI } from '@/api'
import {
  hasExplicitWeChatOAuthCapabilities,
  resolveWeChatOAuthStartStrict,
  type WeChatOAuthPublicSettings,
} from '@/api/auth'
import type { BindableOAuthProvider } from '@/api/user'
import type { PublicSettings, User, UserAuthBindingStatus, UserAuthProvider, UserProfileSourceContext } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { t as translate, useI18n } from '~/i18n'
import { toast } from '~/lib/toast'
import { useAuthStore } from '~/stores/auth'

// ---------------------------------------------------------------------------
// Binding helpers (ports of ProfileInfoCard.vue / ProfileIdentityBindingsSection.vue)
// ---------------------------------------------------------------------------

function normalizeBindingStatus(binding: boolean | UserAuthBindingStatus | undefined): boolean | null {
  if (typeof binding === 'boolean') return binding
  if (!binding) return null
  if (typeof binding.bound === 'boolean') return binding.bound
  return Boolean(binding.provider_subject || binding.issuer || binding.provider_key)
}

export function getBindingStatusForUser(user: User | null | undefined, provider: UserAuthProvider): boolean {
  if (provider === 'email') {
    if (typeof user?.email_bound === 'boolean') return user.email_bound
    return normalizeBindingStatus(user?.auth_bindings?.email ?? user?.identity_bindings?.email) ?? false
  }
  const directFlag = user?.[`${provider}_bound` as keyof User]
  if (typeof directFlag === 'boolean') return directFlag
  return normalizeBindingStatus(user?.auth_bindings?.[provider] ?? user?.identity_bindings?.[provider]) ?? false
}

/** The account email, hidden while it is still a placeholder (*.invalid) address. */
export function displayableEmail(user: User | null | undefined): string {
  const email = user?.email?.trim() || ''
  if (!email) return ''
  if (email.endsWith('.invalid') && !getBindingStatusForUser(user, 'email')) return ''
  return email
}

function normalizeProvider(value: string): UserAuthProvider | null {
  const normalized = value.trim().toLowerCase()
  if (['email', 'linuxdo', 'dingtalk', 'wechat', 'github', 'google'].includes(normalized)) {
    return normalized as UserAuthProvider
  }
  if (normalized === 'oidc' || normalized.startsWith('oidc:') || normalized.startsWith('oidc/')) return 'oidc'
  return null
}

function providerLabel(provider: UserAuthProvider, oidcProviderName: string): string {
  if (provider === 'github') return 'GitHub'
  if (provider === 'google') return 'Google'
  if (provider === 'oidc') return translate('profile.authBindings.providers.oidc', { providerName: oidcProviderName })
  return translate(`profile.authBindings.providers.${provider}`)
}

function readObjectString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function resolveThirdPartySource(
  rawSource: string | UserProfileSourceContext | null | undefined,
  oidcProviderName: string,
): string | null {
  if (!rawSource) return null
  if (typeof rawSource === 'string') {
    const provider = normalizeProvider(rawSource)
    return provider && provider !== 'email' ? providerLabel(provider, oidcProviderName) : null
  }
  const record = rawSource as Record<string, unknown>
  const provider = normalizeProvider(readObjectString(record, 'provider', 'source', 'provider_type', 'auth_provider'))
  if (!provider || provider === 'email') return null
  return (
    readObjectString(record, 'provider_label', 'label', 'provider_name', 'providerName') ||
    providerLabel(provider, oidcProviderName)
  )
}

/** "Avatar/username synced from <provider>" hints for profile fields filled by a third-party login. */
export function profileSourceHints(user: User | null, oidcProviderName: string): Array<{ key: string; text: string }> {
  if (!user) return []
  const hints: Array<{ key: string; text: string }> = []
  const avatarSource = resolveThirdPartySource(user.profile_sources?.avatar ?? user.avatar_source, oidcProviderName)
  const usernameSource = resolveThirdPartySource(
    user.profile_sources?.username ??
      user.profile_sources?.display_name ??
      user.profile_sources?.nickname ??
      user.display_name_source ??
      user.username_source ??
      user.nickname_source,
    oidcProviderName,
  )
  if (avatarSource) hints.push({ key: 'avatar', text: translate('profile.authBindings.source.avatar', { providerName: avatarSource }) })
  if (usernameSource) {
    hints.push({ key: 'username', text: translate('profile.authBindings.source.username', { providerName: usernameSource }) })
  }
  return hints
}

// ---------------------------------------------------------------------------
// Avatar (port of ProfileAvatarCard.vue)
// ---------------------------------------------------------------------------

const TARGET_AVATAR_UPLOAD_BYTES = 20 * 1024
const AVATAR_SCALE_STEPS = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]
const AVATAR_QUALITY_STEPS = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36]

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('avatar_read_failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataURL: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(translate('profile.avatar.readFailed')))
    image.src = dataURL
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(translate('profile.avatar.compressFailed')))),
      type,
      quality,
    )
  })
}

/** Re-encodes the image as webp, shrinking it until it fits the 20KB avatar budget. */
async function compressAvatarFile(file: File): Promise<File> {
  const image = await loadImage(await readFileAsDataURL(file))
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(translate('profile.avatar.compressFailed'))
  for (const scale of AVATAR_SCALE_STEPS) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    for (const quality of AVATAR_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob.size <= TARGET_AVATAR_UPLOAD_BYTES) {
        const fileName = file.name.replace(/\.[^.]+$/, '') || 'avatar'
        return new File([blob], `${fileName}.webp`, { type: 'image/webp' })
      }
    }
  }
  throw new Error(translate('profile.avatar.compressTooLarge'))
}

async function prepareAvatarUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error(translate('profile.avatar.invalidType'))
  if (file.type === 'image/gif') {
    if (file.size > TARGET_AVATAR_UPLOAD_BYTES) throw new Error(translate('profile.avatar.gifTooLarge'))
    return file
  }
  if (file.size <= TARGET_AVATAR_UPLOAD_BYTES) return file
  return compressAvatarFile(file)
}

function ProfileAvatarEditor({ user }: { user: User }) {
  const { t } = useI18n()
  const setUser = useAuthStore((s) => s.setUser)
  const [avatarDraft, setAvatarDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => setAvatarDraft(''), [user.avatar_url])

  const displayName = user.username?.trim() || user.email?.trim() || t('profile.user')
  const previewUrl = avatarDraft.trim() || user.avatar_url?.trim() || ''

  const normalizeUploadedAvatar = (value: string): string | null => {
    const normalized = value.trim()
    if (!normalized) return null
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(normalized)) {
      toast.error(t('profile.avatar.uploadRequired'))
      return null
    }
    return normalized
  }

  const handleFile = async (selected: File | File[] | null) => {
    const file = Array.isArray(selected) ? selected[0] : selected
    if (!file) return
    try {
      const normalized = normalizeUploadedAvatar(await readFileAsDataURL(await prepareAvatarUpload(file)))
      if (normalized) setAvatarDraft(normalized)
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    }
  }

  const handleSave = async () => {
    const normalized = normalizeUploadedAvatar(avatarDraft)
    if (!normalized) return
    setSaving(true)
    try {
      const updated = await userAPI.updateProfile({ avatar_url: normalized })
      setUser(updated)
      setAvatarDraft(updated.avatar_url?.trim() || '')
      toast.success(t('profile.avatar.saveSuccess'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (saving) return
    if (!avatarDraft.trim() && !user.avatar_url?.trim()) {
      toast.error(t('profile.avatar.emptyDeleteHint'))
      return
    }
    setSaving(true)
    try {
      setUser(await userAPI.updateProfile({ avatar_url: '' }))
      setAvatarDraft('')
      toast.success(t('profile.avatar.deleteSuccess'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <VStack gap={3}>
      <Text type="label">{t('profile.avatar.title')}</Text>
      <HStack gap={4} vAlign="center">
        <Avatar src={previewUrl || undefined} name={displayName} size={64} shape="rounded" tooltip={false} />
        <Text type="supporting">{t('profile.avatar.uploadHint')}</Text>
      </HStack>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <FileInput
          label={t('profile.avatar.uploadAction')}
          isLabelHidden
          placeholder={t('profile.avatar.uploadAction')}
          value={null}
          accept="image/*"
          onChange={(files) => void handleFile(files)}
          width={200}
        />
        <Button
          size="sm"
          variant="primary"
          label={t('common.save')}
          isLoading={saving}
          isDisabled={!avatarDraft}
          onClick={() => void handleSave()}
        />
        <Button size="sm" variant="secondary" label={t('common.delete')} isDisabled={saving} onClick={() => void handleDelete()} />
      </HStack>
    </VStack>
  )
}

// ---------------------------------------------------------------------------
// Username (port of ProfileEditForm.vue)
// ---------------------------------------------------------------------------

function ProfileUsernameForm({ initialUsername }: { initialUsername: string }) {
  const { t } = useI18n()
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState(initialUsername)
  const [loading, setLoading] = useState(false)
  const savedUsername = useRef(initialUsername)

  // Follow upstream changes unless the user is mid-edit.
  useEffect(() => {
    setUsername((current) => (current === savedUsername.current ? initialUsername : current))
    savedUsername.current = initialUsername
  }, [initialUsername])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim()) {
      toast.error(t('profile.usernameRequired'))
      return
    }
    setLoading(true)
    const submitted = username
    try {
      const updated = await userAPI.updateProfile({ username: submitted })
      setUsername((current) => (current === submitted ? updated.username : current))
      savedUsername.current = updated.username
      setUser(updated)
      toast.success(t('profile.updateSuccess'))
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('profile.updateFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={3}>
        <Text type="label">{t('profile.editProfile')}</Text>
        <TextInput
          label={t('profile.username')}
          value={username}
          onChange={setUsername}
          placeholder={t('profile.enterUsername')}
        />
        <HStack hAlign="end">
          <Button
            type="submit"
            variant="primary"
            label={loading ? t('profile.updating') : t('profile.updateProfile')}
            isLoading={loading}
          />
        </HStack>
      </VStack>
    </form>
  )
}

/** Avatar editor + username form, side by side (the Vue "basics" panel). */
export function ProfileBasicsCard({ user }: { user: User }) {
  const { t } = useI18n()
  return (
    <Card padding={6}>
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={4}>{t('profile.basicsTitle')}</Heading>
          <Text color="secondary">{t('profile.basicsDescription')}</Text>
        </VStack>
        <Grid columns={{ minWidth: 280, repeat: 'fit' }} gap={4}>
          <Card variant="muted" padding={5}>
            <ProfileAvatarEditor user={user} />
          </Card>
          <Card variant="muted" padding={5}>
            <ProfileUsernameForm initialUsername={user.username || ''} />
          </Card>
        </Grid>
      </VStack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sign-in bindings (port of ProfileIdentityBindingsSection.vue, compact mode)
// ---------------------------------------------------------------------------

const LEGACY_BINDING_NOTE_KEYS: Record<string, string> = {
  'Primary account email is managed from the profile form.': 'profile.authBindings.notes.emailManagedFromProfile',
  'You can unbind this sign-in method.': 'profile.authBindings.notes.canUnbind',
  'Bind another sign-in method before unbinding.': 'profile.authBindings.notes.bindAnotherBeforeUnbind',
}

function legacyCompatibleWeChatSettings(settings: WeChatOAuthPublicSettings | null | undefined) {
  if (!settings) return null
  if (hasExplicitWeChatOAuthCapabilities(settings)) return settings
  if (typeof settings.wechat_oauth_enabled !== 'boolean') return null
  return {
    ...settings,
    wechat_oauth_open_enabled: settings.wechat_oauth_enabled,
    wechat_oauth_mp_enabled: settings.wechat_oauth_enabled,
  }
}

function bindingDetails(user: User | null, provider: UserAuthProvider): UserAuthBindingStatus | null {
  const binding = user?.auth_bindings?.[provider] ?? user?.identity_bindings?.[provider]
  return binding && typeof binding !== 'boolean' ? binding : null
}

function bindingCountLabel(details: UserAuthBindingStatus | null): string {
  if (!details || typeof details.bound_count !== 'number' || details.bound_count <= 1) return ''
  return translate('profile.authBindings.boundCount', { count: details.bound_count })
}

function bindingNote(details: UserAuthBindingStatus | null): string {
  if (!details) return ''
  const noteKey = details.note_key?.trim() || LEGACY_BINDING_NOTE_KEYS[details.note?.trim() || ''] || ''
  if (noteKey) {
    const translated = translate(noteKey)
    if (translated !== noteKey) return translated
  }
  return details.note?.trim() || ''
}

export function IdentityBindingsSection({ user, settings }: { user: User; settings: PublicSettings | null }) {
  const { t } = useI18n()
  const location = useLocation()
  const setUser = useAuthStore((s) => s.setUser)
  const oidcProviderName = settings?.oidc_oauth_provider_name || 'OIDC'

  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailForm, setEmailForm] = useState({ email: '', verifyCode: '', password: '' })
  const [isFormDirty, setIsFormDirty] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [bindingEmail, setBindingEmail] = useState(false)
  const [unbindingProvider, setUnbindingProvider] = useState<BindableOAuthProvider | null>(null)
  const [startingProvider, setStartingProvider] = useState<BindableOAuthProvider | null>(null)

  const resetEmailForm = (source: User) => {
    setEmailForm({
      email: typeof source.email === 'string' && !source.email.endsWith('.invalid') ? source.email : '',
      verifyCode: '',
      password: '',
    })
    setIsFormDirty(false)
  }

  // Profile refreshes must not overwrite an in-progress email verification.
  const lastUserId = useRef<number | null>(null)
  useEffect(() => {
    if (user.id !== lastUserId.current || !isFormDirty) resetEmailForm(user)
    lastUserId.current = user.id
  }, [user])

  const emailBound = getBindingStatusForUser(user, 'email')
  const wechatSettings = legacyCompatibleWeChatSettings(settings)
  const wechatBindingEnabled = resolveWeChatOAuthStartStrict(wechatSettings).mode !== null
  const providerEnabled: Record<BindableOAuthProvider, boolean> = {
    linuxdo: settings?.linuxdo_oauth_enabled ?? false,
    dingtalk: settings?.dingtalk_oauth_enabled ?? false,
    oidc: settings?.oidc_oauth_enabled ?? false,
    wechat: wechatBindingEnabled,
    github: false,
    google: false,
  }

  const oauthItems = (['linuxdo', 'dingtalk', 'oidc', 'wechat'] as const).map((provider) => {
    const bound = getBindingStatusForUser(user, provider)
    const details = bindingDetails(user, provider)
    return {
      provider,
      label: providerLabel(provider, oidcProviderName),
      bound,
      details,
      canBind: !bound && providerEnabled[provider] && (details?.can_bind ?? true),
      canUnbind: Boolean(bound && details?.can_unbind),
    }
  })

  const detailLines = (provider: UserAuthProvider, details: UserAuthBindingStatus | null): string[] => {
    if (!details) return []
    return [
      provider !== 'email' ? details.display_name || '' : '',
      provider !== 'email' ? details.subject_hint || '' : '',
      bindingCountLabel(details),
      bindingNote(details),
    ].filter(Boolean)
  }

  const validateEmailForm = (requireCode: boolean): boolean => {
    if (!emailForm.email) {
      toast.error(t('auth.emailRequired'))
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)) {
      toast.error(t('auth.invalidEmail'))
      return false
    }
    if (requireCode && !emailForm.verifyCode) {
      toast.error(t('auth.codeRequired'))
      return false
    }
    if (requireCode && !emailForm.password) {
      toast.error(t('auth.passwordRequired'))
      return false
    }
    if (requireCode && !emailBound && emailForm.password.length < 6) {
      toast.error(t('auth.passwordMinLength'))
      return false
    }
    return true
  }

  const updateEmailForm = (patch: Partial<typeof emailForm>) => {
    setEmailForm((prev) => ({ ...prev, ...patch }))
    setIsFormDirty(true)
  }

  const sendEmailCode = async () => {
    if (!validateEmailForm(false)) return
    setIsFormDirty(true)
    setSendingCode(true)
    try {
      await userAPI.sendEmailBindingCode(emailForm.email)
      toast.success(t('profile.authBindings.codeSentTo', { email: emailForm.email }))
    } catch (error) {
      toast.error((error as { message?: string }).message || t('auth.sendCodeFailed'))
    } finally {
      setSendingCode(false)
    }
  }

  const bindEmail = async () => {
    if (!validateEmailForm(true)) return
    setBindingEmail(true)
    try {
      const updated = await userAPI.bindEmailIdentity({
        email: emailForm.email,
        verify_code: emailForm.verifyCode,
        password: emailForm.password,
      })
      const replacing = emailBound
      setUser(updated)
      resetEmailForm(updated)
      setShowEmailForm(false)
      toast.success(replacing ? t('profile.authBindings.replaceSuccess') : t('profile.authBindings.bindSuccess'))
    } catch (error) {
      toast.error((error as { message?: string }).message || t('common.tryAgain'))
    } finally {
      setBindingEmail(false)
    }
  }

  const startBinding = async (provider: BindableOAuthProvider) => {
    setStartingProvider(provider)
    try {
      await userAPI.startOAuthBinding(provider, {
        redirectTo: `${location.pathname}${location.search}` || '/profile',
        wechatOAuthSettings: provider === 'wechat' ? wechatSettings : null,
      })
    } catch (error) {
      toast.error(extractApiErrorMessage(error, t('common.tryAgain')))
      setStartingProvider(null)
    }
  }

  const unbind = async (provider: BindableOAuthProvider, label: string) => {
    setUnbindingProvider(provider)
    try {
      setUser(await userAPI.unbindAuthIdentity(provider))
      toast.success(t('profile.authBindings.unbindSuccess', { providerName: label }))
    } catch (error) {
      toast.error((error as { message?: string }).message || t('common.tryAgain'))
    } finally {
      setUnbindingProvider(null)
    }
  }

  const statusTag = (bound: boolean) => {
    const label = bound ? t('profile.authBindings.status.bound') : t('profile.authBindings.status.notBound')
    return (
      <HStack gap={1.5} vAlign="center">
        <StatusDot variant={bound ? 'success' : 'neutral'} label={label} />
        <Text type="supporting">{label}</Text>
      </HStack>
    )
  }

  const emailSummary = displayableEmail(user)
  const emailLines = detailLines('email', bindingDetails(user, 'email'))

  return (
    <Card padding={6}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={4}>{t('profile.authBindings.title')}</Heading>
          <Text color="secondary">{t('profile.authBindings.description')}</Text>
        </VStack>

        <List hasDividers>
          <ListItem
            align="start"
            startContent={<Icon icon={EnvelopeIcon} size="lg" color="accent" />}
            label={
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Text weight="medium">{t('profile.authBindings.providers.email')}</Text>
                {statusTag(emailBound)}
              </HStack>
            }
            description={
              emailSummary || emailLines.length > 0 ? (
                <>
                  {emailSummary && <Text display="block">{emailSummary}</Text>}
                  {emailLines.map((line) => (
                    <Text key={line} type="supporting" display="block">
                      {line}
                    </Text>
                  ))}
                </>
              ) : undefined
            }
            endContent={
              <Button
                size="sm"
                variant="secondary"
                label={
                  showEmailForm
                    ? t('profile.authBindings.hideEmailFormAction')
                    : t('profile.authBindings.manageEmailAction')
                }
                onClick={() => setShowEmailForm((value) => !value)}
              />
            }
          />

          {oauthItems.map((item) => {
            const lines = detailLines(item.provider, item.details)
            return (
              <ListItem
                key={item.provider}
                align="start"
                startContent={<Avatar name={item.label} size={40} shape="rounded" tooltip={false} />}
                label={
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text weight="medium">{item.label}</Text>
                    {statusTag(item.bound)}
                  </HStack>
                }
                description={
                  lines.length > 0 ? (
                    <>
                      {lines.map((line) => (
                        <Text key={line} type="supporting" display="block">
                          {line}
                        </Text>
                      ))}
                    </>
                  ) : undefined
                }
                endContent={
                  item.canBind || item.canUnbind ? (
                    <HStack gap={2} vAlign="center">
                      {item.canBind && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<Icon icon={LinkIcon} />}
                          label={t('profile.authBindings.bindAction', { providerName: item.label })}
                          isLoading={startingProvider === item.provider}
                          onClick={() => void startBinding(item.provider)}
                        />
                      )}
                      {item.canUnbind && (
                        <Button
                          size="sm"
                          variant="secondary"
                          label={
                            unbindingProvider === item.provider
                              ? t('common.loading')
                              : t('profile.authBindings.unbindAction')
                          }
                          isLoading={unbindingProvider === item.provider}
                          onClick={() => void unbind(item.provider, item.label)}
                        />
                      )}
                    </HStack>
                  ) : undefined
                }
              />
            )
          })}
        </List>

        {showEmailForm && (
          <Card variant="muted" padding={4}>
            <VStack gap={2}>
              <HStack gap={2} vAlign="end" wrap="wrap">
                <TextInput
                  label={t('profile.authBindings.emailPlaceholder')}
                  isLabelHidden
                  type="email"
                  value={emailForm.email}
                  onChange={(value) => updateEmailForm({ email: value.trim() })}
                  placeholder={t('profile.authBindings.emailPlaceholder')}
                  isDisabled={sendingCode || bindingEmail}
                  width={280}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  label={sendingCode ? t('common.loading') : t('profile.authBindings.sendCodeAction')}
                  isLoading={sendingCode}
                  isDisabled={bindingEmail}
                  onClick={() => void sendEmailCode()}
                />
              </HStack>
              <HStack gap={2} vAlign="end" wrap="wrap">
                <TextInput
                  label={t('profile.authBindings.codePlaceholder')}
                  isLabelHidden
                  value={emailForm.verifyCode}
                  onChange={(value) => updateEmailForm({ verifyCode: value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder={t('profile.authBindings.codePlaceholder')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  isDisabled={bindingEmail}
                  width={180}
                />
                <TextInput
                  label={
                    emailBound
                      ? t('profile.authBindings.replaceEmailPasswordPlaceholder')
                      : t('profile.authBindings.passwordPlaceholder')
                  }
                  isLabelHidden
                  type="password"
                  value={emailForm.password}
                  onChange={(value) => updateEmailForm({ password: value })}
                  placeholder={
                    emailBound
                      ? t('profile.authBindings.replaceEmailPasswordPlaceholder')
                      : t('profile.authBindings.passwordPlaceholder')
                  }
                  autoComplete={emailBound ? 'current-password' : 'new-password'}
                  isDisabled={bindingEmail}
                  width={240}
                />
              </HStack>
              <HStack>
                <Button
                  size="sm"
                  variant="primary"
                  label={
                    bindingEmail
                      ? t('common.loading')
                      : emailBound
                        ? t('profile.authBindings.confirmEmailReplaceAction')
                        : t('profile.authBindings.confirmEmailBindAction')
                  }
                  isLoading={bindingEmail}
                  onClick={() => void bindEmail()}
                />
              </HStack>
            </VStack>
          </Card>
        )}
      </VStack>
    </Card>
  )
}
