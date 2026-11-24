import { useCallback, useEffect, useState } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { VStack, HStack } from '@astryxdesign/core/Stack'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import {
  RefreshCw,
  Download,
  RotateCcw,
  AlertTriangle,
  ServerCog,
} from 'lucide-react'
import {
  systemAPI,
  type VersionInfo,
  type RollbackVersionInfo,
} from '~/lib/api/admin/system'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

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
    } catch (error: any) {
      toast.error(error?.message || t('admin.settings.update.restartFailed'))
    } finally {
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
