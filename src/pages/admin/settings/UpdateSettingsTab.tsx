import { useCallback, useEffect, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { FrontendReleaseNotesDialog } from './FrontendReleaseNotesDialog'
import {
  RefreshCw,
  Download,
  RotateCcw,
  AlertTriangle,
  ServerCog,
  FileText,
} from 'lucide-react'
import {
  systemAPI,
  type VersionInfo,
  type RollbackVersionInfo,
} from '~/lib/api/admin/system'
import { uiUpdateAPI, type UiUpdateStatus } from '~/lib/api/admin/uiUpdate'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const RESTART_POLL_INTERVAL_MS = 1000
const RESTART_POLL_ATTEMPTS = 60

/** Resolves once /health answers, rejects after a minute of the service being down. */
async function waitForService(timeoutMessage: string): Promise<void> {
  for (let attempt = 0; attempt < RESTART_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_INTERVAL_MS))
    try {
      const response = await fetch('/health', { cache: 'no-store' })
      if (response.ok) return
    } catch {
      // Still down: keep waiting.
    }
  }
  throw new Error(timeoutMessage)
}

/**
 * Online update panel: check GitHub releases, show current/latest version,
 * apply an in-place update, then offer a restart (the binary swap only takes
 * effect after the service restarts).
 */
