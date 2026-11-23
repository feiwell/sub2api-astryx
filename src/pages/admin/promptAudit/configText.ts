import type { NumberInputEntryError } from '@astryxdesign/core/NumberInput'
import type { PromptAuditDraft, PromptAuditEndpointDraft } from '@/features/prompt-audit/types'
import { t, te } from '~/i18n'

export type Tone = 'success' | 'warning' | 'error' | 'neutral'

/** A code the server sends: its name when this app has one, else as sent. */
const named = (group: string, value: string): string => {
  const key = `admin.promptAudit.${group}.${value}`
  return te(key) ? t(key) : value
}

export const statusLabel = (status: string): string => named('status', status)
export const modeLabel = (mode: string): string => named('mode', mode)

/** Running green, switched off grey, degraded amber; anything else is taken for a failure. */
export function processTone(status: string): Tone {
  if (status === 'running') return 'success'
  if (status === 'disabled') return 'neutral'
  if (status === 'degraded') return 'warning'
  return 'error'
}

/** The node will call its guard with a key: one typed now, or the saved one unless that is to be cleared. */
export const hasCredential = (endpoint: PromptAuditEndpointDraft): boolean =>
  !!endpoint.token.trim() || (endpoint.has_token && !endpoint.clear_token)

/** The saved key can no longer be decrypted, and nothing is set to replace or clear it. */
export const isCredentialInvalid = (endpoint: PromptAuditEndpointDraft): boolean =>
  endpoint.token_status === 'invalid' && !endpoint.token.trim() && !endpoint.clear_token

/** The policy's number fields, by the draft field each one edits. */
export type PolicyNumberField = 'worker_count' | 'queue_capacity'

/** By field: what was typed into it and refused. The draft still holds the number from before. */
export type PolicyNumberErrors = Partial<Record<PolicyNumberField, NumberInputEntryError>>

/**
 * What to show under a number field that refused what was typed into it. The field words that
 * in English only, so it is worded here, with the texts the settings pages use for the same.
 */
export const entryErrorStatus = (error: NumberInputEntryError | undefined) =>
  error
    ? {
        type: 'error' as const,
        message:
          error.kind === 'fractional'
            ? t('admin.settings.features.affiliate.wholeNumber')
            : t('admin.settings.features.affiliate.invalidNumber'),
      }
    : undefined

export interface ConfigProblem {
  field: 'endpoints' | 'groups' | 'scanners'
  message: string
}

/**
 * What the server would refuse the draft for, in the words this app has for the server's error,
 * so the save can be held back and the reason shown where it is fixed. Number ranges are not
 * repeated here: their fields cannot hold a value out of range.
 */
export function configProblems(draft: PromptAuditDraft): ConfigProblem[] {
  const problems: ConfigProblem[] = []
  if (draft.enabled && !draft.endpoints.some((endpoint) => endpoint.enabled)) {
    problems.push({ field: 'endpoints', message: t('admin.promptAudit.errors.prompt_audit_endpoint_required') })
  }
  if (!draft.all_groups && draft.group_ids.length === 0) {
    problems.push({ field: 'groups', message: t('admin.promptAudit.errors.prompt_audit_groups_required') })
  }
  if (draft.scanners.length === 0) {
    problems.push({ field: 'scanners', message: t('admin.promptAudit.errors.prompt_audit_scanners_required') })
  }
  return problems
}
