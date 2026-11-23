import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Center } from '@astryxdesign/core/Center'
import { Spinner } from '@astryxdesign/core/Spinner'
import { AppLayout } from '~/layouts/AppLayout'
import { useAuthStore } from '~/stores/auth'
import { useAppStore } from '~/stores/app'
import { getModelPlaza, type ModelPlazaResponse } from '@/api/modelPlaza'
import { ModelPlazaContent } from '~/components/modelPlaza/ModelPlazaContent'
import { PlazaNavBar } from '~/components/modelPlaza/PlazaNavBar'

/**
 * ModelPlazaPage - Model marketplace/pricing display
 * Two modes:
 * - Embedded (?embedded=1 + authenticated): Full AppLayout
 * - Standalone: Custom navbar with logo/login
 */
export function ModelPlazaPage() {
  const [searchParams] = useSearchParams()
  const isAuthenticated = useAuthStore((s) => !!s.token && !!s.user)
  const isEmbedded = searchParams.get('embedded') === '1' && isAuthenticated

  const [data, setData] = useState<ModelPlazaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const appStore = useAppStore()

  useEffect(() => {
    // Fetch public settings for standalone navbar
    void appStore.fetchPublicSettings()

    // Fetch model plaza data
    ;(async () => {
      try {
        const response = await getModelPlaza()
        setData(response)
      } catch {
        setLoadFailed(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [appStore])

  if (isEmbedded) {
    return (
      <AppLayout>
        <ModelPlazaContent response={data} loading={loading} error={loadFailed} embedded />
      </AppLayout>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      <PlazaNavBar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {loading ? (
          <Center axis="both" padding={8} style={{ minHeight: '60vh' }}>
            <Spinner />
          </Center>
        ) : (
          <ModelPlazaContent response={data} loading={false} error={loadFailed} />
        )}
      </main>
    </div>
  )
}
