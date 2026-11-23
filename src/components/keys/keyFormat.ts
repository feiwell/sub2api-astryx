import { t } from '~/i18n'

/** Spend against a limit, as KeysView.vue colours it: red once used up, yellow from 80 %. */
export type UsageLevel = 'ok' | 'near' | 'full'

export function usageLevel(used: number, limit: number): UsageLevel {
  if (used >= limit) return 'full'
  if (used >= limit * 0.8) return 'near'
  return 'ok'
}

/** `$1.2345`; a missing amount reads as zero. */
export function usd(amount: number | null | undefined, digits: number): string {
  return `$${(amount ?? 0).toFixed(digits)}`
}

/** The error detail field KeysView.vue reads when saving a key or resetting its usage fails. */
export function serverDetail(error: unknown): string | undefined {
  return (error as { response?: { data?: { detail?: string } } } | null)?.response?.data?.detail
}

/** Time left until a rate-limit window resets, e.g. `3d 4h`, `2h 13m`, `9m`. */
export function formatResetTime(resetAt: string | null, now: Date): string {
  if (!resetAt) return ''
  const diff = new Date(resetAt).getTime() - now.getTime()
  if (diff <= 0) return t('keys.resetNow')
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}
