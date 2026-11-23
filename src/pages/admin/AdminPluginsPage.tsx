// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Admin Plugins Management - Searchable table template
 */

import { buildApiUrl } from '@/api/url';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useI18n} from '~/i18n';

import {
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {Table, pixel, proportional, useTableSortableState} from '@astryxdesign/core/Table';
import type {TableColumn, TableSortComparator} from '@astryxdesign/core/Table';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Center} from '@astryxdesign/core/Center';
import {Spinner} from '@astryxdesign/core/Spinner';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {FileInput} from '@astryxdesign/core/FileInput';
import {Switch} from '@astryxdesign/core/Switch';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';

import type {PluginInstallation, PluginUISession} from '@/api/admin/plugins';
import {isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp} from '~/components/auth/StepUp';
import {toast} from '~/lib/toast';
import {adminAPI} from '~/lib/api/admin';

type Plugin = PluginInstallation & Record<string, unknown>;

interface PluginBridgeMessage {
  source?: string;
  bridge_token?: string;
  type?: string;
  request_id?: string;
  config?: unknown;
  height?: unknown;
  level?: unknown;
  message?: unknown;
}

const OUTBOUND_CAPABILITY = 'openai.oauth.outbound_transport.v1';
const MIN_FRAME_HEIGHT = 520;
const MAX_FRAME_HEIGHT = 960;

const hasEnabledBinding = (plugin: PluginInstallation) => plugin.bindings.some(binding => binding.enabled);
const currentRollout = (plugin: PluginInstallation) =>
  plugin.bindings.find(binding => binding.capability === OUTBOUND_CAPABILITY)?.rollout_percent || 100;

const stateVariant = (state: PluginInstallation['state']) =>
  state === 'enabled' ? 'success' : state === 'error' || state === 'incompatible' ? 'error' : state === 'starting' ? 'warning' : 'neutral';
const compatibilityVariant = (status: PluginInstallation['compatibility']['status']) =>
  status === 'compatible' ? 'success' : status === 'untested' ? 'warning' : 'error';

function getColumns(
  t: (key: string) => string,
  busyID: number | null,
  onToggle: (plugin: Plugin) => void,
  onConfigure: (plugin: Plugin) => void,
  onTest: (plugin: Plugin) => void,
  onDelete: (plugin: Plugin) => void,
): TableColumn<Plugin>[] {
  return [
    {
      key: 'name',
      header: t('astryx.pluginsAdmin.columns.name'),
      width: proportional(2),
      sortable: true,
      renderCell: item => (
        <VStack gap={1}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text weight="medium">{item.name}</Text>
            <Text type="code" color="secondary">v{item.version}</Text>
            <Badge variant={stateVariant(item.state)} label={t(`admin.plugins.${item.state}`)} />
          </HStack>
          <Text type="supporting">
            {item.plugin_key}
            {item.author ? ` · ${item.author}` : ''}
          </Text>
          {item.last_error && <Text type="supporting">{item.last_error}</Text>}
        </VStack>
      ),
    },
    {
      key: 'compatibility',
      header: t('admin.plugins.compatibility'),
      width: proportional(1.5),
      renderCell: item => (
        <VStack gap={1}>
          <Badge
            variant={compatibilityVariant(item.compatibility.status)}
            label={t(`admin.plugins.${item.compatibility.status}`)}
          />
          <Text type="supporting">{item.compatibility.message}</Text>
        </VStack>
      ),
    },
    {
      key: 'enabled',
      header: t('admin.plugins.enabled'),
      width: pixel(100),
      renderCell: item => (
        <Switch
          label={hasEnabledBinding(item) ? t('admin.plugins.disable') : t('admin.plugins.enable')}
          isLabelHidden
          value={hasEnabledBinding(item)}
          isDisabled={busyID === item.id || (!hasEnabledBinding(item) && (item.state === 'starting' || !item.compatibility.compatible))}
          onChange={() => onToggle(item)}
        />
      ),
    },
    {
      key: 'actions',
      header: t('astryx.pluginsAdmin.columns.actions'),
      width: pixel(320),
      align: 'end',
      renderCell: item => (
        <HStack gap={2} hAlign="end">
          <Button
            label={t('admin.plugins.configure')}
            variant="secondary"
            icon={<Icon icon={Cog6ToothIcon} />}
            onClick={() => onConfigure(item)}
          />
          <Button
            label={t('admin.plugins.test')}
            variant="secondary"
            icon={<Icon icon={PlayIcon} />}
            isDisabled={busyID === item.id}
            onClick={() => onTest(item)}
          />
          <Button
            label={t('admin.plugins.uninstall')}
            variant="destructive"
            icon={<Icon icon={TrashIcon} />}
            isDisabled={busyID === item.id || hasEnabledBinding(item)}
            onClick={() => onDelete(item)}
          />
        </HStack>
      ),
    },
  ];
}

