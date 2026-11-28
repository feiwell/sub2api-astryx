import { useCallback, useEffect, useMemo, useState, type ClipboardEvent } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { CheckIcon, LockClosedIcon, PencilIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from '@heroicons/react/24/outline'
import { adminAPI } from '~/lib/api/admin'
import type { TLSFingerprintProfile } from '~/lib/api/admin/tlsFingerprintProfile'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

type Mode = 'list' | 'create' | 'edit'
type ApiErrorLike = { response?: { data?: { detail?: string } } }

// Raw string inputs for the array fields
interface FieldInputs {
  cipher_suites: string
  curves: string
  point_formats: string
  signature_algorithms: string
  alpn_protocols: string
  supported_versions: string
  key_share_groups: string
  psk_modes: string
  extensions: string
}

interface ProfileForm {
  name: string
  description: string | null
  enable_grease: boolean
}

const EMPTY_FIELDS: FieldInputs = {
  cipher_suites: '',
  curves: '',
  point_formats: '',
  signature_algorithms: '',
  alpn_protocols: '',
  supported_versions: '',
  key_share_groups: '',
  psk_modes: '',
  extensions: '',
}

const EMPTY_FORM: ProfileForm = { name: '', description: null, enable_grease: false }

const NUMERIC_YAML_KEYS = [
  'cipher_suites',
  'curves',
  'point_formats',
  'signature_algorithms',
  'supported_versions',
  'key_share_groups',
  'psk_modes',
  'extensions',
] as const

const MONO = { fontFamily: 'var(--font-family-code)' }
const COLLECTOR_URL = 'https://tls.sub2api.org'

// Parse a comma-separated string of numbers supporting both hex (0x...) and decimal
const parseNumericArray = (input: string): number[] => {
  if (!input.trim()) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10)))
    .filter((n) => !isNaN(n))
}

