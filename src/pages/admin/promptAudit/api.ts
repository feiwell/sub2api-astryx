import type {
  PromptAuditConfig,
  PromptAuditDraft,
  PromptAuditEndpointDraft,
  PromptAuditEvent,
  PromptAuditRuntime,
  PromptDeletePreview,
  PromptDeleteResult,
  PromptEventFilters,
  PromptEventPage,
  PromptProbeResult,
} from '@/features/prompt-audit/types'
import { buildUpdateRequest, eventFilterPayload, eventQueryParams } from '@/features/prompt-audit/viewModel'
import { apiClient } from '~/lib/api/client'

const BASE = '/admin/prompt-audit'

export async function getConfig(): Promise<PromptAuditConfig> {
  const { data } = await apiClient.get<PromptAuditConfig>(`${BASE}/config`)
  return data
}

/**
 * Saves the draft. The server refuses it when its configuration is no longer the version the
 * draft started from, and answers with the configuration as saved: API keys are never sent back.
 */
export async function updateConfig(draft: PromptAuditDraft): Promise<PromptAuditConfig> {
  const { data } = await apiClient.put<PromptAuditConfig>(`${BASE}/config`, buildUpdateRequest(draft))
  return data
}

/**
 * Has the server call a guard node as the draft describes it, saved or not. Without a key typed
 * in the draft, the server uses the one it holds for that node, but only while the base URL is
 * still the saved one.
 */
export async function probeEndpoint(endpoint: PromptAuditEndpointDraft): Promise<PromptProbeResult> {
  const { data } = await apiClient.post<PromptProbeResult>(`${BASE}/endpoints/probe`, {
    endpoint: {
      id: endpoint.id,
      name: endpoint.name,
      protocol: 'openai_compatible',
      base_url: endpoint.base_url,
      model: endpoint.model,
      token: endpoint.token || undefined,
      timeout_ms: endpoint.timeout_ms,
      input_limit: endpoint.input_limit,
      enabled: endpoint.enabled,
    },
  })
  return data
}

export async function getRuntime(): Promise<PromptAuditRuntime> {
  const { data } = await apiClient.get<PromptAuditRuntime>(`${BASE}/runtime`)
  return data
}

export async function listEvents(filters: PromptEventFilters, page: number, pageSize: number): Promise<PromptEventPage> {
  const { data } = await apiClient.get<PromptEventPage>(`${BASE}/events`, {
    params: { page, page_size: pageSize, ...eventQueryParams(filters) },
  })
  return data
}

export async function getEvent(id: number): Promise<PromptAuditEvent> {
  const { data } = await apiClient.get<PromptAuditEvent>(`${BASE}/events/${id}`)
  return data
}

export async function deleteEvent(id: number): Promise<PromptDeleteResult> {
  const { data } = await apiClient.delete<PromptDeleteResult>(`${BASE}/events/${id}`)
  return data
}

export async function batchDeleteEvents(ids: number[]): Promise<PromptDeleteResult> {
  const { data } = await apiClient.post<PromptDeleteResult>(`${BASE}/events/batch-delete`, { ids })
  return data
}

/** Counts what a delete by filter would remove, and mints the token that delete must carry. */
export async function previewDelete(filters: PromptEventFilters): Promise<PromptDeletePreview> {
  const { data } = await apiClient.post<PromptDeletePreview>(`${BASE}/events/delete-preview`, eventFilterPayload(filters))
  return data
}

/** Deletes what a preview counted. `filters` must be the ones that preview was asked with. */
export async function deleteEventsByFilter(
  filters: PromptEventFilters,
  preview: PromptDeletePreview,
): Promise<PromptDeleteResult> {
  const { data } = await apiClient.post<PromptDeleteResult>(`${BASE}/events/delete-by-filter`, {
    filter: eventFilterPayload(filters),
    snapshot_max_id: preview.snapshot_max_id,
    filter_hash: preview.filter_hash,
    confirmation_token: preview.confirmation_token,
    confirm: true,
  })
  return data
}