const COMPARATORS: Partial<Record<string, TableSortComparator<Plugin>>> = {
  name: (a, b) => a.name.localeCompare(b.name),
};

/* ------------------------------------------------------------------------- */
/* Plugin configuration dialog: sandboxed plugin UI + host bridge            */
/* ------------------------------------------------------------------------- */

function PluginConfigDialog({
  plugin,
  onClose,
  runSensitive,
  reportSensitiveError,
}: {
  plugin: PluginInstallation | null;
  onClose: () => void;
  runSensitive: <T>(action: () => Promise<T>) => Promise<T>;
  reportSensitiveError: (error: unknown) => void;
}) {
  const {t} = useI18n();
  const [session, setSession] = useState<PluginUISession | null>(null);
  const [uiLoading, setUiLoading] = useState(false);
  const [uiError, setUiError] = useState('');
  const [frameHeight, setFrameHeight] = useState(640);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameLoadedRef = useRef(false);
  const sessionVersionRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, number>());
  const sessionRef = useRef<PluginUISession | null>(null);
  const pluginRef = useRef<PluginInstallation | null>(null);
  sessionRef.current = session;
  pluginRef.current = plugin;

  const clearPendingRequests = useCallback(() => {
    for (const timeout of pendingRequestsRef.current.values()) window.clearTimeout(timeout);
    pendingRequestsRef.current.clear();
  }, []);

  // Open a fresh UI session whenever a plugin is chosen; drop it on close
  useEffect(() => {
    const version = ++sessionVersionRef.current;
    clearPendingRequests();
    frameLoadedRef.current = false;
    setSession(null);
    setUiError('');
    setFrameHeight(640);
    if (!plugin) {
      setUiLoading(false);
      return;
    }
    setUiLoading(true);
    adminAPI.plugins
      .createUISession(plugin.id)
      .then(next => {
        if (version === sessionVersionRef.current) setSession(next);
      })
      .catch((error: unknown) => {
        if (version !== sessionVersionRef.current) return;
        setUiLoading(false);
        setUiError((error as {message?: string})?.message || t('common.unknownError'));
      });
  }, [plugin, clearPendingRequests, t]);

  useEffect(() => () => clearPendingRequests(), [clearPendingRequests]);

  const postBridgeResult = useCallback((request: PluginBridgeMessage, payload: Record<string, unknown>) => {
    const frameWindow = frameRef.current?.contentWindow;
    const current = sessionRef.current;
    if (!frameWindow || !current) return;
    const requestID = typeof request.request_id === 'string' ? request.request_id.trim() : '';
    const timeout = pendingRequestsRef.current.get(requestID);
    if (!requestID || timeout === undefined) return;
    window.clearTimeout(timeout);
    pendingRequestsRef.current.delete(requestID);
    frameWindow.postMessage(
      {
        source: 'sub2api-plugin-host',
        bridge_token: current.bridge_token,
        type: `${request.type}.result`,
        request_id: requestID,
        ...payload,
      },
      // The sandboxed iframe has an opaque origin, so no fixed target origin exists.
      // Pending request tracking plus load invalidation prevents cross-navigation leaks.
      '*',
    );
  }, []);

  useEffect(() => {
    const handleBridgeMessage = async (event: MessageEvent) => {
      const current = sessionRef.current;
      const target = pluginRef.current;
      if (!current || !target || event.source !== frameRef.current?.contentWindow || event.origin !== 'null') return;
      const message = event.data as PluginBridgeMessage;
      if (!message || message.source !== 'sub2api-plugin-ui' || message.bridge_token !== current.bridge_token) return;

      const requestID = typeof message.request_id === 'string' ? message.request_id.trim() : '';
      const expectsResponse =
        message.type === 'config.load' ||
        message.type === 'config.save' ||
        message.type === 'config.test' ||
        message.type === 'plugin.status';
      if (expectsResponse) {
        if (!requestID || pendingRequestsRef.current.has(requestID)) return;
        const timeout = window.setTimeout(() => pendingRequestsRef.current.delete(requestID), 30_000);
        pendingRequestsRef.current.set(requestID, timeout);
      }

      try {
        switch (message.type) {
          case 'sub2api.plugin.ready':
            setUiLoading(false);
            break;
          case 'config.load': {
            const config = await adminAPI.plugins.getConfig(target.id);
            postBridgeResult(message, {ok: true, config});
            break;
          }
          case 'config.save': {
            if (!message.config || typeof message.config !== 'object' || Array.isArray(message.config)) {
              throw new Error(t('admin.plugins.bridgeRejected'));
            }
            const config = await runSensitive(() =>
              adminAPI.plugins.saveConfig(target.id, message.config as Record<string, unknown>),
            );
            postBridgeResult(message, {ok: true, config});
            toast.success(t('common.saved'));
            break;
          }
          case 'config.test': {
            const result = await runSensitive(() => adminAPI.plugins.test(target.id));
            postBridgeResult(message, {ok: result.success, result});
            // Success goes back to the plugin UI, which presents it; only failures force a host toast.
            if (!result.success) toast.error(result.message || t('common.error'));
            break;
          }
          case 'plugin.status': {
            // Read-only runtime snapshot: not step-up gated and never toasts.
            const result = await adminAPI.plugins.status(target.id);
            postBridgeResult(message, {ok: true, result});
            break;
          }
          case 'ui.resize': {
            const height = Number(message.height);
            if (Number.isFinite(height)) {
              setFrameHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(height))));
            }
            break;
          }
          case 'ui.notify': {
            const text = typeof message.message === 'string' ? message.message.slice(0, 500) : '';
            if (!text) break;
            if (message.level === 'error') toast.error(text);
            else if (message.level === 'success') toast.success(text);
            else toast.info(text);
            break;
          }
        }
      } catch (error: unknown) {
        if (isStepUpBlocked(error)) reportSensitiveError(error);
        postBridgeResult(message, {
          ok: false,
          error: isStepUpCancelled(error)
            ? t('common.cancel')
            : (error as {message?: string})?.message || t('common.unknownError'),
        });
      }
    };
    const listener = (event: MessageEvent) => void handleBridgeMessage(event);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [postBridgeResult, runSensitive, reportSensitiveError, t]);

  const handleFrameLoad = () => {
    // A load can also come from the plugin navigating its iframe; drop outstanding
    // responses so a late config result never reaches the new document.
    if (frameLoadedRef.current) clearPendingRequests();
    frameLoadedRef.current = true;
    setUiLoading(false);
  };

  const title = t('admin.plugins.configTitle', {name: plugin?.name || ''});

  return (
    <Dialog isOpen={plugin !== null} onOpenChange={open => !open && onClose()} width="min(1200px, 96vw)" maxHeight="94dvh">
      <Layout
        header={<DialogHeader title={title} onOpenChange={open => !open && onClose()} />}
        content={
          <LayoutContent padding={0}>
            <VStack height={frameHeight} hAlign="stretch">
              {uiLoading && !uiError && (
                <Center minHeight={MIN_FRAME_HEIGHT}>
                  <Spinner label={t('admin.plugins.loadingUI')} />
                </Center>
              )}
              {uiError && (
                <Center minHeight={MIN_FRAME_HEIGHT} padding={8}>
                  <EmptyState
                    icon={<Icon icon={ExclamationTriangleIcon} color="warning" />}
                    title={t('admin.plugins.uiUnavailable')}
                    description={uiError}
                  />
                </Center>
              )}
              {session && (
                <iframe
                  ref={frameRef}
                  src={session.url.startsWith('/api/v1/') ? buildApiUrl(session.url) : session.url}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  title={title}
                  width="100%"
                  height="100%"
                  frameBorder={0}
                  hidden={uiLoading}
                  onLoad={handleFrameLoad}
                />
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

export default function AdminPluginsPage() {
  const {t} = useI18n();
  const stepUp = useStepUp();

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [busyID, setBusyID] = useState<number | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [deleting, setDeleting] = useState<Plugin | null>(null);
  const [disabling, setDisabling] = useState<Plugin | null>(null);
  const [untestedPlugin, setUntestedPlugin] = useState<Plugin | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [configPlugin, setConfigPlugin] = useState<Plugin | null>(null);

  const errorMessage = useCallback(
    (error: unknown) => (error as {message?: string})?.message || t('common.unknownError'),
    [t],
  );

  const reportSensitiveError = useCallback(
    (error: unknown) => {
      if (isStepUpCancelled(error)) return;
      if (isStepUpBlocked(error)) {
        toast.error(
          stepUpBlockReason(error) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
            ? t('stepUp.adminApiKeyForbidden')
            : t('stepUp.notEnabled'),
        );
        return;
      }
      toast.error(errorMessage(error));
    },
    [t, errorMessage],
  );

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.plugins.list();
      setPlugins(res as Plugin[]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [errorMessage]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term === ''
      ? plugins
      : plugins.filter(item => item.name.toLowerCase().includes(term));
  }, [plugins, query]);

  const {sortedData} = useTableSortableState<Plugin>({
    data: visible,
    comparators: COMPARATORS,
  });

  const runBusy = useCallback(
    async (plugin: Plugin, action: () => Promise<void>) => {
      setBusyID(plugin.id);
      try {
        await action();
      } catch (error) {
        reportSensitiveError(error);
      } finally {
        setBusyID(null);
      }
    },
    [reportSensitiveError],
  );

  const enablePlugin = useCallback(
    (plugin: Plugin, acceptUntested: boolean) =>
      runBusy(plugin, async () => {
        await stepUp.run(() => adminAPI.plugins.enable(plugin.id, currentRollout(plugin), acceptUntested));
        toast.success(t('admin.plugins.enableSuccess'));
        await loadPlugins();
      }),
    [runBusy, stepUp, t, loadPlugins],
  );

  const handleToggle = useCallback(
    (plugin: Plugin) => {
      if (hasEnabledBinding(plugin)) {
        setDisabling(plugin);
      } else if (!plugin.compatibility.tested) {
        setUntestedPlugin(plugin);
      } else {
        void enablePlugin(plugin, false);
      }
    },
    [enablePlugin],
  );

  const confirmDisable = async () => {
    if (!disabling) return;
    const plugin = disabling;
    await runBusy(plugin, async () => {
      await stepUp.run(() => adminAPI.plugins.disable(plugin.id));
      toast.success(t('admin.plugins.disableSuccess'));
      await loadPlugins();
    });
    setDisabling(null);
  };

  const handleTest = useCallback(
    (plugin: Plugin) =>
      void runBusy(plugin, async () => {
        const result = await stepUp.run(() => adminAPI.plugins.test(plugin.id));
        if (result.success) toast.success(result.message || t('admin.plugins.testSuccess'));
        else toast.error(result.message || t('common.error'));
      }),
    [runBusy, stepUp, t],
  );

  const handleUpload = async () => {
    if (!uploadFile || !uploadFile.name.toLowerCase().endsWith('.s2plugin')) {
      toast.error(t('admin.plugins.fileRequired'));
      return;
    }
    setUploading(true);
    try {
      await stepUp.run(() => adminAPI.plugins.upload(uploadFile));
      toast.success(t('admin.plugins.uploadSuccess'));
      setShowUploadDialog(false);
      setUploadFile(null);
      loadPlugins();
    } catch (err) {
      reportSensitiveError(err);
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const plugin = deleting;
    await runBusy(plugin, async () => {
      await stepUp.run(() => adminAPI.plugins.remove(plugin.id));
      toast.success(t('admin.plugins.uninstallSuccess'));
      await loadPlugins();
    });
    setDeleting(null);
  };

  const columns = useMemo(
    () => getColumns(t, busyID, handleToggle, setConfigPlugin, handleTest, setDeleting),
    [t, busyID, handleToggle, handleTest],
  );

  return (
    <Layout
      height="fill"
      contentWidth={1200}
      content={
        <LayoutContent>
          <VStack gap={6} padding={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={2}>
                  <Heading level={1}>{t('admin.plugins.title')}</Heading>
                  <Text color="secondary">{t('admin.plugins.description')}</Text>
                </VStack>
              </StackItem>
              <Button
                label={t('admin.plugins.upload')}
                variant="primary"
                icon={<Icon icon={PlusIcon} />}
                onClick={() => setShowUploadDialog(true)}
              />
            </HStack>

            <Banner status="info" title={t('admin.plugins.runtimeNotice')} description={t('admin.plugins.menuNotice')} />

            <VStack width={300}>
              <TextInput
                label={t('common.search')}
                isLabelHidden
                value={query}
                onChange={setQuery}
                placeholder={t('common.search')}
                startIcon={<Icon icon={MagnifyingGlassIcon} />}
              />
            </VStack>

            {loading && plugins.length === 0 ? (
              <Center minHeight={192}>
                <Spinner label={t('common.loading')} />
              </Center>
            ) : visible.length === 0 ? (
              <EmptyState
                title={t('admin.plugins.empty')}
                description={t('admin.plugins.emptyHint')}
                actions={
                  <Button
                    label={t('admin.plugins.upload')}
                    variant="primary"
                    onClick={() => setShowUploadDialog(true)}
                  />
                }
              />
            ) : (
              <Table<Plugin>
                data={sortedData}
                columns={columns}
                idKey="id"
                density="balanced"
                dividers="rows"
                hasHover
              />
            )}
          </VStack>

          <Dialog
            isOpen={showUploadDialog}
            onOpenChange={(isOpen) => !isOpen && !uploading && setShowUploadDialog(false)}
            width={480}
          >
            <Layout
              header={
                <DialogHeader
                  title={t('admin.plugins.upload')}
                  onOpenChange={(isOpen) => !isOpen && !uploading && setShowUploadDialog(false)}
                />
              }
              content={
                <LayoutContent>
                  <FileInput
                    label={t('admin.plugins.fileRequired')}
                    description={t('admin.plugins.uploadHint')}
                    accept=".s2plugin,application/zip"
                    mode="dropzone"
                    value={uploadFile}
                    onChange={(next) => setUploadFile(Array.isArray(next) ? next[0] ?? null : next)}
                    isDisabled={uploading}
                  />
                </LayoutContent>
              }
              footer={
                <LayoutFooter>
                  <HStack gap={2} hAlign="end">
                    <Button
                      label={t('common.cancel')}
                      variant="secondary"
                      isDisabled={uploading}
                      onClick={() => setShowUploadDialog(false)}
                    />
                    <Button
                      label={uploading ? t('common.processing') : t('admin.plugins.upload')}
                      variant="primary"
                      onClick={handleUpload}
                      isLoading={uploading}
                      isDisabled={!uploadFile}
                    />
                  </HStack>
                </LayoutFooter>
              }
            />
          </Dialog>

          <AlertDialog
            isOpen={deleting !== null}
            onOpenChange={(isOpen) => !isOpen && busyID === null && setDeleting(null)}
            title={t('admin.plugins.uninstall')}
            description={t('admin.plugins.confirmUninstall')}
            actionLabel={t('admin.plugins.uninstall')}
            cancelLabel={t('common.cancel')}
            isActionLoading={busyID !== null && busyID === deleting?.id}
            onAction={() => void confirmDelete()}
          />

          <AlertDialog
            isOpen={disabling !== null}
            onOpenChange={(isOpen) => !isOpen && busyID === null && setDisabling(null)}
            title={t('admin.plugins.disable')}
            description={t('admin.plugins.confirmDisable')}
            actionLabel={t('admin.plugins.disable')}
            cancelLabel={t('common.cancel')}
            isActionLoading={busyID !== null && busyID === disabling?.id}
            onAction={() => void confirmDisable()}
          />

          <AlertDialog
            isOpen={untestedPlugin !== null}
            onOpenChange={(isOpen) => !isOpen && setUntestedPlugin(null)}
            title={t('admin.plugins.untested')}
            description={t('admin.plugins.confirmUntested')}
            actionLabel={t('admin.plugins.enable')}
            actionVariant="primary"
            cancelLabel={t('common.cancel')}
            onAction={() => {
              const plugin = untestedPlugin;
              setUntestedPlugin(null);
              if (plugin) void enablePlugin(plugin, true);
            }}
          />

          <PluginConfigDialog
            plugin={configPlugin}
            onClose={() => setConfigPlugin(null)}
            runSensitive={stepUp.run}
            reportSensitiveError={reportSensitiveError}
          />

          {stepUp.dialog}
        </LayoutContent>
      }
    />
  );
}