// Parse a comma-separated string of string values
const parseStringArray = (input: string): string[] => {
  if (!input.trim()) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Format a number as hex with 0x prefix and 4-digit padding
const formatHex = (n: number): string => '0x' + n.toString(16).padStart(4, '0')
// Format numeric arrays for display in the textareas (null-safe)
const formatNumericArray = (arr: number[] | null | undefined): string => (arr ?? []).map(formatHex).join(', ')
// point_formats, psk_modes and friends (uint8) show as plain numbers (null-safe)
const formatPlainNumericArray = (arr: number[] | null | undefined): string => (arr ?? []).join(', ')

/**
 * Parse the YAML output of tls-fingerprint-web. Expected format:
 *   # comment lines
 *   profile_key:
 *     name: "Profile Name"
 *     enable_grease: false
 *     cipher_suites: [4866, 4867, ...]
 *     alpn_protocols: ["h2", "http/1.1"]
 * Returns the extracted values; `name` is set only when a non-empty name was found.
 */
function parseTlsYaml(text: string): { name?: string; enable_grease?: boolean; fields: Partial<FieldInputs> } {
  const parsed: { name?: string; enable_grease?: boolean; fields: Partial<FieldInputs> } = { fields: {} }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^(\w+):\s*(.+)$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim()
    if (key === 'name') {
      const unquoted = value.replace(/^["']|["']$/g, '')
      if (unquoted) parsed.name = unquoted
    } else if (key === 'enable_grease') {
      parsed.enable_grease = value === 'true'
    } else if ((NUMERIC_YAML_KEYS as readonly string[]).includes(key)) {
      // YAML array: [1, 2, 3]; values are decimal integers from tls-fingerprint-web
      const arrMatch = value.match(/^\[(.*)?\]$/)
      if (arrMatch) {
        parsed.fields[key as (typeof NUMERIC_YAML_KEYS)[number]] = (arrMatch[1] || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .join(', ')
      }
    } else if (key === 'alpn_protocols') {
      // String array: ["h2", "http/1.1"]
      const arrMatch = value.match(/^\[(.*)?\]$/)
      if (arrMatch) {
        parsed.fields.alpn_protocols = (arrMatch[1] || '')
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0)
          .join(', ')
      }
    }
  }
  return parsed
}

interface ProfileRow extends Record<string, unknown> {
  __id: string
  profile: TLSFingerprintProfile
}

interface TlsFingerprintProfilesDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Port of components/admin/TLSFingerprintProfilesModal.vue. The create/edit
 * form is a step inside the same dialog instead of a nested dialog.
 */
export function TlsFingerprintProfilesDialog({ isOpen, onClose }: TlsFingerprintProfilesDialogProps) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<TLSFingerprintProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<Mode>('list')
  const [editingProfile, setEditingProfile] = useState<TLSFingerprintProfile | null>(null)
  const [deletingProfile, setDeletingProfile] = useState<TLSFingerprintProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [yamlInput, setYamlInput] = useState('')
  const [fieldInputs, setFieldInputs] = useState<FieldInputs>(EMPTY_FIELDS)
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)

  const patchFields = (next: Partial<FieldInputs>) => setFieldInputs((prev) => ({ ...prev, ...next }))
  const patchForm = (next: Partial<ProfileForm>) => setForm((prev) => ({ ...prev, ...next }))

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles(await adminAPI.tlsFingerprintProfiles.list())
    } catch (error) {
      toast.error(t('admin.tlsFingerprintProfiles.loadFailed'))
      console.error('Error loading TLS fingerprint profiles:', error)
    } finally {
      setLoading(false)
    }
  }, [t])

  // Load profiles when the dialog opens
  useEffect(() => {
    if (!isOpen) return
    setMode('list')
    void loadProfiles()
  }, [isOpen, loadProfiles])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setFieldInputs(EMPTY_FIELDS)
    setYamlInput('')
  }

  const closeForm = () => {
    setMode('list')
    setEditingProfile(null)
    resetForm()
  }

  const openCreate = () => {
    resetForm()
    setEditingProfile(null)
    setMode('create')
  }

  const parseYamlInput = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    const parsed = parseTlsYaml(text)
    setForm((prev) => ({
      ...prev,
      ...(parsed.name ? { name: parsed.name } : {}),
      ...(parsed.enable_grease !== undefined ? { enable_grease: parsed.enable_grease } : {}),
    }))
    patchFields(parsed.fields)
    if (parsed.name) {
      toast.success(t('admin.tlsFingerprintProfiles.form.yamlParsed'))
    } else {
      toast.error(t('admin.tlsFingerprintProfiles.form.yamlParseFailed'))
    }
  }

  // Auto-parse on paste, once the pasted text has landed in the textarea
  const handleYamlPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget
    setTimeout(() => parseYamlInput(target.value), 50)
  }

  const handleEdit = useCallback((profile: TLSFingerprintProfile) => {
    setEditingProfile(profile)
    setForm({ name: profile.name, description: profile.description, enable_grease: profile.enable_grease })
    setFieldInputs({
      cipher_suites: formatNumericArray(profile.cipher_suites),
      curves: formatPlainNumericArray(profile.curves),
      point_formats: formatPlainNumericArray(profile.point_formats),
      signature_algorithms: formatNumericArray(profile.signature_algorithms),
      alpn_protocols: (profile.alpn_protocols ?? []).join(', '),
      supported_versions: formatNumericArray(profile.supported_versions),
      key_share_groups: formatPlainNumericArray(profile.key_share_groups),
      psk_modes: formatPlainNumericArray(profile.psk_modes),
      extensions: formatNumericArray(profile.extensions),
    })
    setYamlInput('')
    setMode('edit')
  }, [])

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error(t('admin.tlsFingerprintProfiles.form.name') + ' ' + t('common.required'))
      return
    }
    setSubmitting(true)
    try {
      const data = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        enable_grease: form.enable_grease,
        cipher_suites: parseNumericArray(fieldInputs.cipher_suites),
        curves: parseNumericArray(fieldInputs.curves),
        point_formats: parseNumericArray(fieldInputs.point_formats),
        signature_algorithms: parseNumericArray(fieldInputs.signature_algorithms),
        alpn_protocols: parseStringArray(fieldInputs.alpn_protocols),
        supported_versions: parseNumericArray(fieldInputs.supported_versions),
        key_share_groups: parseNumericArray(fieldInputs.key_share_groups),
        psk_modes: parseNumericArray(fieldInputs.psk_modes),
        extensions: parseNumericArray(fieldInputs.extensions),
      }
      if (mode === 'edit' && editingProfile) {
        await adminAPI.tlsFingerprintProfiles.update(editingProfile.id, data)
        toast.success(t('admin.tlsFingerprintProfiles.updateSuccess'))
      } else {
        await adminAPI.tlsFingerprintProfiles.create(data)
        toast.success(t('admin.tlsFingerprintProfiles.createSuccess'))
      }
      closeForm()
      void loadProfiles()
    } catch (error) {
      toast.error((error as ApiErrorLike).response?.data?.detail || t('admin.tlsFingerprintProfiles.saveFailed'))
      console.error('Error saving TLS fingerprint profile:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingProfile) return
    setDeleting(true)
    try {
      await adminAPI.tlsFingerprintProfiles.delete(deletingProfile.id)
      toast.success(t('admin.tlsFingerprintProfiles.deleteSuccess'))
      setDeletingProfile(null)
      void loadProfiles()
    } catch (error) {
      toast.error((error as ApiErrorLike).response?.data?.detail || t('admin.tlsFingerprintProfiles.deleteFailed'))
      console.error('Error deleting TLS fingerprint profile:', error)
    } finally {
      setDeleting(false)
    }
  }

  const rows: ProfileRow[] = useMemo(() => profiles.map((profile) => ({ __id: String(profile.id), profile })), [profiles])

  const columns: TableColumn<ProfileRow>[] = useMemo(
    () => [
      {
        key: 'name',
        header: t('admin.tlsFingerprintProfiles.columns.name'),
        renderCell: ({ profile }: ProfileRow) => <Text weight="medium">{profile.name}</Text>,
        width: proportional(1.5),
      },
      {
        key: 'description',
        header: t('admin.tlsFingerprintProfiles.columns.description'),
        renderCell: ({ profile }: ProfileRow) =>
          profile.description ? (
            <Text color="secondary" maxLines={1}>
              {profile.description}
            </Text>
          ) : (
            <Text type="supporting" color="disabled">
              —
            </Text>
          ),
        width: proportional(2),
      },
      {
        key: 'grease',
        header: t('admin.tlsFingerprintProfiles.columns.grease'),
        renderCell: ({ profile }: ProfileRow) => (
          <Icon
            icon={profile.enable_grease ? CheckIcon : LockClosedIcon}
            size="sm"
            color={profile.enable_grease ? 'success' : 'disabled'}
            label={profile.enable_grease ? t('common.enabled') : t('common.disabled')}
          />
        ),
        width: pixel(90),
      },
      {
        key: 'alpn',
        header: t('admin.tlsFingerprintProfiles.columns.alpn'),
        renderCell: ({ profile }: ProfileRow) =>
          profile.alpn_protocols?.length ? (
            <HStack gap={1} wrap="wrap" vAlign="center">
              {profile.alpn_protocols.slice(0, 3).map((proto) => (
                <Token key={proto} label={proto} color="blue" size="sm" />
              ))}
              {profile.alpn_protocols.length > 3 && <Text type="supporting">+{profile.alpn_protocols.length - 3}</Text>}
            </HStack>
          ) : (
            <Text type="supporting" color="disabled">
              —
            </Text>
          ),
        width: proportional(1.5),
      },
      {
        key: 'actions',
        header: t('admin.tlsFingerprintProfiles.columns.actions'),
        renderCell: ({ profile }: ProfileRow) => (
          <HStack gap={1}>
            <IconButton icon={<Icon icon={PencilIcon} />} label={t('common.edit')} variant="ghost" onClick={() => handleEdit(profile)} />
            <IconButton
              icon={<Icon icon={TrashIcon} />}
              label={t('common.delete')}
              variant="ghost"
              onClick={() => setDeletingProfile(profile)}
            />
          </HStack>
        ),
        width: pixel(100),
      },
    ],
    [t, handleEdit],
  )

  const renderList = () => (
    <VStack gap={4} hAlign="stretch">
      <HStack gap={3} vAlign="center" hAlign="between">
        <Text color="secondary">{t('admin.tlsFingerprintProfiles.description')}</Text>
        <Button
          label={t('admin.tlsFingerprintProfiles.createProfile')}
          icon={<Icon icon={PlusIcon} />}
          variant="primary"
          size="sm"
          onClick={openCreate}
        />
      </HStack>
      {loading ? (
        <Center minHeight={160}>
          <Spinner />
        </Center>
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={<Icon icon={ShieldCheckIcon} size="lg" color="secondary" />}
          title={t('admin.tlsFingerprintProfiles.noProfiles')}
          description={t('admin.tlsFingerprintProfiles.createFirstProfile')}
        />
      ) : (
        <Card padding={0}>
          <Table data={rows} columns={columns} idKey="__id" density="compact" />
        </Card>
      )}
    </VStack>
  )

  // One of the TLS array textareas; label/placeholder/hint follow the Vue form
  const arrayField = (key: keyof FieldInputs, labelKey: string, placeholder: string, hintKey?: string) => (
    <TextArea
      label={t(`admin.tlsFingerprintProfiles.form.${labelKey}`)}
      description={hintKey ? t(`admin.tlsFingerprintProfiles.form.${hintKey}`) : undefined}
      placeholder={placeholder}
      rows={2}
      value={fieldInputs[key]}
      onChange={(value) => patchFields({ [key]: value })}
      controlStyle={MONO}
    />
  )

  const renderForm = () => (
    <VStack gap={4} hAlign="stretch">
      {/* Paste YAML */}
      <VStack gap={2} hAlign="stretch">
        <TextArea
          label={t('admin.tlsFingerprintProfiles.form.pasteYaml')}
          placeholder={t('admin.tlsFingerprintProfiles.form.pasteYamlPlaceholder')}
          rows={4}
          value={yamlInput}
          onChange={setYamlInput}
          onPaste={handleYamlPaste}
          controlStyle={MONO}
        />
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            label={t('admin.tlsFingerprintProfiles.form.parseYaml')}
            variant="secondary"
            size="sm"
            onClick={() => parseYamlInput(yamlInput)}
          />
          <Text type="supporting">
            {t('admin.tlsFingerprintProfiles.form.pasteYamlHint')}{' '}
            <Link href={COLLECTOR_URL} isExternalLink hasUnderline type="inherit">
              {t('admin.tlsFingerprintProfiles.form.openCollector')}
            </Link>
          </Text>
        </HStack>
      </VStack>

      <Divider />

      {/* Basic info */}
      <HStack gap={4}>
        <StackItem size="fill">
          <TextInput
            label={t('admin.tlsFingerprintProfiles.form.name')}
            placeholder={t('admin.tlsFingerprintProfiles.form.namePlaceholder')}
            value={form.name}
            onChange={(name) => patchForm({ name })}
            isRequired
          />
        </StackItem>
        <StackItem size="fill">
          <TextInput
            label={t('admin.tlsFingerprintProfiles.form.description')}
            placeholder={t('admin.tlsFingerprintProfiles.form.descriptionPlaceholder')}
            value={form.description ?? ''}
            onChange={(description) => patchForm({ description })}
          />
        </StackItem>
      </HStack>

      {/* GREASE toggle */}
      <Switch
        label={t('admin.tlsFingerprintProfiles.form.enableGrease')}
        description={t('admin.tlsFingerprintProfiles.form.enableGreaseHint')}
        value={form.enable_grease}
        onChange={(enable_grease) => patchForm({ enable_grease })}
      />

      {/* TLS array fields, two per row */}
      <HStack gap={4}>
        <StackItem size="fill">{arrayField('cipher_suites', 'cipherSuites', '0x1301, 0x1302, 0xc02c', 'cipherSuitesHint')}</StackItem>
        <StackItem size="fill">{arrayField('curves', 'curves', '29, 23, 24', 'curvesHint')}</StackItem>
      </HStack>
      <HStack gap={4}>
        <StackItem size="fill">{arrayField('signature_algorithms', 'signatureAlgorithms', '0x0403, 0x0804, 0x0401')}</StackItem>
        <StackItem size="fill">{arrayField('supported_versions', 'supportedVersions', '0x0304, 0x0303')}</StackItem>
      </HStack>
      <HStack gap={4}>
        <StackItem size="fill">{arrayField('key_share_groups', 'keyShareGroups', '29, 23')}</StackItem>
        <StackItem size="fill">{arrayField('extensions', 'extensions', '0x0000, 0x0005, 0x000a')}</StackItem>
      </HStack>
      <HStack gap={4}>
        <StackItem size="fill">{arrayField('point_formats', 'pointFormats', '0')}</StackItem>
        <StackItem size="fill">{arrayField('psk_modes', 'pskModes', '1')}</StackItem>
      </HStack>

      {/* ALPN protocols, full width */}
      {arrayField('alpn_protocols', 'alpnProtocols', 'h2, http/1.1')}
    </VStack>
  )

  const isForm = mode !== 'list'
  const title = mode === 'edit'
    ? t('admin.tlsFingerprintProfiles.editProfile')
    : mode === 'create'
      ? t('admin.tlsFingerprintProfiles.createProfile')
      : t('admin.tlsFingerprintProfiles.title')
  // Dismissing the form step returns to the profile list, like closing Vue's nested form modal
  const handleOpenChange = (open: boolean) => {
    if (open) return
    if (isForm) closeForm()
    else onClose()
  }

  return (
    <>
      <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={880} purpose={isForm ? 'form' : 'info'}>
        <Layout
          header={<DialogHeader title={title} onOpenChange={handleOpenChange} />}
          content={<LayoutContent>{isForm ? renderForm() : renderList()}</LayoutContent>}
          footer={
            <LayoutFooter>
              <HStack gap={3} hAlign="end">
                {isForm ? (
                  <>
                    <Button label={t('common.cancel')} variant="secondary" onClick={closeForm} />
                    <Button
                      label={mode === 'edit' ? t('common.update') : t('common.create')}
                      variant="primary"
                      isLoading={submitting}
                      onClick={() => void handleSubmit()}
                    />
                  </>
                ) : (
                  <Button label={t('common.close')} variant="secondary" onClick={onClose} />
                )}
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      <AlertDialog
        isOpen={deletingProfile !== null}
        onOpenChange={(open) => !open && !deleting && setDeletingProfile(null)}
        title={t('admin.tlsFingerprintProfiles.deleteProfile')}
        description={t('admin.tlsFingerprintProfiles.deleteConfirmMessage', { name: deletingProfile?.name })}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isActionLoading={deleting}
        onAction={() => void confirmDelete()}
      />
    </>
  )
}
