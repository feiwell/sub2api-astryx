import { platformLabel } from '@/utils/platformColors'

type Translate = (key: string) => string

/**
 * Label for a group/route platform: admin.groups.platforms.<value>, falling
 * back to the platform catalog's display name for server-registered platforms.
 */
export function groupPlatformLabel(t: Translate, platform: string): string {
  if (!platform) return '—'
  const key = `admin.groups.platforms.${platform}`
  const label = t(key)
  return label === key ? platformLabel(platform) : label
}
