import { useEffect, useRef, useState } from 'react'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import type { OllamaCloudUsageState } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

/** Session updates use the dedicated encrypted-session API, never the account credentials payload. */
export function OllamaSettings({
  id,
  initial,
  onUpdated,
}: {
  id: number
  initial: OllamaCloudUsageState
  onUpdated: () => void
}) {
  const { t } = useI18n(),
    l = (key: string) => t(`admin.accounts.ollamaCloud.${key}`)
  const [state, setState] = useState(initial),
    [session, setSession] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    const n = ++seq.current
    setBusy(false)
    adminAPI.accounts
      .getOllamaCloudUsage(id)
      .then((s) => {
        if (seq.current === n) setState(s)
      })
      .catch((e) => {
        if (seq.current === n) toast.error(extractApiErrorMessage(e, l('loadFailed')))
      })
    return () => {
      seq.current++
    }
  }, [id, t])
  const run = async (fn: () => Promise<OllamaCloudUsageState>, clear = false) => {
    const n = ++seq.current
    setBusy(true)
    try {
      const next = await fn()
      if (seq.current !== n) return
      setState(next)
      if (clear) setSession('')
      onUpdated()
    } catch (e) {
      if (seq.current === n) toast.error(extractApiErrorMessage(e, t('common.error')))
    } finally {
      if (seq.current === n) setBusy(false)
    }
  }
  return (
    <VStack gap={2} hAlign="stretch">
      <Text weight="medium">{l('title')}</Text>
      <Text type="supporting">{l(state.configured ? 'configured' : 'notConfigured')}</Text>
      {!state.encryption_key_configured && <Text>{l('encryptionKeyRequired')}</Text>}
      {state.snapshot?.data && (
        <Text type="supporting">
          {l('plan')}: {state.snapshot.data.plan || '—'} · {l('balance')}: {state.snapshot.data.balance || '—'}
        </Text>
      )}
      {state.snapshot && (
        <>
          <Text type="supporting">
            {l('status')}: {l(state.snapshot.status)}
          </Text>
          {(['five_hour', 'seven_day'] as const).map((key) => {
            const w = state.snapshot?.data?.[key]
            return (
              w && (
                <Text key={key} type="supporting">
                  {l(key === 'five_hour' ? 'fiveHour' : 'sevenDay')}: {w.used_percent}% ·{' '}
                  {w.reset_text || w.reset_at || '—'}
                </Text>
              )
            )
          })}
          {!!state.snapshot.data?.models?.length && (
            <Text type="supporting">
              {l('models')}: {state.snapshot.data.models.map((m) => `${m.model} (${m.requests})`).join(', ')}
            </Text>
          )}
        </>
      )}
      <TextInput
        type="password"
        autoComplete="off"
        label={l('sessionLabel')}
        description={l('sessionSecurityHint')}
        value={session}
        onChange={setSession}
        isDisabled={busy || !state.encryption_key_configured}
      />
      <HStack gap={2}>
        <Button
          label={t('common.save')}
          isDisabled={busy || !session.trim() || !state.encryption_key_configured}
          onClick={() => void run(() => adminAPI.accounts.saveOllamaCloudUsageSession(id, session.trim()), true)}
        />
        {state.configured && (
          <>
            <Button
              label={l('refreshNow')}
              isDisabled={busy}
              onClick={() => void run(() => adminAPI.accounts.refreshOllamaCloudUsage(id))}
            />
            <Button label={l('deleteSession')} isDisabled={busy} onClick={() => setConfirm(true)} />
          </>
        )}
      </HStack>
      <Switch
        label={l('autoRefresh')}
        value={state.auto_refresh_enabled}
        isDisabled={busy || !state.configured}
        onChange={(enabled) => void run(() => adminAPI.accounts.setOllamaCloudUsageAutoRefresh(id, enabled))}
      />
      <AlertDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={l('deleteSession')}
        description={l('deleteConfirm')}
        actionLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onAction={() => {
          setConfirm(false)
          void run(() => adminAPI.accounts.deleteOllamaCloudUsageSession(id), true)
        }}
      />
    </VStack>
  )
}
