import { useLayoutEffect, useRef, useState } from 'react'
import { defaultCNBaseUrl, isMultiProtocolApiKeyPlatform, resolveProviderAccountMode } from '@/components/account/credentialsBuilder'
import { buildModelMappingObject } from '@/composables/useModelWhitelist'
import { supportsUpstreamModelSync } from '@/constants/platformCatalog'
import type { Account } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { t } from '~/i18n'
import { adminAPI } from '~/lib/api/admin'
import type { SyncUpstreamModelsResult } from '~/lib/api/admin/accounts'
import { toast } from '~/lib/toast'
import type { AccountForm } from './accountForm'

const label = (name: string) => t(`admin.accounts.${name}`)
function supportsDiscovery(form: AccountForm, account: Account | null) {
  if (!supportsUpstreamModelSync(form.platform) || account?.parent_account_id != null) return false
  if (form.type === 'apikey') return true
  if (!account) return false
  if (form.type === 'service_account') return form.platform === 'gemini' && form.authMode !== 'apikey'
  if (form.type === 'setup-token') return form.platform === 'anthropic'
  return form.type === 'oauth' && !(form.platform === 'gemini' && form.project.trim())
}

function previewBaseUrl(f: AccountForm) {
  if (!isMultiProtocolApiKeyPlatform(f.platform)) return f.baseUrl.trim()
  const mode = resolveProviderAccountMode(f.platform, f.providerMode)
  if (f.protocol === 'adaptive') return f.endpoints.chat_completions?.trim() || defaultCNBaseUrl(f.platform, mode)
  return f.baseUrl.trim() || defaultCNBaseUrl(f.platform, mode, f.protocol)
}

function warnMetadata(result: SyncUpstreamModelsResult) {
  if (result.warnings?.some(w => w.code === 'upstream_model_metadata_incomplete')) toast.warning(label('syncUpstreamModelsMetadataIncomplete'))
  else if (result.warnings?.some(w => w.code === 'upstream_model_metadata_partial')) toast.warning(label('syncUpstreamModelsMetadataPartial'))
}

export async function syncCreatedAccount(id: number) {
  // Preview uses a temporary account. Only the ID endpoint can persist metadata.
  try { warnMetadata(await adminAPI.accounts.syncUpstreamModels(id)) }
  catch { toast.warning(label('syncUpstreamModelsFailed')) } // Creation already succeeded; never retry it.
}

export function useUpstreamModelSync(form: AccountForm, account: Account | null, onChange: (whitelist: string[]) => void) {
  const visible = supportsDiscovery(form, account)
  const baseUrl = previewBaseUrl(form)
  // The preview endpoint accepts neither a proxy nor header overrides. Do not silently bypass either.
  const needsSavedConnection = !account && (form.proxy != null || form.headerEnabled)
  const canSync = visible && (!!account || (!needsSavedConnection && !!form.key.trim() && (form.platform !== 'antigravity' || !!baseUrl)))
  const [busy, setBusy] = useState(false)
  const request = useRef<symbol | null>(null)
  const previewed = useRef(false)
  const latest = useRef({ form, onChange })
  useLayoutEffect(() => { latest.current = { form, onChange } })
  useLayoutEffect(() => {
    setBusy(false)
    previewed.current = false
    return () => { request.current = null }
  }, [account?.id, form.platform, form.type, baseUrl, form.key, form.proxy, form.headerEnabled, form.providerMode, form.protocol])

  const sync = async () => {
    if (!canSync || request.current) return
    const token = request.current = Symbol()
    setBusy(true)
    try {
      const mapping = buildModelMappingObject('combined', form.whitelist, form.aliases)
      const result = account ? await adminAPI.accounts.syncUpstreamModels(account.id)
        : await adminAPI.accounts.syncUpstreamModelsPreview({ platform: form.platform, type: form.type,
          api_key: form.key.trim(), base_url: baseUrl || undefined, ...(mapping && { model_mapping: mapping }) })
      if (request.current !== token) return
      if (result.discovery_source === 'configured_fallback') {
        toast.warning(label('grokModelDiagnostics.configuredFallback'))
        return
      }
      const models = [...new Set((result.models ?? []).map(m => m.trim()).filter(m => m && !m.includes('*')))]
      if (!models.length) { toast.info(label('syncUpstreamModelsEmpty')); return }
      if (!account) previewed.current = true
      const current = latest.current.form
      const reserved = new Set([...current.whitelist, ...current.aliases.map(row => row.from.trim())])
      const added = models.filter(model => !reserved.has(model))
      if (added.length) {
        latest.current.onChange([...current.whitelist, ...added])
        toast.success(t('admin.accounts.syncUpstreamModelsSuccess', { count: added.length, total: models.length }))
      } else toast.info(t('astryx.accountSyncUnchanged', { count: models.length }))
      warnMetadata(result)
    } catch (err) {
      if (request.current === token) toast.error(t('admin.accounts.syncUpstreamModelsError', { message: extractApiErrorMessage(err, label('syncUpstreamModelsFailed')) }))
    } finally {
      if (request.current === token) { request.current = null; setBusy(false) }
    }
  }
  return { visible, canSync, busy, needsSavedConnection, sync, previewed }
}
