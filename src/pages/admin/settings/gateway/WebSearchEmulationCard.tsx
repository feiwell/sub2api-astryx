import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from '@astryxdesign/core/Icon'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { DateInput } from '@astryxdesign/core/DateInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Divider } from '@astryxdesign/core/Divider'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Grid } from '@astryxdesign/core/Grid'
import { List, ListItem } from '@astryxdesign/core/List'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, VStack, StackItem } from '@astryxdesign/core/Stack'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import type { Proxy } from '@/types'
import { extractApiErrorMessage } from '@/utils/apiError'
import { adminAPI } from '~/lib/api/admin'
import type { WebSearchProviderConfig, WebSearchTestResult } from '~/lib/api/admin/settings'
import { copyToClipboard } from '~/lib/clipboard'
import { useI18n } from '~/i18n'
import { toast } from '~/lib/toast'

const DEFAULT_WEB_SEARCH_QUOTA_LIMIT = 1000

const PROVIDER_TYPE_OPTIONS = [
  { value: 'brave', label: 'Brave Search' },
  { value: 'tavily', label: 'Tavily' },
]

/** A provider row plus a stable id for per-row UI state (expanded, key visibility). */
interface ProviderRow {
  uid: number
  cfg: WebSearchProviderConfig
}

/** UTC keeps the date stable across repeated edits in different timezones. */
function formatSubscribedAt(ts: number | null): ComponentProps<typeof DateInput>['value'] {
  if (!ts) return undefined
  const d = new Date(ts * 1000)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}` as ComponentProps<typeof DateInput>['value']
}

function parseSubscribedAt(dateStr: string | undefined): number | null {
  if (!dateStr) return null
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000)
}

function quotaPercentage(cfg: WebSearchProviderConfig): number {
  if (!cfg.quota_limit || cfg.quota_limit <= 0) return 0
  return ((cfg.quota_used ?? 0) / cfg.quota_limit) * 100
}

export function WebSearchEmulationCard() {
  const { t } = useI18n()
  const nextUid = useRef(0)
  const toRow = (cfg: WebSearchProviderConfig): ProviderRow => ({ uid: nextUid.current++, cfg })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows] = useState<ProviderRow[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [keyVisible, setKeyVisible] = useState<Record<number, boolean>>({})
  const [resetTarget, setResetTarget] = useState<ProviderRow | null>(null)
  const [resetting, setResetting] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testQuery, setTestQuery] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<WebSearchTestResult | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [resp, proxiesResp] = await Promise.all([
          adminAPI.settings.getWebSearchEmulationConfig(),
          adminAPI.proxies.list(1, 1000).catch(() => ({ items: [] as Proxy[] })),
        ])
        if (resp) {
          setEnabled(resp.enabled || false)
          setRows((resp.providers || []).map(toRow))
        }
        setProxies(proxiesResp.items || [])
      } catch (err: unknown) {
        // 404 means the config has not been created yet.
        const status = (err as { status?: number })?.status
        if (status !== 404 && status !== undefined) {
          toast.error(extractApiErrorMessage(err, t('common.error')))
        }
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateRow = (uid: number, patch: Partial<WebSearchProviderConfig>) => {
    setRows(prev => prev.map(r => (r.uid === uid ? { ...r, cfg: { ...r.cfg, ...patch } } : r)))
  }

  const addProvider = () => {
    const row = toRow({
      type: 'brave',
      api_key: '',
      api_key_configured: false,
      quota_limit: DEFAULT_WEB_SEARCH_QUOTA_LIMIT,
      subscribed_at: null,
      proxy_id: null,
      expires_at: null,
    })
    setRows(prev => [...prev, row])
    setExpanded(prev => ({ ...prev, [row.uid]: true }))
  }

  const removeProvider = (uid: number) => {
    setRows(prev => prev.filter(r => r.uid !== uid))
  }

  const copyApiKey = async (row: ProviderRow) => {
    if (!row.cfg.api_key) {
      toast.error(t('admin.settings.webSearchEmulation.apiKeyPlaceholder'))
      return
    }
    await copyToClipboard(row.cfg.api_key, t('admin.settings.webSearchEmulation.copied'))
  }

  const confirmResetUsage = async () => {
    if (!resetTarget) return
    setResetting(true)
    try {
      await adminAPI.settings.resetWebSearchUsage({ provider_type: resetTarget.cfg.type })
      updateRow(resetTarget.uid, { quota_used: 0 })
      toast.success(t('admin.settings.webSearchEmulation.resetUsageSuccess'))
      setResetTarget(null)
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setResetting(false)
    }
  }

  const runTest = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const query = testQuery.trim() || t('admin.settings.webSearchEmulation.testDefaultQuery')
      setTestResult(await adminAPI.settings.testWebSearchEmulation(query))
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setTestLoading(false)
    }
  }

  const save = useCallback(async () => {
    for (const { cfg } of rows) {
      const raw = cfg.quota_limit
      if (raw != null && Number(raw) !== 0 && Number(raw) < 1) {
        toast.error(t('admin.settings.webSearchEmulation.quotaLimitMustBePositive'))
        return
      }
    }
    setSaving(true)
    try {
      const updated = await adminAPI.settings.updateWebSearchEmulationConfig({
        enabled,
        providers: rows.map(({ cfg }) => ({
          ...cfg,
          quota_limit: Number(cfg.quota_limit) > 0 ? Number(cfg.quota_limit) : null,
        })),
      })
      if (updated) {
        setEnabled(updated.enabled || false)
        setRows((updated.providers || []).map(toRow))
        setExpanded({})
        setKeyVisible({})
      }
      toast.success(t('admin.settings.settingsSaved'))
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setSaving(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rows, t])

  const proxyOptions = [
    { value: '', label: t('admin.accounts.noProxy') },
    ...proxies.map(p => ({ value: String(p.id), label: `${p.name} (${p.protocol}://${p.host}:${p.port})` })),
  ]

  const quotaText = (cfg: WebSearchProviderConfig) =>
    `${cfg.quota_used ?? 0} / ${cfg.quota_limit != null && cfg.quota_limit > 0 ? cfg.quota_limit : '∞'}`

  const renderProviderBody = ({ uid, cfg }: ProviderRow) => {
    const visible = !!keyVisible[uid]
    const pct = quotaPercentage(cfg)
    const hasLimit = cfg.quota_limit != null && cfg.quota_limit > 0
    return (
      <VStack gap={3} hAlign="stretch">
        <HStack gap={2} vAlign="end">
          <StackItem size="fill">
            <TextInput
              size="sm"
              type={visible ? 'text' : 'password'}
              label={t('admin.settings.webSearchEmulation.apiKey')}
              value={cfg.api_key}
              placeholder={cfg.api_key_configured ? '••••••••' : t('admin.settings.webSearchEmulation.apiKeyPlaceholder')}
              onChange={api_key => updateRow(uid, { api_key })}
            />
          </StackItem>
          <IconButton
            size="sm"
            variant="ghost"
            label={visible ? t('admin.settings.webSearchEmulation.hideApiKey') : t('admin.settings.webSearchEmulation.showApiKey')}
            icon={<Icon icon={visible ? EyeSlashIcon : EyeIcon} />}
            onClick={() => setKeyVisible(prev => ({ ...prev, [uid]: !visible }))}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={t('admin.settings.webSearchEmulation.copyApiKey')}
            icon={<Icon icon={ClipboardDocumentIcon} />}
            isDisabled={!cfg.api_key}
            onClick={() => copyApiKey({ uid, cfg })}
          />
        </HStack>

        <Grid columns={2} gap={3}>
          <NumberInput
            size="sm"
            hasClear
            min={1}
            label={t('admin.settings.webSearchEmulation.quotaLimit')}
            description={t('admin.settings.webSearchEmulation.quotaLimitHint')}
            placeholder="∞"
            value={cfg.quota_limit}
            onChange={quota_limit => updateRow(uid, { quota_limit })}
          />
          <DateInput
            size="sm"
            label={t('admin.settings.webSearchEmulation.subscribedAt')}
            description={t('admin.settings.webSearchEmulation.subscribedAtHint')}
            value={formatSubscribedAt(cfg.subscribed_at)}
            onChange={date => updateRow(uid, { subscribed_at: parseSubscribedAt(date) })}
          />
        </Grid>

        <HStack gap={2} vAlign="center">
          <Text type="supporting">{t('admin.settings.webSearchEmulation.quotaUsage')}:</Text>
          <StackItem size="fill">
            {hasLimit && (
              <ProgressBar
                isLabelHidden
                label={t('admin.settings.webSearchEmulation.quotaUsage')}
                value={Math.min(pct, 100)}
                variant={pct > 90 ? 'error' : pct > 70 ? 'warning' : 'success'}
              />
            )}
          </StackItem>
          <Text type="supporting" hasTabularNumbers>{quotaText(cfg)}</Text>
          {(cfg.quota_used ?? 0) > 0 && (
            <Button
              size="sm"
              variant="ghost"
              label={t('admin.settings.webSearchEmulation.resetUsage')}
              onClick={() => setResetTarget({ uid, cfg })}
            />
          )}
        </HStack>

        <HStack gap={3} vAlign="end">
          <StackItem size="fill">
            <Selector
              size="sm"
              label={t('admin.settings.webSearchEmulation.proxy')}
              options={proxyOptions}
              hasSearch={proxyOptions.length > 6}
              value={cfg.proxy_id != null ? String(cfg.proxy_id) : ''}
              onChange={v => updateRow(uid, { proxy_id: v ? Number(v) : null })}
            />
          </StackItem>
          <Button
            size="sm"
            label={t('admin.settings.webSearchEmulation.test')}
            onClick={() => {
              setTestResult(null)
              setTestOpen(true)
            }}
          />
        </HStack>
      </VStack>
    )
  }

  return (
    <>
      <VStack gap={4} hAlign="stretch">
        {loading ? (
          <HStack gap={2} vAlign="center">
            <Spinner size="sm" />
            <Text color="secondary">{t('common.loading')}</Text>
          </HStack>
        ) : (
          <>
            <CheckboxInput
              label={t('admin.settings.webSearchEmulation.enabled')}
              description={t('admin.settings.webSearchEmulation.enabledHint')}
              value={enabled}
              onChange={setEnabled}
            />

            {enabled && (
              <VStack gap={3} hAlign="stretch">
                <HStack gap={3} vAlign="center">
                  <StackItem size="fill">
                    <Text weight="medium">{t('admin.settings.webSearchEmulation.providers')}</Text>
                  </StackItem>
                  <Button size="sm" label={t('admin.settings.webSearchEmulation.addProvider')} onClick={addProvider} />
                </HStack>

                {rows.length === 0 ? (
                  <Text type="supporting" justify="center">{t('admin.settings.webSearchEmulation.noProviders')}</Text>
                ) : (
                  rows.map(row => {
                    const isOpen = !!expanded[row.uid]
                    return (
                      <Card key={row.uid} variant="muted" padding={3}>
                        <VStack gap={3} hAlign="stretch">
                          <HStack gap={3} vAlign="center" wrap="wrap">
                            <IconButton
                              size="sm"
                              variant="ghost"
                              label={row.cfg.type}
                              icon={<Icon icon={isOpen ? ChevronDownIcon : ChevronRightIcon} />}
                              onClick={() => setExpanded(prev => ({ ...prev, [row.uid]: !isOpen }))}
                            />
                            <Selector
                              size="sm"
                              isLabelHidden
                              label={t('admin.settings.webSearchEmulation.providers')}
                              options={PROVIDER_TYPE_OPTIONS}
                              value={row.cfg.type}
                              onChange={type => updateRow(row.uid, { type: type as WebSearchProviderConfig['type'] })}
                            />
                            <Text type="supporting" hasTabularNumbers>{quotaText(row.cfg)}</Text>
                            {!isOpen && row.cfg.api_key_configured && (
                              <Badge variant="success" label={t('admin.settings.webSearchEmulation.apiKeyConfigured')} />
                            )}
                            <StackItem size="fill">{null}</StackItem>
                            <Button
                              size="sm"
                              variant="destructive"
                              label={t('admin.settings.webSearchEmulation.removeProvider')}
                              onClick={() => removeProvider(row.uid)}
                            />
                          </HStack>
                          {isOpen && (
                            <>
                              <Divider />
                              {renderProviderBody(row)}
                            </>
                          )}
                        </VStack>
                      </Card>
                    )
                  })
                )}
              </VStack>
            )}

            <HStack>
              <Button
                variant="primary"
                label={saving ? t('common.saving') : t('common.save')}
                isLoading={saving}
                onClick={save}
              />
            </HStack>
          </>
        )}
      </VStack>

      <AlertDialog
        isOpen={resetTarget !== null}
        onOpenChange={open => { if (!open) setResetTarget(null) }}
        title={t('admin.settings.webSearchEmulation.resetUsage')}
        description={t('admin.settings.webSearchEmulation.resetUsageConfirm')}
        actionLabel={t('admin.settings.webSearchEmulation.resetUsage')}
        cancelLabel={t('common.cancel')}
        isActionLoading={resetting}
        onAction={confirmResetUsage}
      />

      <Dialog isOpen={testOpen} onOpenChange={setTestOpen} width={560} maxHeight="80dvh">
        <Layout
          header={<DialogHeader title={t('admin.settings.webSearchEmulation.testResultTitle')} onOpenChange={setTestOpen} />}
          content={
            <LayoutContent>
              <VStack gap={4} hAlign="stretch">
                <HStack gap={2} vAlign="end">
                  <StackItem size="fill">
                    <TextInput
                      isLabelHidden
                      label={t('admin.settings.webSearchEmulation.test')}
                      value={testQuery}
                      placeholder={t('admin.settings.webSearchEmulation.testDefaultQuery')}
                      onChange={setTestQuery}
                      onEnter={runTest}
                    />
                  </StackItem>
                  <Button
                    variant="primary"
                    label={testLoading ? t('admin.settings.webSearchEmulation.testing') : t('admin.settings.webSearchEmulation.test')}
                    isLoading={testLoading}
                    onClick={runTest}
                  />
                </HStack>
                {testResult && (
                  <VStack gap={2} hAlign="stretch">
                    <Text weight="medium">
                      {t('admin.settings.webSearchEmulation.testResultProvider')}: {testResult.provider}
                    </Text>
                    {testResult.results.length === 0 ? (
                      <Text type="supporting">{t('admin.settings.webSearchEmulation.testNoResults')}</Text>
                    ) : (
                      <List hasDividers edge="flush">
                        {testResult.results.map((r, i) => (
                          <ListItem key={i} label={r.title} description={r.snippet} href={r.url} target="_blank" />
                        ))}
                      </List>
                    )}
                  </VStack>
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button label={t('common.close')} onClick={() => setTestOpen(false)} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  )
}