export function UpdateSettingsTab() {
  const { t } = useI18n()
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [needsRestart, setNeedsRestart] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [rollbackVersions, setRollbackVersions] = useState<RollbackVersionInfo[]>([])
  const [rollingBack, setRollingBack] = useState<string | null>(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)

  // The frontend is a static tree served by nginx, so it has its own update
  // channel: a loopback service that pulls and rebuilds `dist`.
  const [uiStatus, setUiStatus] = useState<UiUpdateStatus | null>(null)
  const [uiLoading, setUiLoading] = useState(true)
  const [uiApplying, setUiApplying] = useState(false)
  const [uiError, setUiError] = useState('')
  const [showUiNotes, setShowUiNotes] = useState(false)
  const uiBusy = uiApplying || uiStatus?.job.state === 'running'

  const loadUi = useCallback(async () => {
    setUiLoading(true)
    try {
      setUiStatus(await uiUpdateAPI.status(true))
      setUiError('')
    } catch (error: any) {
      setUiError(error?.message || t('admin.settings.update.uiFailed'))
    } finally {
      setUiLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadUi()
  }, [loadUi])

  // Resume polling after a reload, including jobs started by another administrator.
  useEffect(() => {
    if (uiStatus?.job.state !== 'running') return
    let disposed = false
    let polling = false
    const timer = window.setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const next = await uiUpdateAPI.status()
        if (disposed) return
        setUiStatus(next)
        setUiError('')
        if (next.job.state === 'done') {
          toast.success(t('admin.settings.update.uiDone'))
          window.setTimeout(() => window.location.reload(), 1500)
        } else if (next.job.state === 'failed') {
          toast.error(t('admin.settings.update.uiFailed'))
        }
      } catch (error: any) {
        if (!disposed) setUiError(error?.message || t('admin.settings.update.uiFailed'))
      } finally {
        polling = false
      }
    }, 1000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [uiStatus?.job.state, t])

  const applyUi = useCallback(async () => {
    try {
      setUiApplying(true)
      const result = await uiUpdateAPI.apply()
      setUiStatus((current) => current ? { ...current, job: result.job } : current)
      setUiError('')
    } catch (error: any) {
      toast.error(error?.message || t('admin.settings.update.uiFailed'))
    } finally {
      setUiApplying(false)
    }
  }, [t])

  const check = useCallback(
    async (force = false) => {
      try {
        setLoading(true)
        const data = await systemAPI.checkUpdates(force)
        setInfo(data)
      } catch (error: any) {
        toast.error(error?.message || t('admin.settings.update.checkFailed'))
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    check(false)
  }, [check])

  const loadRollback = useCallback(async () => {
    try {
      setRollbackLoading(true)
      const data = await systemAPI.getRollbackVersions()
      setRollbackVersions(data.versions ?? [])
    } catch {
      setRollbackVersions([])
      toast.error(t('admin.settings.update.rollbackFailed'))
    } finally {
      setRollbackLoading(false)
    }
  }, [t])

  const handleUpdate = useCallback(async () => {
    try {
      setUpdating(true)
      const result = await systemAPI.performUpdate()
      if (result.need_restart) setNeedsRestart(true)
      toast.success(result.message || t('admin.settings.update.updateSuccess'))
      await check(true)
    } catch (error: any) {
      toast.error(error?.message || t('admin.settings.update.updateFailed'))
    } finally {
      setUpdating(false)
    }
  }, [check, t])

  const handleRestart = useCallback(async () => {
    try {
      setRestarting(true)
      await systemAPI.restartService()
      toast.success(t('admin.settings.update.restarting'))
      // The old build answers this call and then exits; systemd brings the new
      // one up a few seconds later. Reload only once it is actually answering,
      // otherwise the tab lands on a connection error.
      await waitForService(t('admin.settings.update.restartTimedOut'))
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || t('admin.settings.update.restartFailed'))
      setRestarting(false)
    }
  }, [t])

  const handleRollback = useCallback(
    async (version?: string) => {
      const label = version || t('admin.settings.update.rollbackLocalBackup')
      if (!window.confirm(t('admin.settings.update.rollbackConfirm', { version: label }))) {
        return
      }
      try {
        setRollingBack(version || 'local')
        const result = await systemAPI.rollback(version)
        if (result.need_restart) setNeedsRestart(true)
        toast.success(result.message || t('admin.settings.update.rollbackSuccess'))
        await check(true)
      } catch (error: any) {
        toast.error(error?.message || t('admin.settings.update.rollbackFailed'))
      } finally {
        setRollingBack(null)
      }
    },
    [check, t]
  )

  return (
    <VStack gap={4} hAlign="stretch">
      <Card padding={5}>
        <VStack gap={4} hAlign="stretch">
          <HStack gap={2} vAlign="center">
            <Icon icon={ServerCog} />
            <Text weight="semibold">{t('admin.settings.update.versionTitle')}</Text>
            {info && !loading && (
              <Badge
                variant={info.has_update ? 'warning' : 'success'}
                label={
                  info.has_update
                    ? t('admin.settings.update.updateAvailable')
                    : t('admin.settings.update.upToDate')
                }
              />
            )}
            {loading && <Spinner size="sm" />}
          </HStack>

          <HStack gap={6} vAlign="center" wrap="wrap">
            <VStack gap={1}>
              <Text size="sm" color="secondary">
                {t('admin.settings.update.currentVersion')}
              </Text>
              <Text weight="semibold">{info?.current_version || '—'}</Text>
            </VStack>
            <VStack gap={1}>
              <Text size="sm" color="secondary">
                {t('admin.settings.update.latestVersion')}
              </Text>
              <Text weight="semibold">{info?.latest_version || '—'}</Text>
            </VStack>
            {info?.build_type === 'source' && (
              <Badge variant="neutral" label={t('admin.settings.update.buildTypeSource')} />
            )}
          </HStack>

          <HStack gap={2} wrap="wrap">
            <Button
              variant="secondary"
              icon={<Icon icon={RefreshCw} />}
              label={t('admin.settings.update.checkNow')}
              isDisabled={loading || updating}
              onClick={() => void check(true)}
            />
            {info?.has_update && (
              <Button
                variant="primary"
                icon={<Icon icon={Download} />}
                label={t('admin.settings.update.updateNow')}
                isDisabled={updating}
                onClick={() => void handleUpdate()}
              />
            )}
          </HStack>

          {updating && (
            <HStack gap={2} vAlign="center">
              <Spinner size="sm" />
              <Text size="sm" color="secondary">
                {t('admin.settings.update.updatingHint')}
              </Text>
            </HStack>
          )}

          {needsRestart && (
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Icon icon={AlertTriangle} />
              <Text size="sm">{t('admin.settings.update.needRestart')}</Text>
              <Button
                variant="primary"
                icon={<Icon icon={RefreshCw} />}
                label={t('admin.settings.update.restartNow')}
                isDisabled={restarting}
                onClick={() => void handleRestart()}
              />
            </HStack>
          )}

          {info?.warning && (
            <HStack gap={2} vAlign="center">
              <Icon icon={AlertTriangle} />
              <Text size="sm" color="secondary">
                {info.warning}
              </Text>
            </HStack>
          )}
        </VStack>
      </Card>

      {(uiStatus || uiError) && (
        <Card padding={5}>
          <VStack gap={4} hAlign="stretch">
            <HStack gap={2} vAlign="center">
              <Icon icon={ServerCog} />
              <Text weight="semibold">{t('admin.settings.update.uiTitle')}</Text>
              {!uiLoading && uiStatus && (
                <Badge
                  variant={uiStatus.unreachable ? 'neutral' : uiStatus.has_update ? 'warning' : 'success'}
                  label={
                    uiStatus.unreachable
                      ? t('admin.settings.update.uiUnreachable')
                      : uiStatus.has_update
                        ? t('admin.settings.update.updateAvailable')
                        : t('admin.settings.update.upToDate')
                  }
                />
              )}
              {uiLoading && <Spinner size="sm" />}
            </HStack>

            {uiStatus && <HStack gap={6} vAlign="center" wrap="wrap">
              <VStack gap={1} maxWidth="100%">
                <Text size="sm" color="secondary">
                  {t('admin.settings.update.uiCurrent')}
                </Text>
                <Text weight="semibold">{uiStatus.current_sha || '—'}</Text>
              </VStack>
              <VStack gap={1} maxWidth="100%">
                <Text size="sm" color="secondary">
                  {t('admin.settings.update.uiLatest')}
                </Text>
                <Text weight="semibold">{uiStatus.latest_sha || '—'}</Text>
              </VStack>
              {uiStatus.built_at && (
                <VStack gap={1} maxWidth="100%">
                  <Text size="sm" color="secondary">
                    {t('admin.settings.update.uiBuiltAt')}
                  </Text>
                  <Text weight="semibold">{uiStatus.built_at}</Text>
                </VStack>
              )}
            </HStack>}

            <HStack gap={2} wrap="wrap">
              <Button
                variant="secondary"
                icon={<Icon icon={RefreshCw} />}
                label={t('admin.settings.update.checkNow')}
                isDisabled={uiLoading || uiBusy}
                onClick={() => void loadUi()}
              />
              {uiStatus && (
                <Button
                  variant="secondary"
                  icon={<Icon icon={FileText} />}
                  label={t(uiStatus.has_update
                    ? 'admin.settings.update.uiPreviewNotes'
                    : 'admin.settings.update.uiViewNotes')}
                  aria-haspopup="dialog"
                  onClick={() => setShowUiNotes(true)}
                />
              )}
              {uiStatus?.has_update && (
                <Button
                  variant="primary"
                  icon={<Icon icon={Download} />}
                  label={t('admin.settings.update.uiApply')}
                  isDisabled={uiBusy}
                  onClick={() => void applyUi()}
                />
              )}
            </HStack>

            {uiError && <Text size="sm" role="alert">{uiError}</Text>}
            {uiStatus?.job.state === 'failed' && (
              <Text size="sm" role="alert">{uiStatus.job.log || t('admin.settings.update.uiFailed')}</Text>
            )}

            {uiBusy && (
              <HStack gap={2} vAlign="center">
                <Spinner size="sm" />
                <Text size="sm" color="secondary">
                  {t('admin.settings.update.uiBuilding')}
                  {uiStatus?.job.step ? ` (${uiStatus.job.step})` : ''}
                </Text>
              </HStack>
            )}
          </VStack>
        </Card>
      )}

      {uiStatus && (
        <FrontendReleaseNotesDialog
          isOpen={showUiNotes}
          onOpenChange={setShowUiNotes}
          status={uiStatus}
        />
      )}

      {info?.release_info && (
        <Card padding={5}>
          <VStack gap={3} hAlign="stretch">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text weight="semibold">
                {info.release_info.name || `v${info.latest_version}`}
              </Text>
              <Text size="sm" color="secondary">
                {info.release_info.published_at}
              </Text>
              <Button
                variant="ghost"
                label={
                  showNotes
                    ? t('admin.settings.update.hideNotes')
                    : t('admin.settings.update.showNotes')
                }
                isDisabled={false}
                onClick={() => setShowNotes((v) => !v)}
              />
            </HStack>
            {showNotes && (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  fontFamily: 'inherit',
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                }}
              >
                {info.release_info.body || t('admin.settings.update.noNotes')}
              </pre>
            )}
            {info.release_info.html_url && (
              <a href={info.release_info.html_url} target="_blank" rel="noreferrer">
                <Text size="sm">{t('admin.settings.update.viewOnGithub')}</Text>
              </a>
            )}
          </VStack>
        </Card>
      )}

      <Card padding={5}>
        <VStack gap={3} hAlign="stretch">
          <HStack gap={2} vAlign="center">
            <Icon icon={RotateCcw} />
            <Text weight="semibold">{t('admin.settings.update.rollbackTitle')}</Text>
          </HStack>
          <Text size="sm" color="secondary">
            {t('admin.settings.update.rollbackHint')}
          </Text>
          <HStack gap={2} wrap="wrap">
            <Button
              variant="secondary"
              icon={<Icon icon={RotateCcw} />}
              label={t('admin.settings.update.rollbackLocalBackup')}
              isDisabled={rollingBack !== null}
              onClick={() => void handleRollback()}
            />
            <Button
              variant="ghost"
              label={t('admin.settings.update.loadRollbackVersions')}
              isDisabled={rollingBack !== null || rollbackLoading}
              onClick={() => void loadRollback()}
            />
          </HStack>
          {rollbackVersions.length > 0 && (
            <VStack gap={2}>
              {rollbackVersions.map((v) => (
                <HStack key={v.version} gap={2} vAlign="center" wrap="wrap">
                  <Text size="sm">v{v.version}</Text>
                  <Text size="sm" color="secondary">
                    {v.published_at}
                  </Text>
                  <Button
                    variant="ghost"
                    label={t('admin.settings.update.rollbackTo')}
                    isDisabled={rollingBack !== null}
                    onClick={() => void handleRollback(v.version)}
                  />
                </HStack>
              ))}
            </VStack>
          )}
        </VStack>
      </Card>
    </VStack>
  )
}
