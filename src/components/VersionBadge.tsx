import { useEffect, useState } from 'react'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { systemAPI } from '~/lib/api/admin/system'
import { useI18n } from '~/i18n'
import { useAuthStore, selectIsAdmin } from '~/stores/auth'

/**
 * The running version, shown under the site name in the side nav. When GitHub
 * reports a newer release an update button appears that jumps straight to the
 * online update panel.
 *
 * Only admins ask: everyone else would get a 403, and the version is not
 * theirs to act on anyway. A failed check is silent — this sits in the shell,
 * so it must never surface a banner or hold up the page.
 */
export function VersionBadge({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { t } = useI18n()
  const isAdmin = useAuthStore(selectIsAdmin)
  const [version, setVersion] = useState<string | null>(null)
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    systemAPI
      .checkUpdates(false)
      .then((info) => {
        if (cancelled) return
        setVersion(info.current_version)
        setHasUpdate(info.has_update)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  if (!isAdmin || !version) return null

  return (
    <HStack gap={2} vAlign="center">
      <Text size="sm" color="secondary">
        v{version}
      </Text>
      {hasUpdate && (
        <Button
          size="sm"
          variant="primary"
          label={t('common.update')}
          onClick={() => onNavigate('/admin/settings?tab=update')}
        />
      )}
    </HStack>
  )
}
