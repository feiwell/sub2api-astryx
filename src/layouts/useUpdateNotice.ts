import { useEffect, useState } from 'react'
import { checkUpdates } from '~/lib/api/admin/system'
import { pollWhileVisible } from '~/lib/visiblePolling'
import { toAppPath } from '@/utils/appPath'

export function useUpdateNotice(isAdmin: boolean) {
  const [frontendUpdate, setFrontendUpdate] = useState(false)
  const [backendUpdate, setBackendUpdate] = useState(false)

  useEffect(() => {
    setFrontendUpdate(false)
    setBackendUpdate(false)
    if (!isAdmin) return
    let active = true
    let frontendPending = false
    let backendPending = false
    let currentBackendVersion: string | undefined
    const currentFrontendVersion = document.querySelector<HTMLMetaElement>('meta[name="frontend-build-id"]')?.content

    const check = () => {
      if (currentFrontendVersion && !frontendPending) {
        frontendPending = true
        const url = new URL(toAppPath('/'), window.location.origin)
        url.searchParams.set('check_frontend_build', String(Date.now()))
        void fetch(url, { cache: 'no-store', credentials: 'same-origin' })
          .then((response) => response.ok ? response.text() : '')
          .then((html) => {
            const latest = new DOMParser().parseFromString(html, 'text/html')
              .querySelector<HTMLMetaElement>('meta[name="frontend-build-id"]')?.content
            if (active && latest && latest !== currentFrontendVersion) setFrontendUpdate(true)
          })
          .catch(() => {})
          .finally(() => { frontendPending = false })
      }
      if (!backendPending) {
        backendPending = true
        void checkUpdates().then((info) => {
          if (!active) return
          const changed = currentBackendVersion !== undefined && currentBackendVersion !== info.current_version
          if (currentBackendVersion === undefined) currentBackendVersion = info.current_version
          setBackendUpdate(info.has_update || changed)
        }).catch(() => {}).finally(() => { backendPending = false })
      }
    }

    check()
    const stop = pollWhileVisible(check, 5 * 60 * 1000)
    return () => { active = false; stop() }
  }, [isAdmin])

  return { frontendUpdate: isAdmin && frontendUpdate, backendUpdate: isAdmin && backendUpdate }
}
