import { useCallback, useEffect, useState } from 'react'
import type { CustomMenuItem } from '@/types'
import { getSettings } from '~/lib/api/admin/settings'
import { useAppStore } from '~/stores/app'
import { selectIsAdmin, useAuthStore } from '~/stores/auth'

export type MenuItemLookup =
  | { status: 'loading' }
  | { status: 'found'; item: CustomMenuItem }
  | { status: 'missing' }
  | { status: 'failed'; retry: () => void }

/**
 * The custom menu item behind `/custom/:id`. Public settings list the items every user sees;
 * items shown to admins only come with the admin settings, read once when one is asked for.
 */
export function useCustomMenuItem(id: string | undefined): MenuItemLookup {
  const publicItems = useAppStore((s) => s.publicSettings?.custom_menu_items)
  const isPublicLoaded = useAppStore((s) => s.publicSettingsLoaded)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)
  const isAdmin = useAuthStore(selectIsAdmin)
  const [isWaitingForPublic, setWaitingForPublic] = useState(!isPublicLoaded)
  const [adminItems, setAdminItems] = useState<CustomMenuItem[] | null>(null)
  const [hasAdminLookupFailed, setAdminLookupFailed] = useState(false)

  useEffect(() => {
    if (!isWaitingForPublic) return
    let isCurrent = true
    void fetchPublicSettings().finally(() => {
      if (isCurrent) setWaitingForPublic(false)
    })
    return () => {
      isCurrent = false
    }
  }, [isWaitingForPublic, fetchPublicSettings])

  const publicItem = publicItems?.find((item) => item.id === id)
  const needsAdminItems =
    !isWaitingForPublic && !publicItem && isAdmin && adminItems === null && !hasAdminLookupFailed

  useEffect(() => {
    if (!needsAdminItems) return
    let isCurrent = true
    getSettings()
      .then((settings) => {
        if (isCurrent) setAdminItems(Array.isArray(settings.custom_menu_items) ? settings.custom_menu_items : [])
      })
      .catch(() => {
        if (isCurrent) setAdminLookupFailed(true)
      })
    return () => {
      isCurrent = false
    }
  }, [needsAdminItems])

  const retry = useCallback(() => setAdminLookupFailed(false), [])

  if (publicItem) return { status: 'found', item: publicItem }
  if (isWaitingForPublic || needsAdminItems) return { status: 'loading' }
  if (!isAdmin) return { status: 'missing' }
  // An admin is told the lookup failed rather than that the page is gone, which it may not be.
  if (hasAdminLookupFailed) return { status: 'failed', retry }
  const adminItem = adminItems?.find((item) => item.id === id)
  return adminItem ? { status: 'found', item: adminItem } : { status: 'missing' }
}
