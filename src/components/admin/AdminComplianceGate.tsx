import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { adminComplianceAPI, type AdminComplianceStatus } from '@/api/admin/compliance'
import { extractApiErrorMessage } from '@/utils/apiError'
import { useI18n } from '~/i18n'
import { useAuthStore } from '~/stores/auth'

const Confirmation = lazy(() => import('./AdminComplianceForm'))
const pending = <Center axis="both" padding={8}><Spinner /></Center>
type Check = { state: 'pending' | 'open' } | { state: 'required'; status: AdminComplianceStatus } | { state: 'error'; message: string }

function CheckedConsole({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [check, setCheck] = useState<Check>({ state: 'pending' })
  const [revision, setRevision] = useState(0)
  const lockSeen = useRef(false)
  const recheck = useCallback(() => {
    setCheck({ state: 'pending' })
    setRevision((n) => n + 1)
  }, [])
  async function leave() {
    await logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    const requireCheck = () => {
      lockSeen.current = true
      recheck()
    }
    window.addEventListener('admin-compliance-required', requireCheck)
    return () => window.removeEventListener('admin-compliance-required', requireCheck)
  }, [recheck])
  useEffect(() => {
    let current = true
    void adminComplianceAPI.getStatus().then((status) => {
      if (typeof status?.required !== 'boolean') throw new Error(t('legal.loadFailed'))
      if (!current) return
      lockSeen.current = status.required
      setCheck(status.required ? { state: 'required', status } : { state: 'open' })
    }).catch((error) => {
      if (!current) return
      // Older backends do not expose this feature. Never ignore a lock already reported by the backend.
      if (error?.status === 404 && !lockSeen.current) setCheck({ state: 'open' })
      else setCheck({ state: 'error', message: extractApiErrorMessage(error, t('legal.loadFailed')) })
    })
    return () => { current = false }
  }, [revision, t])

  if (check.state === 'open') return children
  if (check.state === 'required') return (
    <Suspense fallback={pending}>
      <Confirmation key={`${check.status.version}:${locale}`} status={check.status} onAccepted={recheck} onLogout={leave} />
    </Suspense>
  )
  if (check.state === 'error') return (
    <Center axis="both" padding={8}>
      <VStack gap={4}>
        <Banner status="error" title={t('legal.loadFailed')} description={check.message} />
        <HStack gap={2}>
          <Button label={t('common.refresh')} onClick={recheck} />
          <Button label={t('adminCompliance.logout')} variant="secondary" onClick={() => void leave()} />
        </HStack>
      </VStack>
    </Center>
  )
  return pending
}

/** Per-administrator state. Protected pages mount only after this administrator's status is checked. */
export function AdminComplianceGate({ children }: { children: ReactNode }) {
  const adminId = useAuthStore((s) => s.user?.role === 'admin' ? s.user.id : undefined)
  return adminId === undefined ? children : <CheckedConsole key={adminId}>{children}</CheckedConsole>
}
