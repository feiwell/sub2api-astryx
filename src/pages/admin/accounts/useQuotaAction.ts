import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { OpenAIQuotaUsage } from '~/lib/api/admin/accounts'
import type { ClaudeResetCredits } from '~/lib/api/admin/claudeResetCredits'
import { extractApiErrorMessage } from '@/utils/apiError'
import { t } from '~/i18n'

export interface CreditState {
  claude?: ClaudeResetCredits | null
  pendingKey?: string
  errorKey?: string
  openAI?: OpenAIQuotaUsage | null
  snapshotKey?: string
  message?: string
}

/** The lock and result belong to the account even if its row is temporarily filtered out. */
export class QuotaAction<State extends object> {
  private listeners = new Set<() => void>()
  private state: { data: State; busy: boolean; error: string }

  constructor(initial: State) {
    this.state = { data: initial, busy: false, error: '' }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  update = (patch: Partial<State>) => this.commit({ data: { ...this.state.data, ...patch } })
  private commit(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  async run<T>(request: () => Promise<T>, apply: (result: T) => void | Promise<void>, onError?: (error: unknown) => void) {
    if (this.state.busy) return
    this.commit({ busy: true, error: '' })
    try {
      await apply(await request())
    } catch (error) {
      this.commit({ error: extractApiErrorMessage(error, t('admin.accounts.usageError')) })
      onError?.(error)
    } finally {
      this.commit({ busy: false })
    }
  }
}

export type CreditAction = QuotaAction<CreditState>

export function useCreditAction(action: CreditAction) {
  const { data, busy, error } = useSyncExternalStore(action.subscribe, action.getSnapshot, action.getSnapshot)
  return { ...data, busy, error }
}

/** Provider probes only update a mounted cell. Credit mutations use the page's persistent action. */
export function useQuotaAction() {
  const [action] = useState(() => new QuotaAction({}))
  const { busy, error } = useSyncExternalStore(action.subscribe, action.getSnapshot, action.getSnapshot)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const run = useCallback(<T,>(request: () => Promise<T>, apply: (result: T) => void | Promise<void>) =>
    action.run(request, result => { if (mounted.current) return apply(result) }), [action])
  return { busy, error, run }
}
